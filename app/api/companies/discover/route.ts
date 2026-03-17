import { NextRequest, NextResponse } from 'next/server';
import { getCompanies, updateCompany } from '@/lib/storage';
import { discoverCareerUrlBatch, type DiscoverProgress } from '@/lib/discover-career-urls';

export const maxDuration = 60;

let discoverInProgress = false;

// 진행 상태를 메모리에 보관 (서버리스 환경에서는 배치 간 유지 안 될 수 있음)
let lastProgress: DiscoverProgress | null = null;

export async function POST(request: NextRequest) {
  if (discoverInProgress) {
    return NextResponse.json({ error: '탐색이 이미 진행 중입니다.' }, { status: 409 });
  }

  discoverInProgress = true;

  try {
    const body = await request.json().catch(() => ({}));
    const forceNew = body.forceNew === true;

    if (forceNew) lastProgress = null;

    const { companies } = await getCompanies();
    const targetCount = companies.filter(c => c.active && !c.careerPageUrl).length;

    if (targetCount === 0) {
      discoverInProgress = false;
      return NextResponse.json({
        status: 'completed',
        message: '채용페이지 URL이 없는 기업이 없습니다.',
        isComplete: true,
        progress: { completedCompanies: 0, totalCompanies: 0, discovered: 0, failed: 0, runCount: 0 },
      });
    }

    const { results, progress } = await discoverCareerUrlBatch(companies, lastProgress);
    lastProgress = progress;

    // 발견된 URL을 기업 레코드에 저장
    for (const r of results) {
      if (r.url && r.verified) {
        await updateCompany(r.companyId, { careerPageUrl: r.url });
      }
    }

    discoverInProgress = false;

    return NextResponse.json({
      status: progress.isComplete ? 'completed' : 'in_progress',
      results: results.map(r => ({
        companyName: r.companyName,
        url: r.url,
        verified: r.verified,
      })),
      isComplete: progress.isComplete,
      progress: {
        completedCompanies: progress.completedCompanyIds.length,
        totalCompanies: progress.totalCompanies,
        discovered: progress.discovered,
        failed: progress.failed,
        runCount: progress.runCount,
      },
    });
  } catch (err) {
    discoverInProgress = false;
    console.error('[discover] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : '탐색 중 오류 발생' },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    isRunning: discoverInProgress,
    progress: lastProgress,
  });
}
