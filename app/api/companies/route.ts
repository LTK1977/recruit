import { NextRequest, NextResponse } from 'next/server';
import { getCompanies, addCompany, updateCompany, removeCompany } from '@/lib/storage';
import { generateSearchTerms } from '@/lib/constants';

export async function GET() {
  const list = await getCompanies();
  return NextResponse.json(list);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, aliases = [], searchTerms = [], active = true, notes = '', careerPageUrl } = body;

  if (!name) {
    return NextResponse.json({ error: '기업명은 필수입니다.' }, { status: 400 });
  }

  // Auto-generate search terms if not provided (법인 표기 제거 후 생성)
  const terms = searchTerms.length > 0
    ? searchTerms
    : generateSearchTerms(name);

  const company = await addCompany({ name, aliases, searchTerms: terms, active, notes, careerPageUrl: careerPageUrl || undefined });
  return NextResponse.json(company, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  const action = searchParams.get('action');

  // 전체 기업 검색어 일괄 재생성
  if (action === 'regenerate-search-terms') {
    const { companies } = await getCompanies();
    let updated = 0;
    for (const company of companies) {
      const newTerms = generateSearchTerms(company.name);
      const oldTerms = company.searchTerms;
      // 기존 검색어가 기본 생성 패턴이면 재생성 (커스텀은 유지)
      const isDefault = oldTerms.length <= 3 && oldTerms.some(t =>
        t.includes(' AI') || t.includes(' 인공지능') || t.includes(' 데이터')
      );
      if (isDefault || oldTerms.length === 0) {
        await updateCompany(company.id, { searchTerms: newTerms });
        updated++;
      }
    }
    return NextResponse.json({ success: true, total: companies.length, updated });
  }

  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  const updates = await request.json();
  const company = await updateCompany(id, updates);
  if (!company) return NextResponse.json({ error: '기업을 찾을 수 없습니다.' }, { status: 404 });

  return NextResponse.json(company);
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  const removed = await removeCompany(id);
  if (!removed) return NextResponse.json({ error: '기업을 찾을 수 없습니다.' }, { status: 404 });

  return NextResponse.json({ success: true });
}
