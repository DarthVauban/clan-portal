"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import styles from "@/components/custom-select.module.css";

export type CustomSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type CustomSelectProps = {
  value: string;
  options: CustomSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
  testId?: string;
  className?: string;
  size?: "compact" | "regular";
  layout?: "block" | "inline";
};

function firstEnabledIndex(options: CustomSelectOption[]) {
  return options.findIndex((option) => !option.disabled);
}

function moveHighlight(options: CustomSelectOption[], currentIndex: number, direction: 1 | -1) {
  if (options.length === 0) return -1;
  let nextIndex = currentIndex;
  for (let attempt = 0; attempt < options.length; attempt += 1) {
    nextIndex = (nextIndex + direction + options.length) % options.length;
    if (!options[nextIndex]?.disabled) return nextIndex;
  }
  return currentIndex;
}

export function CustomSelect({
  value,
  options,
  onChange,
  placeholder = "Выберите",
  ariaLabel,
  disabled = false,
  testId,
  className = "",
  size = "compact",
  layout = "block",
}: CustomSelectProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);
  const [highlightedIndex, setHighlightedIndex] = useState(() => Math.max(selectedIndex, firstEnabledIndex(options)));
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [open]);

  const openMenu = () => {
    if (disabled) return;
    setHighlightedIndex(Math.max(selectedIndex, firstEnabledIndex(options)));
    setOpen(true);
  };

  const chooseOption = (option: CustomSelectOption | undefined) => {
    if (!option || option.disabled) return;
    onChange(option.value);
    setOpen(false);
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      setHighlightedIndex((current) => moveHighlight(options, current < 0 ? firstEnabledIndex(options) : current, event.key === "ArrowDown" ? 1 : -1));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (!open) {
        openMenu();
        return;
      }
      chooseOption(options[highlightedIndex]);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
    }
  };

  const rootClassName = [
    styles.root,
    layout === "inline" ? styles.rootInline : "",
    size === "regular" ? styles.regular : styles.compact,
    className,
  ].filter(Boolean).join(" ");

  return (
    <div className={rootClassName} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger}${open ? ` ${styles.triggerOpen}` : ""}`}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-menu`}
        aria-label={ariaLabel ?? placeholder}
        data-testid={testId}
      >
        <span className={`${styles.value}${selectedOption ? "" : ` ${styles.placeholder}`}`}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown className={styles.chevron} size={15} aria-hidden="true" />
      </button>

      {open && (
        <div className={styles.menu} id={`${id}-menu`} role="listbox" aria-label={ariaLabel ?? placeholder}>
          {options.map((option, index) => {
            const selected = option.value === value;
            const highlighted = index === highlightedIndex;
            return (
              <button
                type="button"
                className={[
                  styles.option,
                  selected ? styles.optionSelected : "",
                  highlighted ? styles.optionHighlighted : "",
                ].filter(Boolean).join(" ")}
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                onMouseEnter={() => {
                  if (!option.disabled) setHighlightedIndex(index);
                }}
                onClick={() => chooseOption(option)}
                key={option.value || `empty-${index}`}
              >
                <span>{option.label}</span>
                {selected && <Check className={styles.check} size={13} aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
