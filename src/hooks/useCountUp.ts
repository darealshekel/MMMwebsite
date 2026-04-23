import { useEffect, useRef, useState } from "react";

interface Options {
  duration?: number;
  delay?: number;
  start?: boolean;
}

export const useCountUp = (target: number, { duration = 1600, delay = 0, start = true }: Options = {}) => {
  const [value, setValue] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!start) return;
    let cancelled = false;
    const begin = performance.now() + delay;

    const step = (t: number) => {
      if (cancelled) return;
      const elapsed = t - begin;
      if (elapsed < 0) {
        rafRef.current = requestAnimationFrame(step);
        return;
      }

      const progress = Math.min(1, elapsed / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setValue(target);
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay, start]);

  return value;
};

export const formatNumber = (n: number) => n.toLocaleString("en-US");
