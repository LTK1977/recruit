import * as cheerio from 'cheerio';
import type { JobPosting } from '@/types/posting';
import type { Company } from '@/types/company';
import { hashPostingId, todayString } from '@/lib/constants';
import { globalRateLimiter } from './rate-limiter';
import { fetchWithTimeout } from './fetch-with-timeout';
import type { PlatformCrawler } from './crawler-service';

const BASE_URL = 'https://www.catch.co.kr';
const SEARCH_URL = `${BASE_URL}/NCS/RecruitSearch?search=`;
const USER_AGENT = 'RecruitMonitor/1.0 (internal-tool)';

export const catchCrawler: PlatformCrawler = {
  platform: 'catch',

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
          console.warn(`[catch] HTTP ${res.status} for "${term}"`);
          continue;
        }

        const html = await res.text();
        const $ = cheerio.load(html);

        // Parse recruit list items
        $('.recruit-list li, .list-recruit .item, .recruit_list li, table.board_list tbody tr').each(
          (_, el) => {
            try {
              const $el = $(el);
              const titleEl = $el.find('.title a, .tit a, a.title, td.title a, .recruit_title a');
              const title = titleEl.text().trim();
              const href = titleEl.attr('href') || '';
              const companyName =
                $el.find('.company, .corp, .company_name, td.company').text().trim() ||
                company.name;
              const deadline =
                $el.find('.date, .period, .d_day, td.date').text().trim() || '미정';
              const category =
                $el.find('.badge, .sector, .field, td.field').first().text().trim() || '';

              if (!title || !href) return;

              const sourceUrl = href.startsWith('http') ? href : `${BASE_URL}${href}`;

              allPostings.push({
                id: hashPostingId('catch', sourceUrl),
                companyName,
                companyKey: company.id,
                title,
                category,
                requirements: '',
                preferredQualifications: '',
                deadline,
                platform: 'catch',
                sourceUrl,
                firstSeenDate: todayString(),
                lastSeenDate: todayString(),
              });
            } catch { /* skip */ }
          }
        );
      } catch (err) {
        console.error(`[catch] Error crawling "${term}":`, err);
      }
    }

    return allPostings;
  },
};
