'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlatformBadge } from '@/components/recruit/PlatformBadge';
import { Play, History, ChevronDown, ChevronUp } from 'lucide-react';
import { triggerCrawl } from '@/lib/api-client';
import type { CrawlSession } from '@/types/crawl';
import { toast } from 'sonner';

export default function CrawlLogPage() {
  const [sessions, setSessions] = useState<CrawlSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadLog = useCallback(async () => {
    try {
      const res = await fetch('/api/crawl');
      const data = await res.json();
      // Load full crawl log
      const logRes = await fetch('/api/crawl');
      const logData = await logRes.json();
      if (logData.latest) {
        // We need the full log - use a separate approach
        const fullRes = await fetch('/api/stats');
        // For now, show at least the latest
        setSessions(logData.latest ? [logData.latest] : []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadLog(); }, [loadLog]);

  const handleCrawl = async () => {
    setCrawling(true);
    try {
      const result = await triggerCrawl();
      toast.success(`크롤링 완료: ${result.totalFound}건 수집, ${result.newPostings}건 신규`);
      await loadLog();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '크롤링 실패');
    } finally {
      setCrawling(false);
    }
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-500/15 text-green-400 border-green-500/30';
      case 'running': return 'bg-blue-500/15 text-blue-400 border-blue-500/30';
      case 'failed': return 'bg-red-500/15 text-red-400 border-red-500/30';
      default: return '';
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">크롤링 이력</h1>
          <p className="text-sm text-muted-foreground mt-1">크롤링 실행 기록과 결과를 확인하세요</p>
        </div>
        <Button onClick={handleCrawl} disabled={crawling} size="sm">
          <Play className="h-4 w-4 mr-1.5" />
          {crawling ? '크롤링 중...' : '크롤링 실행'}
        </Button>
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

                  return (
                    <>
                      <TableRow key={s.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setExpandedId(expanded ? null : s.id)}>
                        <TableCell>
                          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="text-sm">
                          {new Date(s.startedAt).toLocaleString('ko-KR')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {s.triggeredBy === 'manual' ? '수동' : '자동'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`text-xs ${statusColor(s.status)}`}>
                            {s.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{s.totalPostingsFound}건</TableCell>
                        <TableCell className="font-medium text-primary">{s.totalNewPostings}건</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{duration}</TableCell>
                      </TableRow>

                      {expanded && s.results.length > 0 && (
                        <TableRow key={`${s.id}-detail`}>
                          <TableCell colSpan={7} className="bg-muted/20 px-8 py-3">
                            <div className="space-y-2">
                              <p className="text-xs font-medium text-muted-foreground mb-2">플랫폼별 상세</p>
                              {s.results.map((r, i) => (
                                <div key={i} className="flex items-center gap-3 text-sm">
                                  <PlatformBadge platform={r.platform} />
                                  <span className="text-muted-foreground">{r.companySearchTerm}</span>
                                  <Badge variant="outline" className={`text-xs ${statusColor(r.status)}`}>{r.status}</Badge>
                                  <span>{r.postingsFound}건</span>
                                  <span className="text-primary">+{r.newPostings}</span>
                                  <span className="text-muted-foreground">{(r.durationMs / 1000).toFixed(1)}s</span>
                                  {r.error && <span className="text-destructive text-xs">{r.error}</span>}
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
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
