'use client';

import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react';
import { triggerFullCrawl, type CrawlResult } from '@/lib/api-client';
import { toast } from 'sonner';

interface CrawlContextType {
  /** 크롤링 진행 중 여부 */
  isCrawling: boolean;
  /** 진행 상태 텍스트 (예: "120/370개 기업 (배치 #3)") */
  progress: string;
  /** 마지막 크롤링 결과 */
  lastResult: CrawlResult | null;
  /** 크롤링 시작 */
  startCrawl: (options?: { forceNew?: boolean }) => void;
  /** 크롤링 강제 중지 */
  stopCrawl: () => void;
}

const CrawlContext = createContext<CrawlContextType | null>(null);

export function useCrawl(): CrawlContextType {
  const ctx = useContext(CrawlContext);
  if (!ctx) throw new Error('useCrawl must be used within CrawlProvider');
  return ctx;
}

export function CrawlProvider({ children }: { children: ReactNode }) {
  const [isCrawling, setIsCrawling] = useState(false);
  const [progress, setProgress] = useState('');
  const [lastResult, setLastResult] = useState<CrawlResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const startCrawl = useCallback((options?: { forceNew?: boolean }) => {
    if (abortRef.current) return; // 이미 진행 중

    const controller = new AbortController();
    abortRef.current = controller;
    setIsCrawling(true);
    setProgress('시작 중...');

    triggerFullCrawl(
      (result: CrawlResult) => {
        if (result.progress) {
          const p = result.progress;
          setProgress(`${p.completedCompanies}/${p.totalCompanies}개 기업 (배치 #${p.runCount})`);
        }
        setLastResult(result);
      },
      options,
      controller.signal,
    )
      .then((result) => {
        const p = result?.progress;
        toast.success(
          `크롤링 완료: ${p?.cumulativePostings || result?.totalFound || 0}건 수집, ${p?.cumulativeNewPostings || result?.newPostings || 0}건 신규`,
          { duration: 5000 },
        );
        setLastResult(result);
      })
      .catch((err) => {
        // AbortError는 사용자가 중지한 것이므로 에러 표시 안 함
        if (err instanceof DOMException && err.name === 'AbortError') {
          toast.info('크롤링이 중지되었습니다.', { duration: 3000 });
        } else {
          toast.error(err instanceof Error ? err.message : '크롤링 실패');
        }
      })
      .finally(() => {
        abortRef.current = null;
        setIsCrawling(false);
        setProgress('');
      });
  }, []);

  const stopCrawl = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  return (
    <CrawlContext.Provider value={{ isCrawling, progress, lastResult, startCrawl, stopCrawl }}>
      {children}
    </CrawlContext.Provider>
  );
}
