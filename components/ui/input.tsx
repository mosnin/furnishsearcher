"use client";
import * as React from "react";
import { Input as SharedInput } from "@/components/ui-system/primitives";
export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}
const Input = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <SharedInput ref={ref} {...props} />
));
Input.displayName = "Input";
export { Input };
