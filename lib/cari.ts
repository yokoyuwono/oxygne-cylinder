/**
 * Penyusun saringan pencarian untuk PostgREST (`.or(...)`).
 *
 * PostgREST membaca koma sebagai pemisah antar cabang pada pohon logika, jadi
 * kata kunci yang mengandung koma memecah permintaan dan berbalas 400
 * (PGRST100 "failed to parse logic tree"). Ini bukan kasus langka di sini:
 * nama pelanggan umumnya berbentuk "NAMA,DESA" (AGUS,GLEDUG), sehingga petugas
 * wajar mengetik koma dan layarnya justru kosong tanpa pesan apa pun.
 *
 * Perbaikannya: nilai pola dibungkus tanda kutip ganda, bentuk yang memang
 * diizinkan PostgREST (`name.ilike."%agus,gledug%"`). Di dalam kutip, tanda
 * kutip ganda dan garis miring terbalik perlu dilolos-kan dengan garis miring
 * terbalik.
 */

/** Nilai pola ilike yang aman dipakai di dalam `.or(...)`, sudah berkutip. */
export function polaIlike(kataKunci: string): string {
    const aman = kataKunci
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
    return `"%${aman}%"`;
}

/**
 * Rangkaian cabang `kolom.ilike.<pola>` yang siap diserahkan ke `.or(...)`,
 * mis. cariDiKolom(['name', 'companyName'], 'agus,gledug').
 */
export function cariDiKolom(kolom: string[], kataKunci: string): string {
    const pola = polaIlike(kataKunci);
    return kolom.map(k => `${k}.ilike.${pola}`).join(',');
}
