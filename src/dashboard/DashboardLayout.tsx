import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";

import { useAuth } from "@/hooks/AuthContext";
import { useVault } from "@/dashboard/VaultContext";
import { AccentPicker } from "@/dashboard/components/AccentPicker";
import { Button } from "@/dashboard/components/Button";
import { CommandPalette } from "@/dashboard/components/CommandPalette";
import { FabricSyncButton } from "@/dashboard/components/FabricSyncButton";
import { TelemetrySyncButton } from "@/dashboard/components/TelemetrySyncButton";
import { ThemeToggle } from "@/dashboard/components/ThemeToggle";
import { TimeRangeControl } from "@/dashboard/components/TimeRangeControl";
import { TourOverlay, useTour } from "@/dashboard/tour";
import {
  NAV,
  SETTINGS_NAV,
  showsCatalogFilters,
  showsTimeRange,
  visibleNav,
} from "@/dashboard/nav";
import { useActor } from "@/dashboard/useActor";

const control =
  "min-w-[7rem] rounded-md border border-border-strong bg-surface-raised px-2.5 py-1.5 text-sm text-fg";

const livePulse = { ["--pulse-rgb"]: "16 185 129" } as CSSProperties;

/** Persists the one-time command-palette hint dismissal, same localStorage
 * pattern as the theme toggle. A truthy value means the hint was seen. */
const HINT_KEY = "living-vault:palette-hint";

function readHintDismissed() {
  try {
    return Boolean(localStorage.getItem(HINT_KEY));
  } catch {
    return false;
  }
}

/** Persists the desktop sidebar collapsed state, same localStorage pattern. */
const COLLAPSE_KEY = "living-vault:sidebar-collapsed";

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

function navLinkClass({
  isActive,
  collapsed = false,
}: {
  isActive: boolean;
  collapsed?: boolean;
}) {
  return `flex items-center rounded-md border-l-2 py-2 text-sm font-medium transition-colors ${
    collapsed ? "justify-center px-2" : "gap-2 px-3"
  } ${
    isActive
      ? "border-accent bg-accent/15 text-sidebar-fg-strong"
      : "border-transparent text-sidebar-fg hover:bg-white/5 hover:text-sidebar-fg-strong"
  }`;
}

