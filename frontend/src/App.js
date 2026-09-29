import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AppLayout from "@/components/AppLayout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import LeadsPage from "@/pages/LeadsPage";
import CRMBoard from "@/pages/CRMBoard";
import NotificationsPage from "@/pages/NotificationsPage";
import UsersPage from "@/pages/UsersPage";
import SettingsPage from "@/pages/SettingsPage";

function Protected({ children, adminOnly }) {
  const { user, isAdmin } = useAuth();
  if (user === null)
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400">
        Memuat…
      </div>
    );
  if (user === false) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              element={
                <Protected>
                  <AppLayout />
                </Protected>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/leads" element={<LeadsPage />} />
              <Route path="/crm" element={<CRMBoard />} />
              <Route path="/notifikasi" element={<NotificationsPage />} />
              <Route
                path="/users"
                element={
                  <Protected adminOnly>
                    <UsersPage />
                  </Protected>
                }
              />
              <Route
                path="/settings"
                element={
                  <Protected adminOnly>
                    <SettingsPage />
                  </Protected>
                }
              />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
