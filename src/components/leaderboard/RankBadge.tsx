import { cn } from "@/lib/utils";

export function RankBadge({
  rank,
  highlighted = false,
  className,
}: {
  rank: number;
  highlighted?: boolean;
  className?: string;
}) {
  const label = `#${rank}`;
  const sizeClass = label.length >= 6
    ? "min-w-[4.6rem] text-[8px]"
    : label.length >= 5
      ? "min-w-[4rem] text-[9px]"
      : "min-w-10 text-sm";

  const colorClass =
    rank === 1
      ? "text-gold-shimmer"
      : highlighted
        ? "text-primary text-glow-primary"
        : "text-muted-foreground";

  return (
    <div
      className={cn(
        "shrink-0 whitespace-nowrap font-pixel leading-none tabular-nums",
        sizeClass,
        colorClass,
        className,
      )}
    >
      {label}
    </div>
  );
}
