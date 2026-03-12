import { NextResponse } from 'next/server';

export async function GET() {
  const info = {
    storageMode: getMode(),
    env: {
      VERCEL: process.env.VERCEL ?? '(not set)',
      VERCEL_ENV: process.env.VERCEL_ENV ?? '(not set)',
      KV_REST_API_URL: process.env.KV_REST_API_URL ? '(set)' : '(not set)',
      KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN ? '(set)' : '(not set)',
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
