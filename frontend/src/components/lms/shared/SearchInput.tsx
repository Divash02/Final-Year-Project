import React, { useId } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faMagnifyingGlass, faXmark } from "@fortawesome/free-solid-svg-icons";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Announced to screen readers as the search's purpose. */
  label: string;
  /** Shows while a server query is in flight. */
  loading?: boolean;
  className?: string;
}

/**
 * Toolbar search. Debouncing is the caller's choice
 * (`useDebouncedValue`); this owns the affordances: clear button,
 * loading indicator, and a labelled input that works at full
 * keyboard parity.
 */
export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  onChange,
  placeholder = "Search…",
  label,
  loading = false,
  className = "",
}) => {
  const id = useId();

  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <FontAwesomeIcon
        icon={faMagnifyingGlass}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-busy={loading || undefined}
        className="cos-input h-9 w-full pl-9 pr-16 text-sm"
      />
      <span className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
        {loading && (
          <span
            className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent"
            role="status"
            aria-label="Searching"
          />
        )}
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
          >
            <FontAwesomeIcon icon={faXmark} className="h-3 w-3" aria-hidden="true" />
          </button>
        )}
      </span>
    </div>
  );
};

export default SearchInput;
