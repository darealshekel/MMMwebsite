import { cn } from "@/lib/utils";
import { rankTextColorClass } from "@/components/leaderboard/rank-colors";

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

  return (
    <div
      className={cn(
        "shrink-0 whitespace-nowrap font-pixel leading-none tabular-nums",
        sizeClass,
        rankTextColorClass(rank),
        className,
      )}
    >
      {label}
    </div>
  );
}
