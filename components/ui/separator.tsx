"use client";
import * as React from "react";
import { Separator as Base } from "@base-ui/react/separator";
import { cn } from "@/lib/utils";
const Separator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base> & { decorative?: boolean }
>(
  (
    { className, orientation = "horizontal", decorative = true, ...props },
    ref,
  ) => (
    <Base
      ref={ref}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      aria-hidden={decorative || undefined}
      {...props}
    />
  ),
);
Separator.displayName = "Separator";
export { Separator };
