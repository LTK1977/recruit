import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

export async function GET() {
  let redisTest = 'skipped';

  // Redis 연결 테스트
  if (process.env.REDIS_URL) {
    try {
      const url = new URL(process.env.REDIS_URL);
      const redis = new Redis({
        url: `https://${url.hostname}`,
        token: url.password,
      });
      await redis.set('debug:test', 'ok');
      const val = await redis.get('debug:test');
      redisTest = val === 'ok' ? 'connected' : `unexpected: ${val}`;
    } catch (err) {
      redisTest = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  const info = {
    storageMode: getMode(),
    redisTest,
    env: {
      VERCEL: process.env.VERCEL ?? '(not set)',
      VERCEL_ENV: process.env.VERCEL_ENV ?? '(not set)',
      KV_REST_API_URL: process.env.KV_REST_API_URL ? '(set)' : '(not set)',
      KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? '(set)' : '(not set)',
      REDIS_URL: process.env.REDIS_URL ? '(set)' : '(not set)',
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY ? '(set)' : '(not set)',
      NODE_ENV: process.env.NODE_ENV ?? '(not set)',
      AWS_LAMBDA_FUNCTION_NAME: process.env.AWS_LAMBDA_FUNCTION_NAME ?? '(not set)',
    },
    cwd: process.cwd(),
    tmpWritable: await checkWritable('/tmp/recruit-test.txt'),
    cwdWritable: await checkWritable(process.cwd() + '/data/test-write.txt'),
  };
  return NextResponse.json(info);
}

function getMode(): string {
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) return 'kv';
  if (process.env.REDIS_URL) return 'kv (redis-url)';
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL_ENV) return 'tmpfile';
  return 'file';
}

async function checkWritable(path: string): Promise<boolean> {
  const { promises: fs } = await import('fs');
  try {
    await fs.writeFile(path, 'test', 'utf-8');
    await fs.unlink(path);
    return true;
  } catch {
    return false;
  }
}
