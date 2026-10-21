import { NavLink, Outlet, useLocation } from "react-router";
import { useTranslation } from "react-i18next";
import { BookOpen, CloudOff, House, Layers, RefreshCw, Settings, Target, Timer, TriangleAlert } from "lucide-react";
import { useRegisterSW } from "virtual:pwa-register/react";
import { useData } from "@/state/app";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui";
import { relativeTime } from "./format";

const NAV = [
  { to: "/", key: "home", icon: House },
  { to: "/study", key: "study", icon: BookOpen },
  { to: "/sections", key: "sections", icon: Layers },
  { to: "/review", key: "review", icon: Target },
  { to: "/mock", key: "mock", icon: Timer },
  { to: "/settings", key: "settings", icon: Settings },
] as const;

export function Layout() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const focus = /^\/(study|quiz|practice)/.test(pathname) || /^\/mock\/run/.test(pathname);

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col">
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
        <NavLink to="/" className="flex items-center gap-2 font-semibold">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span>{t("app.name")}</span>
          <span className="hidden text-xs font-normal text-muted-foreground sm:inline">{t("app.tagline")}</span>
        </NavLink>
        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => cn("rounded-lg px-3 py-1.5 text-sm whitespace-nowrap", isActive ? "bg-muted font-medium" : "text-muted-foreground hover:text-foreground")}>
              {t(`nav.${n.key}`)}
            </NavLink>
          ))}
        </nav>
        <SyncIndicator />
      </header>

      <OfflineBanner />
      <UpdatePrompt />

      <main className={cn("min-w-0 flex-1 px-4 py-5", !focus && "pb-24 md:pb-8")}>
        <Outlet />
      </main>

      {!focus && (
        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => cn("flex flex-col items-center gap-0.5 py-2 text-[0.65rem]", isActive ? "text-primary" : "text-muted-foreground")}>
              <n.icon className="size-5" />
              <span className="max-w-full truncate px-0.5">{t(`nav.${n.key}`)}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  );
}

function SyncIndicator() {
  const { t, i18n } = useTranslation();
  const { sync, snap, syncNow } = useData();
  const pending = Object.keys(snap.outbox).length;
  const label =
    sync.state === "syncing"
      ? t("common.syncing")
      : sync.state === "error"
        ? t("common.syncError", { message: sync.error })
        : pending
          ? t("common.pending", { count: pending })
          : t("common.synced", { when: snap.lastSyncAt ? relativeTime(snap.lastSyncAt, i18n.language) : t("common.never") });
  return (
    <button onClick={() => void syncNow()} title={label} aria-label={label} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted-foreground hover:bg-muted">
      {sync.state === "offline" ? (
        <CloudOff className="size-4" />
      ) : sync.state === "error" ? (
        <TriangleAlert className="size-4 text-warning" />
      ) : (
        <RefreshCw className={cn("size-4", sync.state === "syncing" && "animate-spin")} />
      )}
      {pending > 0 && <span className="tabular-nums">{pending}</span>}
    </button>
  );
}

function OfflineBanner() {
  const { t } = useTranslation();
  const { sync } = useData();
  if (sync.state !== "offline") return null;
  return <div className="bg-muted px-4 py-2 text-center text-xs text-muted-foreground">{t("common.offline")}</div>;
}

function UpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <div role="status" className="flex items-center justify-center gap-3 bg-primary/10 px-4 py-2 text-sm">
      {t("common.updateReady")}
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        {t("common.reload")}
      </Button>
    </div>
  );
}
