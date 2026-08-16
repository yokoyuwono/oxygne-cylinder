import React from 'react';
import { MetodeBayar } from '../types';
import { METODE_BAYAR } from '../lib/metodeBayar';

interface PilihMetodeBayarProps {
  nilai: MetodeBayar;
  onGanti: (metode: MetodeBayar) => void;
  /** Diubah hanya kalau konteksnya menuntut kalimat lain; bawaannya sudah pas. */
  label?: string;
}

/**
 * Pemilih tunai atau transfer.
 *
 * Dipakai di tiga layar pencatatan pemasukan yang berjauhan (Tukar Besar, Tukar
 * Kecil, Uang Masuk), jadi bentuknya satu komponen -- tiga salinan berarti tiga
 * tempat yang harus diingat kalau nanti metodenya bertambah.
 *
 * Tunai terpilih sejak awal dan bukan pilihan kosong: mayoritas transaksi memang
 * tunai, dan memaksa satu klik wajib memperlambat jalur yang paling sering dipakai.
 */
const PilihMetodeBayar: React.FC<PilihMetodeBayarProps> = ({ nilai, onGanti, label = 'Metode Bayar' }) => (
  <div>
    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">{label}</label>
    <div className="bg-gray-100 p-1 rounded-lg inline-flex gap-1">
      {METODE_BAYAR.map(m => (
        <button
          key={m.id}
          type="button"
          onClick={() => onGanti(m.id)}
          className={`px-5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
            nilai === m.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
          }`}
        >
          <span className="material-icons text-sm">{m.ikon}</span>
          {m.label}
        </button>
      ))}
    </div>
  </div>
);

export default PilihMetodeBayar;
