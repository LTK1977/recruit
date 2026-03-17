import type { CompanyList, Company } from '@/types/company';
import type { JobPosting } from '@/types/posting';
import type { DashboardStats } from '@/types/filters';

const BASE = '';

// === Companies ===
export async function fetchCompanies(): Promise<CompanyList> {
  const res = await fetch(`${BASE}/api/companies`);
  return res.json();
}

export async function createCompany(data: { name: string; aliases?: string[]; searchTerms?: string[]; notes?: string; careerPageUrl?: string }): Promise<Company> {
  const res = await fetch(`${BASE}/api/companies`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function patchCompany(id: string, data: Partial<Company>): Promise<Company> {
  const res = await fetch(`${BASE}/api/companies?id=${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteCompany(id: string): Promise<void> {
  await fetch(`${BASE}/api/companies?id=${id}`, { method: 'DELETE' });
}

export async function bulkUploadCompanies(file: File): Promise<{
  success: boolean;
  total: number;
  added: number;
  skipped: number;
  skippedNames: string[];
  error?: string;
}> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${BASE}/api/companies/bulk`, {
    method: 'POST',
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '업로드 실패');
  return data;
}

// === Crawl ===
export interface CrawlResult {
  sessionId?: string;
  status: string;
  totalFound: number;
  newPostings: number;
  note?: string;
  isComplete: boolean;
  progress?: {
    completedCompanies: number;
    totalCompanies: number;
    runCount: number;
    cumulativePostings: number;
    cumulativeNewPostings: number;
  };
  error?: string;
}

/** 단일 배치 크롤링 실행 */
export async function triggerCrawlBatch(options?: { forceNew?: boolean }, signal?: AbortSignal): Promise<CrawlResult> {
  const res = await fetch(`${BASE}/api/crawl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '크롤링 실패');
  return data;
}

/**
 * 전체 크롤링 실행 (자동 이어하기).
 * 모든 기업이 처리될 때까지 배치를 자동으로 반복 호출.
 * 네트워크 오류 발생 시 자동 재시도 (PC 절전 복귀 대응).
 * signal을 전달하면 AbortController로 중단 가능.
 */
export async function triggerFullCrawl(
  onProgress?: (progress: CrawlResult) => void,
  options?: { forceNew?: boolean },
  signal?: AbortSignal,
): Promise<CrawlResult> {
  let lastResult: CrawlResult | null = null;
  let isFirst = true;
  let retryCount = 0;
  const MAX_RETRIES = 30; // 최대 30회 재시도 (절전 복귀 대기)

  while (true) {
    if (signal?.aborted) break;

    try {
      const result = await triggerCrawlBatch(isFirst ? options : undefined, signal);
      lastResult = result;
      isFirst = false;
      retryCount = 0; // 성공 시 재시도 카운트 초기화

      if (onProgress) onProgress(result);

      if (result.isComplete) break;

      // 다음 배치 전 짧은 대기 (서버 부하 방지)
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      // AbortError는 사용자 중지 → 즉시 throw
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (signal?.aborted) break;

      retryCount++;
      if (retryCount > MAX_RETRIES) throw err;

      // 네트워크 오류 시 점진적 대기 후 재시도 (3초 → 5초 → 10초, 최대 10초)
      const delay = Math.min(3000 * Math.pow(1.5, retryCount - 1), 10000);
      console.log(`[crawl] 네트워크 오류, ${(delay / 1000).toFixed(0)}초 후 재시도 (${retryCount}/${MAX_RETRIES})`, err);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return lastResult!;
}

/** 이전 호환: triggerCrawl */
export async function triggerCrawl(platforms?: string[]): Promise<{
  sessionId: string;
  status: string;
  totalFound: number;
  newPostings: number;
}> {
  const result = await triggerCrawlBatch();
  return {
    sessionId: result.sessionId || '',
    status: result.status,
    totalFound: result.totalFound,
    newPostings: result.newPostings,
  };
}

export async function getCrawlStatus(): Promise<{ latest: unknown; isRunning: boolean; progress: unknown }> {
  const res = await fetch(`${BASE}/api/crawl`);
  return res.json();
}

// === Discover Career URLs ===
export interface DiscoverResult {
  status: string;
  isComplete: boolean;
  results?: { companyName: string; url: string | null; verified: boolean }[];
  progress?: {
    completedCompanies: number;
    totalCompanies: number;
    discovered: number;
    failed: number;
    runCount: number;
  };
  error?: string;
}

export async function triggerDiscoverBatch(options?: { forceNew?: boolean }, signal?: AbortSignal): Promise<DiscoverResult> {
  const res = await fetch(`${BASE}/api/companies/discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(options || {}),
    signal,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '탐색 실패');
  return data;
}

export async function triggerFullDiscover(
  onProgress?: (result: DiscoverResult) => void,
  options?: { forceNew?: boolean },
  signal?: AbortSignal,
): Promise<DiscoverResult> {
  let lastResult: DiscoverResult | null = null;
  let isFirst = true;

  while (true) {
    if (signal?.aborted) break;

    const result = await triggerDiscoverBatch(isFirst ? options : undefined, signal);
    lastResult = result;
    isFirst = false;

    if (onProgress) onProgress(result);
    if (result.isComplete) break;

    await new Promise(r => setTimeout(r, 1000));
  }

  return lastResult!;
}

// === Postings ===
export async function fetchPostings(params: Record<string, string>): Promise<{
  postings: JobPosting[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const qs = new URLSearchParams(params).toString();
  const res = await fetch(`${BASE}/api/postings?${qs}`);
  return res.json();
}

// === Stats ===
export async function fetchStats(): Promise<DashboardStats> {
  const res = await fetch(`${BASE}/api/stats`);
  return res.json();
}
