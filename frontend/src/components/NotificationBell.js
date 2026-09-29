import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { ALERT_META, fmtDate } from "@/lib/meta";

export default function NotificationBell({ data, reload }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const items = data?.items || [];
  const unread = data?.unread || 0;

  const markAll = async () => {
    await api.put("/notifications/read-all");
    reload();
  };

  const openLead = async (n) => {
    await api.put(`/notifications/${n.id}/read`);
    setOpen(false);
    reload();
    navigate(`/leads?open=${n.lead_id}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          data-testid="notification-bell"
          className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <Bell className="h-5 w-5 text-slate-600" />
          {unread > 0 && (
            <span
              data-testid="notification-count"
              className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#D97706] text-white text-[10px] font-bold flex items-center justify-center"
            >
              {unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0" data-testid="notification-drawer">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <p className="font-semibold text-slate-900">Notifikasi & Alert</p>
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-[#065F46]"
            onClick={markAll}
            data-testid="mark-all-read-btn"
          >
            Tandai dibaca
          </Button>
        </div>
        <div className="max-h-[380px] overflow-y-auto brand-scroll">
          {items.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-400">Belum ada notifikasi</p>
          )}
          {items.map((n) => {
            const meta = ALERT_META[n.alert_type] || ALERT_META.kkpr_terbit;
            return (
              <button
                key={n.id}
                onClick={() => openLead(n)}
                data-testid={`notification-item-${n.id}`}
                className={`w-full text-left px-4 py-3 border-b last:border-0 hover:bg-slate-50 transition-colors flex gap-3 ${
                  n.read ? "opacity-60" : ""
                }`}
              >
                <span className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${meta.dot}`} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">{n.judul}</p>
                  <p className="text-xs text-slate-500 truncate">{n.pesan}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(n.created_at)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
