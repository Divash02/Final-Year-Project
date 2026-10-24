import React, { useRef, useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronUp, faSearch, faTimes, faCheck } from "@fortawesome/free-solid-svg-icons";

interface MultiSelectOption {
  id: string;
  label: string;
  group?: string;
  [key: string]: unknown;
}

interface MultiSelectProps {
  options: MultiSelectOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  groupBy?: (option: MultiSelectOption) => string | undefined;
  maxHeight?: number;
  disabled?: boolean;
  label?: string;
  error?: string;
  required?: boolean;
}

export const MultiSelect: React.FC<MultiSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = "Select options...",
  searchable = true,
  groupBy,
  maxHeight = 300,
  disabled = false,
  label,
  error,
  required = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number; width: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const updateDropdownPosition = useCallback(() => {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();
      window.addEventListener("scroll", updateDropdownPosition, true);
      window.addEventListener("resize", updateDropdownPosition);
      return () => {
        window.removeEventListener("scroll", updateDropdownPosition, true);
        window.removeEventListener("resize", updateDropdownPosition);
      };
    }
  }, [isOpen, updateDropdownPosition]);

  const groupedOptions = useMemo(() => {
    if (!groupBy) {
      return [{ group: undefined, options }];
    }
    const groups = new Map<string, MultiSelectOption[]>();
    const ungrouped: MultiSelectOption[] = [];
    options.forEach((opt) => {
      const group = groupBy(opt);
      if (group) {
        if (!groups.has(group)) groups.set(group, []);
        groups.get(group)!.push(opt);
      } else {
        ungrouped.push(opt);
      }
    });
    const result: { group: string | undefined; options: MultiSelectOption[] }[] = [];
    if (ungrouped.length) result.push({ group: undefined, options: ungrouped });
    groups.forEach((opts, group) => result.push({ group, options: opts }));
    return result;
  }, [options, groupBy]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedOptions;
    const query = searchQuery.toLowerCase();
    return groupedOptions
      .map(({ group, options }) => ({
        group,
        options: options.filter((opt) => opt.label.toLowerCase().includes(query)),
      }))
      .filter((g) => g.options.length > 0);
  }, [groupedOptions, searchQuery]);

  const allFilteredOptions = useMemo(
    () => filteredGroups.flatMap((g) => g.options),
    [filteredGroups]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setSearchQuery("");
        setFocusedIndex(-1);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (!isOpen) {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
          event.preventDefault();
          setIsOpen(true);
          setFocusedIndex(0);
        }
        return;
      }

      switch (event.key) {
        case "Escape":
          event.preventDefault();
          setIsOpen(false);
          setSearchQuery("");
          setFocusedIndex(-1);
          buttonRef.current?.focus();
          break;
        case "ArrowDown":
          event.preventDefault();
          setFocusedIndex((prev) =>
            prev < allFilteredOptions.length - 1 ? prev + 1 : prev
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setFocusedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          break;
        case "Enter":
        case " ":
          if (focusedIndex >= 0 && focusedIndex < allFilteredOptions.length) {
            event.preventDefault();
            const option = allFilteredOptions[focusedIndex];
            onChange(
              value.includes(option.id)
                ? value.filter((id) => id !== option.id)
                : [...value, option.id]
            );
          }
          break;
        case "Tab":
          setIsOpen(false);
          setSearchQuery("");
          setFocusedIndex(-1);
          break;
      }
    },
    [isOpen, allFilteredOptions, focusedIndex, value, onChange]
  );

  const toggleOption = (optionId: string) => {
    onChange(
      value.includes(optionId)
        ? value.filter((id) => id !== optionId)
        : [...value, optionId]
    );
  };

  const removeSelection = (event: React.MouseEvent, optionId: string) => {
    event.stopPropagation();
    onChange(value.filter((id) => id !== optionId));
  };

  const selectedOptions = options.filter((opt) => value.includes(opt.id));

