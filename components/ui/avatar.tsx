"use client";
import * as React from "react";
import { Avatar as Base } from "@base-ui/react/avatar";
import { cn } from "@/lib/utils";
const Avatar = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<typeof Base.Root>
>(({ className, ...props }, ref) => (
  <Base.Root
    ref={ref}
    className={cn(
      "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
      className,
    )}
    {...props}
  />
));
Avatar.displayName = "Avatar";
const AvatarImage = React.forwardRef<
  HTMLImageElement,
  React.ComponentPropsWithoutRef<typeof Base.Image>
>(({ className, ...props }, ref) => (
  <Base.Image
    ref={ref}
    className={cn("aspect-square h-full w-full object-cover", className)}
    {...props}
  />
));
AvatarImage.displayName = "AvatarImage";
const AvatarFallback = React.forwardRef<
  HTMLSpanElement,
  React.ComponentPropsWithoutRef<typeof Base.Fallback> & { delayMs?: number }
>(({ className, delayMs, ...props }, ref) => (
  <Base.Fallback
    ref={ref}
    className={cn(
      "flex h-full w-full items-center justify-center rounded-full bg-muted text-xs",
      className,
    )}
    {...props}
  />
));
AvatarFallback.displayName = "AvatarFallback";
export { Avatar, AvatarImage, AvatarFallback };
