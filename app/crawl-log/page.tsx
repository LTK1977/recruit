'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlatformBadge } from '@/components/recruit/PlatformBadge';
import { Play, History, ChevronDown, ChevronUp, AlertCircle, Loader2, Square } from 'lucide-react';
import { useCrawl } from '@/contexts/CrawlContext';
import type { CrawlSession } from '@/types/crawl';

export default function CrawlLogPage() {
  const [sessions, setSessions] = useState<CrawlSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { isCrawling, progress, lastResult, startCrawl, stopCrawl } = useCrawl();

  const loadLog = useCallback(async () => {
    try {
      const res = await fetch('/api/crawl?full=true');
      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLog(); }, [loadLog]);

  // 크롤링 배치마다 이력 새로고침
  useEffect(() => {
    if (lastResult) {
      loadLog();
    }
  }, [lastResult, loadLog]);

  // 크롤링 완료 시에도 이력 새로고침
  useEffect(() => {
    if (!isCrawling) {
      loadLog();
    }
  }, [isCrawling, loadLog]);

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/15 text-green-400 border-green-500/30';
      case 'running': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'failed': return 'bg-red-500/15 text-red-400 border-red-500/30';
      default: return '';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'completed': return '완료';
      case 'running': return '진행중';
      case 'failed': return '실패';
      default: return status;
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">크롤링 이력</h1>
          <p className="text-sm text-muted-foreground mt-1">크롤링 실행 기록과 결과를 확인하세요</p>
        </div>
        <div className="flex items-center gap-3">
          {isCrawling && progress && (
            <span className="text-sm text-muted-foreground">{progress}</span>
          )}
          {isCrawling ? (
            <Button onClick={stopCrawl} variant="destructive" size="sm">
              <Square className="h-4 w-4 mr-1.5 fill-current" />
              크롤링 중지
            </Button>
          ) : (
            <Button onClick={() => startCrawl()} size="sm">
              <Play className="h-4 w-4 mr-1.5" />
              크롤링 실행
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>실행 시간</TableHead>
                <TableHead className="w-20">트리거</TableHead>
                <TableHead className="w-20">상태</TableHead>
                <TableHead className="w-24">전체 수집</TableHead>
                <TableHead className="w-20">신규</TableHead>
                <TableHead className="w-28">소요 시간</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    불러오는 중...
                  </TableCell>
                </TableRow>
              ) : sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <History className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
                    <p className="text-muted-foreground">아직 크롤링 이력이 없습니다</p>
                  </TableCell>
                </TableRow>
              ) : (
                sessions.map((s) => {
                  const expanded = expandedId === s.id;
                  const duration = s.completedAt && s.startedAt
                    ? ((new Date(s.completedAt).getTime() - new Date(s.startedAt).getTime()) / 1000).toFixed(1) + 's'
                    : '-';
                  const hasDetails = s.results.length > 0 || !!s.note;

                  return (
                    <TableRow key={s.id} className="group">
                      <TableCell colSpan={7} className="p-0">
                        {/* 세션 요약 행 */}
                        <div
                          className="flex items-center cursor-pointer hover:bg-muted/50 px-4 py-3"
                          onClick={() => hasDetails && setExpandedId(expanded ? null : s.id)}
                        >
                          <div className="w-10 flex-shrink-0">
                            {hasDetails && (expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />)}
                          </div>
                          <div className="flex-1 text-sm">
                            {new Date(s.startedAt).toLocaleString('ko-KR')}
                          </div>
                          <div className="w-20">
                            <Badge variant="outline" className="text-xs">
                              {s.triggeredBy === 'manual' ? '수동' : '자동'}
                            </Badge>
                          </div>
                          <div className="w-20">
                            <Badge variant="outline" className={`text-xs ${statusColor(s.status)}`}>
                              {statusLabel(s.status)}
                            </Badge>
                          </div>
                          <div className="w-24 font-medium text-sm">{s.totalPostingsFound}건</div>
                          <div className="w-20 font-medium text-sm text-primary">{s.totalNewPostings}건</div>
                          <div className="w-28 text-sm text-muted-foreground">{duration}</div>
                        </div>

                        {/* 확장: 상세 내역 */}
                        {expanded && (
                          <div className="bg-muted/20 px-8 py-3 border-t border-border/50">
                            {s.note && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                <span>{s.note}</span>
                              </div>
                            )}
                            {s.results.length > 0 && (
                              <div className="space-y-2">
                                <p className="text-xs font-medium text-muted-foreground mb-2">플랫폼별 상세</p>
                                {s.results.map((r, i) => (
                                  <div key={i} className="flex items-center gap-3 text-sm">
                                    <PlatformBadge platform={r.platform} />
                                    <span className="text-muted-foreground truncate max-w-[200px]">{r.companySearchTerm}</span>
                                    <Badge variant="outline" className={`text-xs ${statusColor(r.status)}`}>
                                      {statusLabel(r.status)}
                                    </Badge>
                                    <span>{r.postingsFound}건</span>
                                    <span className="text-primary">+{r.newPostings}</span>
                                    <span className="text-muted-foreground">{(r.durationMs / 1000).toFixed(1)}s</span>
                                    {r.error && <span className="text-destructive text-xs truncate max-w-[200px]">{r.error}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
