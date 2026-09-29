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
- Dashboard: 4 stat cards, distribusi prioritas, pipeline, chart lead per wilayah, lead terbaru.
- Daftar Lead: tabel + filter + search + tambah lead manual + detail dialog + follow-up + kirim email alert + tombol Sync OSS.
- CRM Kanban 6 kolom dengan pindah tahap.
- Notifikasi in-app (bell + halaman) + Email otomatis (Resend) untuk lead Prioritas A di wilayah target.
- Peta Sebaran Proyek (react-leaflet + OpenStreetMap) dari koordinat lead.
- Manajemen User (admin) + Pengaturan wilayah/jenis target (admin).
- OSS Auto-Sync SIMULASI: cron `.emergent/crons.yml` (/api/cron/oss-ingest tiap 30 mnt) + manual /api/ingest/run menghasilkan lead OSS-style baru, memicu notifikasi in-app, email otomatis (A+target), dan Telegram.
- Notifikasi Telegram (send_telegram) untuk setiap lead baru — aktif bila TELEGRAM_TOKEN & TELEGRAM_CHAT_ID diisi.
- Ringkasan Harian: cron `daily-digest` (/api/cron/daily-digest, 07:30 WITA) mengirim rangkuman lead baru & KKPR terbit via email (semua user aktif) + Telegram; tombol uji manual /api/digest/run.
- Tested: iteration_1 (24/24) + iteration_2 (auto-email & peta) lulus.

## Backlog
- P0: Isi TELEGRAM_TOKEN + TELEGRAM_CHAT_ID untuk mengaktifkan notifikasi Telegram (kode siap).
- P1: Integrasi live OSS/GISTARU (butuh akses API resmi; saat ini SIMULASI auto-sync).
- P2: Brute-force lockout login; delete/export lead; WhatsApp channel.

## Next Tasks
- Konfirmasi sumber data OSS nyata / mekanisme ingest.
- Otomasi email alert on-create untuk wilayah target prioritas A.
