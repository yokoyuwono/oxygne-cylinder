/**
 * Kelola akun staf: membuat dan menghapus pengguna Supabase Auth.
 *
 * Kenapa harus di server, tidak cukup dari browser:
 *
 *   * `auth.admin.createUser` menuntut service_role key. Key itu melewati seluruh
 *     RLS; menaruhnya di bundle JS sama dengan menyerahkan seluruh basis data ke
 *     siapa pun yang membuka devtools. (Bundle app ini publik -- lihat anon key di
 *     lib/supabase.ts.)
 *   * `auth.signUp` memang bisa dipanggil dari browser, tapi ia mengganti sesi yang
 *     sedang aktif: Administrator yang menambah staf justru ikut berpindah menjadi
 *     staf baru itu. Bukan yang diinginkan.
 *
 * Jadi service_role key hanya hidup di sini, sebagai secret Edge Function, dan
 * fungsi ini yang memeriksa sendiri bahwa pemanggilnya benar-benar Administrator.
 *
 * Dideploy dengan verify_jwt = false, dan itu disengaja: kalau gerbang Supabase yang
 * memeriksa JWT, permintaan preflight OPTIONS dari browser ikut ditolak (preflight
 * tidak pernah membawa Authorization header), sehingga fungsinya tidak pernah bisa
 * dipanggil dari app. Pemeriksaannya dipindah ke dalam -- lihat bagian 1.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * Peran yang boleh diberikan. Tanpa daftar ini, kolom `role` yang bertipe text
 * bebas menerima nilai apa pun -- dan peran yang tidak dikenal diperlakukan sebagai
 * Operator oleh lib/peran.ts, jadi salah ketik berubah jadi penurunan hak diam-diam.
 */
const PERAN_SAH = ['admin', 'operator'];

/** Supabase menolak password di bawah 6 karakter; ditolak lebih awal supaya pesannya jelas. */
const MIN_PASSWORD = 6;

const jawab = (isi: unknown, status = 200) =>
  new Response(JSON.stringify(isi), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // -----------------------------------------------------------------------
    // 1. Pemanggilnya siapa, dan bolehkah dia
    //
    // Inilah satu-satunya lapisan yang menjaga fungsi ini -- gerbangnya sengaja
    // dilewati (verify_jwt = false, lihat komentar kepala berkas). Token diverifikasi
    // ke Supabase Auth, lalu perannya dibaca dari profiles.
    //
    // Menyembunyikan menunya di Layout tidak menghalangi apa pun: fungsi ini terbuka
    // di internet dan bisa dipanggil langsung.
    // -----------------------------------------------------------------------

    const token = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return jawab({ error: 'Harus login.' }, 401);

    const { data: pemanggil, error: errPemanggil } = await admin.auth.getUser(token);
    if (errPemanggil || !pemanggil.user) return jawab({ error: 'Sesi tidak sah.' }, 401);

    const { data: profilPemanggil } = await admin
      .from('profiles')
      .select('role')
      .eq('id', pemanggil.user.id)
      .single();

    if (profilPemanggil?.role !== 'admin') {
      return jawab({ error: 'Hanya Administrator yang boleh mengelola pengguna.' }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body?.aksi) return jawab({ error: 'Aksi tidak disebutkan.' }, 400);

    // -----------------------------------------------------------------------
    // 2. Tambah staf
    // -----------------------------------------------------------------------

    if (body.aksi === 'tambah') {
      const email = String(body.email || '').trim().toLowerCase();
      const nama = String(body.nama || '').trim();
      const password = String(body.password || '');
      const peran = String(body.peran || 'operator');

      if (!email.includes('@')) return jawab({ error: 'Email tidak valid.' }, 400);
      if (!nama) return jawab({ error: 'Nama lengkap wajib diisi.' }, 400);
      if (password.length < MIN_PASSWORD) {
        return jawab({ error: `Kata sandi minimal ${MIN_PASSWORD} karakter.` }, 400);
      }
      if (!PERAN_SAH.includes(peran)) return jawab({ error: 'Peran tidak dikenal.' }, 400);

      // email_confirm: true -- staf toko tidak punya alur verifikasi email; tanpa ini
      // akunnya dibuat tapi tidak pernah bisa login sampai ada yang mengklik tautan
      // di email yang barangkali tidak dipantau siapa pun.
      const { data: baru, error: errBuat } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (errBuat || !baru.user) {
        return jawab({ error: errBuat?.message || 'Gagal membuat akun.' }, 400);
      }

      // Baris profiles-nya sudah ada: trigger on_auth_user_created menyisipkannya
      // saat insert ke auth.users, dengan nama 'New User' dan peran 'operator'.
      // Yang tersisa hanya menimpanya dengan nama dan peran yang dipilih.
      const { error: errProfil } = await admin
        .from('profiles')
        .update({ name: nama, username: email, role: peran })
        .eq('id', baru.user.id);

      if (errProfil) {
        // Akun auth sudah terlanjur jadi. Dibiarkan hidup dengan profil bawaan akan
        // memunculkan baris "New User" berperan Operator yang tidak pernah diminta,
        // jadi lebih baik dibatalkan seluruhnya.
        await admin.auth.admin.deleteUser(baru.user.id);
        return jawab({ error: `Gagal menyimpan profil: ${errProfil.message}` }, 400);
      }

      return jawab({ id: baru.user.id, email, nama, peran });
    }

    // -----------------------------------------------------------------------
    // 3. Hapus staf
    //
    // Baris profiles ikut terhapus sendiri -- profiles.id punya
    // `references auth.users (id) on delete cascade`.
    // -----------------------------------------------------------------------

    if (body.aksi === 'hapus') {
      const id = String(body.id || '');
      if (!id) return jawab({ error: 'Id pengguna tidak disebutkan.' }, 400);

      // Menghapus diri sendiri akan mengunci Administrator keluar dari akunnya
      // sendiri di tengah sesi, dan kalau dia satu-satunya admin, mengunci semua
      // orang keluar dari menu ini selamanya.
      if (id === pemanggil.user.id) {
        return jawab({ error: 'Tidak bisa menghapus akun sendiri.' }, 400);
      }

      const { error: errHapus } = await admin.auth.admin.deleteUser(id);
      if (errHapus) return jawab({ error: `Gagal menghapus akun: ${errHapus.message}` }, 400);

      return jawab({ id });
    }

    return jawab({ error: `Aksi tidak dikenal: ${body.aksi}` }, 400);
  } catch (e) {
    return jawab({ error: e instanceof Error ? e.message : 'Kesalahan tak terduga.' }, 500);
  }
});
