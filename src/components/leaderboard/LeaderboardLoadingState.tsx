export function LeaderboardLoadingState() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 6 }).map((_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-[26px] border border-white/8 bg-gradient-to-r from-card/80 via-card/40 to-card/80"
        />
      ))}
    </div>
  );
}
