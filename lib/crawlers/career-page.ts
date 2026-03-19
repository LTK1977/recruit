import { OpenRouter } from '@openrouter/sdk';
import * as cheerio from 'cheerio';
import type { JobPosting } from '@/types/posting';
import type { Company } from '@/types/company';
import type { PlatformCrawler } from './crawler-service';
import { globalRateLimiter } from './rate-limiter';
import { fetchWithTimeout } from './fetch-with-timeout';
import { hashPostingId, todayString } from '@/lib/constants';

interface ExtractedJob {
  title?: string;
  category?: string;
  requirements?: string;
  preferredQualifications?: string;
  deadline?: string;
  url?: string;
  location?: string;
  experienceLevel?: string;
  employmentType?: string;
  salary?: string;
}

/**
 * HTML에서 불필요한 요소를 제거하고 텍스트만 추출.
 * AI 토큰 사용량 최소화를 위해 12,000자로 제한.
 */
function cleanHtml(rawHtml: string): string {
  const $ = cheerio.load(rawHtml);
  // 비콘텐츠 요소 제거
  $('script, style, svg, nav, footer, header, noscript, iframe, link, meta, img, video, audio').remove();
  // 텍스트 추출 및 공백 정리
  const text = $('body').text().replace(/\s+/g, ' ').trim();
  // 12,000자 제한 (~4,000 토큰)
  return text.slice(0, 12000);
}

/**
 * AI를 사용하여 채용 페이지 텍스트에서 AI 관련 채용 공고를 추출.
 */
async function extractJobsWithAI(
  text: string,
  companyName: string,
  apiKey: string,
): Promise<ExtractedJob[]> {
  const openrouter = new OpenRouter({ apiKey });

  const prompt = `당신은 채용 공고 추출 전문 AI입니다. 아래는 "${companyName}" 기업의 채용 페이지에서 추출한 텍스트입니다.

이 텍스트에서 AI, 머신러닝, 딥러닝, 데이터사이언스, NLP, 컴퓨터비전, LLM, 생성형AI, 데이터엔지니어링과 관련된 채용 공고만 찾아서 JSON 배열로 반환해 주세요.

각 공고는 다음 필드를 포함해야 합니다:
- title: 직무명
- category: 부서/분야
- requirements: 주요 자격요건
- preferredQualifications: 우대사항
- deadline: 마감일 (없으면 "상시채용")
- url: 공고 상세 URL (있는 경우)
- location: 근무지
- experienceLevel: 경력 조건
- employmentType: 고용형태 (정규직/계약직 등)
- salary: 급여 정보 (있는 경우)

AI 관련 공고가 없으면 빈 배열 []을 반환하세요.
반드시 JSON 배열만 반환하세요. 다른 텍스트는 포함하지 마세요.

채용 페이지 텍스트:
${text}`;

  try {
    // OpenRouter SDK: chat.send() with chatGenerationParams wrapper
    const response = await openrouter.chat.send({
      chatGenerationParams: {
        model: 'deepseek/deepseek-v3.2',
        messages: [{ role: 'user', content: prompt }],
      },
    });

    // Non-streaming response: ChatResponse
    const content = ('choices' in response && response.choices?.[0]?.message?.content) || '[]';

    // JSON 파싱 (코드 블록 감싸진 경우 처리)
    let jsonStr = content.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed;
    // { jobs: [...] } 또는 { postings: [...] } 형태 처리
    if (parsed.jobs && Array.isArray(parsed.jobs)) return parsed.jobs;
    if (parsed.postings && Array.isArray(parsed.postings)) return parsed.postings;
    if (parsed.data && Array.isArray(parsed.data)) return parsed.data;
    return [];
  } catch (err) {
    console.error(`[career] AI extraction failed for ${companyName}:`, err);
    return [];
  }
}

export const careerPageCrawler: PlatformCrawler = {
  platform: 'career',

  async crawl(company: Company): Promise<JobPosting[]> {
    // careerPageUrl이 없는 기업은 스킵
    if (!company.careerPageUrl) return [];

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      console.warn('[career] OPENROUTER_API_KEY not set, skipping career page crawling');
      return [];
    }

    await globalRateLimiter.wait();

    try {
      // 채용 페이지 HTML 가져오기
      const res = await fetchWithTimeout(company.careerPageUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml',
        },
        timeout: 10000,
      });

      if (!res.ok) {
        console.warn(`[career] HTTP ${res.status} for ${company.name}: ${company.careerPageUrl}`);
        return [];
      }

      const html = await res.text();
      const cleanedText = cleanHtml(html);

      // 텍스트가 너무 적으면 스킵 (SPA 등으로 콘텐츠 로드 안 된 경우)
      if (cleanedText.length < 50) {
        console.warn(`[career] Too little content for ${company.name} (${cleanedText.length} chars)`);
        return [];
      }

      // AI로 채용 공고 추출
      const extracted = await extractJobsWithAI(cleanedText, company.name, apiKey);
      const today = todayString();

      return extracted.map((job) => ({
        id: hashPostingId('career', `${company.careerPageUrl}:${job.title || 'unknown'}`),
        companyName: company.name,
        companyKey: company.id,
        title: job.title || '',
        category: job.category || '',
        requirements: job.requirements || '',
        preferredQualifications: job.preferredQualifications || '',
        deadline: job.deadline || '상시채용',
        platform: 'career' as const,
        sourceUrl: job.url || company.careerPageUrl!,
        location: job.location,
        experienceLevel: job.experienceLevel,
        employmentType: job.employmentType,
        salary: job.salary,
        firstSeenDate: today,
        lastSeenDate: today,
      }));
    } catch (err) {
      console.error(`[career] Error for ${company.name}:`, err);
      return [];
    }
  },
};
