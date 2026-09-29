# PRD — PROPERLEAD (Project & Finance Intelligence)

## Problem Statement
CRM akuisisi lead perumahan untuk marketing bank. Sistem mendeteksi proyek/developer yang mencapai milestone tata ruang/perizinan (RDTR, KKPR/PKKPR) dari OSS, mengubahnya menjadi lead terskor, memberi notifikasi ke marketing, dan mengelola follow-up hingga kerjasama. Bukan sekadar "pencari izin lokasi" — mengikuti alur OSS → perubahan status → KKPR/RDTR/lokasi → identifikasi pelaku usaha → filter perumahan → filter wilayah target → lead scoring → notifikasi → CRM.

## Architecture
- Frontend: React (CRA + craco), Tailwind, shadcn/ui, recharts, lucide-react, sonner. Same-origin ke backend via REACT_APP_BACKEND_URL.
- Backend: FastAPI (semua route prefix /api), MongoDB (motor).
- Auth: JWT via httpOnly cookies (SameSite=Lax, Secure), akses 12 jam. Dua peran: super_admin & user.
- Email: Emergent-managed Resend (in-app bell + email alert per-lead ke email user yang login).

## User Personas
- Super Admin (pemilik web app): kelola semua user, atur wilayah/jenis target, akses semua fitur.
- Marketing Bank (user): dashboard, daftar lead, CRM pipeline, notifikasi, follow-up.

## Core Requirements (static)
- 3 alert: RDTR Baru (hijau), KKPR/PKKPR Terbit (biru), Perubahan Status (oranye).
- Lead scoring 0-100: KKPR terbit +40, kegiatan real estat +20, lokasi wilayah target +15, data developer +15, RDTR +10 → Prioritas A (≥80) / B (60-79) / C (<60).
- Filter wilayah & jenis proyek. Wilayah target dapat dikonfigurasi (Banjarmasin, Banjarbaru, Kab. Banjar, Tanah Laut, Barito Kuala, Tapin).
- CRM 6 tahap: NEW → DIHUBUNGI → RESPON → MEETING → PROPOSAL → KERJASAMA.

## Implemented (2026-09-29)
- Login/auth JWT cookie + 2 peran + seed super admin (selviyuniastuti6@gmail.com) & demo marketing user.
- Dashboard: 4 stat cards (Lead baru hari ini, KKPR terbit, RDTR baru, Status berubah), distribusi prioritas, pipeline, chart lead per wilayah, lead terbaru.
- Daftar Lead: tabel + filter (wilayah/jenis/prioritas/alert) + search + tambah lead manual + detail dialog (developer/proyek/tata ruang/perizinan/score breakdown/aktivitas) + follow-up + kirim email alert.
- CRM Kanban 6 kolom dengan pindah tahap.
- Notifikasi in-app (bell + halaman, filter per tipe, mark read/all).
- Manajemen User (admin): CRUD user, toggle aktif, ubah peran.
- Pengaturan wilayah/jenis target (admin) → memengaruhi lead scoring.
- 8 seed lead OSS-style (Kalimantan Selatan) + notifikasi.
- Tested: backend 24/24 pass, frontend flows pass, real email pass.

## Backlog
- P1: Integrasi live OSS/GISTARU (butuh akses API resmi; saat ini seed + input manual).
- P1: Notifikasi email otomatis saat lead baru masuk (saat ini manual per-lead via tombol).
- P2: Brute-force lockout di login (playbook item, belum diimplementasi).
- P2: Delete lead endpoint; export lead; peta koordinat proyek.
- P2: WhatsApp/Telegram notifikasi.

## Next Tasks
- Konfirmasi sumber data OSS nyata / mekanisme ingest.
- Otomasi email alert on-create untuk wilayah target prioritas A.
