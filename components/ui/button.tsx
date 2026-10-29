"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Button as SharedButton } from "@/components/ui-system/primitives";
import { cn } from "@/lib/utils";
const buttonVariants = cva("ds-button", {
  variants: {
    variant: {
      default: "ds-button--primary",
      secondary: "ds-button--secondary",
      outline: "ds-button--secondary",
      ghost: "ds-button--ghost",
      destructive: "ds-button--danger",
      link: "ds-button--link",
    },
    size: {
      default: "",
      sm: "ds-button--small",
      lg: "ds-button--large",
      icon: "ds-button--icon",
    },
  },
  defaultVariants: { variant: "default", size: "default" },
});
export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "default", size, asChild = false, type, ...props },
    ref,
  ) => {
    const classes = cn(buttonVariants({ variant, size, className }));
    // Compatibility links stay anchors. Ordinary controls use the shared Base UI button.
    if (asChild) return <Slot ref={ref} className={classes} {...props} />;
    const kind =
      variant === "destructive"
        ? "danger"
        : variant === "ghost" || variant === "link"
          ? "ghost"
          : variant === "default"
            ? "primary"
            : "secondary";
    return (
      <SharedButton
        ref={ref}
        type={type ?? "submit"}
        variant={kind}
        className={classes}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";
export { Button, buttonVariants };
