import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import QueryProvider from "./providers/QueryProvider.jsx";
import { AuthProvider, useAuth } from "./auth/AuthProvider.jsx";
import LoginPage from "./auth/LoginPage.jsx";
import AppShell from "./components/layout/AppShell.jsx";
import { Spinner, Empty } from "./components/ui/index.jsx";
import { Lock } from "lucide-react";
import { ROUTE_PERMS, firstAllowedRoute } from "./lib/nav.js";

import DashboardPage from "./features/dashboard/DashboardPage.jsx";
import SetupPage from "./features/setup/SetupPage.jsx";
import OrdersPage from "./features/orders/OrdersPage.jsx";
import PackingPage from "./features/packing/PackingPage.jsx";
import ShipmentsPage from "./features/shipments/ShipmentsPage.jsx";
import ReportsPage from "./features/reports/ReportsPage.jsx";
import DocumentsPage from "./features/documents/DocumentsPage.jsx";
import CostingPage from "./features/costing/CostingPage.jsx";

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

function Routed() {
  const { user, ready } = useAuth();
  if (!ready) return <div className="page"><Spinner label="Starting up…" /></div>;
  if (!user) return <LoginPage />;

  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Guard perm={ROUTE_PERMS["/"]}><DashboardPage /></Guard>} />
        <Route path="orders" element={<Guard perm={ROUTE_PERMS["/orders"]}><OrdersPage /></Guard>} />
        <Route path="packing" element={<Guard perm={ROUTE_PERMS["/packing"]}><PackingPage /></Guard>} />
        <Route path="shipments" element={<Guard perm={ROUTE_PERMS["/shipments"]}><ShipmentsPage /></Guard>} />
        <Route path="documents" element={<Guard perm={ROUTE_PERMS["/documents"]}><DocumentsPage /></Guard>} />
        <Route path="reports" element={<Guard perm={ROUTE_PERMS["/reports"]}><ReportsPage /></Guard>} />
        <Route path="costing" element={<Guard perm={ROUTE_PERMS["/costing"]}><CostingPage /></Guard>} />
        <Route path="setup" element={<Guard perm={ROUTE_PERMS["/setup"]}><SetupPage /></Guard>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <QueryProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routed />
        </AuthProvider>
      </BrowserRouter>
    </QueryProvider>
  );
}
