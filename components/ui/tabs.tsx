"use client";
import * as React from "react";
import { Tabs as Base } from "@base-ui/react/tabs";
import { cn } from "@/lib/utils";
function Tabs({
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof Base.Root>, "onValueChange"> & {
  onValueChange?: (value: string) => void;
}) {
  return (
    <Base.Root
      {...props}
      onValueChange={(value) => onValueChange?.(String(value))}
    />
  );
}
const TabsList = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.List>
>(({ className, children, ...props }, ref) => (
  <Base.List
    ref={ref}
    className={cn("ds-segmented-list", className)}
    {...props}
  >
    <Base.Indicator className="ds-segmented-indicator" />
    {children}
  </Base.List>
));
TabsList.displayName = "TabsList";
const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Base.Tab>
>(({ className, ...props }, ref) => (
  <Base.Tab
    ref={ref}
    className={cn("ds-segmented-tab", className)}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";
const TabsContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Panel>
>(({ className, ...props }, ref) => (
  <Base.Panel
    ref={ref}
    className={cn("mt-3 outline-none", className)}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";
export { Tabs, TabsList, TabsTrigger, TabsContent };
