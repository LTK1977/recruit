import type { Metadata } from 'next';
import { Noto_Sans_KR } from 'next/font/google';
import { Toaster } from '@/components/ui/sonner';
import { Sidebar } from '@/components/recruit/Sidebar';
import { CrawlProvider } from '@/contexts/CrawlContext';
import './globals.css';

const notoSansKR = Noto_Sans_KR({
  variable: '--font-noto',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'AI 채용 모니터',
  description: '고객사 AI 채용 동향 모니터링 대시보드',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <body className={`${notoSansKR.variable} antialiased`}>
        <CrawlProvider>
          <div className="flex min-h-dvh">
            <Sidebar />
            <main className="flex-1 overflow-auto">{children}</main>
          </div>
          <Toaster position="bottom-right" />
        </CrawlProvider>
      </body>
    </html>
  );
}
