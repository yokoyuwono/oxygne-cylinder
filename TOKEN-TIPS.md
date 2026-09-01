# Hemat Token di Claude Code

Catatan cara kerja, bukan konteks yang perlu selalu dimuat. Isinya dipindahkan
ke sini dari `CLAUDE.md`, yang sebelumnya membayar ~3.000 token tiap sesi untuk
tips yang jarang terpakai saat sedang bekerja.

Angka penghematan di bawah relatif, bukan takaran pasti — biaya sebenarnya
bergantung pada berapa banyak berkas yang dibuka dan berapa putaran yang
dijalani. Yang bisa dipegang: urutan besarnya, bukan digitnya.

## 1. Konteks yang selalu dimuat adalah biaya terbesar

`CLAUDE.md` masuk ke konteks setiap sesi, dibaca atau tidak. Isinya hanya layak
untuk fakta yang tidak bisa ditemukan agen dengan melihat sendiri: kebiasaan tak
tertulis, alasan di balik sebuah keputusan, jebakan yang tak diakui berkas
konfigurasi mana pun. Daftar script npm dan struktur folder tidak termasuk —
agen bisa membacanya langsung, dan salinan di dokumen justru bisa basi.

Dokumen besar (`DESIGN.md`, `DATABASE-SCHEMA.md`, `CODE-CONVENTIONS.md`) cukup
ditunjuk dari `CLAUDE.md`, tidak disalin isinya.

## 2. Bersihkan worktree agen yang sudah selesai

Worktree tertinggal di `.claude/worktrees/` berisi salinan penuh source code.
Setiap pencarian berkas mengembalikan hasil ganda — token terbuang, dan ada
risiko yang dibaca justru salinan yang sudah usang.

```bash
git worktree list
```

```bash
git worktree remove .claude/worktrees/<nama> --force
```

## 3. Izin yang sudah di-allow menghemat putaran

Tiap permintaan izin adalah satu putaran tambahan. Perintah baca-saja yang
sering dipakai sudah didaftarkan di `.claude/settings.json`; tambahkan yang
lain begitu terasa berulang.

## 4. Minta verifikasi lewat perintah, bukan lewat membaca ulang

`npm run typecheck` dan `npm run lint` memberi jawaban pasti dalam satu
perintah. Tanpa keduanya, satu-satunya cara agen memastikan perubahannya tidak
merusak adalah membuka lagi berkas-berkas yang terkait — jauh lebih mahal.

## 5. Permintaan spesifik, bukan permintaan luas

"Jelaskan `DashboardView.tsx`" memaksa membaca seluruh berkas. "Jelaskan
useEffect yang memuat data tabung di `DashboardView`" membaca satu bagian.
Menyebut nama berkas dan nomor baris memotong tahap pencarian sepenuhnya.

## 6. Gabungkan tugas pada berkas yang sama

Tiga permintaan terpisah pada `lib/laporanHarian.ts` berarti berkas itu dibaca
tiga kali. Satu permintaan berisi tiga poin membacanya sekali.

```
Di lib/laporanHarian.ts:
1. Perbaiki deposit yang terhitung dua kali
2. Tambahkan JSDoc di hitungPendapatanHarian
3. Pindahkan angka ajaib ke konstanta di atas
```

## 7. Print mode untuk tugas satu tembakan (CLI)

Berlaku saat memakai `claude` dari terminal, bukan aplikasi desktop. Sesi
interaktif membawa seluruh riwayat percakapan di tiap putaran; print mode tidak.

```bash
claude -p 'Perbaiki label Tersedia yang tidak muncul di InventoryView' --allowedTools 'Read,Edit' --max-turns 5
```

- `--max-turns` menahan putaran yang meliar. Perbaikan kecil 3, fitur 8-10,
  analisis tanpa edit 2.
- `--allowedTools` menutup pintu ke perkakas yang tidak dibutuhkan tugas itu.
- `--model haiku` cukup untuk tugas mekanis: perbarui import, perbaiki typo,
  daftar isi berkas.

Memipa berkas lewat stdin membuat isinya masuk sekali, tanpa putaran pencarian:

```bash
git diff | claude -p 'Tinjau diff ini untuk bug' --allowedTools 'Read' --max-turns 2
```
