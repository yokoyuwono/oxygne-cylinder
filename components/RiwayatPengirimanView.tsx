import React, { useMemo, useState } from 'react';
import { Cylinder, Member, Transaction } from '../types';
import { formatIDR, formatTanggal } from '../labels';
import { hariIni } from '../lib/laporanHarian';
import { usePaginasi } from '../lib/usePaginasi';
import { saringRiwayat, susunRiwayat } from '../lib/laporanPengiriman';
import Paginasi from './Paginasi';

interface RiwayatPengirimanViewProps {
  transactions: Transaction[];
  cylinders: Cylinder[];
  members: Member[];
}

const LABEL_BAYAR: Record<string, string> = { CASH: 'Tunai', TRANSFER: 'Transfer', BON: 'Bon' };

/** Hari per halaman. Satu hari bisa berisi puluhan pelanggan, jadi halamannya per hari. */
const HARI_PER_HALAMAN = 7;

/**
 * Riwayat Laporan Pengiriman: pengiriman yang nomor tabungnya sudah disimpan.
 *
 * Murni turunan dari transaksi yang sudah ada di memori (lihat susunRiwayat), jadi tidak
 * ada query tambahan. Yang dibatalkan lewat Laporan & Riwayat tidak muncul lagi di sini.
 * Catatan yang masih menunggu nomor tabung tidak tampil di sini; itu ada di tab Isi
 * Nomor Tabung.
 *
 * Satu tanggal satu kelompok yang bisa dibuka-tutup. Kepalanya sudah memuat ringkasan
 * hari itu, jadi deretan hari bisa dibaca sekilas tanpa membuka satu per satu.
 */
const RiwayatPengirimanView: React.FC<RiwayatPengirimanViewProps> = ({ transactions, cylinders, members }) => {
  const [cari, setCari] = useState('');
  /** Hanya tanggal yang pernah diketuk; sisanya mengikuti bawaan (lihat `terbuka`). */
  const [pilihan, setPilihan] = useState<Record<string, boolean>>({});

  const semuaHari = useMemo(
    () => susunRiwayat(transactions, cylinders, members),
    [transactions, cylinders, members]
  );
  const hari = useMemo(() => saringRiwayat(semuaHari, cari), [semuaHari, cari]);
  const { halamanIni, halaman, totalHalaman, totalBaris, perHalaman, setHalaman } = usePaginasi(hari, HARI_PER_HALAMAN);

  // Bawaan: hari terbaru terbuka, yang lain tertutup. Saat mencari semuanya terbuka --
  // yang dicari adalah isi kelompoknya, dan menyembunyikannya membuat hasil tampak kosong.
  const terbuka = (tanggal: string) =>
    pilihan[tanggal] ?? (cari.trim() ? true : tanggal === semuaHari[0]?.tanggal);

  if (semuaHari.length === 0) {
    return (
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-10 text-center">
        <span className="material-icons text-4xl text-gray-300">history</span>
        <p className="mt-2 font-bold text-gray-800">Belum ada riwayat pengiriman</p>
        <p className="text-sm text-gray-500 mt-1">
          Pengiriman muncul di sini setelah nomor tabungnya disimpan di tab "Isi Nomor Tabung".
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-3">
      <div className="relative">
        <span className="material-icons absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">search</span>
        <input
          type="text"
          value={cari}
          onChange={e => setCari(e.target.value)}
          placeholder="Cari nama pelanggan atau kode tabung"
          autoComplete="off"
          className="w-full bg-white border border-gray-300 rounded-xl pl-10 pr-3 py-3 md:py-2.5 text-base md:text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
        />
      </div>

      {hari.length === 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-sm text-gray-500">
          Tidak ada pengiriman yang cocok dengan "{cari}".
        </div>
      )}

      {halamanIni.map(h => {
        const buka = terbuka(h.tanggal);
        return (
          <section key={h.tanggal} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <button
              type="button"
              aria-expanded={buka}
              onClick={() => setPilihan(prev => ({ ...prev, [h.tanggal]: !buka }))}
              className="w-full text-left p-4 flex items-start gap-3 hover:bg-gray-50 active:bg-gray-50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-sm md:text-base font-bold text-gray-900">
                    {formatTanggal(`${h.tanggal}T00:00`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </h3>
                  {h.tanggal === hariIni() && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">Hari ini</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {h.baris.length} pelanggan · {h.jumlahTabung} tabung
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                  <span className="px-2 py-0.5 rounded-md bg-green-50 text-green-700 font-bold">
                    Pemasukan {formatIDR(h.pemasukan)}
                  </span>
                  {h.bon > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold">Bon {formatIDR(h.bon)}</span>
                  )}
                  {h.biayaIsi > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-600 font-bold">
                      Biaya isi pabrik {formatIDR(h.biayaIsi)}
                    </span>
                  )}
                </div>
              </div>
              <span className={`material-icons text-gray-400 shrink-0 mt-0.5 transition-transform ${buka ? 'rotate-180' : ''}`}>
                expand_more
              </span>
            </button>

            {buka && (
              <ul className="border-t border-gray-100 divide-y divide-gray-100">
                {h.baris.map(b => (
                  <li key={b.kunci} className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-bold text-gray-900 leading-snug break-words">{b.namaPelanggan}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{b.tabung.length} tabung</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-gray-900">{formatIDR(b.total)}</div>
                        <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded font-bold text-[10px] uppercase ${
                          b.caraBayar === 'BON' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
                        }`}>
                          {LABEL_BAYAR[b.caraBayar] ?? b.caraBayar}
                        </span>
                      </div>
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {b.tabung.map(t => (
                        <span
                          key={t.id}
                          className={`rounded-lg border px-2.5 py-1 text-sm font-mono font-bold text-gray-800 ${
                            t.dariPabrik ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          {t.kode}
                          {t.dariPabrik && (
                            <span className="ml-1.5 font-sans text-[10px] font-bold text-amber-700">
                              Di pabrik{t.biayaIsi > 0 ? ` · ${formatIDR(t.biayaIsi)}` : ''}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {totalHalaman > 1 && (
        <Paginasi
          halaman={halaman}
          totalHalaman={totalHalaman}
          totalBaris={totalBaris}
          perHalaman={perHalaman}
          onPindah={setHalaman}
        />
      )}
    </div>
  );
};

export default RiwayatPengirimanView;
