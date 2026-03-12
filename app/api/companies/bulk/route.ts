import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { addCompaniesBulk } from '@/lib/storage';

interface ParsedRow {
  name: string;
  aliases: string[];
  searchTerms: string[];
  notes: string;
}

function parseExcelBuffer(buffer: Buffer): ParsedRow[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });

  const results: ParsedRow[] = [];

  for (const row of rows) {
    // 유연한 컬럼 매핑: 다양한 헤더명 지원
    const name = String(
      row['기업명'] ?? row['회사명'] ?? row['company'] ?? row['Company'] ??
      row['name'] ?? row['Name'] ?? row['기업'] ?? row['회사'] ?? ''
    ).trim();

    if (!name) continue; // 기업명 없으면 스킵

    const aliasRaw = String(
      row['별칭'] ?? row['aliases'] ?? row['Aliases'] ?? row['다른이름'] ?? ''
    ).trim();

    const searchRaw = String(
      row['검색어'] ?? row['searchTerms'] ?? row['SearchTerms'] ?? row['search'] ?? ''
    ).trim();

    const notes = String(
      row['메모'] ?? row['notes'] ?? row['Notes'] ?? row['비고'] ?? row['참고'] ?? ''
    ).trim();

    const aliases = aliasRaw ? aliasRaw.split(/[,;|]/).map(s => s.trim()).filter(Boolean) : [];
    const searchTerms = searchRaw ? searchRaw.split(/[,;|]/).map(s => s.trim()).filter(Boolean) : [];

    results.push({ name, aliases, searchTerms, notes });
  }

  return results;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '파일이 첨부되지 않았습니다.' }, { status: 400 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      return NextResponse.json(
        { error: '지원하지 않는 파일 형식입니다. xlsx, xls, csv 파일만 가능합니다.' },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parsed = parseExcelBuffer(buffer);

    if (parsed.length === 0) {
      return NextResponse.json(
        { error: '파일에서 기업 정보를 찾을 수 없습니다. 첫 번째 열에 기업명이 포함되어 있는지 확인하세요.' },
        { status: 400 }
      );
    }

    // 검색어 자동 생성 후 배치로 한번에 저장
    const items = parsed.map(row => ({
      name: row.name,
      aliases: row.aliases,
      searchTerms: row.searchTerms.length > 0
        ? row.searchTerms
        : [`${row.name} AI`, `${row.name} 인공지능`, `${row.name} 데이터`],
      active: true,
      notes: row.notes,
    }));

    const result = await addCompaniesBulk(items);

    return NextResponse.json({
      success: true,
      total: parsed.length,
      added: result.added.length,
      skipped: result.duplicateNames.length,
      skippedNames: result.duplicateNames.slice(0, 20),
    });
  } catch (err) {
    console.error('Bulk upload error:', err);
    return NextResponse.json(
      { error: '파일 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
