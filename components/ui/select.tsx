"use client";
import * as React from "react";
import { Select as Base } from "@base-ui/react/select";
import { CaretDown, Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
function collectItems(
  children: React.ReactNode,
): { value: string; label: React.ReactNode }[] {
  const items: { value: string; label: React.ReactNode }[] = [];
  React.Children.forEach(children, (child) => {
    if (
      !React.isValidElement<{ value?: string; children?: React.ReactNode }>(
        child,
      )
    )
      return;
    if (child.type === SelectItem && child.props.value !== undefined)
      items.push({ value: child.props.value, label: child.props.children });
    else items.push(...collectItems(child.props.children));
  });
  return items;
}
function Select({
  children,
  onValueChange,
  ...props
}: Omit<React.ComponentProps<typeof Base.Root<string>>, "onValueChange"> & {
  onValueChange?: (value: string) => void;
}) {
  const items = collectItems(children);
  return (
    <Base.Root
      {...props}
      items={items}
      onValueChange={(value) => onValueChange?.(value ?? "")}
    >
      {children}
    </Base.Root>
  );
}
const SelectGroup = Base.Group,
  SelectValue = Base.Value;
const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof Base.Trigger>
>(({ className, children, ...props }, ref) => (
  <Base.Trigger
    ref={ref}
    className={cn("ds-input ds-select-trigger", className)}
    {...props}
  >
    {children}
    <Base.Icon>
      <CaretDown size={13} />
    </Base.Icon>
  </Base.Trigger>
));
SelectTrigger.displayName = "SelectTrigger";
const SelectContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Popup> & {
    position?: "popper" | "item-aligned";
    sideOffset?: number;
  }
>(({ className, children, position, sideOffset = 5, ...props }, ref) => (
  <Base.Portal>
    <div className="furnish-ui ds-portal">
      <Base.Positioner
        alignItemWithTrigger={false}
        sideOffset={sideOffset}
        className="ds-positioner"
      >
        <Base.Popup ref={ref} className={cn("ds-popup", className)} {...props}>
          <Base.List>{children}</Base.List>
        </Base.Popup>
      </Base.Positioner>
    </div>
  </Base.Portal>
));
SelectContent.displayName = "SelectContent";
const SelectLabel = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.GroupLabel>
>(({ className, ...props }, ref) => (
  <Base.GroupLabel
    ref={ref}
    className={cn("px-3 py-2 text-xs font-medium", className)}
    {...props}
  />
));
SelectLabel.displayName = "SelectLabel";
const SelectItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Base.Item> & { textValue?: string }
>(({ className, children, textValue, ...props }, ref) => (
  <Base.Item
    ref={ref}
    className={cn("ds-option", className)}
    label={textValue}
    {...props}
  >
    <span className="w-3">
      <Base.ItemIndicator>
        <Check size={12} />
      </Base.ItemIndicator>
    </span>
    <Base.ItemText>{children}</Base.ItemText>
  </Base.Item>
));
SelectItem.displayName = "SelectItem";
const SelectSeparator = Base.Separator,
  SelectScrollUpButton = Base.ScrollUpArrow,
  SelectScrollDownButton = Base.ScrollDownArrow;
export {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectLabel,
  SelectItem,
  SelectSeparator,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
