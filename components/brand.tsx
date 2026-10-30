import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

type MarkProps = { className?: string; size?: number };

/** Original globe symbol. Text color belongs to the surrounding surface. */
export function GlobeMark({ className, size = 36 }: MarkProps) {
  return (
    // A static vector keeps the mark equally crisp in the navigation and footer.
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/globe-mark.svg" alt="" aria-hidden="true" width={size} height={size} className={className} style={{ display: "block", flexShrink: 0 }} />
  );
}

export function Brand({ className, size = 36, markOnly = false, style }: MarkProps & { markOnly?: boolean; style?: CSSProperties }) {
  return (
    <span className={cn("globe-brand", className)} aria-label="globe" style={{ display: "inline-flex", alignItems: "center", gap: size * .2, color: "inherit", lineHeight: 1, ...style }}>
      <GlobeMark size={size} />
      {!markOnly && <span aria-hidden="true" style={{ fontSize: size * .88, fontWeight: 560, letterSpacing: "-.065em", lineHeight: 1 }}>globe</span>}
    </span>
  );
}
