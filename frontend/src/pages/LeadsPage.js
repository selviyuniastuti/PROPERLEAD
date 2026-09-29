import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, Plus, Filter } from "lucide-react";
import api, { apiErr } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import LeadDetailDialog from "@/components/LeadDetailDialog";
import {
  ALERT_META,
  PRIORITY_META,
  JENIS_OPTIONS,
  PERIZINAN_STATUS,
  KKPR_JENIS,
  fmtDate,
} from "@/lib/meta";
import { toast } from "sonner";

const EMPTY = {
  developer: { nama: "", nib: "", alamat: "", kontak: "" },
  proyek: { nama: "", jenis: "Perumahan", kabupaten_kota: "", kecamatan: "", luas_ha: "", koordinat: "" },
  tata_ruang: { rdtr: "", zona: "", ketentuan_zonasi: "" },
  perizinan: { jenis_kkpr: "KKPR", status: "Proses", tanggal_terbit: "", nomor_dokumen: "" },
  alert_type: "kkpr_terbit",
  sumber: "OSS",
};

export default function LeadsPage() {
  const [params, setParams] = useSearchParams();
  const [leads, setLeads] = useState([]);
  const [regions, setRegions] = useState([]);
  const [filters, setFilters] = useState({
    search: "",
    wilayah: "all",
    jenis: "all",
    prioritas: "all",
    alert_type: "all",
  });
  const [active, setActive] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const q = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v && v !== "all") q[k] = v;
    });
    const { data } = await api.get("/leads", { params: q });
    setLeads(data);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.get("/settings").then(({ data }) => setRegions(data.regions.map((r) => r.name)));
  }, []);

  useEffect(() => {
    const id = params.get("open");
    if (id) {
      api.get(`/leads/${id}`).then(({ data }) => setActive(data)).catch(() => {});
      params.delete("open");
      setParams(params, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openLead = async (id) => {
    const { data } = await api.get(`/leads/${id}`);
    setActive(data);
  };

  const setF = (k, v) => setForm((f) => ({ ...f, [k]: { ...f[k], ...v } }));

  const submit = async () => {
    if (!form.developer.nama || !form.proyek.nama || !form.proyek.kabupaten_kota) {
      toast.error("Nama developer, nama proyek, dan kab/kota wajib diisi");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        proyek: {
          ...form.proyek,
          luas_ha: form.proyek.luas_ha ? parseFloat(form.proyek.luas_ha) : null,
        },
      };
      await api.post("/leads", payload);
      toast.success("Lead berhasil ditambahkan");
      setAddOpen(false);
      setForm(EMPTY);
      load();
    } catch (e) {
      toast.error(apiErr(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Daftar Lead
          </h1>
          <p className="text-sm text-slate-500 mt-1">{leads.length} lead ditemukan</p>
        </div>
        <Button
          onClick={() => setAddOpen(true)}
          className="bg-[#065F46] hover:bg-[#044E38]"
          data-testid="add-lead-btn"
        >
          <Plus className="h-4 w-4 mr-2" /> Tambah Lead
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            data-testid="search-input"
            placeholder="Cari developer / proyek…"
            className="pl-9"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>
        <FilterSelect
          testid="filter-wilayah"
          value={filters.wilayah}
          onChange={(v) => setFilters((f) => ({ ...f, wilayah: v }))}
          placeholder="Semua Wilayah"
          options={regions}
        />
        <FilterSelect
          testid="filter-jenis"
          value={filters.jenis}
          onChange={(v) => setFilters((f) => ({ ...f, jenis: v }))}
          placeholder="Semua Jenis"
          options={JENIS_OPTIONS}
        />
        <FilterSelect
          testid="filter-prioritas"
          value={filters.prioritas}
          onChange={(v) => setFilters((f) => ({ ...f, prioritas: v }))}
          placeholder="Semua Prioritas"
          options={["A", "B", "C"]}
        />
        <FilterSelect
          testid="filter-alert"
          value={filters.alert_type}
          onChange={(v) => setFilters((f) => ({ ...f, alert_type: v }))}
          placeholder="Semua Alert"
          options={[
            { value: "rdtr_baru", label: "RDTR Baru" },
            { value: "kkpr_terbit", label: "KKPR Terbit" },
            { value: "perubahan_status", label: "Perubahan Status" },
          ]}
        />
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto brand-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3">Developer / Proyek</th>
                <th className="px-3 py-3 hidden md:table-cell">Wilayah</th>
                <th className="px-3 py-3 hidden lg:table-cell">Milestone</th>
                <th className="px-3 py-3 hidden lg:table-cell">Perizinan</th>
                <th className="px-3 py-3">Skor</th>
                <th className="px-3 py-3">Prioritas</th>
                <th className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {leads.map((l) => {
                const alert = ALERT_META[l.alert_type] || ALERT_META.kkpr_terbit;
                const prio = PRIORITY_META[l.prioritas];
                return (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors" data-testid={`lead-row-${l.id}`}>
                    <td className="px-5 py-3">
                      <p className="font-semibold text-slate-900">{l.developer?.nama}</p>
                      <p className="text-xs text-slate-500">{l.proyek?.nama}</p>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell text-slate-600">
                      {l.proyek?.kabupaten_kota}
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${alert.badge}`}>
                        {alert.label}
                      </span>
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell text-slate-600">
                      {l.perizinan?.jenis_kkpr}: {l.perizinan?.status}
                    </td>
                    <td className="px-3 py-3 font-mono font-bold text-slate-800">{l.score}</td>
                    <td className="px-3 py-3">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${prio.badge}`}>
                        {l.prioritas}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openLead(l.id)}
                        data-testid={`detail-btn-${l.id}`}
                        className="border-[#065F46] text-[#065F46] hover:bg-[#ECFDF5]"
                      >
                        Detail
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {leads.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                    Tidak ada lead sesuai filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add lead dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto brand-scroll" data-testid="add-lead-dialog">
          <DialogHeader>
            <DialogTitle>Tambah Lead Manual</DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Nama Developer *" testid="form-dev-nama" value={form.developer.nama} onChange={(v) => setF("developer", { nama: v })} />
            <Field label="NIB" testid="form-dev-nib" value={form.developer.nib} onChange={(v) => setF("developer", { nib: v })} />
            <Field label="Alamat Developer" testid="form-dev-alamat" value={form.developer.alamat} onChange={(v) => setF("developer", { alamat: v })} />
            <Field label="Kontak" testid="form-dev-kontak" value={form.developer.kontak} onChange={(v) => setF("developer", { kontak: v })} />
            <Field label="Nama Proyek *" testid="form-proyek-nama" value={form.proyek.nama} onChange={(v) => setF("proyek", { nama: v })} />
            <div className="space-y-1.5">
              <Label>Jenis Proyek</Label>
              <Select value={form.proyek.jenis} onValueChange={(v) => setF("proyek", { jenis: v })}>
                <SelectTrigger data-testid="form-proyek-jenis"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {JENIS_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Kab/Kota *</Label>
              <Select value={form.proyek.kabupaten_kota} onValueChange={(v) => setF("proyek", { kabupaten_kota: v })}>
                <SelectTrigger data-testid="form-proyek-wilayah"><SelectValue placeholder="Pilih wilayah" /></SelectTrigger>
                <SelectContent>
                  {regions.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="Kecamatan" testid="form-proyek-kec" value={form.proyek.kecamatan} onChange={(v) => setF("proyek", { kecamatan: v })} />
            <Field label="Luas (ha)" testid="form-proyek-luas" value={form.proyek.luas_ha} onChange={(v) => setF("proyek", { luas_ha: v })} />
            <Field label="RDTR" testid="form-rdtr" value={form.tata_ruang.rdtr} onChange={(v) => setF("tata_ruang", { rdtr: v })} />
            <Field label="Zona" testid="form-zona" value={form.tata_ruang.zona} onChange={(v) => setF("tata_ruang", { zona: v })} />
            <div className="space-y-1.5">
              <Label>Jenis KKPR</Label>
              <Select value={form.perizinan.jenis_kkpr} onValueChange={(v) => setF("perizinan", { jenis_kkpr: v })}>
                <SelectTrigger data-testid="form-kkpr-jenis"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KKPR_JENIS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status Perizinan</Label>
              <Select value={form.perizinan.status} onValueChange={(v) => setF("perizinan", { status: v })}>
                <SelectTrigger data-testid="form-perizinan-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIZINAN_STATUS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Field label="No. Dokumen" testid="form-nomor-dok" value={form.perizinan.nomor_dokumen} onChange={(v) => setF("perizinan", { nomor_dokumen: v })} />
            <div className="space-y-1.5">
              <Label>Jenis Alert</Label>
              <Select value={form.alert_type} onValueChange={(v) => setForm((f) => ({ ...f, alert_type: v }))}>
                <SelectTrigger data-testid="form-alert-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="kkpr_terbit">KKPR/PKKPR Terbit</SelectItem>
                  <SelectItem value="rdtr_baru">RDTR Baru</SelectItem>
                  <SelectItem value="perubahan_status">Perubahan Status</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Batal</Button>
            <Button onClick={submit} disabled={saving} className="bg-[#065F46] hover:bg-[#044E38]" data-testid="submit-lead-btn">
              Simpan Lead
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

function FilterSelect({ testid, value, onChange, placeholder, options }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testid}>
        <div className="flex items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <SelectValue placeholder={placeholder} />
        </div>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{placeholder}</SelectItem>
        {options.map((o) =>
          typeof o === "string" ? (
            <SelectItem key={o} value={o}>{o}</SelectItem>
          ) : (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          )
        )}
      </SelectContent>
    </Select>
  );
}

function Field({ label, value, onChange, testid }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input data-testid={testid} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
