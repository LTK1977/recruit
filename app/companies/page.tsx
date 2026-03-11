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
import { Plus, Pencil, Trash2, Building2, Search } from 'lucide-react';
import { fetchCompanies, createCompany, patchCompany, deleteCompany } from '@/lib/api-client';
import type { Company } from '@/types/company';
import { toast } from 'sonner';

interface FormData {
  name: string;
  aliases: string;
  searchTerms: string;
  notes: string;
}

const emptyForm: FormData = { name: '', aliases: '', searchTerms: '', notes: '' };

export default function CompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);

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
        await patchCompany(editingId, { name: form.name, aliases, searchTerms, notes: form.notes });
        toast.success('기업 정보가 수정되었습니다.');
      } else {
        await createCompany({ name: form.name, aliases, searchTerms, notes: form.notes });
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

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">모니터링 기업 관리</h1>
          <p className="text-sm text-muted-foreground mt-1">AI 채용을 모니터링할 고객사를 등록하세요</p>
        </div>
        <Button onClick={openAdd} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />
          기업 추가
        </Button>
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
