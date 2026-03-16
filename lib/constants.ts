import type { Platform } from '@/types/posting';

export const PLATFORMS: { key: Platform; label: string; color: string }[] = [
  { key: 'saramin', label: '사람인', color: 'bg-blue-500' },
  { key: 'jobkorea', label: '잡코리아', color: 'bg-green-500' },
  { key: 'catch', label: '캐치', color: 'bg-orange-500' },
  { key: 'wanted', label: '원티드', color: 'bg-purple-500' },
  { key: 'career', label: '채용페이지', color: 'bg-pink-500' },
];

export const AI_SEARCH_KEYWORDS = [
  'AI', '인공지능', 'ML', '머신러닝', '딥러닝', 'LLM',
  '데이터사이언스', 'NLP', '자연어처리', '컴퓨터비전',
  'GPT', '생성형', 'AX',
];

export const DEFAULT_PAGE_SIZE = 50;
export const CRAWL_RATE_LIMIT_MS = 2000;

export function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 기업명에서 법인 표기를 제거하여 검색에 적합한 이름으로 정제.
 * 예: "주식회사 삼성전자" → "삼성전자"
 *     "포티투닷(주)" → "포티투닷"
 *     "㈜카카오" → "카카오"
 */
export function cleanCompanyName(name: string): string {
  return name
    .replace(/주식회사\s*/g, '')
    .replace(/\(주\)/g, '')
    .replace(/㈜/g, '')
    .replace(/\(유\)/g, '')
    .replace(/유한회사\s*/g, '')
    .replace(/유한책임회사\s*/g, '')
    .replace(/\(사\)/g, '')
    .replace(/사단법인\s*/g, '')
    .replace(/재단법인\s*/g, '')
    .replace(/\s*Inc\.?$/i, '')
    .replace(/\s*Corp\.?$/i, '')
    .replace(/\s*Co\.,?\s*Ltd\.?$/i, '')
    .replace(/\s*Ltd\.?$/i, '')
    .replace(/\s*LLC$/i, '')
    .trim();
}

/**
 * 기업명을 정제한 후 기본 검색어 목록을 생성.
 * 정제된 이름 단독 + AI/인공지능/데이터 조합.
 */
export function generateSearchTerms(name: string): string[] {
  const cleaned = cleanCompanyName(name);
  const base = cleaned || name; // 정제 후 빈 문자열이면 원본 사용
  return [base, `${base} AI`, `${base} 인공지능`, `${base} 데이터`];
}

export function slugify(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9가-힣]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function hashPostingId(platform: string, url: string): string {
  let hash = 0;
  const str = `${platform}:${url}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `${platform}-${Math.abs(hash).toString(36)}`;
}
