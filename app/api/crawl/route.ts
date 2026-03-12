import { NextRequest, NextResponse } from 'next/server';
import { getCompanies, getAllPostingIds, savePostings, appendCrawlSession } from '@/lib/storage';
import { runFullCrawl } from '@/lib/crawlers/crawler-service';
import { todayString, generateId } from '@/lib/constants';
import { getCrawlLog } from '@/lib/storage';
import type { Platform } from '@/types/posting';
import type { CrawlSession } from '@/types/crawl';

// Simple in-memory lock to prevent concurrent crawls
let crawlInProgress = false;

export async function POST(request: NextRequest) {
  if (crawlInProgress) {
    return NextResponse.json({ error: '크롤링이 이미 진행 중입니다.' }, { status: 409 });
  }

  crawlInProgress = true;

  try {
    const body = await request.json().catch(() => ({}));
    const platformFilter = body.platforms as Platform[] | undefined;

    const { companies } = await getCompanies();
    const activeCompanies = companies.filter(c => c.active);

    // 기업이 없어도 세션 기록은 남긴다
    if (activeCompanies.length === 0) {
      const emptySession: CrawlSession = {
        id: generateId(),
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        status: 'completed',
        results: [],
        totalPostingsFound: 0,
        totalNewPostings: 0,
        triggeredBy: 'manual',
        note: companies.length === 0
          ? '등록된 기업이 없어 크롤링을 건너뛰었습니다.'
          : '활성화된 기업이 없어 크롤링을 건너뛰었습니다.',
      };
      await appendCrawlSession(emptySession);
      crawlInProgress = false;

      return NextResponse.json({
        sessionId: emptySession.id,
        status: emptySession.status,
        totalFound: 0,
        newPostings: 0,
        results: [],
        note: emptySession.note,
      });
    }

    const existingIds = await getAllPostingIds();
    const { session, allPostings } = await runFullCrawl(activeCompanies, existingIds, 'manual', platformFilter);

    // Save results
    if (allPostings.length > 0) {
      const today = todayString();
      await savePostings({
        date: today,
        crawledAt: new Date().toISOString(),
        postings: allPostings,
        newCount: session.totalNewPostings,
      });
    }

    await appendCrawlSession(session);
    crawlInProgress = false;

    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      totalFound: session.totalPostingsFound,
      newPostings: session.totalNewPostings,
      results: session.results,
    });
  } catch (err) {
    crawlInProgress = false;
    console.error('[crawl] Error:', err);

    // 에러가 발생해도 세션 기록을 남긴다
    const errorSession: CrawlSession = {
      id: generateId(),
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'failed',
      results: [],
      totalPostingsFound: 0,
      totalNewPostings: 0,
      triggeredBy: 'manual',
      note: `오류: ${err instanceof Error ? err.message : String(err)}`,
    };
    try {
      await appendCrawlSession(errorSession);
    } catch {
      // 세션 저장마저 실패하면 로그만 남김
      console.error('[crawl] Failed to save error session');
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : '크롤링 중 오류 발생' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const log = await getCrawlLog();
  const url = new URL(request.url);
  const full = url.searchParams.get('full');

  if (full === 'true') {
    // 전체 이력 반환
    return NextResponse.json({ sessions: log.sessions, isRunning: crawlInProgress });
  }

  // 기본: 최신 세션 + 실행 상태
  const latest = log.sessions[0] || null;
  return NextResponse.json({ latest, isRunning: crawlInProgress });
}
