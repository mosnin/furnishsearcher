"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { Input as BaseInput } from "@base-ui/react/input";
import { Select } from "@base-ui/react/select";
import { Checkbox } from "@base-ui/react/checkbox";
import { Tabs } from "@base-ui/react/tabs";
import { Dialog } from "@base-ui/react/dialog";
import { CaretDown, Check, X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";
import { NumberPop } from "@/components/public-experience/motion";

export function Button({
  className,
  variant = "primary",
  size = "default",
  type = "button",
  ...props
}: ComponentProps<typeof BaseButton> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "default" | "icon";
}) {
  return (
    <BaseButton
      type={type}
      className={cn(
        "ds-button",
        `ds-button--${variant}`,
        size === "icon" && "ds-button--icon",
        className,
      )}
      {...props}
    />
  );
}
export function ActionLink({
  className,
  variant = "secondary",
  ...props
}: ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return (
    <Link
      className={cn("ds-button", `ds-button--${variant}`, className)}
      {...props}
    />
  );
}
export function Input({
  className,
  ...props
}: ComponentProps<typeof BaseInput>) {
  return <BaseInput className={cn("ds-input", className)} {...props} />;
}
export function SelectField({
  label,
  value,
  onValueChange,
  options,
  name,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  name?: string;
}) {
  return (
    <div className="ds-field">
      <span>{label}</span>
      <Select.Root
        value={value}
        onValueChange={(value) => onValueChange(value ?? "")}
        name={name}
        items={options}
      >
        <Select.Trigger
          aria-label={label}
          className="ds-input ds-select-trigger"
        >
          <Select.Value />
          <Select.Icon>
            <CaretDown size={12} />
          </Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <div className="furnish-ui ds-portal">
            <Select.Positioner
              sideOffset={5}
              alignItemWithTrigger={false}
              className="ds-positioner"
            >
              <Select.Popup className="ds-popup">
                <Select.List>
                  {options.map((option) => (
                    <Select.Item
                      key={option.value}
                      value={option.value}
                      className="ds-option"
                    >
                      <Select.ItemIndicator>
                        <Check size={12} />
                      </Select.ItemIndicator>
                      <Select.ItemText>{option.label}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.List>
              </Select.Popup>
            </Select.Positioner>
          </div>
        </Select.Portal>
      </Select.Root>
    </div>
  );
}
export function CheckField({
  children,
  checked,
  onCheckedChange,
}: {
  children: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label className="ds-check-label">
      <Checkbox.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        className="ds-checkbox"
      >
        <Checkbox.Indicator>
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
        </Checkbox.Indicator>
      </Checkbox.Root>
      {children}
    </label>
  );
}
export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cn("ds-panel", className)} {...props} />;
}
export function Widget({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel className={cn("ds-widget", className)}>
      <header className="ds-widget-header">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </Panel>
  );
}
export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="ds-page-header">
      <div>
        {eyebrow && <p className="ds-breadcrumb">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function Status({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "positive" | "caution" | "critical";
}) {
  return <span className={`ds-status ds-status--${tone}`}>{children}</span>;
}
export function Metric({
  label,
  value,
  detail,
  loading,
}: {
  label: string;
  value: ReactNode;
  detail: string;
  loading?: boolean;
}) {
  return (
    <div className="ds-metric">
      <p>{label}</p>
      <strong>
        {loading ? (
          <span className="ds-skeleton" aria-label="Loading" />
        ) : typeof value === "number" || typeof value === "string" ? (
          <NumberPop value={value} />
        ) : (
          value
        )}
      </strong>
      <small>{detail}</small>
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ds-empty">
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
export function ViewTabs({
  value,
  onValueChange,
  tabs,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  tabs: { value: string; label: string }[];
  children?: ReactNode;
}) {
  return (
    <Tabs.Root
      value={value}
      onValueChange={(v) => onValueChange(String(v))}
      className="ds-tabs"
    >
      <Tabs.List aria-label="Dashboard view" data-motion-tabs>
        <Tabs.Indicator className="ds-tab-indicator" />
        {tabs.map((tab) => (
          <Tabs.Tab key={tab.value} value={tab.value} className="ds-tab">
            {tab.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <Tabs.Panel value={value} className="ds-view-panel">
        {children}
      </Tabs.Panel>
    </Tabs.Root>
  );
}
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  finalFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  finalFocus?: ComponentProps<typeof Dialog.Popup>["finalFocus"];
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <div className="furnish-ui ds-portal">
          <Dialog.Backdrop className="ds-backdrop" />
          <Dialog.Popup
            className={cn("ds-dialog", className)}
            finalFocus={finalFocus}
          >
            <header className="ds-dialog-header">
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Close
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Close dialog"
                  />
                }
              >
                <X size={16} />
              </Dialog.Close>
            </header>
            {description && (
              <Dialog.Description className="ds-dialog-description">
                {description}
              </Dialog.Description>
            )}
            {children}
          </Dialog.Popup>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
