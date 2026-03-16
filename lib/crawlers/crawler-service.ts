import type { JobPosting, Platform } from '@/types/posting';
import type { Company } from '@/types/company';
import type { CrawlSession, PlatformCrawlResult, CrawlProgress } from '@/types/crawl';
import { generateId, todayString } from '@/lib/constants';
import { saraminCrawler } from './saramin';
import { jobkoreaCrawler } from './jobkorea';
import { catchCrawler } from './catch-crawler';
import { wantedCrawler } from './wanted';
import { careerPageCrawler } from './career-page';

export interface PlatformCrawler {
  platform: Platform;
  crawl(company: Company): Promise<JobPosting[]>;
}

const crawlers: PlatformCrawler[] = [
  saraminCrawler,
  jobkoreaCrawler,
  catchCrawler,
  wantedCrawler,
  careerPageCrawler,
];

export function getCrawlerByPlatform(platform: Platform): PlatformCrawler | undefined {
  return crawlers.find((c) => c.platform === platform);
}

// 타임아웃 안전 마진: 저장할 시간 확보
const MAX_CRAWL_MS = process.env.VERCEL ? 45000 : 300000;

export interface CrawlBatchResult {
  session: CrawlSession;
  allPostings: JobPosting[];
  progress: CrawlProgress;
}

/**
 * 배치 크롤링 실행.
 * progress가 주어지면 이전에 완료된 기업은 건너뛰고 이어서 실행.
 */
export async function runCrawlBatch(
  companies: Company[],
  existingIds: Set<string>,
  triggeredBy: 'manual' | 'scheduled' = 'manual',
  previousProgress?: CrawlProgress | null,
  platformFilter?: Platform[],
): Promise<CrawlBatchResult> {
  const sessionId = generateId();
  const startTime = Date.now();
  const today = todayString();

  // 이어하기 상태 결정
  const isResume = previousProgress && previousProgress.date === today && !previousProgress.isComplete;
  const completedIds = new Set(isResume ? previousProgress.completedCompanyIds : []);
  const runCount = isResume ? previousProgress.runCount + 1 : 1;

  const session: CrawlSession = {
    id: sessionId,
    startedAt: new Date().toISOString(),
    status: 'running',
    results: [],
    totalPostingsFound: 0,
    totalNewPostings: 0,
    triggeredBy,
    runIndex: runCount,
  };

  const allPostings: JobPosting[] = [];
  const activeCompanies = companies.filter((c) => c.active);
  const activeCrawlers = platformFilter
    ? crawlers.filter((c) => platformFilter.includes(c.platform))
    : crawlers;

  // 이미 처리된 기업 건너뛰기
  const pendingCompanies = activeCompanies.filter(c => !completedIds.has(c.id));
  let batchProcessed = 0;
  let timedOut = false;

  for (const company of pendingCompanies) {
    if (Date.now() - startTime > MAX_CRAWL_MS) {
      timedOut = true;
      break;
    }

    for (const crawler of activeCrawlers) {
      if (Date.now() - startTime > MAX_CRAWL_MS) {
        timedOut = true;
        break;
      }

      const start = Date.now();
      const result: PlatformCrawlResult = {
        platform: crawler.platform,
        companySearchTerm: `${company.name} (${crawler.platform})`,
        status: 'running',
        postingsFound: 0,
        newPostings: 0,
        durationMs: 0,
      };

      try {
        const postings = await crawler.crawl(company);
        result.postingsFound = postings.length;

        for (const p of postings) {
          if (existingIds.has(p.id)) {
            p.firstSeenDate = todayString();
          } else {
            result.newPostings++;
          }
          p.lastSeenDate = todayString();
          allPostings.push(p);
        }

        result.status = 'completed';
      } catch (err) {
        result.status = 'failed';
        result.error = err instanceof Error ? err.message : String(err);
        console.error(`[crawl] ${crawler.platform} x ${company.name} failed:`, err);
      }

      result.durationMs = Date.now() - start;
      session.results.push(result);
    }

    if (timedOut) break;

    // 이 기업 처리 완료
    completedIds.add(company.id);
    batchProcessed++;
  }

  // Deduplicate
  const deduped = new Map<string, JobPosting>();
  for (const p of allPostings) deduped.set(p.id, p);
  const uniquePostings = Array.from(deduped.values());

  // 이번 배치 결과
  const batchNewPostings = uniquePostings.filter((p) => !existingIds.has(p.id)).length;
  session.totalPostingsFound = uniquePostings.length;
  session.totalNewPostings = batchNewPostings;
  session.completedAt = new Date().toISOString();
  session.status = 'completed';

  const totalDone = completedIds.size;
  const totalTarget = activeCompanies.length;
  const isComplete = totalDone >= totalTarget;

  if (!isComplete) {
    session.note = `${totalDone}/${totalTarget}개 기업 처리 완료 (배치 #${runCount}, 이번 ${batchProcessed}개 처리). 자동으로 이어서 실행됩니다.`;
  } else {
    session.note = runCount > 1
      ? `전체 ${totalTarget}개 기업 크롤링 완료 (총 ${runCount}회 배치 실행)`
      : `전체 ${totalTarget}개 기업 크롤링 완료`;
  }

  // 진행 상태 업데이트
  const progress: CrawlProgress = {
    date: today,
    completedCompanyIds: Array.from(completedIds),
    totalCompanies: totalTarget,
    totalPostingsFound: (isResume ? previousProgress.totalPostingsFound : 0) + uniquePostings.length,
    totalNewPostings: (isResume ? previousProgress.totalNewPostings : 0) + batchNewPostings,
    runCount,
    lastRunAt: new Date().toISOString(),
    isComplete,
  };

  return { session, allPostings: uniquePostings, progress };
}
