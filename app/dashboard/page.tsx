'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PlatformBadge, NewBadge } from '@/components/recruit/PlatformBadge';
import { FileText, Building2, Radar, Clock, Play, ExternalLink, TrendingUp, Loader2 } from 'lucide-react';
import { fetchStats, triggerFullCrawl, fetchPostings } from '@/lib/api-client';
import type { CrawlResult } from '@/lib/api-client';
import type { DashboardStats } from '@/types/filters';
import type { JobPosting } from '@/types/posting';
import { PLATFORMS } from '@/lib/constants';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer } from 'recharts';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentPostings, setRecentPostings] = useState<JobPosting[]>([]);
  const [loading, setLoading] = useState(true);
  const [crawling, setCrawling] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState('');

  const loadData = useCallback(async () => {
    try {
      const [s, p] = await Promise.all([
        fetchStats(),
        fetchPostings({ newOnly: 'true', sort: 'firstSeenDate', dir: 'desc', pageSize: '20' }),
      ]);
      setStats(s);
      setRecentPostings(p.postings);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCrawl = async () => {
    setCrawling(true);
    setCrawlProgress('시작 중...');
    try {
      const result = await triggerFullCrawl((progress: CrawlResult) => {
        if (progress.progress) {
          const p = progress.progress;
          setCrawlProgress(`${p.completedCompanies}/${p.totalCompanies}개 기업 (배치 #${p.runCount})`);
        }
      });
      const cumulative = result.progress;
      toast.success(
        `크롤링 완료: ${cumulative?.cumulativePostings || result.totalFound}건 수집, ${cumulative?.cumulativeNewPostings || result.newPostings}건 신규`,
        { duration: 5000 },
      );
      await loadData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '크롤링 실패');
    } finally {
      setCrawling(false);
      setCrawlProgress('');
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">대시보드</h1>
          <p className="text-sm text-muted-foreground mt-1">AI 채용 모니터링 현황</p>
        </div>
        <div className="flex items-center gap-3">
          {crawling && crawlProgress && (
            <span className="text-xs text-muted-foreground">{crawlProgress}</span>
          )}
          <Button onClick={handleCrawl} disabled={crawling} size="sm">
            {crawling ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Play className="h-4 w-4 mr-1.5" />}
            {crawling ? '크롤링 중...' : '크롤링 실행'}
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">전체 공고</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.totalPostings || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">오늘 신규</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{stats?.newToday || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">모니터링 기업</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats?.activeCompanies || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">마지막 크롤링</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {stats?.lastCrawlAt ? new Date(stats.lastCrawlAt).toLocaleString('ko-KR') : '-'}
            </div>
            {stats?.lastCrawlStatus && (
              <Badge variant="outline" className="mt-1 text-xs">
                {stats.lastCrawlStatus}
              </Badge>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Platform distribution + Trend chart */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">플랫폼별 현황</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {PLATFORMS.map((p) => {
                const count = stats?.byPlatform[p.key] || 0;
                const total = stats?.totalPostings || 1;
                const pct = Math.round((count / total) * 100) || 0;
                return (
                  <div key={p.key} className="flex items-center gap-3">
                    <PlatformBadge platform={p.key} />
                    <div className="flex-1">
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className={`h-full rounded-full ${p.color}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <span className="text-sm font-medium w-12 text-right">{count}건</span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">최근 7일 신규 공고 추이</CardTitle>
          </CardHeader>
          <CardContent>
            {stats?.trendLast7Days && stats.trendLast7Days.length > 0 ? (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={stats.trendLast7Days}>
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fontSize: 11 }} width={30} />
                  <RTooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))' }}
                    labelFormatter={(v) => `${v}`}
                    formatter={(v) => [`${String(v)}건`, '신규']}
                  />
                  <Bar dataKey="count" fill="oklch(0.65 0.15 250)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">
                아직 수집된 데이터가 없습니다
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Today's new postings */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-medium">
            오늘 신규 공고 <NewBadge />
          </CardTitle>
          <Radar className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {recentPostings.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">플랫폼</TableHead>
                  <TableHead className="w-32">기업</TableHead>
                  <TableHead>제목</TableHead>
                  <TableHead className="w-24">마감일</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentPostings.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell><PlatformBadge platform={p.platform} /></TableCell>
                    <TableCell className="font-medium text-sm">{p.companyName}</TableCell>
                    <TableCell className="text-sm truncate max-w-xs">{p.title}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.deadline}</TableCell>
                    <TableCell>
                      <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-muted-foreground text-sm">
              오늘 신규 공고가 없습니다. 크롤링을 실행해 보세요.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
