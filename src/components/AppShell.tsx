"use client";
// ADEEB ENTERPRISES — Main application shell (Windows 95 desktop layout)
// Renders title bar, menu bar, sidebar, workspace, and status bar.

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface AppShellProps {
  children: React.ReactNode;
  userName?: string;
  userRole?: string;
  businessName?: string;
  currentPage?: string;
  statusText?: string;
}

const NAV_ITEMS = [
  { label: "Dashboard",        href: "/dashboard",   icon: "🏠" },
  { label: "Parties",          href: "/parties",     icon: "👥" },
  { label: "Purchase Entry",   href: "/purchases",   icon: "🐃" },
  { label: "Payments",         href: "/payments",    icon: "💰" },
  { label: "Cash EX",          href: "/cash-ex",     icon: "💸" },
  { label: "PDF Import",       href: "/import",      icon: "📄" },
  { label: "Party Ledger",     href: "/ledger",      icon: "📒" },
  { label: "Reports",          href: "/reports",     icon: "📊" },
  { label: "Audit Log",        href: "/reports/audit", icon: "🔍" },
  { label: "Settings",         href: "/settings",    icon: "⚙️" },
];

const MENU_ITEMS = [
  {
    label: "File",
    items: [
      { label: "Dashboard",     href: "/dashboard" },
      { separator: true },
      { label: "PDF Import",    href: "/import" },
      { separator: true },
      { label: "Sign Out",      href: "/api/auth/signout" },
    ],
  },
  {
    label: "Transactions",
    items: [
      { label: "New Purchase",  href: "/purchases/new" },
      { label: "New Payment",   href: "/payments/new" },
      { separator: true },
      { label: "All Purchases", href: "/purchases" },
      { label: "All Payments",  href: "/payments" },
      { label: "Cash EX",       href: "/cash-ex" },
    ],
  },
  {
    label: "Parties",
    items: [
      { label: "Party List",    href: "/parties" },
      { label: "New Party",     href: "/parties/new" },
    ],
  },
  {
    label: "Reports",
    items: [
      { label: "Daily",         href: "/reports/daily" },
      { label: "Monthly",       href: "/reports/monthly" },
      { label: "Party Ledger",  href: "/reports/party-ledger" },
      { label: "Outstanding",   href: "/reports/outstanding" },
      { label: "Purchase Summary", href: "/reports/purchases" },
      { label: "Payment Methods",  href: "/reports/payments" },
      { label: "Cash EX Expenses", href: "/reports/cash-ex" },
      { separator: true },
      { label: "Audit Log",     href: "/reports/audit" },
    ],
  },
  {
    label: "Tools",
    items: [
      { label: "PDF Import",    href: "/import" },
      { label: "Export CSV",    href: "/reports?export=csv" },
    ],
  },
  {
    label: "Settings",
    items: [
      { label: "Business Profile", href: "/settings" },
      { label: "Users & Access",   href: "/settings/users" },
      { label: "Payment Methods",  href: "/settings/payment-methods" },
    ],
  },
  {
    label: "Help",
    items: [
      { label: "Ledger Convention", href: "/help#ledger" },
      { label: "Cash EX Rule",      href: "/help#cashex" },
      { label: "About",             href: "/about" },
    ],
  },
];

export default function AppShell({
  children,
  userName,
  userRole,
  businessName = "ADEEB ENTERPRISES",
  currentPage = "",
  statusText,
}: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(
        now.toLocaleTimeString("en-IN", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        })
      );
    };
    tick();
    const id = setInterval(tick, 30000);
    return () => clearInterval(id);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handler = () => setActiveMenu(null);
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  return (
    <div className="desktop">
      <div className="win-window">
        {/* ── TITLE BAR ──────────────────────────── */}
        <div className="title-bar">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Logo" className="title-bar-logo" />
          <span className="title-bar-text">
            {businessName} — Buffalo Trading Ledger
          </span>
          <button className="title-btn" title="Minimize">_</button>
          <button className="title-btn" title="Maximize">□</button>
          <button className="title-btn" title="Close">✕</button>
        </div>

        {/* ── MENU BAR ───────────────────────────── */}
        <div className="menu-bar" onClick={(e) => e.stopPropagation()}>
          {MENU_ITEMS.map((menu) => (
            <div
              key={menu.label}
              className={`menu-item ${activeMenu === menu.label ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                setActiveMenu(activeMenu === menu.label ? null : menu.label);
              }}
            >
              {menu.label}
              <div className="menu-dropdown">
                {menu.items.map((item, i) =>
                  (item as any).separator ? (
                    <div key={i} className="menu-dropdown-separator" />
                  ) : (
                    <div
                      key={(item as any).label}
                      className="menu-dropdown-item"
                      onClick={() => {
                        setActiveMenu(null);
                        router.push((item as any).href);
                      }}
                    >
                      {(item as any).label}
                    </div>
                  )
                )}
              </div>
            </div>
          ))}
        </div>

        {/* ── TOOLBAR ────────────────────────────── */}
        <div className="toolbar">
          <button className="toolbar-btn" onClick={() => router.push("/purchases/new")} title="New Purchase">
            🐃 <span className="label"> New Purchase</span>
          </button>
          <button className="toolbar-btn" onClick={() => router.push("/payments/new")} title="New Payment">
            💰 <span className="label"> New Payment</span>
          </button>
          <div className="toolbar-separator" />
          <button className="toolbar-btn" onClick={() => router.push("/import")} title="PDF Import">
            📄 <span className="label"> Import PDF</span>
          </button>
          <div className="toolbar-separator" />
          <button className="toolbar-btn" onClick={() => router.push("/reports")} title="Reports">
            📊 <span className="label"> Reports</span>
          </button>
          <button className="toolbar-btn" onClick={() => router.push("/settings")} title="Settings">
            ⚙️ <span className="label"> Settings</span>
          </button>
        </div>

        {/* ── BODY (sidebar + workspace) ─────────── */}
        <div className="app-body">
          {/* Sidebar */}
          <nav className="sidebar">
            <div className="sidebar-section">
              <div className="sidebar-heading">Workspace</div>
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`sidebar-link ${pathname?.startsWith(item.href) && item.href !== "/dashboard" ? "active" : pathname === item.href ? "active" : ""}`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </nav>

          {/* Workspace */}
          <main className="workspace">
            {children}
          </main>
        </div>

        {/* ── STATUS BAR ─────────────────────────── */}
        <div className="status-bar">
          <div className="status-panel" style={{ flex: 1 }}>
            {statusText ?? currentPage ?? "Ready"}
          </div>
          {userRole && (
            <div className="status-panel">
              Role: {userRole}
            </div>
          )}
          {userName && (
            <div className="status-panel">
              👤 {userName}
            </div>
          )}
          <div className="status-panel">{time}</div>
        </div>
      </div>
    </div>
  );
}
