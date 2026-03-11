import { NextRequest, NextResponse } from 'next/server';
import { getCompanies, addCompany, updateCompany, removeCompany } from '@/lib/storage';

export async function GET() {
  const list = await getCompanies();
  return NextResponse.json(list);
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, aliases = [], searchTerms = [], active = true, notes = '' } = body;

  if (!name) {
    return NextResponse.json({ error: '기업명은 필수입니다.' }, { status: 400 });
  }

  // Auto-generate search terms if not provided
  const terms = searchTerms.length > 0
    ? searchTerms
    : [`${name} AI`, `${name} 인공지능`, `${name} 데이터`];

  const company = await addCompany({ name, aliases, searchTerms: terms, active, notes });
  return NextResponse.json(company, { status: 201 });
}

export async function PATCH(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
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
