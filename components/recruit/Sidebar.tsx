'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, FileText, Building2, History, Radar, Loader2, Square } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCrawl } from '@/contexts/CrawlContext';

const navItems = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/postings', label: '채용공고', icon: FileText },
  { href: '/companies', label: '기업관리', icon: Building2 },
  { href: '/crawl-log', label: '크롤링 이력', icon: History },
];

export function Sidebar() {
  const pathname = usePathname();
  const { isCrawling, progress, stopCrawl } = useCrawl();

  return (
    <aside className="w-56 shrink-0 border-r border-border bg-sidebar flex flex-col">
      <div className="flex items-center gap-2 px-4 py-5 border-b border-border">
        <Radar className="h-6 w-6 text-primary" />
        <h1 className="text-base font-bold text-sidebar-foreground">AI 채용 모니터</h1>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-1">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors',
                active
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* 크롤링 진행 상태 */}
      {isCrawling && (
        <div className="mx-2 mb-2 rounded-lg border border-blue-500/30 bg-blue-500/10 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin flex-shrink-0" />
            <span className="text-xs font-medium text-blue-400">크롤링 진행 중</span>
          </div>
          {progress && (
            <p className="text-xs text-blue-300/80 pl-5.5">{progress}</p>
          )}
          <button
            onClick={stopCrawl}
            className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 transition-colors pl-0.5 cursor-pointer"
          >
            <Square className="h-3 w-3 fill-current" />
            중지
          </button>
        </div>
      )}

      <div className="px-4 py-3 border-t border-border text-xs text-muted-foreground">
        내부 모니터링 도구
      </div>
    </aside>
  );
}
