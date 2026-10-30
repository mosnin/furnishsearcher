"use client";
import * as React from "react";
import { Switch as Base } from "@base-ui/react/switch";
import { cn } from "@/lib/utils";
const Switch = React.forwardRef<
  HTMLElement,
  React.ComponentPropsWithoutRef<typeof Base.Root>
>(({ className, ...props }, ref) => (
  <Base.Root
    ref={ref}
    className={cn("ds-switch t-toggle", className)}
    {...props}
  >
    <Base.Thumb className="ds-switch-thumb t-toggle-thumb" />
  </Base.Root>
));
Switch.displayName = "Switch";
export { Switch };
