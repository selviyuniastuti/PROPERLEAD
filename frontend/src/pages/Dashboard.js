import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Cell,
  Tooltip,
} from "recharts";
import {
  Sparkles,
  FileCheck2,
  Map,
  RefreshCw,
  ArrowUpRight,
  TrendingUp,
} from "lucide-react";
import api from "@/lib/api";
import { ALERT_META, PRIORITY_META, CRM_STAGES, stageMeta, fmtDate } from "@/lib/meta";
import LeadDetailDialog from "@/components/LeadDetailDialog";

const STAT_DEFS = [
  {
    key: "lead_baru_hari_ini",
    label: "Lead Baru Hari Ini",
    icon: Sparkles,
    ring: "bg-[#ECFDF5] text-[#065F46]",
  },
  {
    key: "kkpr_terbit",
    label: "KKPR/PKKPR Terbit",
    icon: FileCheck2,
    ring: "bg-[#DBEAFE] text-[#1D4ED8]",
  },
  {
    key: "rdtr_baru",
    label: "RDTR Baru",
    icon: Map,
    ring: "bg-[#DCFCE7] text-[#15803D]",
  },
  {
    key: "status_berubah",
    label: "Status Berubah",
    icon: RefreshCw,
    ring: "bg-[#FFEDD5] text-[#C2410C]",
  },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [leads, setLeads] = useState([]);
  const [active, setActive] = useState(null);

  const load = async () => {
    const [s, l] = await Promise.all([
      api.get("/dashboard/stats"),
      api.get("/leads"),
    ]);
    setStats(s.data);
    setLeads(l.data);
  };

  useEffect(() => {
    load();
  }, []);

  const openLead = async (id) => {
    const { data } = await api.get(`/leads/${id}`);
    setActive(data);
  };

  const chartData = (stats?.per_wilayah || []).map((r) => ({ name: r.wilayah, jumlah: r.jumlah }));
  const colors = ["#065F46", "#0b7a5a", "#10B981", "#D97706", "#F5C451", "#94A3B8"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Ringkasan Dashboard
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Monitoring proyek perumahan &amp; milestone perizinan dari OSS
          </p>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {STAT_DEFS.map((s) => (
          <div
            key={s.key}
            data-testid={`stat-${s.key}`}
            className="bg-white rounded-xl border border-slate-200 p-5 hover:-translate-y-0.5 hover:shadow-md transition-transform"
          >
            <div className="flex items-center justify-between">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${s.ring}`}>
                <s.icon className="h-5 w-5" />
              </div>
              <ArrowUpRight className="h-4 w-4 text-slate-300" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900 mt-4">
              {stats ? stats[s.key] : "—"}
            </p>
            <p className="text-sm text-slate-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Priority + Pipeline */}
        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm font-semibold text-slate-800 mb-4">Distribusi Prioritas</p>
            <div className="space-y-3">
              {["A", "B", "C"].map((p) => {
                const total = stats?.total_leads || 1;
                const val = stats?.prioritas?.[p] || 0;
                const pct = Math.round((val / total) * 100);
                const meta = PRIORITY_META[p];
                return (
                  <div key={p}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className={`px-2 py-0.5 rounded-full border text-[11px] font-semibold ${meta.badge}`}>
                        {meta.label}
                      </span>
                      <span className="font-mono font-semibold text-slate-700">{val}</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-[#065F46] rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <p className="text-sm font-semibold text-slate-800 mb-4">Pipeline CRM</p>
            <div className="space-y-2">
              {CRM_STAGES.map((s) => (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                  <span className="text-sm text-slate-600 flex-1">{s.label}</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {stats?.pipeline?.[s.key] || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Region chart */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 lg:col-span-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-4">
            <TrendingUp className="h-4 w-4 text-[#065F46]" /> Lead per Wilayah
          </p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748B" }} />
              <Tooltip cursor={{ fill: "#F1F5F9" }} />
              <Bar dataKey="jumlah" radius={[6, 6, 0, 0]}>
                {chartData.map((_, i) => (
                  <Cell key={i} fill={colors[i % colors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent leads */}
      <div className="bg-white rounded-xl border border-slate-200">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-slate-800">Lead Terbaru</p>
          <button
            onClick={() => navigate("/leads")}
            className="text-sm font-medium text-[#065F46] hover:underline"
            data-testid="view-all-leads-btn"
          >
            Lihat semua
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {leads.slice(0, 5).map((l) => {
            const alert = ALERT_META[l.alert_type] || ALERT_META.kkpr_terbit;
            const prio = PRIORITY_META[l.prioritas];
            return (
              <button
                key={l.id}
                onClick={() => openLead(l.id)}
                data-testid={`recent-lead-${l.id}`}
                className="w-full text-left px-5 py-4 hover:bg-slate-50 transition-colors flex items-center gap-4"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-900 truncate">{l.developer?.nama}</p>
                  <p className="text-sm text-slate-500 truncate">
                    {l.proyek?.nama} · {l.proyek?.kabupaten_kota}
                  </p>
                </div>
                <span className={`hidden sm:inline text-[11px] font-semibold px-2 py-0.5 rounded-full border ${alert.badge}`}>
                  {alert.label}
                </span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${prio.badge}`}>
                  {prio.label}
                </span>
                <span className="font-mono font-bold text-slate-800 w-10 text-right">{l.score}</span>
                <span className="text-xs text-slate-400 hidden md:block w-24 text-right">
                  {fmtDate(l.tanggal_ditemukan)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <LeadDetailDialog
        lead={active}
        open={!!active}
        onOpenChange={(v) => !v && setActive(null)}
        onChanged={async () => {
          await load();
          if (active) {
            const { data } = await api.get(`/leads/${active.id}`);
            setActive(data);
          }
        }}
      />
    </div>
  );
}
