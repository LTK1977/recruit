import type { Platform } from './posting';

export type CrawlStatus = 'idle' | 'running' | 'completed' | 'failed';

export interface PlatformCrawlResult {
  platform: Platform;
  companySearchTerm: string;
  status: CrawlStatus;
  postingsFound: number;
  newPostings: number;
  error?: string;
  durationMs: number;
}

export interface CrawlSession {
  id: string;
  startedAt: string;
  completedAt?: string;
  status: CrawlStatus;
  results: PlatformCrawlResult[];
  totalPostingsFound: number;
  totalNewPostings: number;
  triggeredBy: 'manual' | 'scheduled';
  note?: string;
  /** 이어하기에서 몇 번째 실행인지 (1부터 시작) */
  runIndex?: number;
}

/** 크롤링 진행 상태 - 이어하기용 */
export interface CrawlProgress {
  /** 오늘 날짜 (YYYY-MM-DD) */
  date: string;
  /** 처리 완료된 기업 ID 목록 */
  completedCompanyIds: string[];
  /** 전체 대상 기업 수 */
  totalCompanies: number;
  /** 누적 수집 공고 수 */
  totalPostingsFound: number;
  /** 누적 신규 공고 수 */
  totalNewPostings: number;
  /** 실행 횟수 */
  runCount: number;
  /** 마지막 실행 시간 */
  lastRunAt: string;
  /** 완료 여부 */
  isComplete: boolean;
}

export interface CrawlLog {
  sessions: CrawlSession[];
}
