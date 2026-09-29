export const LOGO_URL =
  "https://customer-assets-4nw71qhi.emergentagent.net/job_d5229e27-27f0-4c5c-b851-9cce3eb9a31b/artifacts/3dewn6za_Gemini_Generated_Image_eyfskfeyfskfeyfs.jpg";

export const ALERT_META = {
  rdtr_baru: {
    label: "RDTR Baru",
    badge: "bg-[#DCFCE7] text-[#15803D] border-[#86EFAC]",
    dot: "bg-[#10B981]",
  },
  kkpr_terbit: {
    label: "KKPR/PKKPR Terbit",
    badge: "bg-[#DBEAFE] text-[#1D4ED8] border-[#93C5FD]",
    dot: "bg-[#3B82F6]",
  },
  perubahan_status: {
    label: "Perubahan Status",
    badge: "bg-[#FFEDD5] text-[#C2410C] border-[#FDBA74]",
    dot: "bg-[#F97316]",
  },
};

export const PRIORITY_META = {
  A: { label: "Prioritas A", badge: "bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]" },
  B: { label: "Prioritas B", badge: "bg-[#FEF3C7] text-[#92400E] border-[#FDE68A]" },
  C: { label: "Prioritas C", badge: "bg-[#F1F5F9] text-[#334155] border-[#CBD5E1]" },
};

export const CRM_STAGES = [
  { key: "NEW", label: "Baru", color: "#64748B" },
  { key: "DIHUBUNGI", label: "Sudah Dihubungi", color: "#0EA5E9" },
  { key: "RESPON", label: "Respon", color: "#8B5CF6" },
  { key: "MEETING", label: "Meeting", color: "#D97706" },
  { key: "PROPOSAL", label: "Proposal", color: "#F97316" },
  { key: "KERJASAMA", label: "Kerjasama", color: "#065F46" },
];

export const JENIS_OPTIONS = ["Perumahan", "Cluster", "Kawasan Residential", "Apartemen", "Komersial"];
export const PERIZINAN_STATUS = ["Terbit", "Proses", "Belum"];
export const KKPR_JENIS = ["KKPR", "PKKPR"];

export const stageMeta = (key) => CRM_STAGES.find((s) => s.key === key) || CRM_STAGES[0];

export function fmtDate(iso) {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}
