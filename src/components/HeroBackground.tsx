export function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-background" />
      <div className="hero-grid-pattern absolute inset-[-8%]" />
      <div className="hero-grid-lens absolute" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_38%,transparent_0%,hsl(var(--background)/0.22)_42%,hsl(var(--background)/0.94)_100%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/5 via-background/18 to-background" />
    </div>
  );
}
