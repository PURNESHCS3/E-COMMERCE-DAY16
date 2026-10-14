import { cn } from "../../lib/utils";
import type { ComponentProps } from "react";

type CardProps = ComponentProps<"div">;
type CardTitleProps = ComponentProps<"h2">;

export function Card({ className, ...props }: CardProps) {
  return <div className={cn("rounded-2xl border border-stone-200 bg-white shadow-sm", className)} {...props} />;
}

export function CardHeader({ className, ...props }: CardProps) {
  return <div className={cn("p-6 pb-3", className)} {...props} />;
}

export function CardContent({ className, ...props }: CardProps) {
  return <div className={cn("p-6 pt-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: CardTitleProps) {
  return <h2 className={cn("text-xl font-semibold tracking-tight", className)} {...props} />;
}