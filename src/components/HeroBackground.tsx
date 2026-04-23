export function HeroBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 bg-background" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,0.015),transparent_20%,transparent_82%,rgba(255,255,255,0.015))]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.012),transparent_22%,transparent_78%,rgba(255,255,255,0.012))]" />
      <div className="absolute inset-0 bg-gradient-to-b from-background/35 via-background/10 to-background" />
    </div>
  );
}
