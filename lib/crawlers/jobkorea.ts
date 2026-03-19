import * as cheerio from 'cheerio';
import type { JobPosting } from '@/types/posting';
import type { Company } from '@/types/company';
import { hashPostingId, todayString } from '@/lib/constants';
import { globalRateLimiter } from './rate-limiter';
import { fetchWithTimeout } from './fetch-with-timeout';
import type { PlatformCrawler } from './crawler-service';

const BASE_URL = 'https://www.jobkorea.co.kr';
const SEARCH_URL = `${BASE_URL}/Search/?stext=`;
const USER_AGENT = 'RecruitMonitor/1.0 (internal-tool)';

export const jobkoreaCrawler: PlatformCrawler = {
  platform: 'jobkorea',

  async crawl(company: Company): Promise<JobPosting[]> {
    const allPostings: JobPosting[] = [];

    for (const term of company.searchTerms) {
      await globalRateLimiter.wait();

      try {
        const url = `${SEARCH_URL}${encodeURIComponent(term)}`;
        const res = await fetchWithTimeout(url, {
          headers: {
            'User-Agent': USER_AGENT,
            'Accept-Language': 'ko-KR,ko;q=0.9',
            Accept: 'text/html,application/xhtml+xml',
          },
          timeout: 10000,
        });

        if (!res.ok) {
          console.warn(`[jobkorea] HTTP ${res.status} for "${term}"`);
          continue;
        }

        const html = await res.text();
        const $ = cheerio.load(html);

        // Parse search result items
        $('.list-post .post-list-info, .recruit-info .list-item, .list-default .list-post').each(
          (_, el) => {
            try {
              const $el = $(el);
              const titleEl = $el.find('.title, .post-list-info .title a, a.title');
              const title = titleEl.text().trim();
              const href = titleEl.attr('href') || $el.find('a').first().attr('href') || '';
              const companyName =
                $el.find('.name, .post-list-corp .name a, .corp-name a').text().trim() ||
                company.name;
              const deadline = $el.find('.date, .exp, .option .date').text().trim() || '미정';
              const category =
                $el.find('.chip, .job-sector, .etc').first().text().trim() || '';

              if (!title || !href) return;

              const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

              allPostings.push({
                id: hashPostingId('jobkorea', sourceUrl),
                companyName,
                companyKey: company.id,
                title,
                category,
                requirements: '',
                preferredQualifications: '',
                deadline,
                platform: 'jobkorea',
                sourceUrl,
                firstSeenDate: todayString(),
                lastSeenDate: todayString(),
              });
            } catch { /* skip malformed item */ }
          }
        );
      } catch (err) {
        console.error(`[jobkorea] Error crawling "${term}":`, err);
      }
    }

    return allPostings;
  },
};
