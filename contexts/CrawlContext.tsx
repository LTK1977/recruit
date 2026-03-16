'use client';

import { createContext, useContext, useState, useRef, useCallback, useEffect, type ReactNode } from 'react';
import { triggerFullCrawl, getCrawlStatus, type CrawlResult } from '@/lib/api-client';
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
  const autoResumeChecked = useRef(false);

  const runCrawl = useCallback((options?: { forceNew?: boolean }) => {
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
        if (result) {
          const p = result.progress;
          toast.success(
            `크롤링 완료: ${p?.cumulativePostings || result.totalFound || 0}건 수집, ${p?.cumulativeNewPostings || result.newPostings || 0}건 신규`,
            { duration: 5000 },
          );
          setLastResult(result);
        }
      })
      .catch((err) => {
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

  const startCrawl = useCallback((options?: { forceNew?: boolean }) => {
    // 수동 실행 시 항상 forceNew로 시작 (오늘 캐시 무시)
    runCrawl({ forceNew: true, ...options });
  }, [runCrawl]);

  const stopCrawl = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  // 페이지 로드 시 미완료 크롤링 자동 감지 → 자동 재개
  useEffect(() => {
    if (autoResumeChecked.current) return;
    autoResumeChecked.current = true;

    getCrawlStatus()
      .then((status) => {
        const prog = status.progress as { isComplete?: boolean; completedCompanyIds?: string[]; totalCompanies?: number; runCount?: number } | null;
        if (prog && !prog.isComplete && prog.completedCompanyIds && prog.completedCompanyIds.length > 0) {
          // 미완료 크롤링이 있으면 자동으로 이어서 실행
          toast.info(
            `미완료 크롤링 발견 (${prog.completedCompanyIds.length}/${prog.totalCompanies}개 기업). 자동으로 이어서 실행합니다.`,
            { duration: 4000 },
          );
          // 잠시 대기 후 재개 (UI가 먼저 렌더링되도록)
          setTimeout(() => runCrawl(), 1500);
        }
      })
      .catch(() => {
        // 실패해도 무시 (첫 로드 시 서버가 아직 준비되지 않을 수 있음)
      });
  }, [runCrawl]);

  // 브라우저 visibility change 감지 — PC 절전 복귀 시 진행 중이던 크롤링 상태 확인
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !abortRef.current) {
        // 크롤링이 진행 중이 아닐 때만 서버 상태 확인
        getCrawlStatus()
          .then((status) => {
            const prog = status.progress as { isComplete?: boolean; completedCompanyIds?: string[]; totalCompanies?: number } | null;
            if (prog && !prog.isComplete && prog.completedCompanyIds && prog.completedCompanyIds.length > 0) {
              toast.info(
                `미완료 크롤링 발견 (${prog.completedCompanyIds.length}/${prog.totalCompanies}개 기업). 자동으로 이어서 실행합니다.`,
                { duration: 4000 },
              );
              setTimeout(() => runCrawl(), 1500);
            }
          })
          .catch(() => {});
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [runCrawl]);

  return (
    <CrawlContext.Provider value={{ isCrawling, progress, lastResult, startCrawl, stopCrawl }}>
      {children}
    </CrawlContext.Provider>
  );
}
