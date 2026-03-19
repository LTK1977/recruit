/**
 * 타임아웃이 적용된 fetch 래퍼.
 * 기본 10초 타임아웃 — Vercel 서버리스 함수(45초 제한) 내에서
 * 하나의 요청이 전체 배치를 블로킹하지 않도록 방지.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeout?: number } = {},
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  // 외부에서 signal을 넘긴 경우 함께 처리
  if (fetchOptions.signal) {
    fetchOptions.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    const res = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
    return res;
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Fetch timeout after ${timeout}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
