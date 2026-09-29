import { useEffect, useState, useCallback } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  KanbanSquare,
  ListChecks,
  Bell,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  MapPinned,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Wordmark, BrandMark } from "@/components/Brand";
import NotificationBell from "@/components/NotificationBell";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import api from "@/lib/api";

const NAV = [
  { to: "/", label: "Ringkasan", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/leads", label: "Daftar Lead", icon: ListChecks, testid: "nav-leads" },
  { to: "/crm", label: "Pipeline CRM", icon: KanbanSquare, testid: "nav-crm" },
  { to: "/peta", label: "Peta Proyek", icon: MapPinned, testid: "nav-peta" },
  { to: "/notifikasi", label: "Notifikasi & Alert", icon: Bell, testid: "nav-notifikasi" },
];
const ADMIN_NAV = [
  { to: "/users", label: "Manajemen User", icon: Users, testid: "nav-users" },
  { to: "/settings", label: "Pengaturan Wilayah", icon: Settings, testid: "nav-settings" },
];

export default function AppLayout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [notif, setNotif] = useState({ items: [], unread: 0 });
  const [mobileOpen, setMobileOpen] = useState(false);

  const loadNotif = useCallback(async () => {
    try {
      const { data } = await api.get("/notifications");
      setNotif(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadNotif();
    const t = setInterval(loadNotif, 30000);
    return () => clearInterval(t);
  }, [loadNotif]);

  const onLogout = async () => {
    await logout();
    navigate("/login");
  };

  const initials = (user?.name || "U")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const NavItems = ({ onClick }) => (
    <nav className="flex-1 px-3 space-y-1">
      {NAV.map((n) => (
        <NavLink
          key={n.to}
          to={n.to}
          end={n.to === "/"}
          onClick={onClick}
          data-testid={n.testid}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? "bg-[#065F46] text-white"
                : "text-slate-300 hover:bg-white/10 hover:text-white"
            }`
          }
        >
          <n.icon className="h-[18px] w-[18px]" />
          {n.label}
        </NavLink>
      ))}
      {isAdmin && (
        <>
          <p className="px-3 pt-4 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
            Admin
          </p>
          {ADMIN_NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              onClick={onClick}
              data-testid={n.testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-[#D97706] text-white"
                    : "text-slate-300 hover:bg-white/10 hover:text-white"
                }`
              }
            >
              <n.icon className="h-[18px] w-[18px]" />
              {n.label}
            </NavLink>
          ))}
        </>
      )}
    </nav>
  );

  const Sidebar = ({ onNavClick }) => (
    <div className="flex flex-col h-full bg-[#0F172A]">
      <div className="flex items-center gap-3 px-5 py-5">
        <BrandMark className="h-10 w-10" />
        <div className="leading-none">
          <Wordmark className="text-lg" />
          <p className="text-[10px] text-slate-400 tracking-wider mt-1">PROJECT &amp; FINANCE INTELLIGENCE</p>
        </div>
      </div>
      <NavItems onClick={onNavClick} />
      <div className="p-3 border-t border-white/10">
        <button
          onClick={onLogout}
          data-testid="logout-btn"
          className="flex w-full items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
        >
          <LogOut className="h-[18px] w-[18px]" />
          Keluar
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        <Sidebar />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64">
            <Sidebar onNavClick={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200">
          <div className="flex items-center justify-between px-4 sm:px-6 py-3">
            <div className="flex items-center gap-3">
              <button
                className="lg:hidden p-2 rounded-lg hover:bg-slate-100"
                onClick={() => setMobileOpen(true)}
                data-testid="mobile-menu-btn"
              >
                <Menu className="h-5 w-5 text-slate-700" />
              </button>
              <div className="hidden sm:block">
                <p className="text-xs text-slate-400">Selamat datang,</p>
                <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <NotificationBell data={notif} reload={loadNotif} />
              <div className="flex items-center gap-2 pl-1 sm:pl-2">
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-[#065F46] text-white text-xs font-bold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div className="hidden sm:block leading-tight">
                  <p className="text-sm font-semibold text-slate-800">{user?.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {isAdmin ? "Super Admin" : "Marketing"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8">
          <Outlet context={{ reloadNotif: loadNotif }} />
        </main>
      </div>
    </div>
  );
}
