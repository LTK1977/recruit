'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, Building2, Search, Upload, FileSpreadsheet, Download, Globe, Sparkles, Loader2, Square } from 'lucide-react';
import { fetchCompanies, createCompany, patchCompany, deleteCompany, bulkUploadCompanies, triggerFullDiscover, type DiscoverResult } from '@/lib/api-client';
import type { Company } from '@/types/company';
import { toast } from 'sonner';
import { useRef } from 'react';

interface FormData {
  name: string;
  aliases: string;
  searchTerms: string;
  notes: string;
  careerPageUrl: string;
}

const emptyForm: FormData = { name: '', aliases: '', searchTerms: '', notes: '', careerPageUrl: '' };

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [discovering, setDiscovering] = useState(false);
  const [discoverProgress, setDiscoverProgress] = useState('');
  const discoverAbortRef = useRef<AbortController | null>(null);

  const loadCompanies = useCallback(async () => {
    try {
      const data = await fetchCompanies();
      setCompanies(data.companies);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadCompanies(); }, [loadCompanies]);

  const openAdd = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (c: Company) => {
    setEditingId(c.id);
    setForm({
      name: c.name,
      aliases: c.aliases.join(', '),
      searchTerms: c.searchTerms.join(', '),
      notes: c.notes || '',
      careerPageUrl: c.careerPageUrl || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('기업명을 입력해주세요.');
      return;
    }

    const aliases = form.aliases.split(',').map((s) => s.trim()).filter(Boolean);
    const searchTerms = form.searchTerms.split(',').map((s) => s.trim()).filter(Boolean);

    try {
      if (editingId) {
        await patchCompany(editingId, { name: form.name, aliases, searchTerms, notes: form.notes, careerPageUrl: form.careerPageUrl || undefined });
        toast.success('기업 정보가 수정되었습니다.');
      } else {
        await createCompany({ name: form.name, aliases, searchTerms, notes: form.notes, careerPageUrl: form.careerPageUrl || undefined });
        toast.success(`${form.name} 기업이 등록되었습니다.`);
      }
      setDialogOpen(false);
      await loadCompanies();
    } catch (err) {
      toast.error('저장 실패');
    }
  };

  const handleDelete = async (c: Company) => {
    if (!confirm(`"${c.name}" 기업을 삭제하시겠습니까?`)) return;
    try {
      await deleteCompany(c.id);
      toast.success(`${c.name} 기업이 삭제되었습니다.`);
      await loadCompanies();
    } catch {
      toast.error('삭제 실패');
    }
  };

  const handleToggleActive = async (c: Company) => {
    await patchCompany(c.id, { active: !c.active });
    await loadCompanies();
  };

  const handleBulkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await bulkUploadCompanies(file);
      if (result.added > 0) {
        toast.success(`${result.added}개 기업이 등록되었습니다.`);
      }
      if (result.skipped > 0) {
        toast.info(`${result.skipped}개 기업은 이미 등록되어 건너뛰었습니다.`, {
          description: result.skippedNames.length > 0
            ? `건너뜀: ${result.skippedNames.slice(0, 5).join(', ')}${result.skippedNames.length > 5 ? ' 외 ' + (result.skippedNames.length - 5) + '개' : ''}`
            : undefined,
          duration: 8000,
        });
      }
      if (result.added === 0 && result.skipped === 0) {
        toast.warning('파일에서 등록할 기업을 찾지 못했습니다.');
      }
      setUploadDialogOpen(false);
      await loadCompanies();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '업로드 실패');
    } finally {
      setUploading(false);
      // 같은 파일 재선택 가능하도록 input 초기화
      e.target.value = '';
    }
  };

  const handleDiscover = async () => {
    const withoutUrl = companies.filter(c => c.active && !c.careerPageUrl).length;
    if (withoutUrl === 0) {
      toast.info('채용페이지 URL이 없는 기업이 없습니다.');
      return;
    }
    if (!confirm(`${withoutUrl}개 기업의 채용페이지를 AI로 탐색합니다. 진행하시겠습니까?`)) return;

    const controller = new AbortController();
    discoverAbortRef.current = controller;
    setDiscovering(true);
    setDiscoverProgress('시작 중...');

    try {
      const result = await triggerFullDiscover(
        (r: DiscoverResult) => {
          if (r.progress) {
            setDiscoverProgress(`${r.progress.completedCompanies}/${r.progress.totalCompanies}개 처리 (${r.progress.discovered}개 발견)`);
          }
        },
        { forceNew: true },
        controller.signal,
      );
      const d = result?.progress?.discovered || 0;
      toast.success(`채용페이지 탐색 완료: ${d}개 기업의 URL을 발견했습니다.`, { duration: 5000 });
      await loadCompanies();
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        toast.info('탐색이 중지되었습니다.');
      } else {
        toast.error(err instanceof Error ? err.message : '탐색 실패');
      }
    } finally {
      discoverAbortRef.current = null;
      setDiscovering(false);
      setDiscoverProgress('');
    }
  };

  const stopDiscover = () => {
    if (discoverAbortRef.current) {
      discoverAbortRef.current.abort();
    }
  };

  const downloadTemplate = () => {
    const csvContent = '\uFEFF기업명,별칭,검색어,메모,채용페이지\nHD현대,"HD Hyundai, 현대중공업","HD현대 AI, HD현대 데이터",조선업,https://www.hdhhicare.com/careers\n삼성전자,"Samsung Electronics, 삼성",,반도체,https://www.samsung.com/sec/careers/';
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '기업목록_템플릿.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">모니터링 기업 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">AI 채용을 모니터링할 고객사를 등록하세요</p>
        </div>
        <div className="flex items-center gap-2">
          {discovering ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">{discoverProgress}</span>
              <Button variant="destructive" size="sm" onClick={stopDiscover}>
                <Square className="h-4 w-4 mr-1.5 fill-current" />
                중지
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={handleDiscover} disabled={companies.length === 0}>
              <Sparkles className="h-4 w-4 mr-1.5" />
              채용페이지 자동 탐색
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => setUploadDialogOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" />
            일괄 등록
          </Button>
          <Button onClick={openAdd} size="sm">
            <Plus className="h-4 w-4 mr-1.5" />
            기업 추가
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : companies.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground/30 mb-4" />
            <p className="text-muted-foreground mb-4">등록된 기업이 없습니다</p>
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4 mr-1.5" />
              첫 번째 기업 등록하기
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {companies.map((c) => (
            <Card key={c.id} className={!c.active ? 'opacity-50' : ''}>
              <CardHeader className="flex flex-row items-start justify-between pb-2">
                <div>
                  <CardTitle className="text-base">{c.name}</CardTitle>
                  {c.aliases.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.aliases.map((a, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{a}</Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Switch checked={c.active} onCheckedChange={() => handleToggleActive(c)} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Search className="h-3 w-3" />
                  {c.searchTerms.join(' | ')}
                </div>
                {c.careerPageUrl && (
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Globe className="h-3 w-3 text-pink-400" />
                    <a href={c.careerPageUrl} target="_blank" rel="noopener noreferrer" className="hover:underline truncate max-w-[250px]">{c.careerPageUrl}</a>
                  </div>
                )}
                {c.notes && (
                  <p className="text-xs text-muted-foreground">{c.notes}</p>
                )}
                <div className="flex items-center gap-2 pt-2">
                  <Button variant="outline" size="sm" onClick={() => openEdit(c)}>
                    <Pencil className="h-3 w-3 mr-1" /> 수정
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => handleDelete(c)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3 w-3 mr-1" /> 삭제
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bulk Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>엑셀 파일로 기업 일괄 등록</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border border-dashed border-muted-foreground/30 p-6 text-center">
              <FileSpreadsheet className="h-10 w-10 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                Excel(.xlsx, .xls) 또는 CSV 파일을 선택하세요
              </p>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleBulkUpload}
                  disabled={uploading}
                />
                <span className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors">
                  {uploading ? (
                    <>처리 중...</>
                  ) : (
                    <><Upload className="h-4 w-4" /> 파일 선택</>
                  )}
                </span>
              </label>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <p className="text-sm font-medium">파일 형식 안내</p>
              <ul className="text-xs text-muted-foreground space-y-1">
                <li>• 첫 번째 행은 헤더(컬럼명)로 인식됩니다</li>
                <li>• <strong>기업명</strong> (필수): &quot;기업명&quot;, &quot;회사명&quot;, &quot;company&quot; 등</li>
                <li>• <strong>별칭</strong> (선택): 쉼표로 구분하여 여러 개 입력 가능</li>
                <li>• <strong>검색어</strong> (선택): 비워두면 자동 생성됩니다</li>
                <li>• <strong>메모</strong> (선택): 참고사항</li>
                <li>• <strong>채용페이지</strong> (선택): 기업 자체 채용 사이트 URL</li>
                <li>• 기업명만 있는 단순 목록도 지원됩니다</li>
                <li>• 이미 등록된 기업명은 자동으로 건너뜁니다</li>
              </ul>
              <Button variant="outline" size="sm" className="mt-2" onClick={downloadTemplate}>
                <Download className="h-3 w-3 mr-1" />
                템플릿 다운로드
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>닫기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? '기업 수정' : '기업 추가'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="name">기업명 *</Label>
              <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="예: HD현대" />
            </div>
            <div>
              <Label htmlFor="aliases">별칭 (쉼표 구분)</Label>
              <Input id="aliases" value={form.aliases} onChange={(e) => setForm({ ...form, aliases: e.target.value })} placeholder="예: HD Hyundai, 현대중공업" />
            </div>
            <div>
              <Label htmlFor="searchTerms">검색어 (쉼표 구분, 비워두면 자동 생성)</Label>
              <Input id="searchTerms" value={form.searchTerms} onChange={(e) => setForm({ ...form, searchTerms: e.target.value })} placeholder="예: HD현대 AI, HD현대 데이터" />
              <p className="text-xs text-muted-foreground mt-1">비워두면 &quot;기업명 AI&quot;, &quot;기업명 인공지능&quot; 등이 자동 생성됩니다.</p>
            </div>
            <div>
              <Label htmlFor="careerPageUrl">채용 페이지 URL (선택)</Label>
              <Input id="careerPageUrl" value={form.careerPageUrl} onChange={(e) => setForm({ ...form, careerPageUrl: e.target.value })} placeholder="https://careers.example.com/jobs" />
              <p className="text-xs text-muted-foreground mt-1">기업 자체 채용 페이지 URL을 입력하면 AI가 채용 공고를 분석합니다.</p>
            </div>
            <div>
              <Label htmlFor="notes">메모</Label>
              <Textarea id="notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="참고사항..." rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSave}>{editingId ? '수정' : '등록'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
