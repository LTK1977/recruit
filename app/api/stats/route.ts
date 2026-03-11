import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { getCompanies, getCrawlLog, getPostingsByDate } from '@/lib/storage';
import { todayString } from '@/lib/constants';
import type { DashboardStats } from '@/types/filters';
import type { Platform, JobPosting } from '@/types/posting';

export async function GET() {
  const { companies } = await getCompanies();
  const crawlLog = await getCrawlLog();
  const today = todayString();

  // Collect last 7 days of postings
  const last7Days: { date: string; count: number }[] = [];
  const allPostings: JobPosting[] = [];
  const byPlatform: Record<Platform, number> = { saramin: 0, jobkorea: 0, catch: 0, wanted: 0 };
  const byCompanyMap = new Map<string, number>();

  const postingsDir = path.join(process.cwd(), 'data', 'postings');

  try {
    const files = await fs.readdir(postingsDir);
    const jsonFiles = files.filter((f) => f.endsWith('.json')).sort().reverse().slice(0, 30);

    for (const file of jsonFiles) {
      const date = file.replace('.json', '');
      const data = await getPostingsByDate(date);
      if (!data) continue;

      allPostings.push(...data.postings);

      // Check if within last 7 days
      const d = new Date(date);
      const t = new Date(today);
      const diffDays = Math.floor((t.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays >= 0 && diffDays < 7) {
        last7Days.push({ date, count: data.newCount });
      }
    }
  } catch { /* no data yet */ }

  // Deduplicate
  const seen = new Map<string, JobPosting>();
  for (const p of allPostings) {
    seen.set(p.id, p);
  }
  const unique = Array.from(seen.values());

  // Count stats
  for (const p of unique) {
    byPlatform[p.platform] = (byPlatform[p.platform] || 0) + 1;
    byCompanyMap.set(p.companyName, (byCompanyMap.get(p.companyName) || 0) + 1);
  }

  const todayPostings = unique.filter((p) => p.firstSeenDate === today);
  const lastSession = crawlLog.sessions[0] || null;

  const stats: DashboardStats = {
    totalPostings: unique.length,
    newToday: todayPostings.length,
    activeCompanies: companies.filter((c) => c.active).length,
    lastCrawlAt: lastSession?.completedAt || lastSession?.startedAt || null,
    lastCrawlStatus: lastSession?.status || null,
    byPlatform,
    byCompany: Array.from(byCompanyMap.entries())
      .map(([companyName, count]) => ({ companyName, count }))
      .sort((a, b) => b.count - a.count),
    trendLast7Days: last7Days.sort((a, b) => a.date.localeCompare(b.date)),
  };

  return NextResponse.json(stats);
}
