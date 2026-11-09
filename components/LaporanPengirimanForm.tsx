import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Cylinder, Member, MemberPrice, RefillPrice, RentalTariff, Transaction } from '../types';
import { formatIDR, labelStatusTabung } from '../labels';
import { hariIni } from '../lib/laporanHarian';
import { METODE_BAYAR } from '../lib/metodeBayar';
import {
  BarisDraf,
  CaraBayarPengiriman,
  HargaPengiriman,
  LaporanPengirimanPayload,
  biayaIsiPabrik,
  cariPelanggan,
  cariTabung,
  hargaPengiriman,
  lengkapi,
  periksaBaris,
  tabungBisaDikirim,
  tabungDiPabrik,
} from '../lib/laporanPengiriman';
import KotakSaran, { Saran } from './KotakSaran';

interface LaporanPengirimanFormProps {
  cylinders: Cylinder[];
  members: Member[];
  memberPrices: MemberPrice[];
  tariffs: RentalTariff[];
  transactions: Transaction[];
  refillPrices: RefillPrice[];
  onSubmit: (payload: LaporanPengirimanPayload) => Promise<void>;
}

/** Isian satu baris beserta teks yang sedang diketik di dua kotak sarannya. */
interface Baris extends BarisDraf {
  kodeTeks: string;
  pelangganTeks: string;
  sumberHarga: HargaPengiriman['sumber'] | undefined;
  /** Tabung di pabrik yang vendor atau harga isinya tidak ketemu. */
  biayaTidakKetemu: boolean;
}

const namaPelanggan = (m: Member) => m.companyName || m.name;

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
const labelClass = 'block text-xs font-bold text-gray-500 uppercase mb-1.5';

const CARA_BAYAR: { id: CaraBayarPengiriman; label: string; ikon: string }[] = [
  ...METODE_BAYAR,
  { id: 'BON', label: 'Bon', ikon: 'receipt_long' },
];

let urutanBaris = 0;
const barisKosong = (): Baris => ({
  kunci: `b-${++urutanBaris}`,
  tabung: null,
  member: null,
  harga: 0,
  hargaManual: false,
  biayaIsi: 0,
  kodeTeks: '',
  pelangganTeks: '',
  sumberHarga: undefined,
  biayaTidakKetemu: false,
});

