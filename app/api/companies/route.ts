import { NextRequest, NextResponse } from 'next/server';
import { getCompanies, saveCompanies, addCompany, updateCompany, removeCompany } from '@/lib/storage';
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

  // 전체 기업 검색어 일괄 재생성 (강제, 한 번에 저장)
  if (action === 'regenerate-search-terms') {
    const list = await getCompanies();
    let updated = 0;
    for (const company of list.companies) {
      const newTerms = generateSearchTerms(company.name);
      company.searchTerms = newTerms;
      updated++;
    }
    list.updatedAt = new Date().toISOString();
    await saveCompanies(list);
    return NextResponse.json({ success: true, total: list.companies.length, updated });
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
