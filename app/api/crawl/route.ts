import { NextRequest, NextResponse } from 'next/server';
import {
  getCompanies, getAllPostingIds, mergePostings,
  appendCrawlSession, getCrawlLog,
  getCrawlProgress, saveCrawlProgress, clearCrawlProgress,
} from '@/lib/storage';
import { runCrawlBatch } from '@/lib/crawlers/crawler-service';
import { todayString, generateId } from '@/lib/constants';
import type { CrawlSession } from '@/types/crawl';

// Vercel 서버리스 함수 최대 실행 시간
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const forceNew = body.forceNew === true; // 강제 새 크롤링

    const { companies } = await getCompanies();
    const activeCompanies = companies.filter(c => c.active);

    // 기업이 없으면 세션 기록만
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
      return NextResponse.json({
        sessionId: emptySession.id,
        status: 'completed',
        totalFound: 0,
        newPostings: 0,
        results: [],
        note: emptySession.note,
        isComplete: true,
      });
    }

    // 이전 진행 상태 확인
    let previousProgress = await getCrawlProgress();
    if (forceNew || (previousProgress && previousProgress.date !== todayString())) {
      // 날짜가 다르거나 강제 새 크롤링이면 초기화
      await clearCrawlProgress();
      previousProgress = null;
    }

    // 이미 완료된 경우
    if (previousProgress?.isComplete && previousProgress.date === todayString() && !forceNew) {
      return NextResponse.json({
        status: 'completed',
        totalFound: previousProgress.totalPostingsFound,
        newPostings: previousProgress.totalNewPostings,
        note: `오늘 크롤링이 이미 완료되었습니다 (${previousProgress.totalCompanies}개 기업, ${previousProgress.runCount}회 실행). 강제 재실행하려면 forceNew를 사용하세요.`,
        isComplete: true,
        progress: previousProgress,
      });
    }

    const existingIds = await getAllPostingIds();
    const { session, allPostings, progress } = await runCrawlBatch(
      companies, existingIds, 'manual', previousProgress,
    );

    // 결과를 기존 데이터에 merge
    if (allPostings.length > 0) {
      await mergePostings(todayString(), allPostings);
    }

    // 세션 기록 저장
    await appendCrawlSession(session);

    // 진행 상태 저장
    await saveCrawlProgress(progress);

    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      totalFound: session.totalPostingsFound,
      newPostings: session.totalNewPostings,
      results: session.results,
      note: session.note,
      isComplete: progress.isComplete,
      progress: {
        completedCompanies: progress.completedCompanyIds.length,
        totalCompanies: progress.totalCompanies,
        runCount: progress.runCount,
        cumulativePostings: progress.totalPostingsFound,
        cumulativeNewPostings: progress.totalNewPostings,
      },
    });
  } catch (err) {
    console.error('[crawl] Error:', err);

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
    try { await appendCrawlSession(errorSession); } catch { /* ignore */ }

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

  const progress = await getCrawlProgress();

  if (full === 'true') {
    return NextResponse.json({
      sessions: log.sessions,
      progress,
    });
  }

  const latest = log.sessions[0] || null;
  return NextResponse.json({ latest, progress });
}
