import type { JobPosting } from '@/types/posting';
import type { Company } from '@/types/company';
import { hashPostingId, todayString } from '@/lib/constants';
import { globalRateLimiter } from './rate-limiter';
import type { PlatformCrawler } from './crawler-service';

// 사람인 공식 API: https://oapi.saramin.co.kr/job-search
const SARAMIN_API_BASE = 'https://oapi.saramin.co.kr/job-search';

interface SaraminJob {
  url?: string;
  active?: number;
  company?: { detail?: { name?: string; href?: string } };
  position?: {
    title?: string;
    industry?: { name?: string };
    location?: { name?: string };
    'job-type'?: { name?: string };
    'experience-level'?: { name?: string };
    'required-education-level'?: { name?: string };
    'job-category'?: { name?: string };
  };
  salary?: { name?: string };
  'posting-timestamp'?: number;
  'modification-timestamp'?: number;
  'opening-timestamp'?: number;
  'expiration-timestamp'?: number;
  keyword?: string;
  'close-type'?: { name?: string };
}

function parseDeadline(job: SaraminJob): string {
  if (job['close-type']?.name === '상시채용') return '상시채용';
  if (job['expiration-timestamp']) {
    return new Date(job['expiration-timestamp'] * 1000).toISOString().slice(0, 10);
  }
  return '미정';
}

function jobToPosting(job: SaraminJob, companyKey: string): JobPosting | null {
  const url = job.url;
  if (!url) return null;

  return {
    id: hashPostingId('saramin', url),
    companyName: job.company?.detail?.name || '',
    companyKey,
    title: job.position?.title || '',
    category: job.position?.['job-category']?.name || job.position?.industry?.name || '',
    requirements: `경력: ${job.position?.['experience-level']?.name || '미상'}, 학력: ${job.position?.['required-education-level']?.name || '미상'}`,
    preferredQualifications: job.keyword || '',
    deadline: parseDeadline(job),
    platform: 'saramin',
    sourceUrl: url,
    location: job.position?.location?.name,
    experienceLevel: job.position?.['experience-level']?.name,
    employmentType: job.position?.['job-type']?.name,
    salary: job.salary?.name,
    firstSeenDate: todayString(),
    lastSeenDate: todayString(),
    keywords: job.keyword ? job.keyword.split(',').map((k) => k.trim()) : [],
  };
}

export const saraminCrawler: PlatformCrawler = {
  platform: 'saramin',

  async crawl(company: Company): Promise<JobPosting[]> {
    const apiKey = process.env.SARAMIN_API_KEY;
    if (!apiKey) {
      console.warn('[saramin] SARAMIN_API_KEY not set, skipping');
      return [];
    }

    const allPostings: JobPosting[] = [];

    for (const term of company.searchTerms) {
      await globalRateLimiter.wait();

      const params = new URLSearchParams({
        'access-key': apiKey,
        keywords: term,
        count: '50',
        sort: 'D',
      });

      try {
        const res = await fetch(`${SARAMIN_API_BASE}?${params}`, {
          headers: { Accept: 'application/json' },
        });

        if (!res.ok) {
          console.warn(`[saramin] API error ${res.status} for "${term}"`);
          continue;
        }

        const data = await res.json();
        const jobs: SaraminJob[] = data?.jobs?.job || [];

        for (const job of jobs) {
          const posting = jobToPosting(job, company.id);
          if (posting) allPostings.push(posting);
        }
      } catch (err) {
        console.error(`[saramin] Error crawling "${term}":`, err);
      }
    }

    return allPostings;
  },
};
