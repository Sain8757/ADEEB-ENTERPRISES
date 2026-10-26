"use client";
// ADEEB ENTERPRISES — Main application shell
// Focused Top Navbar (5 items: Dashboard, Parties, Reports, Trash Bin, Settings), Full-Width Workspace (NO sidebar), and Status Bar.

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

// Navigation: ONLY Dashboard, Parties, Reports, Settings (Trash Bin is inside Settings)
const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: "🏠" },
  { label: "Parties",   href: "/parties",   icon: "👥" },
  { label: "Reports",   href: "/reports",   icon: "📊" },
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

        {/* ── TOP NAVBAR (Main Navigation: Dashboard, Parties, Reports, Settings) ── */}
        <div className="toolbar top-nav-bar" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 8px', overflowX: 'auto', flexWrap: 'nowrap' }}>
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname?.startsWith(item.href) ||
                (item.href === '/parties' && pathname?.startsWith('/ledger')) ||
                (item.href === '/settings' && pathname?.startsWith('/trash'));
            return (
              <button
                key={item.href}
                className={`toolbar-btn ${isActive ? 'active' : ''}`}
                onClick={() => router.push(item.href)}
                title={item.label}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '5px 14px',
                  fontWeight: isActive ? 'bold' : 'normal',
                  background: isActive ? '#000080' : undefined,
                  color: isActive ? '#ffffff' : undefined,
                  borderRadius: '3px',
                  fontSize: '12px',
                  flexShrink: 0,
                  whiteSpace: 'nowrap',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: '14px' }}>{item.icon}</span>
                <span className="label">{item.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── BODY (Workspace full width — NO sidebar) ─────────── */}
        <div className="app-body">
          <main className="workspace" style={{ width: '100%', flex: 1, padding: '8px' }}>
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

        {/* ── MOBILE BOTTOM NAVIGATION (iPhone & Android 100% thumb navigation) ── */}
        <nav className="mobile-bottom-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname?.startsWith(item.href) ||
                (item.href === '/parties' && pathname?.startsWith('/ledger')) ||
                (item.href === '/settings' && pathname?.startsWith('/trash'));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mobile-nav-item ${isActive ? "active" : ""}`}
              >
                <span className="mobile-nav-icon">{item.icon}</span>
                <span className="mobile-nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
