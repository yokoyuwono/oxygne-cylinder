import React, { useMemo, useState } from 'react';
import { Cylinder, CylinderStatus, RefillStation, Transaction } from '../types';
import { formatJam, formatTanggal, labelStatusTabung } from '../labels';
import { hariIni, tanggalLokal } from '../lib/laporanHarian';
import { urutkanTabung } from '../lib/urutanTabung';
import { usePaginasi } from '../lib/usePaginasi';
import Paginasi from './Paginasi';

interface RefillHistoryProps {
  transactions: Transaction[];
  cylinders: Cylinder[];
  stations: RefillStation[];
}

const PENGIRIMAN_PER_HALAMAN = 8;

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white';

interface BarisTabung {
  id: string;
  serialCode: string;
  gasType?: string;
  size?: string;
  status?: CylinderStatus;
  /** Barisnya menunjuk tabung yang sudah tidak ada di data. */
  hilang: boolean;
}

interface Pengiriman {
  kunci: string;
  tanggal: string;
  namaVendor: string;
  tabung: BarisTabung[];
}

/** Warna status terkini tabung -- sekadar penanda, bukan bagian dari riwayatnya. */
const warnaStatus = (status?: CylinderStatus) => {
  switch (status) {
    case CylinderStatus.Refilling: return 'bg-amber-50 text-amber-700 border-amber-200';
    case CylinderStatus.Available: return 'bg-green-50 text-green-700 border-green-200';
    case CylinderStatus.Rented: return 'bg-blue-50 text-blue-700 border-blue-200';
    case CylinderStatus.Damaged: return 'bg-red-50 text-red-700 border-red-200';
    default: return 'bg-gray-100 text-gray-600 border-gray-200';
  }
};

/**
 * Riwayat tabung yang dikirim ke pabrik.
 *
 * Dikelompokkan per PENGIRIMAN, bukan per baris transaksi. Satu kali kirim melahirkan
 * satu baris REFILL_OUT untuk tiap tabung dengan tanggal dan vendor yang identik (lihat
 * handleSendToRefill di App.tsx), jadi kiriman berisi 20 tabung akan tampil sebagai 20
 * baris berulang yang menyebutkan vendor dan jam yang sama persis kalau dibiarkan datar.
 * Yang dicari petugas juga memang kirimannya -- "14 Agustus, 20 tabung ke Merak" --
 * bukan dua puluh kejadian terpisah.
 *
 * Isinya sengaja hanya kiriman keluar. Status terkini tiap tabung tetap ditampilkan
 * sebagai penanda, tapi itu dibaca dari data tabung yang sudah ada di memori, bukan
 * dari mencocokkan baris REFILL_IN.
 */
