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
}

export interface CrawlLog {
  sessions: CrawlSession[];
}
