"use client";
// ADEEB ENTERPRISES — Main application shell
// Clean modern layout with Title bar, Quick Toolbar, Focused Sidebar (5 items), Workspace, and Status bar.

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

interface AppShellProps {
  children: React.ReactNode;
  userName?: string;
  userRole?: string;
  businessName?: string;
  currentPage?: string;
  statusText?: string;
}

// Sidebar: ONLY Dashboard, Parties, Reports, Trash Bin, Settings as requested
const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: "🏠" },
  { label: "Parties",   href: "/parties",   icon: "👥" },
  { label: "Reports",   href: "/reports",   icon: "📊" },
  { label: "Trash Bin", href: "/trash",     icon: "🗑️" },
  { label: "Settings",  href: "/settings",  icon: "⚙️" },
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

        {/* ── TOOLBAR (Quick Access) ────────────── */}
        <div className="toolbar" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}>
          <button className="toolbar-btn" onClick={() => router.push("/parties")} title="Parties (Vyapari)">
            👥 <span className="label"> Parties</span>
          </button>
          <button className="toolbar-btn" onClick={() => router.push("/purchases/new")} title="New Purchase">
            🐃 <span className="label"> New Purchase</span>
          </button>
          <button className="toolbar-btn" onClick={() => router.push("/payments/new")} title="New Payment">
            💰 <span className="label"> New Payment</span>
          </button>
          <div className="toolbar-separator" />
          <button className="toolbar-btn" onClick={() => router.push("/reports")} title="Reports">
            📊 <span className="label"> Reports</span>
          </button>
          <button className="toolbar-btn" onClick={() => router.push("/trash")} title="Trash Bin">
            🗑️ <span className="label"> Trash Bin</span>
          </button>
          <button className="toolbar-btn" onClick={() => router.push("/settings")} title="Settings">
            ⚙️ <span className="label"> Settings</span>
          </button>
        </div>

        {/* ── BODY (sidebar + workspace) ─────────── */}
        <div className="app-body">
          {/* Sidebar (Clean 5 items) */}
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
