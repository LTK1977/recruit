'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { PlatformBadge, NewBadge } from '@/components/recruit/PlatformBadge';
import { Search, ExternalLink, ChevronLeft, ChevronRight, Filter } from 'lucide-react';
import { fetchPostings } from '@/lib/api-client';
import type { JobPosting, Platform } from '@/types/posting';
import { PLATFORMS, todayString } from '@/lib/constants';

export default function PostingsPage() {
  const [postings, setPostings] = useState<JobPosting[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([]);
  const [newOnly, setNewOnly] = useState(false);
  const [selected, setSelected] = useState<JobPosting | null>(null);
  const pageSize = 30;

  const loadPostings = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {
        page: String(page),
        pageSize: String(pageSize),
        sort: 'firstSeenDate',
        dir: 'desc',
      };
      if (searchQuery) params.search = searchQuery;
      if (selectedPlatforms.length) params.platforms = selectedPlatforms.join(',');
      if (newOnly) params.newOnly = 'true';

      const result = await fetchPostings(params);
      setPostings(result.postings);
      setTotal(result.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, selectedPlatforms, newOnly]);

  useEffect(() => {
    loadPostings();
  }, [loadPostings]);

  const totalPages = Math.ceil(total / pageSize);
  const today = todayString();

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]
    );
    setPage(1);
  };

  return (
    <div className="p-6 space-y-4 max-w-7xl">
      <h1 className="text-2xl font-bold">채용공고</h1>

      {/* Filters */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="제목, 기업명, 직무 검색..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-3">
              <Filter className="h-4 w-4 text-muted-foreground" />
              {PLATFORMS.map((p) => (
                <label key={p.key} className="flex items-center gap-1.5 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedPlatforms.includes(p.key)}
                    onCheckedChange={() => togglePlatform(p.key)}
                  />
                  {p.label}
                </label>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={newOnly} onCheckedChange={(v) => { setNewOnly(v); setPage(1); }} />
              <Label className="text-sm">오늘 신규만</Label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        총 <span className="font-semibold text-foreground">{total}</span>건
        {selectedPlatforms.length > 0 || searchQuery || newOnly ? ' (필터 적용됨)' : ''}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">플랫폼</TableHead>
                <TableHead className="w-36">기업</TableHead>
                <TableHead>제목</TableHead>
                <TableHead className="w-28">카테고리</TableHead>
                <TableHead className="w-24">마감일</TableHead>
                <TableHead className="w-24">발견일</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    불러오는 중...
                  </TableCell>
                </TableRow>
              ) : postings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                    채용공고가 없습니다. 먼저 기업을 등록하고 크롤링을 실행해 주세요.
                  </TableCell>
                </TableRow>
              ) : (
                postings.map((p) => (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelected(p)}
                  >
                    <TableCell><PlatformBadge platform={p.platform} /></TableCell>
                    <TableCell className="font-medium text-sm">{p.companyName}</TableCell>
                    <TableCell className="text-sm">
                      <span className="truncate block max-w-sm">{p.title}</span>
                      {p.firstSeenDate === today && <NewBadge />}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.category}</TableCell>
                    <TableCell className="text-xs">{p.deadline}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.firstSeenDate}</TableCell>
                    <TableCell>
                      <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={() => setSelected(null)}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2 mb-1">
                  <PlatformBadge platform={selected.platform} />
                  {selected.firstSeenDate === today && <NewBadge />}
                </div>
                <SheetTitle className="text-lg leading-tight">{selected.title}</SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-muted-foreground">기업:</span> <span className="font-medium">{selected.companyName}</span></div>
                  <div><span className="text-muted-foreground">마감일:</span> {selected.deadline}</div>
                  <div><span className="text-muted-foreground">카테고리:</span> {selected.category || '-'}</div>
                  <div><span className="text-muted-foreground">발견일:</span> {selected.firstSeenDate}</div>
                  {selected.location && <div><span className="text-muted-foreground">위치:</span> {selected.location}</div>}
                  {selected.experienceLevel && <div><span className="text-muted-foreground">경력:</span> {selected.experienceLevel}</div>}
                  {selected.employmentType && <div><span className="text-muted-foreground">고용형태:</span> {selected.employmentType}</div>}
                  {selected.salary && <div><span className="text-muted-foreground">급여:</span> {selected.salary}</div>}
                </div>

                {selected.requirements && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">자격요건</h4>
                    <p className="text-sm text-muted-foreground">{selected.requirements}</p>
                  </div>
                )}

                {selected.preferredQualifications && (
                  <div>
                    <h4 className="text-sm font-medium mb-1">우대사항 / 키워드</h4>
                    <p className="text-sm text-muted-foreground">{selected.preferredQualifications}</p>
                  </div>
                )}

                {selected.keywords && selected.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {selected.keywords.map((k, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{k}</span>
                    ))}
                  </div>
                )}

                <a href={selected.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 w-full mt-4 h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                  원본 공고 보기 <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
