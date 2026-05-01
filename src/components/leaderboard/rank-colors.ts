export function rankTextColorClass(rank: number) {
  return rank === 1
    ? "text-gold-shimmer"
    : rank === 2
      ? "text-silver"
      : rank === 3
        ? "text-bronze"
        : rank <= 10
          ? "text-primary"
          : "text-muted-foreground";
}
