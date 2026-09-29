import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  Building2,
  MapPin,
  FileCheck2,
  Layers,
  Mail,
  PhoneCall,
  TrendingUp,
  Clock,
  Send,
} from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { ALERT_META, PRIORITY_META, CRM_STAGES, stageMeta, fmtDate } from "@/lib/meta";
import { toast } from "sonner";

function Section({ icon: Icon, title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
        <Icon className="h-3.5 w-3.5" /> {title}
      </p>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-800 text-right">{value || "-"}</span>
    </div>
  );
}

export default function LeadDetailDialog({ lead, open, onOpenChange, onChanged }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState(lead?.crm_status || "NEW");

  if (!lead) return null;

  const alert = ALERT_META[lead.alert_type] || ALERT_META.kkpr_terbit;
  const prio = PRIORITY_META[lead.prioritas] || PRIORITY_META.C;

  const saveStage = async (val) => {
    setStage(val);
    try {
      await api.put(`/leads/${lead.id}/crm`, { crm_status: val });
      toast.success(`Status diubah ke ${stageMeta(val).label}`);
      onChanged?.();
    } catch (e) {
      toast.error(apiErr(e));
    }
  };

  const addFollowUp = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api.post(`/leads/${lead.id}/followup`, { catatan: note.trim() });
      setNote("");
      toast.success("Catatan follow-up ditambahkan");
      onChanged?.();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setBusy(false);
    }
  };

  const sendAlert = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/leads/${lead.id}/send-alert`);
      toast.success(`Email alert dikirim ke ${data.to}`);
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-h-[90vh] overflow-y-auto brand-scroll"
        data-testid="lead-detail-dialog"
      >
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${alert.badge}`}>
              {alert.label}
            </span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${prio.badge}`}>
              {prio.label} · {lead.score}
            </span>
          </div>
          <DialogTitle className="text-xl">{lead.proyek?.nama}</DialogTitle>
          <p className="text-sm text-slate-500">{lead.developer?.nama}</p>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-3">
          <Section icon={Building2} title="Developer">
            <Row label="Nama" value={lead.developer?.nama} />
            <Row label="NIB" value={lead.developer?.nib} />
            <Row label="Alamat" value={lead.developer?.alamat} />
            <Row label="Kontak" value={lead.developer?.kontak} />
          </Section>
          <Section icon={MapPin} title="Proyek & Lokasi">
            <Row label="Jenis" value={lead.proyek?.jenis} />
            <Row label="Kab/Kota" value={lead.proyek?.kabupaten_kota} />
            <Row label="Kecamatan" value={lead.proyek?.kecamatan} />
            <Row label="Luas" value={lead.proyek?.luas_ha ? `${lead.proyek.luas_ha} ha` : null} />
            <Row label="Koordinat" value={lead.proyek?.koordinat} />
          </Section>
          <Section icon={Layers} title="Tata Ruang">
            <Row label="RDTR" value={lead.tata_ruang?.rdtr} />
            <Row label="Zona" value={lead.tata_ruang?.zona} />
            <Row label="Ketentuan" value={lead.tata_ruang?.ketentuan_zonasi} />
          </Section>
          <Section icon={FileCheck2} title="Perizinan">
            <Row label="Jenis" value={lead.perizinan?.jenis_kkpr} />
            <Row label="Status" value={lead.perizinan?.status} />
            <Row label="Tgl Terbit" value={fmtDate(lead.perizinan?.tanggal_terbit)} />
            <Row label="No. Dokumen" value={lead.perizinan?.nomor_dokumen} />
          </Section>
        </div>

        <Section icon={TrendingUp} title={`Lead Score — ${lead.score}/100 (Prioritas ${lead.prioritas})`}>
          <Progress value={lead.score} className="h-2 mb-3" />
          <div className="space-y-1.5">
            {(lead.breakdown || []).map((b, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className={b.skor > 0 ? "text-slate-700" : "text-slate-400"}>{b.faktor}</span>
                <span className={`font-mono font-semibold ${b.skor > 0 ? "text-[#065F46]" : "text-slate-300"}`}>
                  +{b.skor}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <div className="grid sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>Status CRM</Label>
            <Select value={stage} onValueChange={saveStage}>
              <SelectTrigger data-testid="crm-status-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CRM_STAGES.map((s) => (
                  <SelectItem key={s.key} value={s.key} data-testid={`crm-option-${s.key}`}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full border-[#065F46] text-[#065F46] hover:bg-[#ECFDF5]"
              onClick={sendAlert}
              disabled={busy}
              data-testid="send-email-alert-btn"
            >
              <Send className="h-4 w-4 mr-2" /> Kirim Email Alert
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Catatan Follow-up</Label>
          <Textarea
            data-testid="followup-note-input"
            placeholder="Tulis hasil follow-up, respon developer, jadwal meeting…"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
          />
          <Button
            onClick={addFollowUp}
            disabled={busy || !note.trim()}
            className="bg-[#065F46] hover:bg-[#044E38]"
            data-testid="add-followup-btn"
          >
            <PhoneCall className="h-4 w-4 mr-2" /> Catat Follow-up
          </Button>
        </div>

        <Section icon={Clock} title="Riwayat Aktivitas">
          {(lead.aktivitas || []).length === 0 ? (
            <p className="text-sm text-slate-400">Belum ada aktivitas.</p>
          ) : (
            <div className="space-y-3">
              {[...(lead.aktivitas || [])].reverse().map((a) => (
                <div key={a.id} className="flex gap-3">
                  <div className="mt-1 h-2 w-2 rounded-full bg-[#065F46] shrink-0" />
                  <div>
                    <p className="text-sm text-slate-700">{a.catatan}</p>
                    <p className="text-[11px] text-slate-400">
                      {a.oleh} · {fmtDate(a.tanggal)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </DialogContent>
    </Dialog>
  );
}

function Label({ children }) {
  return <p className="text-sm font-medium text-slate-700">{children}</p>;
}
