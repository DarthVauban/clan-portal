"use client";

import { Languages } from "lucide-react";
import styles from "@/app/items/item-card.module.css";

export function ItemNameLanguageToggle({
  showEnglishNames,
  onChange,
}: {
  showEnglishNames: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className={styles.itemNameToggle} aria-label="Язык названий предметов" data-testid="item-name-language-toggle">
      <Languages size={17} aria-hidden="true" />
      <span>Названия</span>
      <div>
        <button type="button" className={!showEnglishNames ? styles.languageActive : ""} onClick={() => onChange(false)} aria-pressed={!showEnglishNames} data-testid="item-names-ru">RU</button>
        <button type="button" className={showEnglishNames ? styles.languageActive : ""} onClick={() => onChange(true)} aria-pressed={showEnglishNames} data-testid="item-names-en">EN</button>
      </div>
    </div>
  );
}
