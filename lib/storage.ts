import type { CompanyList, Company } from '@/types/company';
import type { DailyPostings, JobPosting } from '@/types/posting';
import type { CrawlLog, CrawlSession } from '@/types/crawl';
import type { PostingQueryParams } from '@/types/filters';
import { generateId, slugify, todayString } from './constants';

// ============================================================
// 환경 감지: Vercel이면 KV, 로컬이면 파일시스템
// ============================================================
const IS_VERCEL = !!process.env.VERCEL || !!process.env.KV_REST_API_URL;

// --- KV helpers (Vercel) ---
async function kvGet<T>(key: string, defaultValue: T): Promise<T> {
  const { kv } = await import('@vercel/kv');
  const val = await kv.get<T>(key);
  return val ?? defaultValue;
}

async function kvSet<T>(key: string, data: T): Promise<void> {
  const { kv } = await import('@vercel/kv');
  await kv.set(key, data);
}

async function kvKeys(pattern: string): Promise<string[]> {
  const { kv } = await import('@vercel/kv');
  return kv.keys(pattern);
}

async function kvDel(key: string): Promise<void> {
  const { kv } = await import('@vercel/kv');
  await kv.del(key);
}

// --- File helpers (로컬) ---
async function fileGet<T>(filePath: string, defaultValue: T): Promise<T> {
  const { promises: fs } = await import('fs');
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

async function fileSet<T>(filePath: string, data: T): Promise<void> {
  const { promises: fs } = await import('fs');
  const path = await import('path');
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, filePath);
}

function dataPath(...segments: string[]): string {
  const path = require('path');
  return path.join(process.cwd(), 'data', ...segments);
}

// ============================================================
// 통합 저장소 인터페이스
// ============================================================

const KV_COMPANIES = 'recruit:companies';
const KV_CRAWL_LOG = 'recruit:crawl-log';
function kvPostingsKey(date: string) { return `recruit:postings:${date}`; }

// === Companies ===

export async function getCompanies(): Promise<CompanyList> {
  const defaultVal: CompanyList = { companies: [], updatedAt: new Date().toISOString() };
  if (IS_VERCEL) {
    return kvGet<CompanyList>(KV_COMPANIES, defaultVal);
  }
  return fileGet<CompanyList>(dataPath('companies.json'), defaultVal);
}

export async function saveCompanies(list: CompanyList): Promise<void> {
  if (IS_VERCEL) {
    await kvSet(KV_COMPANIES, list);
  } else {
    await fileSet(dataPath('companies.json'), list);
  }
}

export async function addCompany(data: Omit<Company, 'id' | 'addedAt'>): Promise<Company> {
  const list = await getCompanies();
  const company: Company = {
    ...data,
    id: slugify(data.name) || generateId(),
    addedAt: new Date().toISOString(),
  };
  list.companies.push(company);
  list.updatedAt = new Date().toISOString();
  await saveCompanies(list);
  return company;
}

export async function addCompaniesBulk(items: Omit<Company, 'id' | 'addedAt'>[]): Promise<{ added: Company[]; duplicateNames: string[] }> {
  const list = await getCompanies();
  const existingNames = new Set(list.companies.map(c => c.name.toLowerCase()));
  const existingIds = new Set(list.companies.map(c => c.id));
  const added: Company[] = [];
  const duplicateNames: string[] = [];
  const now = new Date().toISOString();

  for (const data of items) {
    if (existingNames.has(data.name.toLowerCase())) {
      duplicateNames.push(data.name);
      continue;
    }

    let id = slugify(data.name) || generateId();
    if (existingIds.has(id)) {
      id = `${id}-${generateId().slice(0, 6)}`;
    }

    const company: Company = {
      ...data,
      id,
      addedAt: now,
    };
    list.companies.push(company);
    existingNames.add(data.name.toLowerCase());
    existingIds.add(id);
    added.push(company);
  }

  if (added.length > 0) {
    list.updatedAt = now;
    await saveCompanies(list);
  }

  return { added, duplicateNames };
}

export async function updateCompany(id: string, updates: Partial<Company>): Promise<Company | null> {
  const list = await getCompanies();
  const idx = list.companies.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  list.companies[idx] = { ...list.companies[idx], ...updates };
  list.updatedAt = new Date().toISOString();
  await saveCompanies(list);
  return list.companies[idx];
}

export async function removeCompany(id: string): Promise<boolean> {
  const list = await getCompanies();
  const before = list.companies.length;
  list.companies = list.companies.filter((c) => c.id !== id);
  if (list.companies.length === before) return false;
  list.updatedAt = new Date().toISOString();
  await saveCompanies(list);
  return true;
}

// === Postings ===

