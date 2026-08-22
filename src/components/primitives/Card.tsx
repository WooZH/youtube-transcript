import { type HTMLAttributes, type ReactNode } from "react";

export type CardVariant = "default" | "hover" | "selected" | "active" | "disabled";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  children: ReactNode;
}

export function Card({
  variant = "default",
  className = "",
  children,
  ...props
}: CardProps) {
  const classes = [
    "card",
    variant !== "default" && `card--${variant}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...props}>
      {children}
    </div>
  );
}
