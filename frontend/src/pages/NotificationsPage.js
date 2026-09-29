import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCheck } from "lucide-react";
import api from "@/lib/api";
import { ALERT_META, PRIORITY_META, fmtDate } from "@/lib/meta";
import { Button } from "@/components/ui/button";

const TABS = [
  { key: "all", label: "Semua" },
  { key: "kkpr_terbit", label: "KKPR Terbit" },
  { key: "rdtr_baru", label: "RDTR Baru" },
  { key: "perubahan_status", label: "Perubahan Status" },
];

export default function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("all");

  const load = useCallback(async () => {
    const { data } = await api.get("/notifications");
    setItems(data.items);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const markAll = async () => {
    await api.put("/notifications/read-all");
    load();
  };

  const open = async (n) => {
    await api.put(`/notifications/${n.id}/read`);
    navigate(`/leads?open=${n.lead_id}`);
  };

  const filtered = tab === "all" ? items : items.filter((i) => i.alert_type === tab);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Notifikasi &amp; Alert
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Deteksi milestone RDTR, KKPR/PKKPR, dan perubahan status
          </p>
        </div>
        <Button variant="outline" onClick={markAll} data-testid="notif-mark-all">
          <CheckCheck className="h-4 w-4 mr-2" /> Tandai semua dibaca
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            data-testid={`notif-tab-${t.key}`}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              tab === t.key
                ? "bg-[#0F172A] text-white"
                : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {filtered.map((n) => {
          const meta = ALERT_META[n.alert_type] || ALERT_META.kkpr_terbit;
          const prio = PRIORITY_META[n.prioritas];
          return (
            <button
              key={n.id}
              onClick={() => open(n)}
              data-testid={`notif-row-${n.id}`}
              className={`w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors flex items-start gap-4 ${
                n.read ? "opacity-60" : ""
              }`}
            >
              <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${meta.dot}`} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-slate-900">{n.judul}</p>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${meta.badge}`}>
                    {meta.label}
                  </span>
                  {!n.read && (
                    <span className="text-[10px] font-bold text-[#D97706]">BARU</span>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{n.pesan}</p>
                <p className="text-[11px] text-slate-400 mt-1">{fmtDate(n.created_at)}</p>
              </div>
              {prio && (
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${prio.badge}`}>
                  {n.prioritas}
                </span>
              )}
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-5 py-12 text-center text-slate-400">Tidak ada notifikasi.</p>
        )}
      </div>
    </div>
  );
}
