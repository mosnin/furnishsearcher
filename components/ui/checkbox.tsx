"use client";
import * as React from "react";
import { Checkbox as Base } from "@base-ui/react/checkbox";
import { Minus } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
type Props = Omit<
  React.ComponentPropsWithoutRef<typeof Base.Root>,
  "checked" | "defaultChecked" | "onCheckedChange"
> & {
  checked?: boolean | "indeterminate";
  defaultChecked?: boolean | "indeterminate";
  onCheckedChange?: (value: boolean | "indeterminate") => void;
};
const Checkbox = React.forwardRef<HTMLElement, Props>(
  ({ className, checked, defaultChecked, onCheckedChange, ...props }, ref) => {
    const [defaultMixed, setDefaultMixed] = React.useState(
      defaultChecked === "indeterminate",
    );
    const mixed =
      checked === undefined ? defaultMixed : checked === "indeterminate";
    return (
      <Base.Root
        ref={ref}
        className={cn("ds-checkbox t-check peer", className)}
        checked={checked === "indeterminate" ? false : checked}
        defaultChecked={
          defaultChecked === "indeterminate" ? false : defaultChecked
        }
        indeterminate={mixed}
        onCheckedChange={(value) => {
          setDefaultMixed(false);
          onCheckedChange?.(value);
        }}
        {...props}
      >
        <Base.Indicator>
          {mixed ? (
            <Minus size={12} />
          ) : (
            <svg
              width="12"
              height="12"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="m3 8 3 3 7-7"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </Base.Indicator>
      </Base.Root>
    );
  },
);
Checkbox.displayName = "Checkbox";
export { Checkbox };