const RefillHistory: React.FC<RefillHistoryProps> = ({ transactions, cylinders, stations }) => {
  const [cari, setCari] = useState('');
  const [dari, setDari] = useState('');
  const [sampai, setSampai] = useState('');
  const [terbuka, setTerbuka] = useState<string[]>([]);

  const pengiriman = useMemo<Pengiriman[]>(() => {
    const petaTabung = new Map(cylinders.map(c => [c.id, c]));
    const petaVendor = new Map(stations.map(s => [s.id, s.name]));
    const kelompok = new Map<string, Pengiriman>();

    for (const t of transactions) {
      if (t.type !== 'REFILL_OUT') continue;

      const kunci = `${t.date}|${t.refillStationId ?? ''}`;
      let grup = kelompok.get(kunci);
      if (!grup) {
        grup = {
          kunci,
          tanggal: t.date,
          namaVendor: petaVendor.get(t.refillStationId ?? '') || 'Vendor tidak dikenal',
          tabung: [],
        };
        kelompok.set(kunci, grup);
      }

      // Tabung yang barisnya masih ada tapi datanya sudah dihapus tetap ditampilkan.
      // Menyembunyikannya membuat jumlah tabung di kartu tidak cocok dengan isinya,
      // dan itu terbaca seperti riwayat yang bocor.
      const c = petaTabung.get(t.cylinderId ?? '');
      grup.tabung.push(c
        ? { id: c.id, serialCode: c.serialCode, gasType: c.gasType, size: c.size, status: c.status, hilang: false }
        : { id: t.cylinderId ?? t.id, serialCode: t.cylinderId ?? '-', hilang: true });
    }

    return [...kelompok.values()]
      .map(g => ({ ...g, tabung: urutkanTabung(g.tabung) }))
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
  }, [transactions, cylinders, stations]);

  const sedangMencari = cari.trim().length > 0;
  const adaSaringan = sedangMencari || Boolean(dari) || Boolean(sampai);

  const terfilter = useMemo(() => {
    const kunci = cari.trim().toLowerCase();

    return pengiriman
      .filter(p => {
        const tgl = tanggalLokal(p.tanggal);
        if (dari && tgl < dari) return false;
        if (sampai && tgl > sampai) return false;
        return true;
      })
      .map(p => {
        if (!kunci) return p;
        // Nama vendor cocok berarti seluruh isi kirimannya relevan -- petugas yang
        // mengetik "merak" ingin melihat kirimannya, bukan nol tabung.
        if (p.namaVendor.toLowerCase().includes(kunci)) return p;

        return {
          ...p,
          tabung: p.tabung.filter(t =>
            [t.serialCode, t.gasType, t.size].some(v => (v || '').toLowerCase().includes(kunci))),
        };
      })
      .filter(p => p.tabung.length > 0);
  }, [pengiriman, cari, dari, sampai]);

  const halaman = usePaginasi(terfilter, PENGIRIMAN_PER_HALAMAN);
  const totalTabung = terfilter.reduce((n, p) => n + p.tabung.length, 0);

  // Saat mencari, semua kartu dibuka: yang dicari justru ada di dalamnya, dan
  // membiarkannya tertutup berarti hasil pencarian yang tidak kelihatan.
  const apakahTerbuka = (kunci: string) => sedangMencari || terbuka.includes(kunci);

  const bukaTutup = (kunci: string) =>
    setTerbuka(prev => prev.includes(kunci) ? prev.filter(k => k !== kunci) : [...prev, kunci]);

  const bersihkanSaringan = () => {
    setCari('');
    setDari('');
    setSampai('');
  };

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Saringan */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
            <input
              type="text"
              value={cari}
              onChange={e => setCari(e.target.value)}
              placeholder="Cari kode seri, jenis gas, ukuran, atau vendor..."
              className={`${inputClass} pl-9 pr-9`}
            />
            {cari && (
              <button
                onClick={() => setCari('')}
                className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
                aria-label="Bersihkan pencarian"
              >
                <span className="material-icons text-base">close</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex-1 lg:flex-none">
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1" htmlFor="riwayat-dari">Dari</label>
              <input
                id="riwayat-dari"
                type="date"
                value={dari}
                max={sampai || hariIni()}
                onChange={e => setDari(e.target.value)}
                className={inputClass}
              />
            </div>
            <div className="flex-1 lg:flex-none">
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1" htmlFor="riwayat-sampai">Sampai</label>
              <input
                id="riwayat-sampai"
                type="date"
                value={sampai}
                min={dari || undefined}
                max={hariIni()}
                onChange={e => setSampai(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
          <p>
            {terfilter.length} pengiriman • {totalTabung} tabung
            {!adaSaringan && ' • semua tanggal'}
          </p>
          {adaSaringan && (
            <button onClick={bersihkanSaringan} className="text-indigo-600 font-medium hover:underline whitespace-nowrap">
              Bersihkan saringan
            </button>
          )}
        </div>
      </div>

      {pengiriman.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center h-64 text-gray-400">
          <span className="material-icons text-4xl mb-2 text-gray-300">history</span>
          <p>Belum ada pengiriman ke pabrik yang tercatat.</p>
          <p className="text-xs mt-1">Riwayatnya muncul di sini setelah pengiriman pertama.</p>
        </div>
      ) : terfilter.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center h-64 text-gray-400">
          <span className="material-icons text-4xl mb-2 text-gray-300">search_off</span>
          <p>Tidak ada pengiriman yang cocok dengan saringan ini.</p>
          <button onClick={bersihkanSaringan} className="text-xs mt-2 text-indigo-600 font-medium hover:underline">
            Bersihkan saringan
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {halaman.halamanIni.map(p => {
              const dibuka = apakahTerbuka(p.kunci);

              return (
                <div key={p.kunci} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <button
                    onClick={() => bukaTutup(p.kunci)}
                    className="w-full p-4 flex items-center gap-4 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
                      <span className="material-icons">local_shipping</span>
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-800 text-sm truncate">{p.namaVendor}</p>
                      <p className="text-xs text-gray-500">
                        {formatTanggal(p.tanggal, { day: 'numeric', month: 'long', year: 'numeric' })} • {formatJam(p.tanggal)}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <p className="font-bold text-gray-800">{p.tabung.length}</p>
                      <p className="text-[10px] text-gray-400 uppercase">tabung</p>
                    </div>

                    <span className={`material-icons text-gray-400 transition-transform shrink-0 ${dibuka ? 'rotate-180' : ''}`}>
                      expand_more
                    </span>
                  </button>

                  {dibuka && (
                    <div className="border-t border-gray-100 divide-y divide-gray-50">
                      {p.tabung.map(t => (
                        <div key={t.id} className="px-4 py-2.5 flex items-center justify-between gap-3 hover:bg-gray-50">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono font-medium text-gray-900 text-sm">{t.serialCode}</span>
                            {t.hilang ? (
                              <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200">
                                data tabung tidak ditemukan
                              </span>
                            ) : (
                              <span className="text-xs text-gray-500 truncate">
                                {t.gasType} • {t.size}
                              </span>
                            )}
                          </div>

                          {!t.hilang && (
                            <span className={`text-[10px] px-2 py-0.5 rounded border whitespace-nowrap ${warnaStatus(t.status)}`}>
                              {labelStatusTabung(t.status)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Paginasi
            halaman={halaman.halaman}
            totalHalaman={halaman.totalHalaman}
            totalBaris={halaman.totalBaris}
            perHalaman={halaman.perHalaman}
            onPindah={halaman.setHalaman}
          />
        </>
      )}
    </div>
  );
};

export default RefillHistory;
