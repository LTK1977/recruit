import type { CompanyList, Company } from '@/types/company';
import type { JobPosting } from '@/types/posting';
import type { DashboardStats } from '@/types/filters';

const BASE = '';

// === Companies ===
export async function fetchCompanies(): Promise<CompanyList> {
  const res = await fetch(`${BASE}/api/companies`);
  return res.json();
}

export async function createCompany(data: { name: string; aliases?: string[]; searchTerms?: string[]; notes?: string }): Promise<Company> {
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
export async function triggerCrawl(platforms?: string[]): Promise<{
  sessionId: string;
  status: string;
  totalFound: number;
  newPostings: number;
}> {
  const res = await fetch(`${BASE}/api/crawl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(platforms ? { platforms } : {}),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || '크롤링 실패');
  }
  return res.json();
}

export async function getCrawlStatus(): Promise<{ latest: unknown; isRunning: boolean }> {
  const res = await fetch(`${BASE}/api/crawl`);
  return res.json();
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
