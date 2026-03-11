export type Platform = 'saramin' | 'jobkorea' | 'catch' | 'wanted';

export const PLATFORM_LABELS: Record<Platform, string> = {
  saramin: '사람인',
  jobkorea: '잡코리아',
  catch: '캐치',
  wanted: '원티드',
};

export interface JobPosting {
  id: string;
  companyName: string;
  companyKey: string;
  title: string;
  category: string;
  requirements: string;
  preferredQualifications: string;
  deadline: string;
  platform: Platform;
  sourceUrl: string;
  location?: string;
  experienceLevel?: string;
  employmentType?: string;
  salary?: string;
  firstSeenDate: string;
  lastSeenDate: string;
  keywords?: string[];
}

export interface DailyPostings {
  date: string;
  crawledAt: string;
  postings: JobPosting[];
  newCount: number;
}
