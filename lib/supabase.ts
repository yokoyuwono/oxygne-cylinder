import { createClient } from '@supabase/supabase-js';

// Access environment variables using Import.meta.env (Vite standard) or process.env depending on setup
const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

// Use fallbacks to prevent "supabaseUrl is required" error during initialization if env vars are missing.
// This allows the app to render a "Setup Required" screen instead of crashing with a white screen.
const supabaseUrl = envUrl || 'https://hesdtlkvpvfczlhswjjg.supabase.co';
const supabaseKey = envKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhlc2R0bGt2cHZmY3psaHN3ampnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY3NTgyMDQsImV4cCI6MjA4MjMzNDIwNH0.7rgx1NZc7BN_1d55DSRWUqFAvUfHte0TTRO2oPSJ1sc';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Helper to check if we are running with real credentials. 
// We check if the keys are present (either from env or hardcoded) and valid.
export const isSupabaseConfigured = !!supabaseUrl && !!supabaseKey && supabaseUrl !== 'https://placeholder.supabase.co';

/**
 * Helper to fetch ALL records from a table, bypassing the default 1000 row limit
 * by automatically paginating through all available records.
 */
export async function fetchAllRecords<T>(tableName: string, select = '*'): Promise<T[]> {
    let allData: T[] = [];
    let from = 0;
    const step = 1000;
    let hasMore = true;

    while (hasMore) {
        const { data, error } = await supabase
            .from(tableName)
            .select(select)
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
