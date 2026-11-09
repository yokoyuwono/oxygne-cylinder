import React, { useEffect, useState } from 'react';

export interface Saran {
  key: string;
  label: string;
  detail?: string;
  badge?: string;
  /** Badge amber untuk hal yang perlu diperhatikan, abu-abu untuk keterangan biasa. */
  badgePeringatan?: boolean;
}

interface KotakSaranProps {
  nilai: string;
  onUbah: (teks: string) => void;
  saran: Saran[];
  onPilih: (key: string) => void;
  placeholder?: string;
  /** Kode tabung diketik huruf besar dengan huruf lebar tetap. */
  kode?: boolean;
  /** Sudah ada pilihan sah di kotak ini; hanya mengubah warna bingkai. */
  terpilih?: boolean;
  /** Enter ditekan ketika tidak ada saran yang disorot. */
  onEnterKosong?: () => void;
  inputRef?: React.Ref<HTMLInputElement>;
}

/**
 * Kotak isian dengan daftar saran di bawahnya.
 *
 * Dipakai dua kali di Laporan Pengiriman (kode tabung dan nama pelanggan). Perilakunya
 * disalin dari pencarian pelanggan di RentalForm: panah dan Enter untuk memilih, Escape
 * menutup, dan saran dipilih lewat onMouseDown -- onClick datang sesudah blur, saat
 * daftarnya sudah menghilang dan kliknya jatuh ke kosong.
 */
const KotakSaran: React.FC<KotakSaranProps> = ({
  nilai, onUbah, saran, onPilih, placeholder, kode, terpilih, onEnterKosong, inputRef,
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

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={nilai}
        autoComplete="off"
        placeholder={placeholder}
        onChange={e => { onUbah(kode ? e.target.value.toUpperCase() : e.target.value); setBuka(true); }}
        onFocus={() => setBuka(true)}
        onBlur={() => setTimeout(() => setBuka(false), 200)}
        onKeyDown={tekanTombol}
        className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-500 ${
          kode ? 'font-mono uppercase' : ''
        } ${terpilih ? 'border-green-400 bg-green-50/40' : 'border-gray-300'}`}
      />

      {tampil && (
        <ul className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {saran.map((s, i) => (
            <li
              key={s.key}
              onMouseDown={() => { onPilih(s.key); setBuka(false); }}
              onMouseEnter={() => setSorot(i)}
              className={`px-3 py-2 cursor-pointer flex items-center justify-between gap-2 ${
                i === sorot ? 'bg-indigo-50' : ''
              }`}
            >
              <div className="min-w-0">
                <div className={`text-sm font-bold text-gray-800 truncate ${kode ? 'font-mono' : ''}`}>{s.label}</div>
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
