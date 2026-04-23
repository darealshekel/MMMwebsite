import type { ComponentPropsWithoutRef, CSSProperties, ElementType, ReactNode } from "react";
import { getBlocksMinedColor } from "@/lib/blocks-mined-colors";
import { cn } from "@/lib/utils";

type BlocksMinedValueProps<T extends ElementType> = {
  as?: T;
  value: number | null | undefined;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
} & Omit<ComponentPropsWithoutRef<T>, "as" | "children" | "className" | "style">;

function withSoftWrapSeparators(value: ReactNode) {
  if (typeof value === "number") {
    return value.toLocaleString().replace(/,/g, ",\u200B");
  }

  if (typeof value === "string") {
    return value.replace(/,/g, ",\u200B");
  }

  return value;
}

export function BlocksMinedValue<T extends ElementType = "span">({
  as,
  value,
  children,
  className,
  style,
  ...rest
}: BlocksMinedValueProps<T>) {
  const Component = (as ?? "span") as ElementType;
  const color = getBlocksMinedColor(value);

  return (
    <Component
      className={cn("tabular-nums tracking-[0.04em] leading-tight break-words [overflow-wrap:anywhere]", className)}
      style={color ? { ...style, color } : style}
      {...rest}
    >
      {withSoftWrapSeparators(children ?? (value != null ? value.toLocaleString() : "—"))}
    </Component>
  );
}
