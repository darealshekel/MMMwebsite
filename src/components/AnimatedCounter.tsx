import { useEffect, useState, useRef } from "react";
import { useInView } from "framer-motion";

interface AnimatedCounterProps {
  target: number;
  duration?: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}

export function AnimatedCounter({ target, duration = 2, prefix = "", suffix = "", decimals = 0 }: AnimatedCounterProps) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (!inView) return;
    const startTime = Date.now();
    const end = target;
    const timer = setInterval(() => {
      const elapsed = (Date.now() - startTime) / (duration * 1000);
      if (elapsed >= 1) {
        setCount(end);
        clearInterval(timer);
      } else {
        const eased = 1 - Math.pow(1 - elapsed, 3);
        setCount(Math.floor(eased * end));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [inView, target, duration]);

  return (
    <span ref={ref} className="tabular-nums">
      {prefix}{decimals > 0 ? count.toFixed(decimals) : count.toLocaleString()}{suffix}
    </span>
  );
}
