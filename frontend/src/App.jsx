import { BrowserRouter, Routes, Route } from "react-router-dom";
import QueryProvider from "./providers/QueryProvider.jsx";
import AppShell from "./components/layout/AppShell.jsx";

import DashboardPage from "./features/dashboard/DashboardPage.jsx";
import SetupPage from "./features/setup/SetupPage.jsx";
import OrdersPage from "./features/orders/OrdersPage.jsx";
import PackingPage from "./features/packing/PackingPage.jsx";
import ShipmentsPage from "./features/shipments/ShipmentsPage.jsx";
import ReportsPage from "./features/reports/ReportsPage.jsx";
import DocumentsPage from "./features/documents/DocumentsPage.jsx";

export default function App() {
  return (
    <QueryProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<DashboardPage />} />
            <Route path="orders" element={<OrdersPage />} />
            <Route path="packing" element={<PackingPage />} />
            <Route path="shipments" element={<ShipmentsPage />} />
            <Route path="documents" element={<DocumentsPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route path="setup" element={<SetupPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryProvider>
  );
}
