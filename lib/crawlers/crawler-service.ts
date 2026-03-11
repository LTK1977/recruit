import type { JobPosting, Platform } from '@/types/posting';
import type { Company } from '@/types/company';
import type { CrawlSession, PlatformCrawlResult } from '@/types/crawl';
import { generateId, todayString } from '@/lib/constants';
import { saraminCrawler } from './saramin';
import { jobkoreaCrawler } from './jobkorea';
import { catchCrawler } from './catch-crawler';
import { wantedCrawler } from './wanted';

export interface PlatformCrawler {
  platform: Platform;
  crawl(company: Company): Promise<JobPosting[]>;
}

const crawlers: PlatformCrawler[] = [
  saraminCrawler,
  jobkoreaCrawler,
  catchCrawler,
  wantedCrawler,
];

export function getCrawlerByPlatform(platform: Platform): PlatformCrawler | undefined {
  return crawlers.find((c) => c.platform === platform);
}

export async function runFullCrawl(
  companies: Company[],
  existingIds: Set<string>,
  triggeredBy: 'manual' | 'scheduled' = 'manual',
  platformFilter?: Platform[]
): Promise<{ session: CrawlSession; allPostings: JobPosting[] }> {
  const sessionId = generateId();
  const session: CrawlSession = {
    id: sessionId,
    startedAt: new Date().toISOString(),
    status: 'running',
    results: [],
    totalPostingsFound: 0,
    totalNewPostings: 0,
    triggeredBy,
  };

  const allPostings: JobPosting[] = [];
  const activeCompanies = companies.filter((c) => c.active);
  const activeCrawlers = platformFilter
    ? crawlers.filter((c) => platformFilter.includes(c.platform))
    : crawlers;

  for (const company of activeCompanies) {
    for (const crawler of activeCrawlers) {
      const start = Date.now();
      const result: PlatformCrawlResult = {
        platform: crawler.platform,
        companySearchTerm: company.searchTerms.join(', '),
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
            p.firstSeenDate = todayString(); // keep as last seen
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
  }

  // Deduplicate
  const deduped = new Map<string, JobPosting>();
  for (const p of allPostings) {
    deduped.set(p.id, p);
  }

  const uniquePostings = Array.from(deduped.values());
  session.totalPostingsFound = uniquePostings.length;
  session.totalNewPostings = uniquePostings.filter((p) => !existingIds.has(p.id)).length;
  session.completedAt = new Date().toISOString();
  session.status = session.results.some((r) => r.status === 'failed') ? 'completed' : 'completed';

  return { session, allPostings: uniquePostings };
}
