import type { Platform } from './posting';

export type SortField = 'firstSeenDate' | 'deadline' | 'companyName' | 'title' | 'platform';
export type SortDirection = 'asc' | 'desc';

export interface FilterState {
  companyIds: string[];
  platforms: Platform[];
  dateFrom: string | null;
  dateTo: string | null;
  searchQuery: string;
  newOnly: boolean;
}

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}

export interface PostingQueryParams extends FilterState {
  sort: SortConfig;
  page: number;
  pageSize: number;
}

export interface DashboardStats {
  totalPostings: number;
  newToday: number;
  activeCompanies: number;
  lastCrawlAt: string | null;
  lastCrawlStatus: string | null;
  byPlatform: Record<Platform, number>;
  byCompany: { companyName: string; count: number }[];
  trendLast7Days: { date: string; count: number }[];
}
