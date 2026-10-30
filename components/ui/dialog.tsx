"use client";
import * as React from "react";
import { Dialog as Base } from "@base-ui/react/dialog";
import { X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
type GateEvent = { preventDefault: () => void };
type Handlers = {
  onEscapeKeyDown?: (event: GateEvent) => void;
  onPointerDownOutside?: (event: GateEvent) => void;
  onInteractOutside?: (event: GateEvent) => void;
};
const Gates = React.createContext<React.MutableRefObject<Handlers> | null>(
  null,
);
function Dialog({
  onOpenChange,
  ...props
}: React.ComponentProps<typeof Base.Root>) {
  const gates = React.useRef<Handlers>({});
  return (
    <Gates.Provider value={gates}>
      <Base.Root
        {...props}
        onOpenChange={(open, details) => {
          let cancelled = false;
          const event = {
            preventDefault: () => {
              cancelled = true;
              details.cancel();
            },
          };
          if (!open && details.reason === "escape-key")
            gates.current.onEscapeKeyDown?.(event);
          if (
            !open &&
            (details.reason === "outside-press" ||
              details.reason === "focus-out")
          ) {
            gates.current.onInteractOutside?.(event);
            gates.current.onPointerDownOutside?.(event);
          }
          if (!cancelled) onOpenChange?.(open, details);
        }}
      />
    </Gates.Provider>
  );
}
function DialogTrigger({
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
function DialogClose({
  asChild,
  children,
  ...props
}: React.ComponentProps<typeof Base.Close> & { asChild?: boolean }) {
  return (
    <Base.Close
      {...props}
      render={asChild && React.isValidElement(children) ? children : undefined}
    >
      {asChild ? undefined : children}
    </Base.Close>
  );
}
const DialogPortal = Base.Portal;
const DialogOverlay = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Backdrop>
>(({ className, ...props }, ref) => (
  <Base.Backdrop
    ref={ref}
    className={cn("ds-backdrop", className)}
    {...props}
  />
));
DialogOverlay.displayName = "DialogOverlay";
const DialogContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Popup> & Handlers
>(
  (
    {
      className,
      children,
      onEscapeKeyDown,
      onPointerDownOutside,
      onInteractOutside,
      ...props
    },
    ref,
  ) => {
    const gates = React.useContext(Gates);
    React.useEffect(() => {
      if (gates)
        gates.current = {
          onEscapeKeyDown,
          onPointerDownOutside,
          onInteractOutside,
        };
      return () => {
        if (gates) gates.current = {};
      };
    }, [gates, onEscapeKeyDown, onPointerDownOutside, onInteractOutside]);
    return (
      <Base.Portal>
        <div className="furnish-ui ds-portal">
          <DialogOverlay />
          <Base.Popup
            ref={ref}
            className={cn("ds-dialog ds-legacy-dialog", className)}
            {...props}
          >
            {children}
            <Base.Close
              className="ds-button ds-button--ghost ds-button--icon ds-dialog-dismiss"
              aria-label="Close dialog"
            >
              <X size={16} />
            </Base.Close>
          </Base.Popup>
        </div>
      </Base.Portal>
    );
  },
);
DialogContent.displayName = "DialogContent";
const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("ds-legacy-dialog-header", className)} {...props} />
);
const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn("flex justify-end gap-2 flex-wrap mt-5", className)}
    {...props}
  />
);
const DialogTitle = React.forwardRef<
  HTMLHeadingElement,
  React.ComponentPropsWithoutRef<typeof Base.Title>
>(({ className, ...props }, ref) => (
  <Base.Title
    ref={ref}
    className={cn("text-[15px] font-semibold pr-6", className)}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";
const DialogDescription = React.forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof Base.Description>
>(({ className, ...props }, ref) => (
  <Base.Description
    ref={ref}
    className={cn("text-[13px] text-muted-foreground mt-2", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";
export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
