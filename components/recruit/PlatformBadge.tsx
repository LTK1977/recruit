import { Badge } from '@/components/ui/badge';
import type { Platform } from '@/types/posting';
import { PLATFORMS } from '@/lib/constants';
import { cn } from '@/lib/utils';

const platformColors: Record<Platform, string> = {
  saramin: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  jobkorea: 'bg-green-500/15 text-green-400 border-green-500/30',
  catch: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  wanted: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

export function PlatformBadge({ platform }: { platform: Platform }) {
  const info = PLATFORMS.find((p) => p.key === platform);
  return (
    <Badge variant="outline" className={cn('text-xs font-medium', platformColors[platform])}>
      {info?.label || platform}
    </Badge>
  );
}

export function NewBadge() {
  return (
    <Badge className="bg-red-500/15 text-red-400 border-red-500/30 text-[10px] px-1.5 py-0" variant="outline">
      NEW
    </Badge>
  );
}
