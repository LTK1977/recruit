import { NextRequest, NextResponse } from 'next/server';
import { getCompanies, getAllPostingIds, savePostings, appendCrawlSession } from '@/lib/storage';
import { runFullCrawl } from '@/lib/crawlers/crawler-service';
import { todayString } from '@/lib/constants';
import { getCrawlLog } from '@/lib/storage';
import type { Platform } from '@/types/posting';

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
    if (companies.length === 0) {
      crawlInProgress = false;
      return NextResponse.json({ error: '모니터링 대상 기업이 없습니다. 먼저 기업을 등록해주세요.' }, { status: 400 });
    }

    const existingIds = await getAllPostingIds();
    const { session, allPostings } = await runFullCrawl(companies, existingIds, 'manual', platformFilter);

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '크롤링 중 오류 발생' },
      { status: 500 }
    );
  }
}

export async function GET() {
  const log = await getCrawlLog();
  const latest = log.sessions[0] || null;
  return NextResponse.json({ latest, isRunning: crawlInProgress });
}
