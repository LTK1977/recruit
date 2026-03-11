import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { FilterState, SortConfig } from '@/types/filters';
import type { CrawlStatus } from '@/types/crawl';

interface RecruitMonitorState {
  filters: FilterState;
  setFilters: (filters: Partial<FilterState>) => void;
  resetFilters: () => void;

  sort: SortConfig;
  setSort: (sort: SortConfig) => void;

  sidebarOpen: boolean;
  toggleSidebar: () => void;

  crawlStatus: CrawlStatus;
  setCrawlStatus: (status: CrawlStatus) => void;
}

const DEFAULT_FILTERS: FilterState = {
  companyIds: [],
  platforms: [],
  dateFrom: null,
  dateTo: null,
  searchQuery: '',
  newOnly: false,
};

export const useStore = create<RecruitMonitorState>()(
  persist(
    (set) => ({
      filters: DEFAULT_FILTERS,
      setFilters: (partial) => set((s) => ({ filters: { ...s.filters, ...partial } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),

      sort: { field: 'firstSeenDate', direction: 'desc' } as SortConfig,
      setSort: (sort) => set({ sort }),

      sidebarOpen: true,
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),

      crawlStatus: 'idle' as CrawlStatus,
      setCrawlStatus: (crawlStatus) => set({ crawlStatus }),
    }),
    {
      name: 'recruit-monitor-storage',
      partialize: (state) => ({
        filters: state.filters,
        sort: state.sort,
        sidebarOpen: state.sidebarOpen,
      }),
    }
  )
);
