import React, { useEffect, useState } from 'react';

export interface Saran {
  key: string;
  label: string;
  detail?: string;
  badge?: string;
  /** Badge amber untuk hal yang perlu diperhatikan, abu-abu untuk keterangan biasa. */
  badgePeringatan?: boolean;
}

/** Tombol di sisi kanan isian, mis. "Tambah" -- pengganti Enter di keyboard layar. */
export interface AksiKotak {
  ikon: string;
  label: string;
  onKlik: () => void;
}

interface KotakSaranProps {
  nilai: string;
  onUbah: (teks: string) => void;
  saran: Saran[];
  onPilih: (key: string) => void;
  placeholder?: string;
  /** Kode tabung diketik huruf besar dengan huruf lebar tetap, tanpa koreksi otomatis. */
  kode?: boolean;
  /** Sudah ada pilihan sah di kotak ini; hanya mengubah warna bingkai. */
  terpilih?: boolean;
  /** Enter ditekan ketika tidak ada saran yang disorot. */
  onEnterKosong?: () => void;
  /**
   * Teks yang ditempel. Kalau diisi, tempelan tidak masuk ke kotak melainkan diserahkan
   * ke sini apa adanya (termasuk baris baru, yang akan dibuang kotak satu baris) --
   * dipakai untuk menempel banyak kode sekaligus.
   */
  onTempel?: (teks: string) => void;
  /** Label tombol Enter di keyboard layar. */
  enterKeyHint?: 'enter' | 'done' | 'go' | 'next' | 'search';
  aksi?: AksiKotak;
  inputRef?: React.Ref<HTMLInputElement>;
}

const layarSempit = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;

/**
 * Kotak isian dengan daftar saran di bawahnya.
 *
 * Dipakai di Laporan Pengiriman (kode tabung dan nama pelanggan). Perilakunya disalin
 * dari pencarian pelanggan di RentalForm: panah dan Enter untuk memilih, Escape
 * menutup, dan saran dipilih lewat onMouseDown -- onClick datang sesudah blur, saat
 * daftarnya sudah menghilang dan kliknya jatuh ke kosong.
 *
 * Di layar sempit isiannya 16px (di bawah itu iOS memperbesar halaman saat fokus),
 * setinggi target sentuh, dan digulirkan ke tengah saat fokus supaya tidak tertutup
 * keyboard layar. Tombol hapus teks dan `aksi` hanya ada di sana; desktop tetap sama.
 */
const KotakSaran: React.FC<KotakSaranProps> = ({
  nilai, onUbah, saran, onPilih, placeholder, kode, terpilih, onEnterKosong, onTempel,
  enterKeyHint, aksi, inputRef,
}) => {
  const [buka, setBuka] = useState(false);
  const [sorot, setSorot] = useState(0);

  // Daftar baru berarti sorotan lama menunjuk ke baris yang sudah tidak ada.
  useEffect(() => { setSorot(0); }, [saran]);

  const tampil = buka && saran.length > 0;

  const tekanTombol = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && saran.length > 0) {
      e.preventDefault();
      setBuka(true);
      setSorot(i => Math.min(i + 1, saran.length - 1));
    } else if (e.key === 'ArrowUp' && saran.length > 0) {
      e.preventDefault();
      setSorot(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (tampil) {
        onPilih(saran[sorot].key);
        setBuka(false);
      } else {
        onEnterKosong?.();
      }
    } else if (e.key === 'Escape') {
      setBuka(false);
    }
  };

  const fokus = (e: React.FocusEvent<HTMLInputElement>) => {
    setBuka(true);
    if (!layarSempit()) return;
    // Menunggu keyboard layar selesai naik sebelum menggulir.
    const el = e.currentTarget;
    setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
  };

  // onMouseDown + preventDefault: mengetuk tombol ini tidak boleh memindahkan fokus dari
  // isian, kalau tidak keyboard layar menutup setiap kali kode ditambahkan.
  const tahanFokus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1 min-w-0">
          <input
            ref={inputRef}
            type="text"
            value={nilai}
            autoComplete="off"
            autoCorrect={kode ? 'off' : undefined}
            autoCapitalize={kode ? 'characters' : undefined}
            spellCheck={kode ? false : undefined}
            enterKeyHint={enterKeyHint}
            placeholder={placeholder}
            onChange={e => { onUbah(kode ? e.target.value.toUpperCase() : e.target.value); setBuka(true); }}
            onFocus={fokus}
            onBlur={() => setTimeout(() => setBuka(false), 200)}
            onKeyDown={tekanTombol}
            onPaste={onTempel ? e => { e.preventDefault(); onTempel(e.clipboardData.getData('text')); } : undefined}
            className={`w-full border rounded-lg px-3 py-3 md:py-2 text-base md:text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
              nilai ? 'pr-10 md:pr-3' : ''
            } ${kode ? 'font-mono uppercase' : ''} ${terpilih ? 'border-green-400 bg-green-50/40' : 'border-gray-300'}`}
          />
          {nilai && (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Hapus isian"
              onMouseDown={tahanFokus}
              onClick={() => onUbah('')}
              className="md:hidden absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center text-gray-400 active:text-gray-600"
            >
              <span className="material-icons text-xl">cancel</span>
            </button>
          )}
        </div>

        {aksi && (
          <button
            type="button"
            aria-label={aksi.label}
            onMouseDown={tahanFokus}
            onClick={aksi.onKlik}
            className="shrink-0 h-[50px] md:h-[38px] min-w-12 md:min-w-0 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white flex items-center justify-center gap-1 text-sm font-bold"
          >
            <span className="material-icons text-xl">{aksi.ikon}</span>
            <span className="hidden md:inline">{aksi.label}</span>
          </button>
        )}
      </div>

      {tampil && (
        <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-[40vh] md:max-h-64 overflow-auto">
          {saran.map((s, i) => (
            <li
              key={s.key}
              onMouseDown={() => { onPilih(s.key); setBuka(false); }}
              onMouseEnter={() => setSorot(i)}
              className={`px-3 py-3 md:py-2 cursor-pointer flex items-center justify-between gap-2 ${
                i === sorot ? 'bg-indigo-50' : ''
              }`}
            >
              <div className="min-w-0">
                <div className={`text-base md:text-sm font-bold text-gray-800 truncate ${kode ? 'font-mono' : ''}`}>{s.label}</div>
                {s.detail && <div className="text-xs text-gray-500 truncate">{s.detail}</div>}
              </div>
              {s.badge && (
                <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  s.badgePeringatan ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {s.badge}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default KotakSaran;
