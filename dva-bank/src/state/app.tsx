import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { LocalStore, type Snapshot } from "@/lib/store";
import { loadCourse, type LoadedCourse } from "@/lib/content";
import { sync } from "@/lib/sync";
import { setLocale } from "@/i18n";

// ---------- auth ----------

type AuthState = { session: Session | null; ready: boolean };
const AuthContext = createContext<AuthState>({ session: null, ready: false });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, ready: false });
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => alive && setState({ session: data.session, ready: true }));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => setState({ session, ready: true }));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// ---------- data ----------

export type SyncStatus = { state: "idle" | "syncing" | "error" | "offline"; error?: string };

type DataState = {
  store: LocalStore;
  snap: Snapshot;
  content: LoadedCourse;
  email: string;
  sync: SyncStatus;
  syncNow: () => Promise<void>;
};

const DataContext = createContext<DataState | null>(null);

export function useData(): DataState {
  const v = useContext(DataContext);
  if (!v) throw new Error("useData outside DataProvider");
  return v;
}

const PUSH_DEBOUNCE_MS = 3000;
const PULL_THROTTLE_MS = 60_000;

function useOnline() {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener("online", fn);
      window.addEventListener("offline", fn);
      return () => {
        window.removeEventListener("online", fn);
        window.removeEventListener("offline", fn);
      };
    },
    () => navigator.onLine,
  );
}

export function DataProvider({ session, children, fallback }: { session: Session; children: ReactNode; fallback: ReactNode }) {
  const userId = session.user.id;
  const storeQ = useQuery({ queryKey: ["store", userId], queryFn: () => LocalStore.open(userId), staleTime: Infinity, gcTime: 0 });
  const store = storeQ.data;
  if (storeQ.error) throw storeQ.error;
  if (!store) return <>{fallback}</>;
  return (
    <Loaded store={store} email={session.user.email ?? ""} fallback={fallback}>
      {children}
    </Loaded>
  );
}

function Loaded({ store, email, children, fallback }: { store: LocalStore; email: string; children: ReactNode; fallback: ReactNode }) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const online = useOnline();
  const [status, setStatus] = useState<SyncStatus>({ state: "idle" });
  const running = useRef<Promise<void> | null>(null);
  const lastPull = useRef(0);
  const [firstSyncDone, setFirstSyncDone] = useState(!store.isEmpty);

  const syncNow = useCallback(async () => {
    if (running.current) return running.current;
    if (!navigator.onLine) {
      setStatus({ state: "offline" });
      return;
    }
    setStatus({ state: "syncing" });
    running.current = sync(supabase, store)
      .then(() => {
        lastPull.current = Date.now();
        setStatus({ state: "idle" });
      })
      .catch((e: Error) => setStatus({ state: "error", error: e.message }))
      .finally(() => {
        running.current = null;
        setFirstSyncDone(true);
      });
    return running.current;
  }, [store]);

  // initial sync, then on focus / reconnect (throttled)
  useEffect(() => {
    void syncNow();
    const onFocus = () => {
      if (Date.now() - lastPull.current > PULL_THROTTLE_MS) void syncNow();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [syncNow]);
  useEffect(() => {
    if (online) void syncNow();
    else setStatus({ state: "offline" });
  }, [online, syncNow]);

  // debounced push whenever the outbox has something
  const pending = Object.keys(snap.outbox).length;
  useEffect(() => {
    if (!pending || !online) return;
    const t = setTimeout(() => void syncNow(), PUSH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [pending, online, snap.outbox, syncNow]);

  useEffect(() => setLocale(snap.profile.locale), [snap.profile.locale]);

  const courseId = snap.profile.active_course;
  const contentQ = useQuery({ queryKey: ["course", courseId], queryFn: () => loadCourse(courseId), staleTime: Infinity });
  const content = contentQ.data;
  if (contentQ.error) throw contentQ.error;

  // material content edits reset affected cards (runs whenever content or the card set changes)
  const reconciledFor = useRef<string>("");
  useEffect(() => {
    if (!content) return;
    const key = `${content.course.id}:${Object.keys(snap.states).length}:${snap.lastSyncAt}`;
    if (reconciledFor.current === key) return;
    reconciledFor.current = key;
    store.reconcileWith(content);
  }, [content, snap.states, snap.lastSyncAt, store]);

  const value = useMemo(
    () => (content ? { store, snap, content, email, sync: status, syncNow } : null),
    [store, snap, content, email, status, syncNow],
  );
  // On a brand-new device wait for the first pull so we don't show an empty dashboard and then jump.
  if (!value || (!firstSyncDone && online)) return <>{fallback}</>;
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}
