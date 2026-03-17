import { OpenRouter } from '@openrouter/sdk';
import type { Company } from '@/types/company';
import { cleanCompanyName } from '@/lib/constants';

/** 채용 플랫폼 도메인 — AI 결과에서 제외 */
const BLOCKED_DOMAINS = [
  'saramin.co.kr', 'jobkorea.co.kr', 'wanted.co.kr', 'catch.co.kr',
  'linkedin.com', 'indeed.com', 'glassdoor.com', 'rocketpunch.com',
  'jobplanet.co.kr', 'incruit.com', 'alba.co.kr', 'work.go.kr',
];

interface AIDiscoverResult {
  company: string;
  url: string | null;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * AI에게 기업 목록의 채용페이지 URL을 요청 (10개씩 배치)
 */
async function askAIForCareerUrls(
  companyNames: string[],
  apiKey: string,
): Promise<AIDiscoverResult[]> {
  const openrouter = new OpenRouter({ apiKey });

  const companiesList = companyNames.map((n, i) => `${i + 1}. ${n}`).join('\n');

  const prompt = `당신은 한국 기업 정보 전문가입니다. 아래 기업들의 **공식 채용페이지(careers page)** URL을 알려주세요.

규칙:
- 반드시 기업이 직접 운영하는 채용 사이트 URL만 제공하세요
- 사람인, 잡코리아, 원티드 등 채용 플랫폼 URL은 절대 포함하지 마세요
- 확실하지 않으면 url을 null로 설정하세요
- 기업의 공식 홈페이지 내 채용 섹션(예: company.com/careers, company.co.kr/recruit)을 우선하세요

JSON 배열로만 응답하세요:
[
  { "company": "기업명", "url": "https://...", "confidence": "high|medium|low" },
  ...
]

기업 목록:
${companiesList}`;

  try {
    const response = await openrouter.chat.send({
      chatGenerationParams: {
        model: 'deepseek/deepseek-v3.2',
        messages: [{ role: 'user', content: prompt }],
      },
    });

    const content = ('choices' in response && response.choices?.[0]?.message?.content) || '[]';

    let jsonStr = content.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.results && Array.isArray(parsed.results)) return parsed.results;
    if (parsed.companies && Array.isArray(parsed.companies)) return parsed.companies;
    return [];
  } catch (err) {
    console.error('[discover] AI career URL discovery failed:', err);
    return [];
  }
}

/**
 * URL이 유효한지 HTTP HEAD 요청으로 검증
 */
async function verifyUrl(url: string): Promise<boolean> {
  try {
    // URL 형식 검증
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;

    // 차단 도메인 체크
    const hostname = parsed.hostname.toLowerCase();
    if (BLOCKED_DOMAINS.some(d => hostname.includes(d))) return false;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout);

    if (res.status >= 200 && res.status < 400) return true;

    // HEAD가 안 되면 GET으로 재시도
    const controller2 = new AbortController();
    const timeout2 = setTimeout(() => controller2.abort(), 8000);
    const res2 = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
      signal: controller2.signal,
      redirect: 'follow',
    });
    clearTimeout(timeout2);

    return res2.status >= 200 && res2.status < 400;
  } catch {
    return false;
  }
}

export interface DiscoverProgress {
  date: string;
  completedCompanyIds: string[];
  totalCompanies: number;
  discovered: number;
  failed: number;
  runCount: number;
  lastRunAt: string;
  isComplete: boolean;
}

export interface DiscoverBatchResult {
  results: { companyId: string; companyName: string; url: string | null; verified: boolean }[];
  progress: DiscoverProgress;
}

const MAX_DISCOVER_MS = process.env.VERCEL ? 45000 : 300000;
const BATCH_SIZE = 10; // AI 1회 호출당 처리 기업 수

/**
 * 배치로 채용페이지 URL을 탐색.
 * progress가 있으면 이어하기.
 */
export async function discoverCareerUrlBatch(
  companies: Company[],
  previousProgress: DiscoverProgress | null,
): Promise<DiscoverBatchResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY가 설정되지 않았습니다.');
  }

  const startTime = Date.now();
  const today = new Date().toISOString().slice(0, 10);

  const isResume = previousProgress && previousProgress.date === today && !previousProgress.isComplete;
  const completedIds = new Set(isResume ? previousProgress.completedCompanyIds : []);
  const runCount = isResume ? previousProgress.runCount + 1 : 1;

  // careerPageUrl이 없고, 아직 처리 안 된 기업만
  const targetCompanies = companies
    .filter(c => c.active && !c.careerPageUrl && !completedIds.has(c.id));

  const totalTarget = companies.filter(c => c.active && !c.careerPageUrl).length;
  const results: DiscoverBatchResult['results'] = [];
  let discovered = isResume ? previousProgress.discovered : 0;
  let failed = isResume ? previousProgress.failed : 0;

  // BATCH_SIZE씩 묶어서 AI에 요청
  for (let i = 0; i < targetCompanies.length; i += BATCH_SIZE) {
    if (Date.now() - startTime > MAX_DISCOVER_MS) break;

    const batch = targetCompanies.slice(i, i + BATCH_SIZE);
    const names = batch.map(c => cleanCompanyName(c.name) || c.name);

    // AI에게 URL 요청
    const aiResults = await askAIForCareerUrls(names, apiKey);

    // 각 기업별 결과 처리
    for (let j = 0; j < batch.length; j++) {
      const company = batch[j];
      const cleanedName = names[j];

      // AI 결과에서 매칭 (순서 또는 이름으로)
      const aiResult = aiResults[j] || aiResults.find(r =>
        r.company && (
          r.company.includes(cleanedName) ||
          cleanedName.includes(r.company) ||
          company.name.includes(r.company)
        )
      );

      let url: string | null = aiResult?.url || null;
      let verified = false;

      if (url) {
        verified = await verifyUrl(url);
        if (verified) {
          discovered++;
        } else {
          url = null; // 검증 실패 시 null
          failed++;
        }
      } else {
        failed++;
      }

      results.push({
        companyId: company.id,
        companyName: company.name,
        url,
        verified,
      });

      completedIds.add(company.id);
    }
  }

  const allCompleted = completedIds.size >= (totalTarget + (isResume ? previousProgress.completedCompanyIds.length - totalTarget : 0));
  // 남은 미처리 기업이 없으면 완료
  const remaining = companies.filter(c => c.active && !c.careerPageUrl && !completedIds.has(c.id)).length;
  const isComplete = remaining === 0;

  const progress: DiscoverProgress = {
    date: today,
    completedCompanyIds: Array.from(completedIds),
    totalCompanies: totalTarget,
    discovered,
    failed,
    runCount,
    lastRunAt: new Date().toISOString(),
    isComplete,
  };

  return { results, progress };
}
