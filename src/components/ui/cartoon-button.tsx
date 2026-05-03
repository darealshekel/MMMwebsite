import { Slot } from "@radix-ui/react-slot";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

interface CartoonButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean;
  label?: string;
  children?: ReactNode;
  color?: string;
  variant?: "primary" | "secondary";
  hasHighlight?: boolean;
}

const variantClasses = {
  primary:
    "border-[#060606] bg-primary text-primary-foreground shadow-[5px_5px_0_#050505] hover:bg-primary/95 hover:shadow-[7px_7px_0_#050505]",
  secondary:
    "border-primary/80 bg-card text-foreground shadow-[5px_5px_0_#050505] hover:border-primary hover:bg-secondary hover:shadow-[7px_7px_0_#050505]",
};

export function CartoonButton({
  asChild = false,
  label,
  children,
  color,
  variant = "primary",
  hasHighlight = true,
  disabled = false,
  className,
  onClick,
  ...props
}: CartoonButtonProps) {
  const Comp = asChild ? Slot : "button";
  const handleClick: CartoonButtonProps["onClick"] = (event) => {
    if (disabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    onClick?.(event);
  };

  return (
    <Comp
      aria-disabled={disabled || undefined}
      disabled={asChild ? undefined : disabled}
      onClick={handleClick}
      className={cn(
        "group relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-[2px] border-2 px-5 font-pixel text-[8px] uppercase tracking-[0.1em]",
        "transition-[transform,box-shadow,background-color,border-color,filter] duration-150 ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "active:translate-x-[3px] active:translate-y-[3px] active:shadow-[2px_2px_0_#050505]",
        hasHighlight &&
          "after:pointer-events-none after:absolute after:left-[-110%] after:top-1/2 after:h-24 after:w-14 after:-translate-y-1/2 after:rotate-12 after:bg-white/25 after:transition-all after:duration-500 after:ease-in-out hover:after:left-[210%]",
        disabled
          ? "pointer-events-none cursor-not-allowed opacity-50"
          : "cursor-pointer hover:-translate-x-0.5 hover:-translate-y-1 hover:brightness-110",
        color ?? variantClasses[variant],
        className,
      )}
      {...props}
    >
      {children ?? label}
    </Comp>
  );
}
