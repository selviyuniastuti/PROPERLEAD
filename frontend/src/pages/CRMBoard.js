import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { ALERT_META, PRIORITY_META, CRM_STAGES } from "@/lib/meta";
import LeadDetailDialog from "@/components/LeadDetailDialog";
import { toast } from "sonner";

export default function CRMBoard() {
  const [leads, setLeads] = useState([]);
  const [active, setActive] = useState(null);

  const load = async () => {
    const { data } = await api.get("/leads");
    setLeads(data);
  };

  useEffect(() => {
    load();
  }, []);

  const move = async (lead, dir) => {
    const idx = CRM_STAGES.findIndex((s) => s.key === lead.crm_status);
    const next = idx + dir;
    if (next < 0 || next >= CRM_STAGES.length) return;
    const target = CRM_STAGES[next].key;
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, crm_status: target } : l)));
    try {
      await api.put(`/leads/${lead.id}/crm`, { crm_status: target });
    } catch (e) {
      toast.error(apiErr(e));
      load();
    }
  };

  const openLead = async (id) => {
    const { data } = await api.get(`/leads/${id}`);
    setActive(data);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Pipeline CRM
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Kelola lead dari NEW hingga Kerjasama. Gunakan panah untuk memindahkan tahap.
        </p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 brand-scroll">
        {CRM_STAGES.map((stage, sIdx) => {
          const col = leads.filter((l) => l.crm_status === stage.key);
          return (
            <div
              key={stage.key}
              data-testid={`crm-column-${stage.key}`}
              className="w-72 shrink-0"
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: stage.color }} />
                  <span className="font-semibold text-slate-800 text-sm">{stage.label}</span>
                </div>
                <span className="text-xs font-mono font-bold text-slate-400">{col.length}</span>
              </div>
              <div className="space-y-3 min-h-[100px]">
                {col.map((l) => {
                  const alert = ALERT_META[l.alert_type] || ALERT_META.kkpr_terbit;
                  const prio = PRIORITY_META[l.prioritas];
                  return (
                    <div
                      key={l.id}
                      data-testid={`crm-card-${l.id}`}
                      className="bg-white rounded-xl border border-slate-200 p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${prio.badge}`}>
                          {prio.label} · {l.score}
                        </span>
                      </div>
                      <button
                        onClick={() => openLead(l.id)}
                        className="text-left w-full"
                        data-testid={`crm-open-${l.id}`}
                      >
                        <p className="font-semibold text-slate-900 text-sm leading-tight">
                          {l.developer?.nama}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5">{l.proyek?.nama}</p>
                        <p className="text-xs text-slate-400 mt-1">{l.proyek?.kabupaten_kota}</p>
                      </button>
                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                        <span className={`h-1.5 w-1.5 rounded-full ${alert.dot}`} />
                        <div className="flex gap-1">
                          <button
                            disabled={sIdx === 0}
                            onClick={() => move(l, -1)}
                            data-testid={`crm-prev-${l.id}`}
                            className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                          >
                            <ChevronLeft className="h-4 w-4 text-slate-500" />
                          </button>
                          <button
                            disabled={sIdx === CRM_STAGES.length - 1}
                            onClick={() => move(l, 1)}
                            data-testid={`crm-next-${l.id}`}
                            className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                          >
                            <ChevronRight className="h-4 w-4 text-slate-500" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                {col.length === 0 && (
                  <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-300">
                    Kosong
                  </div>
                )}
              </div>
            </div>
          );
        })}
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
