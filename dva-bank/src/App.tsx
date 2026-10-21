import { Component, lazy, Suspense, type ReactNode } from "react";
import { createBrowserRouter, Navigate, Outlet, RouterProvider } from "react-router";
import { useTranslation } from "react-i18next";
import { AuthProvider, DataProvider, useAuth } from "@/state/app";
import { Layout } from "@/components/Layout";
import { Button, Spinner } from "@/components/ui";
import { Login } from "@/routes/Login";
const Home = lazy(() => import("@/routes/Home").then((m) => ({ default: m.Home })));
const Study = lazy(() => import("@/routes/Study").then((m) => ({ default: m.Study })));
const Quiz = lazy(() => import("@/routes/Study").then((m) => ({ default: m.Quiz })));
const Practice = lazy(() => import("@/routes/Study").then((m) => ({ default: m.Practice })));
const Sections = lazy(() => import("@/routes/Sections").then((m) => ({ default: m.Sections })));
const Review = lazy(() => import("@/routes/Review").then((m) => ({ default: m.Review })));
const MockHome = lazy(() => import("@/routes/Mock").then((m) => ({ default: m.MockHome })));
const MockRun = lazy(() => import("@/routes/Mock").then((m) => ({ default: m.MockRun })));
const MockResult = lazy(() => import("@/routes/Mock").then((m) => ({ default: m.MockResult })));
const Settings = lazy(() => import("@/routes/Settings").then((m) => ({ default: m.Settings })));

const router = createBrowserRouter([
  {
    path: "/",
    element: <Gate />,
    errorElement: <Crash />,
    children: [
      {
        element: <Layout />,
        children: [
          { index: true, element: <Home /> },
          { path: "study", element: <Study /> },
          { path: "quiz/:sectionId", element: <Quiz /> },
          { path: "practice", element: <Practice /> },
          { path: "sections", element: <Sections /> },
          { path: "review", element: <Review /> },
          { path: "mock", element: <MockHome /> },
          { path: "mock/run", element: <MockRun /> },
          { path: "mock/result/:sessionId", element: <MockResult /> },
          { path: "settings", element: <Settings /> },
          { path: "*", element: <Navigate to="/" replace /> },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ErrorBoundary>
  );
}

function Gate() {
  const { session, ready } = useAuth();
  if (!ready) return <Splash />;
  if (!session) return <Login />;
  return (
    <DataProvider key={session.user.id} session={session} fallback={<Splash />}>
      <Suspense fallback={<Splash />}>
        <Outlet />
      </Suspense>
    </DataProvider>
  );
}

function Splash() {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh place-items-center text-muted-foreground" role="status">
      <span className="flex items-center gap-2 text-sm">
        <Spinner />
        {t("common.loading")}
      </span>
    </div>
  );
}

function Crash() {
  return <CrashView error={null} />;
}

function CrashView({ error }: { error: Error | null }) {
  const { t } = useTranslation();
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div className="flex max-w-md flex-col items-center gap-3">
        <h1 className="text-lg font-semibold">Something went wrong</h1>
        {error && <pre className="max-w-full overflow-auto rounded bg-muted p-2 text-left text-xs">{error.message}</pre>}
        <Button onClick={() => window.location.reload()}>{t("common.retry")}</Button>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    return this.state.error ? <CrashView error={this.state.error} /> : this.props.children;
  }
}