return (
    <div className="w-full" ref={dropdownRef}>
      {label && (
        <label className="mb-1 block text-sm font-medium text-slate-600">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => !disabled && setIsOpen((open) => !open)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        className={`w-full flex flex-wrap items-center gap-1.5 rounded border px-3 py-2 text-left text-sm ${
          disabled
            ? "bg-slate-50 border-slate-200 text-slate-500 cursor-not-allowed"
            : error
            ? "border-red-300 bg-red-50 text-slate-900 focus:border-red-500 focus:ring-red-500"
            : "border-slate-300 bg-white text-slate-900 hover:border-slate-400 focus:border-blue-500 focus:ring-blue-500"
        } focus:outline-none focus:ring-2 transition-colors min-h-[42px]`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-label={label}
      >
        {selectedOptions.length > 0 ? (
          <>
            {selectedOptions.map((opt) => (
              <span
                key={opt.id}
                className="inline-flex items-center gap-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800"
              >
                {opt.label}
                <button
                  type="button"
                  onClick={(e) => removeSelection(e, opt.id)}
                  className="p-0.5 rounded hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  aria-label={`Remove ${opt.label}`}
                >
                  <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                </button>
              </span>
            ))}
            {selectedOptions.length > 3 && (
              <span className="inline-flex items-center rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                +{selectedOptions.length - 3} more
              </span>
            )}
          </>
        ) : (
          <span className="text-slate-400 w-full">{placeholder}</span>
        )}
        <FontAwesomeIcon
          icon={isOpen ? faChevronUp : faChevronDown}
          className={`w-4 h-4 text-slate-500 ml-auto transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>
      {error && <p className="mt-1 text-xs text-red-600" role="alert">{error}</p>}

      {isOpen && dropdownPosition && createPortal(
        <div
          ref={dropdownRef}
          className="z-[1400] max-h-[300px] overflow-auto rounded border border-slate-300 bg-white shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          style={{
            position: "fixed",
            top: dropdownPosition.top,
            left: dropdownPosition.left,
            width: dropdownPosition.width,
            maxHeight: maxHeight,
            zIndex: 1400,
          }}
          role="listbox"
          aria-multiselectable="true"
        >
          {searchable && (
            <div className="sticky top-0 p-2 border-b border-slate-200 bg-white">
              <div className="relative">
                <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setFocusedIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder="Search..."
                  className="w-full rounded border border-slate-300 pl-9 pr-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500 focus:outline-none"
                />
              </div>
            </div>
          )}
          {filteredGroups.length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              {searchQuery ? "No matching options found." : "No options available."}
            </div>
          ) : (
            <ul className="py-1" role="listbox">
              {filteredGroups.map(({ group, options }, groupIndex) => (
                <React.Fragment key={groupIndex}>
                  {group && (
                    <li className="px-3 py-1.5 text-xs font-semibold uppercase text-slate-500 bg-slate-50 border-b border-slate-100 sticky top-0">
                      {group}
                    </li>
                  )}
                  {options.map((option, optionIndex) => {
                    const globalIndex = allFilteredOptions.indexOf(option);
                    const isSelected = value.includes(option.id);
                    const isFocused = globalIndex === focusedIndex;
                    return (
                      <li
                        key={option.id}
                        role="option"
                        aria-selected={isSelected}
                        aria-checked={isSelected}
                        onClick={() => toggleOption(option.id)}
                        onMouseEnter={() => setFocusedIndex(globalIndex)}
                        className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                          isSelected
                            ? "bg-blue-50 text-blue-900"
                            : isFocused
                            ? "bg-slate-100 text-slate-900"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        <FontAwesomeIcon
                          icon={isSelected ? faCheck : faTimes}
                          className={`w-4 h-4 shrink-0 ${
                            isSelected ? "text-blue-600" : "text-slate-300"
                          }`}
                        />
                        <span className="truncate">{option.label}</span>
                      </li>
                    );
                  })}
                </React.Fragment>
              ))}
            </ul>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