const LaporanPengirimanForm: React.FC<LaporanPengirimanFormProps> = ({
  cylinders, members, memberPrices, tariffs, transactions, refillPrices, onSubmit,
}) => {
  // --- State ---
  const [tanggal, setTanggal] = useState(hariIni);
  const [baris, setBaris] = useState<Baris[]>(() => [barisKosong()]);
  const [caraBayar, setCaraBayar] = useState<CaraBayarPengiriman>('CASH');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [fokusKunci, setFokusKunci] = useState<string | null>(null);
  const wadah = useRef<HTMLDivElement>(null);

  const bisaDikirim = useMemo(() => tabungBisaDikirim(cylinders, tariffs), [cylinders, tariffs]);

  // --- Effects ---
  // Baris baru dibuat dulu, fokusnya menyusul setelah inputnya ada di layar.
  useEffect(() => {
    if (!fokusKunci) return;
    wadah.current?.querySelector<HTMLInputElement>(`[data-kode="${fokusKunci}"] input`)?.focus();
    setFokusKunci(null);
  }, [fokusKunci, baris]);

  useEffect(() => {
    if (!sukses) return;
    const t = setTimeout(() => setSukses(null), 3500);
    return () => clearTimeout(t);
  }, [sukses]);

  // --- Handlers ---
  const ubah = (kunci: string, patch: Partial<Baris>) =>
    setBaris(prev => prev.map(b => (b.kunci === kunci ? { ...b, ...patch } : b)));

  /** Harga otomatis hanya dihitung ulang kalau petugas belum mengetik harganya sendiri. */
  const hargaOtomatis = (b: Baris, tabung: Cylinder | null, member: Member | null): Partial<Baris> => {
    if (b.hargaManual || !tabung || !member) return {};
    const h = hargaPengiriman(tabung, member.id, memberPrices, tariffs);
    return { harga: h.harga, sumberHarga: h.sumber };
  };

  const pilihTabung = (kunci: string, tabung: Cylinder) => {
    const b = baris.find(x => x.kunci === kunci);
    if (!b) return;

    const biaya = tabungDiPabrik(tabung) ? biayaIsiPabrik(tabung, transactions, refillPrices) : null;
    ubah(kunci, {
      tabung,
      kodeTeks: tabung.serialCode,
      biayaIsi: biaya ?? 0,
      biayaTidakKetemu: tabungDiPabrik(tabung) && biaya === null,
      ...hargaOtomatis(b, tabung, b.member),
    });
    setError(null);
  };

  const pilihPelanggan = (kunci: string, member: Member) => {
    const b = baris.find(x => x.kunci === kunci);
    if (!b) return;

    ubah(kunci, {
      member,
      pelangganTeks: namaPelanggan(member),
      ...hargaOtomatis(b, b.tabung, member),
    });
    setError(null);
  };

  // Mengetik ulang setelah memilih membatalkan pilihannya: kotak berisi teks yang tidak
  // lagi sama dengan tabung atau pelanggan yang tersimpan di baris itu.
  const ketikKode = (kunci: string, teks: string) => {
    const b = baris.find(x => x.kunci === kunci);
    const lepas = b?.tabung && teks !== b.tabung.serialCode;
    ubah(kunci, lepas ? { kodeTeks: teks, tabung: null, biayaIsi: 0, biayaTidakKetemu: false } : { kodeTeks: teks });
  };

  const ketikPelanggan = (kunci: string, teks: string) => {
    const b = baris.find(x => x.kunci === kunci);
    const lepas = b?.member && teks !== namaPelanggan(b.member);
    ubah(kunci, lepas ? { pelangganTeks: teks, member: null } : { pelangganTeks: teks });
  };

  const tambahBaris = () => {
    const baru = barisKosong();
    setBaris(prev => [...prev, baru]);
    setFokusKunci(baru.kunci);
  };

  const hapusBaris = (kunci: string) =>
    setBaris(prev => (prev.length === 1 ? [barisKosong()] : prev.filter(b => b.kunci !== kunci)));

  // Baris yang tidak disentuh sama sekali tidak dihitung, supaya baris cadangan di
  // ujung tabel tidak menghalangi simpan.
  const terisi = baris.filter(b => b.kodeTeks || b.pelangganTeks || b.tabung || b.member);
  const pesan = periksaBaris(terisi);
  const bolehSimpan = !busy && !!tanggal && !pesan;

  const totalHarga = terisi.reduce((n, b) => n + (b.harga || 0), 0);
  const barisPabrik = terisi.filter(b => b.tabung && tabungDiPabrik(b.tabung));
  const totalBiayaIsi = barisPabrik.reduce((n, b) => n + (b.biayaIsi || 0), 0);

  const simpan = async () => {
    if (!bolehSimpan) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ tanggal, baris: lengkapi(terisi), caraBayar });
      setSukses(`Laporan pengiriman tersimpan: ${terisi.length} tabung.`);
      setBaris([barisKosong()]);
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan laporan pengiriman.');
    } finally {
      setBusy(false);
    }
  };

  // --- Render ---
  const saranTabung = (b: Baris): Saran[] => {
    if (b.tabung && b.kodeTeks === b.tabung.serialCode) return [];
    const terpakai = baris.filter(x => x.kunci !== b.kunci && x.tabung).map(x => (x.tabung as Cylinder).id);
    return cariTabung(bisaDikirim, b.kodeTeks, terpakai).map(c => ({
      key: c.id,
      label: c.serialCode,
      detail: `${c.gasType} ${c.size}`,
      badge: labelStatusTabung(c.status),
      badgePeringatan: tabungDiPabrik(c),
    }));
  };

  const saranPelanggan = (b: Baris): Saran[] => {
    if (b.member && b.pelangganTeks === namaPelanggan(b.member)) return [];
    return cariPelanggan(members, b.pelangganTeks).map(m => ({
      key: m.id,
      label: namaPelanggan(m),
      detail: m.companyName && m.name !== m.companyName ? m.name : m.address,
      badge: m.totalDebt > 0 ? `Utang ${formatIDR(m.totalDebt)}` : undefined,
      badgePeringatan: true,
    }));
  };

  const keteranganHarga = (b: Baris) => {
    if (!b.tabung || !b.member) return null;
    if (b.hargaManual) return { teks: 'Diubah manual', warna: 'text-gray-400' };
    if (b.sumberHarga === 'PELANGGAN') return { teks: 'Harga pelanggan', warna: 'text-green-600' };
    if (b.sumberHarga === 'TARIF') return { teks: 'Tarif', warna: 'text-gray-400' };
    return { teks: 'Tarif belum ada, isi manual', warna: 'text-red-500' };
  };

  const mundur = !!tanggal && tanggal < hariIni();

  return (
    <div ref={wadah} className="max-w-5xl mx-auto space-y-5">
      {sukses && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 bg-green-600 text-white">
          <span className="material-icons text-lg">check_circle</span>
          <span className="font-medium text-sm">{sukses}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6">
        <div className="flex flex-col md:flex-row md:items-end gap-4">
          <div className="md:w-56">
            <label className={labelClass} htmlFor="tanggal-laporan">Tanggal Laporan <span className="text-red-500">*</span></label>
            <input
              id="tanggal-laporan"
              type="date"
              required
              max={hariIni()}
              value={tanggal}
              onChange={e => setTanggal(e.target.value)}
              className={`${inputClass} ${mundur ? 'border-amber-400 bg-amber-50' : ''}`}
            />
          </div>
          <p className="text-xs text-gray-500 md:pb-2.5">
            Tabung boleh yang tersedia di gudang atau yang masih di pabrik. Tabung dari pabrik dicatat
            diterima dan langsung keluar ke pelanggan pada tanggal ini.
          </p>
        </div>

        {mundur && (
          <div className="mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs font-medium">
            <span className="material-icons text-base">history</span>
            Laporan dicatat mundur ke tanggal ini, bukan hari ini.
          </div>
        )}
        {!tanggal && (
          <p className="mt-3 text-xs font-medium text-red-600">Tanggal laporan wajib diisi.</p>
        )}
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6">
        <div className="hidden md:grid md:grid-cols-[2rem_1fr_1.4fr_11rem_2.5rem] gap-3 mb-2">
          <span />
          <span className={labelClass}>Kode Tabung</span>
          <span className={labelClass}>Nama Pelanggan</span>
          <span className={labelClass}>Harga</span>
          <span />
        </div>

        <div className="space-y-4 md:space-y-3">
          {baris.map((b, i) => {
            const ket = keteranganHarga(b);
            const pabrik = !!b.tabung && tabungDiPabrik(b.tabung);
            const terakhir = i === baris.length - 1;

            return (
              <div key={b.kunci} className="border border-gray-100 md:border-0 rounded-xl p-3 md:p-0 bg-gray-50/50 md:bg-transparent">
                <div className="grid grid-cols-1 md:grid-cols-[2rem_1fr_1.4fr_11rem_2.5rem] gap-3 md:items-start">
                  <span className="hidden md:flex h-[38px] items-center justify-center text-xs font-bold text-gray-400">{i + 1}</span>

                  <div data-kode={b.kunci}>
                    <label className={`${labelClass} md:hidden`}>Kode Tabung</label>
                    <KotakSaran
                      kode
                      nilai={b.kodeTeks}
                      onUbah={t => ketikKode(b.kunci, t)}
                      saran={saranTabung(b)}
                      onPilih={key => {
                        const c = bisaDikirim.find(x => x.id === key);
                        if (c) pilihTabung(b.kunci, c);
                      }}
                      terpilih={!!b.tabung}
                      placeholder="Ketik kode tabung"
                    />
                    {b.tabung && (
                      <p className="mt-1 text-[11px] text-gray-500">
                        {b.tabung.gasType} {b.tabung.size}
                        {pabrik && <span className="ml-1.5 font-bold text-amber-600">· Di pabrik</span>}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className={`${labelClass} md:hidden`}>Nama Pelanggan</label>
                    <KotakSaran
                      nilai={b.pelangganTeks}
                      onUbah={t => ketikPelanggan(b.kunci, t)}
                      saran={saranPelanggan(b)}
                      onPilih={key => {
                        const m = members.find(x => x.id === key);
                        if (m) pilihPelanggan(b.kunci, m);
                      }}
                      terpilih={!!b.member}
                      placeholder="Ketik nama pelanggan"
                      onEnterKosong={terakhir && b.tabung && b.member ? tambahBaris : undefined}
                    />
                  </div>

                  <div>
                    <label className={`${labelClass} md:hidden`}>Harga</label>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={b.harga === 0 ? '' : b.harga}
                      placeholder="0"
                      onChange={e => ubah(b.kunci, { harga: Math.max(0, Number(e.target.value) || 0), hargaManual: true })}
                      className={`${inputClass} text-right font-mono`}
                    />
                    {ket && <p className={`mt-1 text-[11px] text-right ${ket.warna}`}>{ket.teks}</p>}
                  </div>

                  <button
                    type="button"
                    onClick={() => hapusBaris(b.kunci)}
                    aria-label={`Hapus baris ${i + 1}`}
                    className="h-[38px] w-full md:w-10 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <span className="material-icons text-lg">delete_outline</span>
                  </button>
                </div>

                {pabrik && (
                  <div className="mt-2 md:ml-11 flex flex-wrap items-center gap-3 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                    <span className="material-icons text-amber-600 text-base">factory</span>
                    <span className="text-xs text-amber-800 font-medium">Biaya isi di pabrik</span>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={b.biayaIsi === 0 ? '' : b.biayaIsi}
                      placeholder="0"
                      onChange={e => ubah(b.kunci, { biayaIsi: Math.max(0, Number(e.target.value) || 0), biayaTidakKetemu: false })}
                      className="w-32 border border-amber-200 bg-white rounded-lg px-2 py-1 text-sm text-right font-mono focus:ring-2 focus:ring-amber-400 outline-none"
                    />
                    {b.biayaTidakKetemu && (
                      <span className="text-[11px] text-red-600 font-medium">
                        Harga vendor tidak ketemu, isi sendiri. Kosong berarti dicatat Rp 0.
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={tambahBaris}
          className="mt-4 flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-800"
        >
          <span className="material-icons text-lg">add_circle_outline</span>
          Tambah baris
        </button>

        <div className="mt-6 pt-4 border-t border-gray-100 flex flex-col items-end gap-1">
          <div className="flex items-baseline gap-4">
            <span className="text-sm font-bold text-gray-500 uppercase">Total ({terisi.length} tabung)</span>
            <span className="text-2xl font-bold text-gray-900 font-mono">{formatIDR(totalHarga)}</span>
          </div>
          {barisPabrik.length > 0 && (
            <p className="text-xs text-amber-700">
              Biaya isi pabrik {formatIDR(totalBiayaIsi)} ({barisPabrik.length} tabung) dicatat terpisah sebagai pengeluaran, tidak mengurangi total ini.
            </p>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 md:p-6 space-y-4">
        <div>
          <label className={labelClass}>Pembayaran</label>
          <div className="bg-gray-100 p-1 rounded-lg inline-flex gap-1">
            {CARA_BAYAR.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCaraBayar(c.id)}
                className={`px-5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${
                  caraBayar === c.id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'
                }`}
              >
                <span className="material-icons text-sm">{c.ikon}</span>
                {c.label}
              </button>
            ))}
          </div>
          {caraBayar === 'BON' && (
            <p className="mt-2 text-xs text-gray-500">
              Harga tiap pelanggan ditambahkan ke utangnya dan baris dicatat belum dibayar.
            </p>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-lg px-3 py-2 text-sm">
            <span className="material-icons text-base mt-0.5">error</span>
            <span>{error}</span>
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <button
            type="button"
            onClick={simpan}
            disabled={!bolehSimpan}
            className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2"
          >
            <span className="material-icons text-lg">save</span>
            {busy ? 'Menyimpan...' : 'Simpan Laporan'}
          </button>
          {!busy && pesan && terisi.length > 0 && <span className="text-xs text-gray-500">{pesan}</span>}
          {!busy && terisi.length === 0 && <span className="text-xs text-gray-500">Isi minimal satu baris pengiriman.</span>}
        </div>
      </div>
    </div>
  );
};

export default LaporanPengirimanForm;
