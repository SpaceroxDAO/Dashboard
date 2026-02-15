import { Card } from './Card';

interface SkeletonCardProps {
  count?: number;
  className?: string;
}

export function SkeletonCard({ count = 1, className = '' }: SkeletonCardProps) {
  const cards = Array.from({ length: count }, (_, i) => i);

  return (
    <>
      {cards.map((i) => (
        <Card key={i} className={`flex flex-col h-full animate-pulse ${className}`}>
          {/* Header skeleton */}
          <div className="flex items-start justify-between mb-3">
            <div className="p-2 rounded-lg bg-surface-hover w-9 h-9"></div>
            <div className="w-12 h-4 bg-surface-hover rounded"></div>
          </div>
          {/* Value skeleton */}
          <div className="text-3xl font-bold mb-1">
            <div className="w-16 h-8 bg-surface-hover rounded"></div>
          </div>
          {/* Label skeleton */}
          <div className="w-20 h-4 bg-surface-hover rounded mb-1"></div>
          {/* Subtitle skeleton */}
          <div className="w-24 h-3 bg-surface-hover rounded mt-1"></div>
        </Card>
      ))}
    </>
  );
}
