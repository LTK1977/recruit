import { promises as fs } from 'fs';
import path from 'path';
import type { CompanyList, Company } from '@/types/company';
import type { DailyPostings, JobPosting } from '@/types/posting';
import type { CrawlLog, CrawlSession } from '@/types/crawl';
import type { PostingQueryParams } from '@/types/filters';
import { generateId, slugify, todayString } from './constants';

const DATA_DIR = path.join(process.cwd(), 'data');
const POSTINGS_DIR = path.join(DATA_DIR, 'postings');
const COMPANIES_FILE = path.join(DATA_DIR, 'companies.json');
const CRAWL_LOG_FILE = path.join(DATA_DIR, 'crawl-log.json');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return defaultValue;
  }
}

async function writeJson<T>(filePath: string, data: T): Promise<void> {
  await ensureDir(path.dirname(filePath));
  const tmp = filePath + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8');
  await fs.rename(tmp, filePath);
}

// === Companies ===

export async function getCompanies(): Promise<CompanyList> {
  return readJson<CompanyList>(COMPANIES_FILE, { companies: [], updatedAt: new Date().toISOString() });
}

export async function saveCompanies(list: CompanyList): Promise<void> {
  await writeJson(COMPANIES_FILE, list);
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
    // ID 충돌 시 고유 접미사 추가
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
    await saveCompanies(list); // 한 번만 저장!
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

function postingsFile(date: string): string {
  return path.join(POSTINGS_DIR, `${date}.json`);
}

export async function getPostingsByDate(date: string): Promise<DailyPostings | null> {
  return readJson<DailyPostings | null>(postingsFile(date), null);
}

export async function savePostings(daily: DailyPostings): Promise<void> {
  await writeJson(postingsFile(daily.date), daily);
}

export async function getAllPostingIds(): Promise<Set<string>> {
  await ensureDir(POSTINGS_DIR);
  const ids = new Set<string>();
  try {
    const files = await fs.readdir(POSTINGS_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const data = await readJson<DailyPostings | null>(path.join(POSTINGS_DIR, file), null);
      if (data?.postings) {
        for (const p of data.postings) ids.add(p.id);
      }
    }
  } catch { /* empty dir */ }
  return ids;
}

export async function queryPostings(params: PostingQueryParams): Promise<{
  postings: JobPosting[];
  total: number;
  page: number;
  pageSize: number;
}> {
  await ensureDir(POSTINGS_DIR);
  const allPostings: JobPosting[] = [];
  const today = todayString();

  try {
    const files = await fs.readdir(POSTINGS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json')).sort().reverse();

    for (const file of jsonFiles) {
      const date = file.replace('.json', '');
      if (params.dateFrom && date < params.dateFrom) continue;
      if (params.dateTo && date > params.dateTo) continue;
      const data = await readJson<DailyPostings | null>(path.join(POSTINGS_DIR, file), null);
      if (data?.postings) allPostings.push(...data.postings);
    }
  } catch { /* empty */ }

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
  return readJson<CrawlLog>(CRAWL_LOG_FILE, { sessions: [] });
}

export async function appendCrawlSession(session: CrawlSession): Promise<void> {
  const log = await getCrawlLog();
  const idx = log.sessions.findIndex((s) => s.id === session.id);
  if (idx >= 0) {
    log.sessions[idx] = session;
  } else {
    log.sessions.unshift(session);
  }
  // Keep last 100 sessions
  log.sessions = log.sessions.slice(0, 100);
  await writeJson(CRAWL_LOG_FILE, log);
}
