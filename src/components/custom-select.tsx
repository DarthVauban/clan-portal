"use client";

import { Check, ChevronDown } from "lucide-react";
import { type CSSProperties, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

type MenuPosition = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
  placement: "top" | "bottom";
};

const MENU_GAP = 6;
const MENU_MAX_HEIGHT = 280;
const MENU_MIN_WIDTH = 210;
const VIEWPORT_PADDING = 8;

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
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const selectedIndex = useMemo(() => options.findIndex((option) => option.value === value), [options, value]);
  const [highlightedIndex, setHighlightedIndex] = useState(() => Math.max(selectedIndex, firstEnabledIndex(options)));
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  const closeMenu = useCallback(() => {
    setOpen(false);
    setMenuPosition(null);
  }, []);

  const updateMenuPosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
      closeMenu();
      return;
    }

    const availableWidth = Math.max(0, window.innerWidth - VIEWPORT_PADDING * 2);
    const width = Math.min(Math.max(rect.width, MENU_MIN_WIDTH), availableWidth);
    const left = Math.min(
      Math.max(rect.left, VIEWPORT_PADDING),
      Math.max(VIEWPORT_PADDING, window.innerWidth - VIEWPORT_PADDING - width),
    );
    const estimatedHeight = Math.min(
      MENU_MAX_HEIGHT,
      menuRef.current?.scrollHeight ?? Math.max(44, options.length * (size === "compact" ? 34 : 36) + 12),
    );
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_PADDING);
    const spaceAbove = Math.max(0, rect.top - MENU_GAP - VIEWPORT_PADDING);
    const placement = spaceBelow < Math.min(estimatedHeight, 160) && spaceAbove > spaceBelow ? "top" : "bottom";
    const availableHeight = placement === "top" ? spaceAbove : spaceBelow;
    const maxHeight = Math.max(72, Math.min(MENU_MAX_HEIGHT, availableHeight));
    const renderedHeight = Math.min(estimatedHeight, maxHeight);
    const top = placement === "top"
      ? Math.max(VIEWPORT_PADDING, rect.top - MENU_GAP - renderedHeight)
      : Math.min(window.innerHeight - VIEWPORT_PADDING - renderedHeight, rect.bottom + MENU_GAP);
    const nextPosition: MenuPosition = { top, left, width, maxHeight, placement };

    setMenuPosition((current) => (
      current
      && current.top === nextPosition.top
      && current.left === nextPosition.left
      && current.width === nextPosition.width
      && current.maxHeight === nextPosition.maxHeight
      && current.placement === nextPosition.placement
        ? current
        : nextPosition
    ));
  }, [closeMenu, options.length, size]);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      if (menuRef.current?.contains(event.target as Node)) return;
      closeMenu();
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
  }, [closeMenu, open]);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
    const frame = window.requestAnimationFrame(updateMenuPosition);
    window.addEventListener("resize", updateMenuPosition);
    document.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateMenuPosition);
      document.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open || highlightedIndex < 0) return;
    const highlightedOption = menuRef.current?.querySelector<HTMLElement>(`[data-option-index="${highlightedIndex}"]`);
    highlightedOption?.scrollIntoView({ block: "nearest" });
  }, [highlightedIndex, open]);

  const openMenu = () => {
    if (disabled) return;
    setMenuPosition(null);
    setHighlightedIndex(Math.max(selectedIndex, firstEnabledIndex(options)));
    setOpen(true);
  };

  const chooseOption = (option: CustomSelectOption | undefined) => {
    if (!option || option.disabled) return;
    onChange(option.value);
    closeMenu();
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
      closeMenu();
    }
  };

  const rootClassName = [
    styles.root,
    layout === "inline" ? styles.rootInline : "",
    size === "regular" ? styles.regular : styles.compact,
    className,
  ].filter(Boolean).join(" ");
  const menuStyle: CSSProperties | undefined = menuPosition
    ? {
        top: menuPosition.top,
        left: menuPosition.left,
        width: menuPosition.width,
        maxHeight: menuPosition.maxHeight,
      }
    : undefined;
  const menu = open && menuPosition ? (
    <div
      ref={menuRef}
      className={`${styles.menu} ${size === "compact" ? styles.menuCompact : styles.menuRegular}`}
      id={`${id}-menu`}
      role="listbox"
      aria-label={ariaLabel ?? placeholder}
      data-placement={menuPosition.placement}
      style={menuStyle}
    >
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
            data-option-index={index}
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
  ) : null;

  return (
    <div className={rootClassName} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.trigger}${open ? ` ${styles.triggerOpen}` : ""}`}
        onClick={() => (open ? closeMenu() : openMenu())}
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

      {menu && createPortal(menu, document.body)}
    </div>
  );
}
