import { cn } from "../../lib/utils";
import type { ComponentProps } from "react";
import type { ButtonSize, ButtonVariant } from "../../types";

type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({ className, variant = "default", size = "default", ...props }: ButtonProps) {
  const variants: Record<ButtonVariant, string> = {
    default: "bg-emerald-800 text-white shadow-sm hover:bg-emerald-900",
    outline: "border border-stone-300 bg-white text-slate-900 hover:border-emerald-800 hover:bg-emerald-50",
    ghost: "text-slate-700 hover:bg-slate-100",
    destructive: "bg-red-600 text-white hover:bg-red-700",
  };
  const sizes: Record<ButtonSize, string> = {
    default: "h-10 px-4 py-2",
    sm: "h-9 px-3 text-sm",
    lg: "h-11 px-6",
  };
  return (
    <button
      className={cn(
        "ui-button inline-flex items-center justify-center rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        `ui-button--${variant}`,
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    />
  );
}