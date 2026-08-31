import { createClient } from '@supabase/supabase-js';

// Access environment variables using Import.meta.env (Vite standard) or process.env depending on setup
const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Use fallbacks to prevent "supabaseUrl is required" error during initialization if env vars are missing.
// This allows the app to render a "Setup Required" screen instead of crashing with a white screen.
const supabaseUrl = envUrl || 'https://mtlsimsndniuonblmnsw.supabase.co';
const supabaseKey = envKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10bHNpbXNuZG5pdW9uYmxtbnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NTc5NDUsImV4cCI6MjA5ODUzMzk0NX0.GHyw3F1pN32EsIx6CZ9-7JFgV3WuoT7OtwQ-coN7mcg';

export const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Benar ketika aplikasi harus berhenti dan meminta env diisi lebih dulu.
 *
 * Pemeriksaan lamanya menanyakan `supabaseUrl` -- nilai SESUDAH jatuh ke bawaan
 * produksi di atas. Nilai itu tidak pernah kosong, jadi jawabannya selalu "sudah
 * terkonfigurasi" dan layar penjaganya tidak pernah sekali pun muncul. Yang
 * menentukan justru `envUrl`/`envKey`: ada tidaknya kredensial yang benar-benar
 * dipasok lingkungan.
 *
 * Hanya berlaku saat dev. Aplikasi toko dibangun tanpa env dan memang hidup dari
 * nilai bawaan di atas -- menahannya di produksi berarti menyambut operator
 * dengan layar konfigurasi, bukan dengan aplikasinya. Di dev sebaliknya: env
 * yang kosong berarti `npm run dev` sedang menulis ke data toko yang asli, dan
 * itu justru yang harus ditahan.
 */
export const perluSetupEnv = import.meta.env.DEV && !(envUrl && envKey);

/**
 * Helper to fetch ALL records from a table, bypassing the default 1000 row limit
 * by automatically paginating through all available records.
 */
export async function fetchAllRecords<T>(
    tableName: string,
    select = '*',
    /**
     * Saringan opsional yang dipasang pada query, mis. membuang baris yang sudah
     * dibatalkan. Diterapkan di sini supaya seluruh pemakai data ikut tersaring
     * dari satu tempat -- menyaringnya di tiap komponen menyisakan risiko satu
     * tempat terlewat, dan angkanya lalu salah tanpa error apa pun.
     */
    saring?: (q: any) => any,
    /**
     * Kolom pengurut, sekaligus penentu batas antar halaman.
     *
     * Wajib stabil dan unik, karena .range() memotong hasil berdasar urutan ini --
     * urutan yang goyah membuat baris terlewat atau terambil dua kali. Hampir semua
     * tabel di sini memakai `id`, tapi tidak semua punya: refill_drafts berkunci
     * "stationId". Sebelum parameter ini ada, tabel begitu membalas 42703 dan --
     * karena seluruh pemuatan awal satu Promise.all -- menjatuhkan SEMUA data
     * aplikasi, bukan cuma tabelnya sendiri.
     */
    kolomUrut = 'id'
): Promise<T[]> {
    let allData: T[] = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        let q = supabase.from(tableName).select(select);
        if (saring) q = saring(q);

        const { data, error } = await q
            .range(from, from + step - 1)
            .order(kolomUrut as any, { ascending: true });

        if (error) {
            console.error(`Error fetching from ${tableName}:`, error);
            throw error;
        }

        if (data && data.length > 0) {
            allData = allData.concat(data as any[]);
            from += step;
            if (data.length < step) hasMore = false;
        } else {
            hasMore = false;
        }
    }

    return allData;
}
