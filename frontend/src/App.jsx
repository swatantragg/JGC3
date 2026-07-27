import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { Lock } from "lucide-react";
import QueryProvider from "./providers/QueryProvider.jsx";
import { ToastProvider } from "./providers/ToastProvider.jsx";
import { AuthProvider, useAuth } from "./auth/AuthProvider.jsx";
import LoginPage from "./auth/LoginPage.jsx";
import AppShell from "./components/layout/AppShell.jsx";
import { Spinner, Empty } from "./components/ui/index.jsx";
import { ROUTE_PERMS, firstAllowedRoute } from "./lib/nav.js";

import DashboardPage from "./features/dashboard/DashboardPage.jsx";
import SetupPage from "./features/setup/SetupPage.jsx";
import OrdersPage from "./features/orders/OrdersPage.jsx";
import PackingPage from "./features/packing/PackingPage.jsx";
import ShipmentsPage from "./features/shipments/ShipmentsPage.jsx";
import ReportsPage from "./features/reports/ReportsPage.jsx";
import DocumentsPage from "./features/documents/DocumentsPage.jsx";

/* A page the signed-in user has no rights to redirects to their first
   permitted one, so deep links never dead-end on a blank screen. An account
   with nothing ticked has nowhere to send — it gets told so rather than
   bouncing between two forbidden routes. */
function Guard({ perm, children }) {
  const { has } = useAuth();
  const { pathname } = useLocation();
  if (has(perm)) return children;
  const fallback = firstAllowedRoute(has);
  if (fallback === pathname) {
    return (
      <Empty icon={Lock} title="No areas assigned yet">
        Your account is active but nothing has been ticked for it. Ask the admin to grant
        access under <b>Setup → Users</b>.
      </Empty>
    );
  }
  return <Navigate to={fallback} replace state={{ denied: pathname }} />;
}

const guard = (path, el) => <Guard perm={ROUTE_PERMS[path]}>{el}</Guard>;

function Routed() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="page"><Spinner label="Starting up…" /></div>;
  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={guard("/", <DashboardPage />)} />
        <Route path="orders" element={guard("/orders", <OrdersPage />)} />
        <Route path="po-reports" element={guard("/po-reports", <DocumentsPage group="PO" />)} />
        <Route path="packing" element={guard("/packing", <PackingPage />)} />
        <Route path="shipments" element={guard("/shipments", <ShipmentsPage />)} />
        <Route path="supplier-reports" element={guard("/supplier-reports", <DocumentsPage group="SUP" />)} />
        <Route path="pre-shipment" element={guard("/pre-shipment", <DocumentsPage group="PRE" />)} />
        <Route path="post-shipment" element={guard("/post-shipment", <DocumentsPage group="POST" />)} />
        <Route path="reports" element={guard("/reports", <ReportsPage />)} />
        <Route path="documents" element={guard("/documents", <DocumentsPage />)} />
        <Route path="setup" element={guard("/setup", <SetupPage />)} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryProvider>
      {/* Hash routing: the bundle is served statically behind nginx, so a deep
          link must resolve without a server rewrite. */}
      <HashRouter>
        <AuthProvider>
          <ToastProvider>
            <Routed />
          </ToastProvider>
        </AuthProvider>
      </HashRouter>
    </QueryProvider>
  );
}
