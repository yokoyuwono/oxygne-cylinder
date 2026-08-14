import React, { useState } from 'react';

export interface DataGagal {
  /** Nama data seperti yang dikenal petugas, mis. "Tabung", bukan nama tabelnya. */
  label: string;
  /** Pesan asli dari Supabase, untuk dilaporkan kalau perlu dibetulkan. */
  pesan: string;
}

interface Props {
  gagal: DataGagal[];
  onMuatUlang: () => Promise<void>;
}

/**
 * Pemberitahuan bahwa sebagian data tidak berhasil dimuat.
 *
 * Tanpa ini, satu tabel yang gagal terlihat persis sama seperti tabel yang
 * memang kosong: daftar kosong, tanpa tanda apa pun. Petugas bisa menyimpulkan
 * barangnya tidak ada dan mengambil keputusan dari angka yang sebenarnya tidak
 * lengkap. Jadi kegagalannya disebutkan, dan disebutkan bagian mana yang kena --
 * halaman lain tetap boleh dipakai seperti biasa.
 */
const PeringatanDataGagal: React.FC<Props> = ({ gagal, onMuatUlang }) => {
  const [sedangMuat, setSedangMuat] = useState(false);

  if (gagal.length === 0) return null;

  const cobaLagi = async () => {
    setSedangMuat(true);
    try {
      await onMuatUlang();
    } finally {
      setSedangMuat(false);
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 animate-fade-in" role="alert">
      <div className="flex items-start gap-3">
        <span className="material-icons text-amber-600 mt-0.5">warning_amber</span>

        <div className="flex-1 min-w-0">
          <p className="font-bold text-amber-900">Sebagian data gagal dimuat</p>
          <p className="text-sm text-amber-800 mt-1">
            Data berikut belum termuat, jadi angkanya bisa terlihat kosong atau kurang:{' '}
            <span className="font-semibold">{gagal.map(g => g.label).join(', ')}</span>.
            Data lain di aplikasi tetap benar.
          </p>

          <details className="mt-2">
            <summary className="text-xs text-amber-700 cursor-pointer hover:text-amber-900 select-none">
              Rincian teknis
            </summary>
            <ul className="mt-2 space-y-1">
              {gagal.map(g => (
                <li key={g.label} className="text-xs text-amber-800 font-mono break-words">
                  {g.label}: {g.pesan}
                </li>
              ))}
            </ul>
          </details>
        </div>

        <button
          onClick={cobaLagi}
          disabled={sedangMuat}
          className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-60 transition-colors active:scale-95"
        >
          <span className={`material-icons text-base ${sedangMuat ? 'animate-spin' : ''}`}>refresh</span>
          {sedangMuat ? 'Memuat...' : 'Coba lagi'}
        </button>
      </div>
    </div>
  );
};

export default PeringatanDataGagal;
