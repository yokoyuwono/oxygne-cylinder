import { createClient } from '@supabase/supabase-js';

// Access environment variables using Import.meta.env (Vite standard) or process.env depending on setup
const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Use fallbacks to prevent "supabaseUrl is required" error during initialization if env vars are missing.
// This allows the app to render a "Setup Required" screen instead of crashing with a white screen.
const supabaseUrl = envUrl || 'https://mtlsimsndniuonblmnsw.supabase.co';
const supabaseKey = envKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im10bHNpbXNuZG5pdW9uYmxtbnN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI5NTc5NDUsImV4cCI6MjA5ODUzMzk0NX0.GHyw3F1pN32EsIx6CZ9-7JFgV3WuoT7OtwQ-coN7mcg';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to check if we are running with real credentials. 
// We check if the keys are present (either from env or hardcoded) and valid.
export const isSupabaseConfigured = !!supabaseUrl && !!supabaseKey && supabaseUrl !== 'https://placeholder.supabase.co';

/**
 * Pesan yang masih bisa dibaca orang dari error apa pun yang keluar dari Supabase.
 *
 * PostgrestError bukan Error biasa -- ia objek polos {message, code, details},
 * jadi `String(e)` di atasnya cuma menghasilkan "[object Object]". Kodenya ikut
 * dibawa karena itu yang paling menolong saat melapor (mis. 42703 = kolom tidak
 * ada, artinya migration belum jalan di environment ini).
 */
export function pesanErrorSupabase(e: unknown): string {
    if (e && typeof e === 'object') {
        const err = e as { message?: string; code?: string };
        if (err.message) return err.code ? `${err.message} (kode ${err.code})` : err.message;
    }
    return String(e);
}

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
    saring?: (q: any) => any
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
            .order('id' as any, { ascending: true });

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
