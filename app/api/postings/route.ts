import { NextRequest, NextResponse } from 'next/server';
import { queryPostings } from '@/lib/storage';
import type { Platform } from '@/types/posting';
import type { SortField, SortDirection } from '@/types/filters';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const companyIds = searchParams.get('companyIds')?.split(',').filter(Boolean) || [];
  const platforms = (searchParams.get('platforms')?.split(',').filter(Boolean) || []) as Platform[];
  const dateFrom = searchParams.get('dateFrom') || null;
  const dateTo = searchParams.get('dateTo') || null;
  const searchQuery = searchParams.get('search') || '';
  const newOnly = searchParams.get('newOnly') === 'true';
  const sortField = (searchParams.get('sort') || 'firstSeenDate') as SortField;
  const sortDir = (searchParams.get('dir') || 'desc') as SortDirection;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);

  const result = await queryPostings({
    companyIds,
    platforms,
    dateFrom,
    dateTo,
    searchQuery,
    newOnly,
    sort: { field: sortField, direction: sortDir },
    page,
    pageSize,
  });

  return NextResponse.json(result);
}
