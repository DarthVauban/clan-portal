"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Boxes,
  Calculator,
  ChevronDown,
  CircleUserRound,
  Database,
  HandCoins,
  Home,
  Menu,
  ScrollText,
  ShieldCheck,
  Sparkles,
  UsersRound,
  X,
} from "lucide-react";
import { useState } from "react";

const primaryNavigation = [
  { href: "/", label: "Обзор", icon: Home },
  { href: "/collectives", label: "Коллективы", icon: UsersRound },
  { href: "/items", label: "База предметов", icon: Database },
  { href: "/resources", label: "Ресурсы", icon: Boxes },
];

const requestNavigation = [
  { href: "/requests/resources", label: "На получение ресурсов", icon: HandCoins },
  { href: "/requests/crafting", label: "На крафт предметов", icon: ScrollText },
];

const utilityNavigation = [
  { href: "/craft-calculator", label: "Калькулятор крафта", icon: Calculator },
  { href: "/profile", label: "Мой профиль", icon: CircleUserRound },
];

function NavLink({ href, label, icon: Icon, onNavigate }: {
  href: string;
  label: string;
  icon: typeof Home;
  onNavigate: () => void;
}) {
  const pathname = usePathname();
  const active = href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Link className={`nav-link${active ? " nav-link--active" : ""}`} href={href} onClick={onNavigate}>
      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
      <span>{label}</span>
      {active && <span className="nav-marker" />}
    </Link>
  );
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="portal-shell">
      <button
        className={`sidebar-backdrop${menuOpen ? " sidebar-backdrop--visible" : ""}`}
        aria-label="Закрыть меню"
        onClick={closeMenu}
      />

      <aside className={`sidebar${menuOpen ? " sidebar--open" : ""}`}>
        <div className="brand">
          <div className="brand-emblem">
            <Image src="/clan-logo.png" alt="Эмблема клана" width={56} height={64} priority />
          </div>
          <div>
            <div className="brand-name">Clan Portal</div>
            <div className="brand-caption">Сообщество Corepunk</div>
          </div>
          <button className="sidebar-close" onClick={closeMenu} aria-label="Закрыть меню">
            <X size={20} />
          </button>
        </div>

        <nav className="navigation" aria-label="Основная навигация">
          <div className="nav-group">
            <div className="nav-group-label">Клан</div>
            {primaryNavigation.map((item) => <NavLink key={item.href} {...item} onNavigate={closeMenu} />)}
          </div>

          <div className="nav-group">
            <div className="nav-group-label">Заявки</div>
            {requestNavigation.map((item) => <NavLink key={item.href} {...item} onNavigate={closeMenu} />)}
          </div>

          <div className="nav-group nav-group--last">
            <div className="nav-group-label">Инструменты</div>
            {utilityNavigation.map((item) => <NavLink key={item.href} {...item} onNavigate={closeMenu} />)}
          </div>
        </nav>

        <div className="sidebar-status">
          <div className="status-icon"><ShieldCheck size={18} /></div>
          <div>
            <strong>Версия 0.1</strong>
            <span>Каркас портала</span>
          </div>
          <Sparkles size={15} className="status-spark" />
        </div>
      </aside>

      <div className="content-column">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Открыть меню">
            <Menu size={21} />
          </button>
          <div className="topbar-breadcrumb">
            <span className="online-dot" />
            Единое пространство клана
          </div>
          <div className="topbar-actions">
            <button className="collective-switcher" type="button" aria-label="Выбранный коллектив">
              <span className="collective-symbol">I</span>
              <span className="collective-name">Основной состав</span>
              <ChevronDown size={16} />
            </button>
            <Link className="profile-chip" href="/profile" aria-label="Открыть профиль">
              <span>DK</span>
            </Link>
          </div>
        </header>

        <main className="main-content">{children}</main>
      </div>
    </div>
  );
}
