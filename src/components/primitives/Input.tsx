import { forwardRef, type InputHTMLAttributes } from "react";

export type InputSize = "sm" | "md";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  inputSize?: InputSize;
  error?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ inputSize = "md", error = false, className = "", ...props }, ref) => {
    const classes = [
      "input",
      inputSize === "sm" && "input--sm",
      error && "input--error",
      className,
    ]
      .filter(Boolean)
      .join(" ");

    return <input ref={ref} className={classes} {...props} />;
  },
);

Input.displayName = "Input";
