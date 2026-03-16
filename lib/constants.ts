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
