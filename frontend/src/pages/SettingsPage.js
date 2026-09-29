import { useEffect, useState } from "react";
import { MapPin, Building, Save } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function SettingsPage() {
  const [regions, setRegions] = useState([]);
  const [types, setTypes] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get("/settings").then(({ data }) => {
      setRegions(data.regions);
      setTypes(data.project_types);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings", { regions, project_types: types });
      toast.success("Pengaturan disimpan. Skor lead baru mengikuti wilayah target.");
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
          Pengaturan Wilayah &amp; Target
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Tentukan wilayah kerja dan jenis proyek target. Lead di wilayah target mendapat +15 skor.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-4">
          <MapPin className="h-4 w-4 text-[#065F46]" /> Wilayah Target
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {regions.map((r, i) => (
            <label
              key={r.name}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 cursor-pointer hover:bg-slate-50"
              data-testid={`region-row-${i}`}
            >
              <span className="text-sm font-medium text-slate-700">{r.name}</span>
              <Switch
                checked={r.target}
                onCheckedChange={(v) =>
                  setRegions((rs) => rs.map((x, j) => (j === i ? { ...x, target: v } : x)))
                }
                data-testid={`region-switch-${i}`}
              />
            </label>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-4">
          <Building className="h-4 w-4 text-[#D97706]" /> Jenis Proyek Target
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {types.map((t, i) => (
            <label
              key={t.name}
              className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3 cursor-pointer hover:bg-slate-50"
              data-testid={`type-row-${i}`}
            >
              <span className="text-sm font-medium text-slate-700">{t.name}</span>
              <Switch
                checked={t.enabled}
                onCheckedChange={(v) =>
                  setTypes((ts) => ts.map((x, j) => (j === i ? { ...x, enabled: v } : x)))
                }
                data-testid={`type-switch-${i}`}
              />
            </label>
          ))}
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="bg-[#065F46] hover:bg-[#044E38]" data-testid="save-settings-btn">
        <Save className="h-4 w-4 mr-2" /> Simpan Pengaturan
      </Button>
    </div>
  );
}