const NAV_ICON: Record<string, ReactNode> = {
  "/": (
    <path
      d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "/monitor": (
    <path
      d="M3 12h4l3-8 4 16 3-8h4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "/catalogue": <path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round" />,
  "/submissions": (
    <path
      d="M4 13h4l2 3h4l2-3h4M4 13l2-8h12l2 8M4 13v5a1 1 0 001 1h14a1 1 0 001-1v-5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "/effectiveness": (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  "/cost": (
    <path
      d="M12 3v18M16 6.5a4 4 0 00-4-2.5h-1.5a3 3 0 000 6h3a3 3 0 010 6H10A4 4 0 016 13"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  "/coverage": (
    <>
      <rect height="7" rx="1" width="7" x="3" y="3" />
      <rect height="7" rx="1" width="7" x="14" y="3" />
      <rect height="7" rx="1" width="7" x="3" y="14" />
      <rect height="7" rx="1" width="7" x="14" y="14" />
    </>
  ),
  "/dependencies": (
    <>
      <circle cx="5" cy="12" r="2.5" />
      <circle cx="19" cy="6" r="2.5" />
      <circle cx="19" cy="18" r="2.5" />
      <path d="M7.2 11l9.6-4M7.2 13l9.6 4" />
    </>
  ),
  "/model": (
    <>
      <rect height="6" rx="1" width="8" x="3" y="4" />
      <rect height="6" rx="1" width="8" x="13" y="14" />
      <path d="M7 10v3a2 2 0 002 2h6" />
    </>
  ),
  "/settings": (
    <>
      <circle cx="12" cy="12" r="3" />
      <path
        d="M19.4 13a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-2.9 1.2V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-2.9-1.2l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00-1.2-2.9H3a2 2 0 110-4h.1a1.7 1.7 0 001.2-2.9l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.9.3H13a1.7 1.7 0 001-1.6V3a2 2 0 114 0v.1a1.7 1.7 0 002.9 1.2l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.9V13z"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
};

function NavIcon({ path }: { path: string }) {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 shrink-0"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="20"
    >
      {NAV_ICON[path] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  );
}

function VaultMark() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-strong text-accent-fg shadow-card">
      <svg
        aria-hidden="true"
        fill="none"
        height="20"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
        width="20"
      >
        <rect height="18" rx="2" width="18" x="3" y="3" />
        <circle cx="12" cy="12" r="3.2" />
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round" />
      </svg>
    </span>
  );
}

const STATUSES = [
  "active",
  "deprecated",
  "retired",
  "plugin-managed",
  "project-specific",
];
const TYPES = [
  "skill",
  "subagent",
  "prompt",
  "mcp-server",
  "hook",
  "command",
  "workflow",
];

export function DashboardLayout() {
  const { signOut } = useAuth();
  const { dataset, error, filters, reload, setFilters } = useVault();
  const { role } = useActor();
  const { active: tourActive } = useTour();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(() => readHintDismissed());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    readSidebarCollapsed(),
  );
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  function dismissHint() {
    setHintDismissed(true);
    try {
      localStorage.setItem(HINT_KEY, "dismissed");
    } catch {
      /* storage unavailable, in-memory dismiss still works */
    }
  }

  function toggleSidebar() {
    setSidebarCollapsed((collapsed) => {
      const next = !collapsed;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* storage unavailable, in-memory toggle still works */
      }
      return next;
    });
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const assetIdMatch = location.pathname.match(/^\/asset\/([^/]+)/);
  const assetPageTitle =
    assetIdMatch && dataset
      ? dataset.assets.find((asset) => asset.id === assetIdMatch[1])?.name
      : undefined;

  const pageTitle =
    assetPageTitle ??
    [...NAV, SETTINGS_NAV].find((item) =>
      item.path === "/"
        ? location.pathname === "/"
        : location.pathname.startsWith(item.path),
    )?.label ??
    (location.pathname.startsWith("/asset/") ? "Asset detail" : "Not found");

  const settingsLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex w-full items-center rounded-md border border-sidebar-border py-2 text-sm transition-colors ${
      sidebarCollapsed ? "justify-center px-2" : "gap-2 px-3"
    } ${
      isActive
        ? "bg-accent/15 text-sidebar-fg-strong"
        : "text-sidebar-fg hover:bg-white/5 hover:text-sidebar-fg-strong"
    }`;

  // The asset search and filter selects drive filteredAssets, which the model
  // canvas never reads, so they are hidden there to avoid a dead second search.
  const catalogFilters = showsCatalogFilters(location.pathname);
  const timeRangeControl = showsTimeRange(location.pathname);
  // How many of the four dropdown filters are narrowing the catalogue (search is
  // separate). Drives the count badge on the single grouped Filters control.
  const activeFilterCount = [
    filters.type,
    filters.tier,
    filters.status,
    filters.risk,
  ].filter((value) => value !== "all").length;

  function closeNav() {
    setMobileNavOpen(false);
    hamburgerRef.current?.focus();
  }

  useEffect(() => {
    if (!mobileNavOpen) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeNav();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobileNavOpen]);

  const navLinks = (onNavigate?: () => void, collapsed = false) =>
    visibleNav(role).map((item) => (
      <NavLink
        aria-label={item.label}
        className={({ isActive }) => navLinkClass({ isActive, collapsed })}
        end={item.path === "/"}
        key={item.path}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        to={item.path}
      >
        <NavIcon path={item.path} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </NavLink>
    ));

  const filterControls = (stacked = false) => (
    <>
      <select
        aria-label="Filter by type"
        className={`${control} ${stacked ? "w-full" : ""}`}
        onChange={(event) =>
          setFilters({
            ...filters,
            type: event.target.value as typeof filters.type,
          })
        }
        value={filters.type}
      >
        <option value="all">All types</option>
        {TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by tier"
        className={`${control} ${stacked ? "w-full" : ""}`}
        onChange={(event) =>
          setFilters({
            ...filters,
            tier: event.target.value as typeof filters.tier,
          })
        }
        value={filters.tier}
      >
        <option value="all">All tiers</option>
        <option value="stock">Stock</option>
        <option value="custom">Custom</option>
        <option value="forked">Forked</option>
      </select>
      <select
        aria-label="Filter by status"
        className={`${control} ${stacked ? "w-full" : ""}`}
        onChange={(event) =>
          setFilters({
            ...filters,
            status: event.target.value as typeof filters.status,
          })
        }
        value={filters.status}
      >
        <option value="all">All statuses</option>
        {STATUSES.map((status) => (
          <option key={status} value={status}>
            {status}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by risk"
        className={`${control} ${stacked ? "w-full" : ""}`}
        onChange={(event) =>
          setFilters({
            ...filters,
            risk: event.target.value as typeof filters.risk,
          })
        }
        value={filters.risk}
      >
        <option value="all">All risk</option>
        <option value="low">low</option>
        <option value="medium">medium</option>
        <option value="high">high</option>
      </select>
    </>
  );

  return (
    <div className="min-h-screen text-fg">
      <a
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
        href="#main"
      >
        Skip to main content
      </a>

      <aside
        className={`fixed inset-y-0 left-0 hidden flex-col border-r border-sidebar-border bg-sidebar py-4 text-sidebar-fg motion-safe:transition-[width] motion-safe:duration-200 lg:flex ${
          sidebarCollapsed ? "w-16 items-center px-2" : "w-64 px-4"
        }`}
      >
        <div className="relative w-full">
          <div
            aria-hidden="true"
            className="glow-surface pointer-events-none absolute inset-x-0 -top-6 h-28"
          />
          <div
            className={`relative flex items-center ${
              sidebarCollapsed ? "justify-center" : "gap-2.5"
            }`}
          >
            <VaultMark />
            {!sidebarCollapsed && (
              <div>
                <div className="font-mono text-[0.625rem] font-semibold uppercase tracking-[0.2em] text-accent">
                  Fabric native
                </div>
                <div className="font-display text-lg font-semibold leading-tight tracking-tight text-sidebar-fg-strong">
                  The Living Vault
                </div>
              </div>
            )}
          </div>
          {!sidebarCollapsed && (
            <p className="relative mt-3 text-sm text-sidebar-fg">
              Agentic assets, governed and measured.
            </p>
          )}
        </div>
        <nav className="mt-6 w-full space-y-1" data-tour="sidebar-nav">
          {navLinks(undefined, sidebarCollapsed)}
        </nav>
        <div className="mt-auto w-full space-y-2">
          <NavLink
            aria-label={SETTINGS_NAV.label}
            className={settingsLinkClass}
            data-tour="settings-link"
            title={sidebarCollapsed ? SETTINGS_NAV.label : undefined}
            to={SETTINGS_NAV.path}
          >
            <NavIcon path={SETTINGS_NAV.path} />
            {!sidebarCollapsed && <span>{SETTINGS_NAV.label}</span>}
          </NavLink>
          <button
            aria-expanded={!sidebarCollapsed}
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            className={`flex w-full items-center rounded-md border border-sidebar-border py-2 text-sm text-sidebar-fg hover:bg-white/5 hover:text-sidebar-fg-strong ${
              sidebarCollapsed ? "justify-center px-2" : "gap-2 px-3"
            }`}
            onClick={toggleSidebar}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            type="button"
          >
            <svg
              aria-hidden="true"
              className="h-5 w-5 shrink-0"
              fill="none"
              height="20"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="20"
            >
              <path
                d={sidebarCollapsed ? "M9 6l6 6-6 6" : "M15 6l-6 6 6 6"}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            {!sidebarCollapsed && <span>Collapse</span>}
          </button>
          <button
            aria-label="Sign out"
            className={`flex w-full items-center justify-center rounded-md border border-sidebar-border py-2 text-sm text-sidebar-fg hover:bg-white/5 hover:text-sidebar-fg-strong ${
              sidebarCollapsed ? "px-2" : "px-3"
            }`}
            onClick={() => void signOut()}
            title={sidebarCollapsed ? "Sign out" : undefined}
            type="button"
          >
            {sidebarCollapsed ? (
              <svg
                aria-hidden="true"
                className="h-5 w-5"
                fill="none"
                height="20"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="20"
              >
                <path
                  d="M16 17l5-5-5-5M21 12H9M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              "Sign out"
            )}
          </button>
        </div>
      </aside>

      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/50"
            onClick={closeNav}
            type="button"
          />
          <aside className="absolute inset-y-0 left-0 flex w-64 flex-col border-r border-sidebar-border bg-sidebar p-4 text-sidebar-fg">
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold tracking-tight text-sidebar-fg-strong">
                The Living Vault
              </div>
              <button
                aria-label="Close navigation"
                className="rounded-md p-1 text-sidebar-fg hover:bg-white/5"
                onClick={closeNav}
                ref={closeRef}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="20"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="20"
                >
                  <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            </div>
            <nav className="mt-6 space-y-1">{navLinks(closeNav)}</nav>
            <div className="mt-auto space-y-2">
              <NavLink
                aria-label={SETTINGS_NAV.label}
                className={({ isActive }) =>
                  `flex items-center gap-2 rounded-md border border-sidebar-border px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-accent/15 text-sidebar-fg-strong"
                      : "text-sidebar-fg hover:bg-white/5 hover:text-sidebar-fg-strong"
                  }`
                }
                onClick={closeNav}
                to={SETTINGS_NAV.path}
              >
                <NavIcon path={SETTINGS_NAV.path} />
                <span>{SETTINGS_NAV.label}</span>
              </NavLink>
              <button
                className="w-full rounded-md border border-sidebar-border px-3 py-2 text-left text-sm text-sidebar-fg hover:bg-white/5"
                onClick={() => void signOut()}
                type="button"
              >
                Sign out
              </button>
            </div>
          </aside>
        </div>
      )}

      <div
        className={`${
          sidebarCollapsed ? "lg:pl-16" : "lg:pl-64"
        } motion-safe:transition-[padding] motion-safe:duration-200`}
        inert={mobileNavOpen || undefined}
      >
        <header className="sticky top-0 z-10 border-b border-border bg-surface-raised/95 px-4 py-3 backdrop-blur lg:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-3">
              <button
                aria-label="Open navigation"
                className="rounded-md border border-border-strong p-1.5 text-muted hover:bg-surface-inset hover:text-fg lg:hidden"
                onClick={() => setMobileNavOpen(true)}
                ref={hamburgerRef}
                type="button"
              >
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="20"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="20"
                >
                  <path d="M3 6h18M3 12h18M3 18h18" strokeLinecap="round" />
                </svg>
              </button>
              <div>
                <div className="eyebrow flex items-center gap-2">
                  <span>The Living Vault</span>
                  {dataset?.telemetryMeta && (
                    <span className="inline-flex items-center gap-1.5 text-success">
                      <span
                        aria-hidden="true"
                        className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-success"
                        style={livePulse}
                      />
                      <span>live</span>
                    </span>
                  )}
                </div>
                <h1 className="font-display text-xl font-semibold tracking-tight text-fg">
                  {pageTitle}
                </h1>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {catalogFilters && (
                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="search"
                >
                  <input
                    aria-label="Search assets"
                    className={`${control} grow placeholder:text-subtle`}
                    onChange={(event) =>
                      setFilters({ ...filters, search: event.target.value })
                    }
                    placeholder="Search assets"
                    type="search"
                    value={filters.search}
                  />
                  <Button
                    aria-expanded={filtersOpen}
                    onClick={() => setFiltersOpen((open) => !open)}
                    size="sm"
                    type="button"
                    variant={
                      activeFilterCount > 0 || filtersOpen
                        ? "primary"
                        : "secondary"
                    }
                  >
                    <svg
                      aria-hidden="true"
                      fill="none"
                      height="15"
                      stroke="currentColor"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      width="15"
                    >
                      <path
                        d="M3 5h18l-7 8v5l-4 2v-7L3 5Z"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Filters
                    {activeFilterCount > 0 && (
                      <span
                        aria-hidden="true"
                        className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-fg/20 px-1 text-[0.6875rem] font-semibold tabular-nums"
                      >
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </div>
              )}
              <div
                className="relative hidden sm:block"
                data-tour="command-palette"
              >
                <button
                  aria-label="Open command palette"
                  className="inline-flex h-9 items-center gap-2 rounded-md border border-border-strong bg-surface-raised px-2.5 text-sm text-muted hover:bg-surface-inset hover:text-fg"
                  onClick={() => setPaletteOpen(true)}
                  type="button"
                >
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height="16"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    width="16"
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" strokeLinecap="round" />
                  </svg>
                  <kbd className="font-mono text-[0.6875rem] tracking-wide">
                    ⌘K
                  </kbd>
                </button>
                {!hintDismissed && !paletteOpen && !tourActive && (
                  <div
                    className="absolute right-0 top-full z-20 mt-2 w-56 rounded-md border border-border-strong bg-surface-raised p-3 text-left shadow-raised"
                    data-rise
                    role="status"
                  >
                    <p className="text-sm text-fg">
                      Press the command palette or hit Cmd-K to jump to any page
                      or asset.
                    </p>
                    <div className="mt-2 flex justify-end">
                      <Button
                        onClick={dismissHint}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        Got it
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              {timeRangeControl && <TimeRangeControl />}
              <ThemeToggle />
              <AccentPicker />
              <span className="flex items-center gap-2" data-tour="header-sync">
                <TelemetrySyncButton />
                <FabricSyncButton />
              </span>
            </div>
          </div>
        </header>
        {catalogFilters && filtersOpen && (
          <div className="border-b border-border bg-surface-raised px-4 py-3 lg:px-6">
            <div
              aria-label="Filters"
              aria-modal="false"
              className="space-y-3"
              role="dialog"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="eyebrow">Filters</div>
                <div className="flex items-center gap-2">
                  {activeFilterCount > 0 && (
                    <Button
                      onClick={() =>
                        setFilters({
                          ...filters,
                          type: "all",
                          tier: "all",
                          status: "all",
                          risk: "all",
                        })
                      }
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      Clear all
                    </Button>
                  )}
                  <Button
                    onClick={() => setFiltersOpen(false)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    Close
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {filterControls(true)}
              </div>
            </div>
          </div>
        )}
        <main className="p-4 lg:px-6 lg:py-6" data-tour="page-main" id="main">
          {error && (
            <div
              className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-danger/30 bg-danger-surface px-3 py-2 text-sm text-danger-fg"
              role="alert"
            >
              <span>{error}</span>
              <Button
                onClick={() => void reload()}
                size="sm"
                type="button"
                variant="secondary"
              >
                Retry
              </Button>
            </div>
          )}
          <Outlet />
        </main>
      </div>
      <CommandPalette
        onClose={() => setPaletteOpen(false)}
        open={paletteOpen}
      />
      <TourOverlay />
    </div>
  );
}
