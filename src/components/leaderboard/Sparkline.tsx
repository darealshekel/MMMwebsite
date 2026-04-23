interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  className?: string;
  strokeClass?: string;
  fillClass?: string;
}

export const Sparkline = ({
  data,
  width = 600,
  height = 140,
  className = "",
  strokeClass = "stroke-primary",
  fillClass = "fill-primary/15",
}: SparklineProps) => {
  if (data.length === 0) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);

  const points = data.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * (height - 12) - 6;
    return [x, y] as const;
  });

  const linePath = points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const areaPath = `${linePath} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`w-full h-full ${className}`}
      aria-hidden="true"
    >
      {[0.25, 0.5, 0.75].map((p) => (
        <line
          key={p}
          x1={0}
          x2={width}
          y1={height * p}
          y2={height * p}
          className="stroke-border"
          strokeDasharray="2 4"
          strokeWidth={1}
        />
      ))}
      <path d={areaPath} className={fillClass} />
      <path d={linePath} className={strokeClass} fill="none" strokeWidth={2} strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <rect
          key={i}
          x={x - 1.5}
          y={y - 1.5}
          width={3}
          height={3}
          className={i === points.length - 1 ? "fill-primary" : "fill-foreground/40"}
        />
      ))}
    </svg>
  );
};
