import { forwardRef, type InputHTMLAttributes } from "react";

export interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className = "", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="text"
        className={`search-input ${className}`}
        {...props}
      />
    );
  },
);

SearchInput.displayName = "SearchInput";
