"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "@/app/items/item-card.module.css";

export type KnowledgeSearchItem = {
  name: string;
  slug: string;
  meta: string;
  image?: string;
};

export function KnowledgeSearch({
  items,
  value,
  onChange,
  compact = false,
}: {
  items: KnowledgeSearchItem[];
  value?: string;
  onChange?: (value: string) => void;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [internalValue, setInternalValue] = useState("");
  const [focused, setFocused] = useState(false);
  const query = value ?? internalValue;

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("ru");
    if (!normalized) return [];
    return items.filter((item) => item.name.toLocaleLowerCase("ru").includes(normalized)).slice(0, 6);
  }, [items, query]);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  const updateQuery = (nextValue: string) => {
    if (onChange) onChange(nextValue);
    else setInternalValue(nextValue);
  };

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    if (results[0]) router.push(`/items/${results[0].slug}`);
  };

  return (
    <div className={`${styles.knowledgeSearchWrap} ${compact ? styles.knowledgeSearchCompact : ""}`}>
      <form className={styles.knowledgeSearch} onSubmit={submitSearch} role="search">
        <Search size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 120)}
          placeholder="Поиск предмета по названию…"
          aria-label="Поиск предмета по названию"
          data-testid="knowledge-search"
        />
        <kbd>Ctrl K</kbd>
      </form>

      {focused && query.trim() && (
        <div className={styles.searchResults}>
          {results.length > 0 ? results.map((item) => (
            <Link href={`/items/${item.slug}`} className={styles.searchResult} key={item.slug}>
              <span className={styles.searchResultImage}>
                {item.image && <Image src={item.image} alt="" width={38} height={38} />}
              </span>
              <span><strong>{item.name}</strong><small>{item.meta}</small></span>
            </Link>
          )) : <div className={styles.searchEmpty}>Предметы с таким названием не найдены</div>}
        </div>
      )}
    </div>
  );
}
