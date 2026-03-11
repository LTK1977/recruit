import * as cheerio from 'cheerio';
import type { JobPosting } from '@/types/posting';
import type { Company } from '@/types/company';
import { hashPostingId, todayString } from '@/lib/constants';
import { globalRateLimiter } from './rate-limiter';
import type { PlatformCrawler } from './crawler-service';

const BASE_URL = 'https://www.wanted.co.kr';
const USER_AGENT = 'RecruitMonitor/1.0 (internal-tool)';

interface WantedJob {
  id?: number;
  position?: string;
  company?: { name?: string; id?: number };
  category?: { name?: string };
  address?: { full_location?: string; country?: string };
  due_time?: string;
  title_img?: { origin?: string };
}

export const wantedCrawler: PlatformCrawler = {
  platform: 'wanted',

  async crawl(company: Company): Promise<JobPosting[]> {
    const allPostings: JobPosting[] = [];

    for (const term of company.searchTerms) {
      await globalRateLimiter.wait();

      // Try internal API first
      try {
        const apiUrl = `https://www.wanted.co.kr/api/v4/jobs?query=${encodeURIComponent(term)}&country=kr&job_sort=job.latest_order&years=-1&limit=50`;
        const res = await fetch(apiUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'application/json',
            'Accept-Language': 'ko-KR,ko;q=0.9',
          },
        });

        if (res.ok) {
          const data = await res.json();
          const jobs: WantedJob[] = data?.data || [];

          for (const job of jobs) {
            if (!job.id) continue;
            const sourceUrl = `${BASE_URL}/wd/${job.id}`;

            allPostings.push({
              id: hashPostingId('wanted', sourceUrl),
              companyName: job.company?.name || company.name,
              companyKey: company.id,
              title: job.position || '',
              category: job.category?.name || '',
              requirements: '',
              preferredQualifications: '',
              deadline: job.due_time || '상시채용',
              platform: 'wanted',
              sourceUrl,
              location: job.address?.full_location,
              firstSeenDate: todayString(),
              lastSeenDate: todayString(),
            });
          }
          continue; // API worked, skip HTML fallback
        }
      } catch {
        // API failed, try HTML fallback
      }

      // HTML fallback
      await globalRateLimiter.wait();
      try {
        const url = `${BASE_URL}/search?query=${encodeURIComponent(term)}&tab=position`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept: 'text/html',
            'Accept-Language': 'ko-KR,ko;q=0.9',
          },
        });

        if (!res.ok) continue;

        const html = await res.text();
        const $ = cheerio.load(html);

        $('[class*="JobCard"], [data-cy="job-card"], a[href^="/wd/"]').each((_, el) => {
          try {
            const $el = $(el);
            const href = $el.attr('href') || $el.find('a').first().attr('href') || '';
            const title = $el.find('[class*="title"], [class*="position"]').first().text().trim() ||
              $el.text().trim().split('\n')[0]?.trim() || '';
            const companyName = $el.find('[class*="company"]').first().text().trim() || company.name;

            if (!title || !href) return;

            const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

            allPostings.push({
              id: hashPostingId('wanted', sourceUrl),
              companyName,
              companyKey: company.id,
              title,
              category: '',
              requirements: '',
              preferredQualifications: '',
              deadline: '상시채용',
              platform: 'wanted',
              sourceUrl,
              firstSeenDate: todayString(),
              lastSeenDate: todayString(),
            });
          } catch { /* skip */ }
        });
      } catch (err) {
        console.error(`[wanted] Error crawling "${term}":`, err);
      }
    }

    return allPostings;
  },
};
