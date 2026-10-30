"use client";
import * as React from "react";
import { Tooltip as Base } from "@base-ui/react/tooltip";
import { cn } from "@/lib/utils";
function TooltipProvider({
  delayDuration,
  children,
  ...props
}: React.ComponentProps<typeof Base.Provider> & { delayDuration?: number }) {
  return (
    <Base.Provider delay={delayDuration} {...props}>
      {children}
    </Base.Provider>
  );
}
const Tooltip = Base.Root;
function TooltipTrigger({
  asChild,
  children,
  ...props
}: React.ComponentProps<typeof Base.Trigger> & { asChild?: boolean }) {
  return (
    <Base.Trigger
      {...props}
      render={asChild && React.isValidElement(children) ? children : undefined}
    >
      {asChild ? undefined : children}
    </Base.Trigger>
  );
}
const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Popup> & {
    sideOffset?: number;
    side?: "top" | "bottom" | "left" | "right";
  }
>(({ className, sideOffset = 5, side = "top", ...props }, ref) => (
  <Base.Portal>
    <div className="furnish-ui ds-portal">
      <Base.Positioner
        sideOffset={sideOffset}
        side={side}
        className="ds-positioner"
      >
        <Base.Popup
          ref={ref}
          className={cn("ds-popup ds-tooltip px-3 py-2 text-xs", className)}
          {...props}
        />
      </Base.Positioner>
    </div>
  </Base.Portal>
));
TooltipContent.displayName = "TooltipContent";
export { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent };
