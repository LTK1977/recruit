import type { CompanyList, Company } from '@/types/company';
import type { DailyPostings, JobPosting } from '@/types/posting';
import type { CrawlLog, CrawlSession, CrawlProgress } from '@/types/crawl';
import type { PostingQueryParams } from '@/types/filters';
import { generateId, slugify, todayString } from './constants';

// ============================================================
// 저장소 모드 감지 (런타임 함수 - 매 호출 시 평가)
// ============================================================
type StorageMode = 'kv' | 'tmpfile' | 'file';

function getStorageMode(): StorageMode {
  // 1순위: Vercel KV 설정이 있으면 KV 사용 (기존 @vercel/kv 방식)
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    return 'kv';
  }
  // 1순위-B: Vercel Redis (REDIS_URL) 방식
  if (process.env.REDIS_URL) {
    return 'kv';
  }
  // 2순위: Vercel 서버리스 환경이면 /tmp 사용
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV) {
    return 'tmpfile';
  }
  // 3순위: 로컬 파일시스템
  return 'file';
}

// ============================================================
// KV helpers (Upstash Redis via REDIS_URL 또는 @vercel/kv)
// ============================================================
import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;

function getRedisClient(): Redis {
  if (_redis) return _redis;

  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    // 기존 @vercel/kv 방식 호환
    _redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });
  } else if (process.env.REDIS_URL) {
    // Vercel Redis: REDIS_URL에서 REST URL과 토큰 추출
    // 형식: rediss://default:TOKEN@HOST:PORT
    const url = new URL(process.env.REDIS_URL);
    const restUrl = `https://${url.hostname}`;
    const token = url.password;
    _redis = new Redis({ url: restUrl, token });
  } else {
    throw new Error('Redis configuration not found');
  }

  return _redis;
}

async function kvGet<T>(key: string, defaultValue: T): Promise<T> {
  try {
    const redis = getRedisClient();
    const val = await redis.get<T>(key);
    return val ?? defaultValue;
  } catch (err) {
    console.error(`[KV] get ${key} failed:`, err);
    return defaultValue;
  }
}

async function kvSet<T>(key: string, data: T): Promise<void> {
  const redis = getRedisClient();
  await redis.set(key, data);
}

async function kvKeys(pattern: string): Promise<string[]> {
  const redis = getRedisClient();
  const keys: string[] = [];
  let cursor = '0';
  do {
    const result = await redis.scan(Number(cursor), { match: pattern, count: 100 });
    cursor = String(result[0]);
    keys.push(...(result[1] as string[]));
  } while (cursor !== '0');
  return keys;
}

// ============================================================
// File helpers (로컬 + /tmp 공용)
// ============================================================
function getDataDir(): string {
  const path = require('path');
  const mode = getStorageMode();
  if (mode === 'tmpfile') {
    // Vercel 서버리스: /tmp 은 쓰기 가능
    return '/tmp/recruit-data';
  }
  return path.join(process.cwd(), 'data');
}

function dataPath(...segments: string[]): string {
  const path = require('path');
  return path.join(getDataDir(), ...segments);
}

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
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

// ============================================================
// 통합 읽기/쓰기
// ============================================================
const KV_COMPANIES = 'recruit:companies';
const KV_CRAWL_LOG = 'recruit:crawl-log';
const KV_CRAWL_PROGRESS = 'recruit:crawl-progress';
function kvPostingsKey(date: string) { return `recruit:postings:${date}`; }

async function storageGet<T>(kvKey: string, fileSuffix: string, defaultValue: T): Promise<T> {
  const mode = getStorageMode();
  if (mode === 'kv') {
    return kvGet<T>(kvKey, defaultValue);
  }
  return fileGet<T>(dataPath(fileSuffix), defaultValue);
}

async function storageSet<T>(kvKey: string, fileSuffix: string, data: T): Promise<void> {
  const mode = getStorageMode();
  if (mode === 'kv') {
    await kvSet(kvKey, data);
  } else {
    await fileSet(dataPath(fileSuffix), data);
  }
}

// ============================================================
// === Companies ===
// ============================================================

export async function getCompanies(): Promise<CompanyList> {
  return storageGet<CompanyList>(KV_COMPANIES, 'companies.json', {
    companies: [],
    updatedAt: new Date().toISOString(),
  });
}

export async function saveCompanies(list: CompanyList): Promise<void> {
  await storageSet(KV_COMPANIES, 'companies.json', list);
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

// ============================================================
// === Postings ===
// ============================================================

export async function getPostingsByDate(date: string): Promise<DailyPostings | null> {
  return storageGet<DailyPostings | null>(kvPostingsKey(date), `postings/${date}.json`, null);
}

export async function savePostings(daily: DailyPostings): Promise<void> {
  await storageSet(kvPostingsKey(daily.date), `postings/${daily.date}.json`, daily);
}

export async function getAllPostingIds(): Promise<Set<string>> {
  const ids = new Set<string>();
  const mode = getStorageMode();

  if (mode === 'kv') {
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
  const mode = getStorageMode();

  if (mode === 'kv') {
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

// ============================================================
// === Crawl Log ===
// ============================================================

export async function getCrawlLog(): Promise<CrawlLog> {
  return storageGet<CrawlLog>(KV_CRAWL_LOG, 'crawl-log.json', { sessions: [] });
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
  await storageSet(KV_CRAWL_LOG, 'crawl-log.json', log);
}

// ============================================================
// === Crawl Progress (이어하기용) ===
// ============================================================

export async function getCrawlProgress(): Promise<CrawlProgress | null> {
  return storageGet<CrawlProgress | null>(KV_CRAWL_PROGRESS, 'crawl-progress.json', null);
}

export async function saveCrawlProgress(progress: CrawlProgress): Promise<void> {
  await storageSet(KV_CRAWL_PROGRESS, 'crawl-progress.json', progress);
}

export async function clearCrawlProgress(): Promise<void> {
  const emptyProgress: CrawlProgress = {
    date: '',
    completedCompanyIds: [],
    totalCompanies: 0,
    totalPostingsFound: 0,
    totalNewPostings: 0,
    runCount: 0,
    lastRunAt: '',
    isComplete: true,
  };
  await storageSet(KV_CRAWL_PROGRESS, 'crawl-progress.json', emptyProgress);
}

/** 기존 postings에 새 postings를 merge (중복 제거) */
export async function mergePostings(date: string, newPostings: JobPosting[]): Promise<void> {
  const existing = await getPostingsByDate(date);
  const merged = new Map<string, JobPosting>();

  // 기존 데이터 먼저
  if (existing?.postings) {
    for (const p of existing.postings) merged.set(p.id, p);
  }
  // 새 데이터로 덮어쓰기 (같은 id면 최신으로)
  for (const p of newPostings) merged.set(p.id, p);

  const allPostings = Array.from(merged.values());
  const newCount = newPostings.filter(p => !existing?.postings?.some(ep => ep.id === p.id)).length;

  await savePostings({
    date,
    crawledAt: new Date().toISOString(),
    postings: allPostings,
    newCount: (existing?.newCount || 0) + newCount,
  });
}
