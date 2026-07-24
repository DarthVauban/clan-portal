"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, GitBranch, ListTodo } from "lucide-react";
import styles from "@/app/quests/quests.module.css";

const sections = [
  { href: "/quests/tasks", label: "Задания", caption: "Каталог квестов", icon: ListTodo },
  { href: "/quests/chains", label: "Цепочки заданий", caption: "Порядок прохождения", icon: GitBranch },
  { href: "/quests/reward-stats", label: "Статистика наград", caption: "Аналитика добычи", icon: BarChart3 },
];

export function QuestSectionNav() {
  const pathname = usePathname();

  return (
    <nav className={styles.sectionNav} aria-label="Разделы заданий">
      {sections.map(({ href, label, caption, icon: Icon }) => {
        const active = pathname.startsWith(href) || (href === "/quests/chains" && /^\/quests\/(?!tasks|reward-stats)/.test(pathname));
        return (
          <Link className={active ? styles.sectionNavActive : undefined} href={href} key={href} aria-current={active ? "page" : undefined}>
            <span><Icon size={18} /></span>
            <div><strong>{label}</strong><small>{caption}</small></div>
          </Link>
        );
      })}
    </nav>
  );
}