export async function getPostingsByDate(date: string): Promise<DailyPostings | null> {
  if (IS_VERCEL) {
    return kvGet<DailyPostings | null>(kvPostingsKey(date), null);
  }
  return fileGet<DailyPostings | null>(dataPath('postings', `${date}.json`), null);
}

export async function savePostings(daily: DailyPostings): Promise<void> {
  if (IS_VERCEL) {
    await kvSet(kvPostingsKey(daily.date), daily);
  } else {
    await fileSet(dataPath('postings', `${daily.date}.json`), daily);
  }
}

export async function getAllPostingIds(): Promise<Set<string>> {
  const ids = new Set<string>();

  if (IS_VERCEL) {
    const keys = await kvKeys('recruit:postings:*');
    for (const key of keys) {
      const data = await kvGet<DailyPostings | null>(key, null);
      if (data?.postings) {
        for (const p of data.postings) ids.add(p.id);
      }
    }
  } else {
    const { promises: fs } = await import('fs');
    const dir = dataPath('postings');
    try {
      await fs.mkdir(dir, { recursive: true });
      const files = await fs.readdir(dir);
      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        const data = await fileGet<DailyPostings | null>(dataPath('postings', file), null);
        if (data?.postings) {
          for (const p of data.postings) ids.add(p.id);
        }
      }
    } catch { /* empty dir */ }
  }

  return ids;
}

export async function queryPostings(params: PostingQueryParams): Promise<{
  postings: JobPosting[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const allPostings: JobPosting[] = [];
  const today = todayString();

  if (IS_VERCEL) {
    const keys = await kvKeys('recruit:postings:*');
    for (const key of keys) {
      const date = key.replace('recruit:postings:', '');
      if (params.dateFrom && date < params.dateFrom) continue;
      if (params.dateTo && date > params.dateTo) continue;
      const data = await kvGet<DailyPostings | null>(key, null);
      if (data?.postings) allPostings.push(...data.postings);
    }
  } else {
    const { promises: fs } = await import('fs');
    const dir = dataPath('postings');
    try {
      await fs.mkdir(dir, { recursive: true });
      const files = await fs.readdir(dir);
      const jsonFiles = files.filter((f) => f.endsWith('.json')).sort().reverse();

      for (const file of jsonFiles) {
        const date = file.replace('.json', '');
        if (params.dateFrom && date < params.dateFrom) continue;
        if (params.dateTo && date > params.dateTo) continue;
        const data = await fileGet<DailyPostings | null>(dataPath('postings', file), null);
        if (data?.postings) allPostings.push(...data.postings);
      }
    } catch { /* empty */ }
  }

  // Deduplicate by id (keep latest)
  const seen = new Map<string, JobPosting>();
  for (const p of allPostings) {
    if (!seen.has(p.id) || p.lastSeenDate > (seen.get(p.id)?.lastSeenDate || '')) {
      seen.set(p.id, p);
    }
  }
  let filtered = Array.from(seen.values());

  // Apply filters
  if (params.companyIds.length > 0) {
    filtered = filtered.filter((p) => params.companyIds.includes(p.companyKey));
  }
  if (params.platforms.length > 0) {
    filtered = filtered.filter((p) => params.platforms.includes(p.platform));
  }
  if (params.searchQuery) {
    const q = params.searchQuery.toLowerCase();
    filtered = filtered.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.requirements.toLowerCase().includes(q) ||
        p.companyName.toLowerCase().includes(q)
    );
  }
  if (params.newOnly) {
    filtered = filtered.filter((p) => p.firstSeenDate === today);
  }

  // Sort
  const { field, direction } = params.sort;
  filtered.sort((a, b) => {
    const av = a[field] || '';
    const bv = b[field] || '';
    const cmp = av < bv ? -1 : av > bv ? 1 : 0;
    return direction === 'asc' ? cmp : -cmp;
  });

  const total = filtered.length;
  const start = (params.page - 1) * params.pageSize;
  const postings = filtered.slice(start, start + params.pageSize);

  return { postings, total, page: params.page, pageSize: params.pageSize };
}

// === Crawl Log ===

export async function getCrawlLog(): Promise<CrawlLog> {
  if (IS_VERCEL) {
    return kvGet<CrawlLog>(KV_CRAWL_LOG, { sessions: [] });
  }
  return fileGet<CrawlLog>(dataPath('crawl-log.json'), { sessions: [] });
}

export async function appendCrawlSession(session: CrawlSession): Promise<void> {
  const log = await getCrawlLog();
  const idx = log.sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    log.sessions[idx] = session;
  } else {
    log.sessions.unshift(session);
  }
  log.sessions = log.sessions.slice(0, 100);

  if (IS_VERCEL) {
    await kvSet(KV_CRAWL_LOG, log);
  } else {
    await fileSet(dataPath('crawl-log.json'), log);
  }
}
