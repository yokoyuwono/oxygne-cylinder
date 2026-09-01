# Oxygne Cylinder

Sistem manajemen sewa tabung gas industri untuk Central Gas Wlingi: React 18 +
TypeScript + Vite + Supabase. Dipakai toko setiap hari untuk ~1.500 tabung dan
~1.300 pelanggan.

Berbincang dan menulis komentar dalam bahasa Indonesia.

## Peta

- `App.tsx` — HashRouter, sekaligus pemegang seluruh state aplikasi dan
  pemuatan data awal. Tiap view menerima datanya sebagai prop dari sini.
- `types.ts` — semua tipe dan enum.
- `lib/` — aturan bisnis. Perhitungan tinggal di sini, bukan di komponen.
- `components/` — satu berkas per halaman.
- `labels.ts` — satu-satunya tempat teks Indonesia untuk nilai database.
- `supabase/migrations/` — perubahan skema, berurut waktu.

## Dev menyentuh data produksi

`lib/supabase.ts` jatuh ke URL dan anon key **produksi** ketika env kosong, jadi
`npm run dev` tanpa `.env.local` menulis ke data toko yang asli. Salin
`.env.example` lebih dulu sebelum mencoba fitur yang menulis.

## Aturan yang tidak terbaca dari kodenya sendiri

- **Nilai enum di database berbahasa Inggris**, diterjemahkan hanya saat render
  lewat `labels.ts`. Alasannya: perubahan tampilan tidak boleh menuntut migrasi
  ribuan baris produksi. Teks Indonesia yang ditulis langsung di komponen
  memutus jaminan itu.
- **Transaksi satu tabel.** `transactions` dibedakan kolom `type`, bukan tabel
  per jenis. Jenis baru berarti dua tempat: `types.ts` dan `JENIS_TRANSAKSI` di
  `labels.ts`.
- **Deposit uang titipan, bukan pendapatan** — ikut arus kas harian, tidak
  pernah ikut laba. Aturan uang lengkapnya ada di `lib/laporanHarian.ts`; pakai
  predikat yang sudah ada di sana (`barisPendapatan`, `uangMasukBaris`) supaya
  aturannya tetap satu tempat.
- **Status tabung berubah bersama transaksinya.** Menulis `cylinders.status`
  tanpa baris transaksi membuat riwayat pergerakan tabung kehilangan jejak.
- **Tabung curah tulang punggung sewa harian**: Oxygen 1m3 tanpa kode tabung.
  Tarif Acetylene dan Argon masih nonaktif.

## Alur tugas yang sering muncul

- Tambah field ke Member: `types.ts` → migrasi di `supabase/migrations/` →
  komponen yang menampilkan.
- Jenis transaksi baru: `types.ts` → `labels.ts` → logikanya di `lib/`.
- Angka laporan yang salah: mulai dari `lib/laporanHarian.ts`, bukan dari
  komponen yang menampilkannya.

## Selesai berarti terverifikasi

Jalankan `npm run typecheck` dan `npm run lint` sebelum menyatakan perubahan
selesai, dan pastikan tidak ada keluhan baru dari berkas yang disentuh.

## Referensi, dibaca saat perlu

- `DESIGN.md` — arsitektur, alur data, model keamanan, utang teknis.
- `DATABASE-SCHEMA.md` — kolom tiap tabel, relasi, RLS, indeks.
- `CODE-CONVENTIONS.md` — penamaan, pola komponen, gaya komentar.
- `TOKEN-TIPS.md` — memakai Claude Code CLI dengan hemat token.
