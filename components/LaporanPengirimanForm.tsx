import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Member, MemberPrice, PengirimanMenunggu, RentalTariff } from '../types';
import { formatIDR } from '../labels';
import { hariIni } from '../lib/laporanHarian';
import {
  BarisCatat,
  CaraBayarPengiriman,
  HargaPengiriman,
  cariPelanggan,
  hargaPengiriman,
  jenisAwal,
  jenisTersedia,
  periksaCatatan,
  susunMenunggu,
} from '../lib/laporanPengiriman';
import KotakSaran, { Saran } from './KotakSaran';

interface LaporanPengirimanFormProps {
  members: Member[];
  memberPrices: MemberPrice[];
  tariffs: RentalTariff[];
  namaPengguna?: string;
  onSubmit: (baris: PengirimanMenunggu[]) => Promise<void>;
}

/** Isian satu baris beserta teks yang sedang diketik di kotak pelanggan. */
interface Baris extends BarisCatat {
  kunci: string;
  pelangganTeks: string;
  /**
   * Harga yang diketik petugas tidak boleh tertimpa isian otomatis ketika pelanggan atau
   * jenisnya diganti -- ia sudah tahu angka yang dia mau.
   */
  hargaManual: boolean;
  sumberHarga: HargaPengiriman['sumber'] | undefined;
}

const namaPelanggan = (m: Member) => m.companyName || m.name;

// Isian 16px di layar sempit: di bawah itu iOS memperbesar halaman saat fokus. Tinggi
// minimal 44px = target sentuh. Dari md ke atas kembali ke ukuran desktop.
const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-3 md:py-2 text-base md:text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
const labelClass = 'block text-xs font-bold text-gray-500 uppercase mb-1.5';

// Tanpa spinner bawaan browser: di HP terlalu kecil untuk disentuh, dan jumlah punya stepper sendiri.
const tanpaSpinner = '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';

const GRID = 'lg:grid-cols-[2rem_1.6fr_9.5rem_6rem_9rem_8rem_2.5rem]';

const CARA_BAYAR: { id: CaraBayarPengiriman; label: string }[] = [
  { id: 'CASH', label: 'Tunai' },
  { id: 'TRANSFER', label: 'Transfer' },
  { id: 'BON', label: 'Bon' },
];

let urutanBaris = 0;

/**
 * Catat pengiriman siang hari, secepat mungkin: pelanggan, jumlah, harga.
 *
 * Nomor tabung sengaja tidak diminta di sini -- di lapangan baru diketahui dan diketik
 * malam hari (lihat IsiKodePengirimanForm). Yang disimpan hanya daftar tunggu; belum ada
 * transaksi dan status tabung belum berubah.
 *
 * Di HP tiap baris jadi kartu bertumpuk dan tombol simpan menempel di atas bottom-nav,
 * supaya bisa dipakai satu tangan; dari md ke atas tetap berupa tabel.
 */
const LaporanPengirimanForm: React.FC<LaporanPengirimanFormProps> = ({
  members, memberPrices, tariffs, namaPengguna, onSubmit,
}) => {
  const jenisList = useMemo(() => jenisTersedia(tariffs), [tariffs]);
  const awal = useMemo(() => jenisAwal(jenisList), [jenisList]);

  const barisKosong = (): Baris => ({
    kunci: `b-${++urutanBaris}`,
    member: null,
    pelangganTeks: '',
    gasType: awal.gasType,
    size: awal.size,
    jumlah: 1,
    harga: 0,
    hargaManual: false,
    sumberHarga: undefined,
    caraBayar: 'CASH',
  });

  // --- State ---
  const [tanggal, setTanggal] = useState(hariIni);
  const [baris, setBaris] = useState<Baris[]>(() => [barisKosong()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [fokusKunci, setFokusKunci] = useState<string | null>(null);
  const wadah = useRef<HTMLDivElement>(null);

  // --- Effects ---
  // Baris baru dibuat dulu, fokusnya menyusul setelah inputnya ada di layar.
  useEffect(() => {
    if (!fokusKunci) return;
    wadah.current?.querySelector<HTMLInputElement>(`[data-pelanggan="${fokusKunci}"] input`)?.focus();
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
  const hargaOtomatis = (b: Baris, member: Member | null, gasType: string, size: string): Partial<Baris> => {
    if (b.hargaManual || !member) return {};
    const h = hargaPengiriman({ gasType, size }, member.id, memberPrices, tariffs);
    return { harga: h.harga, sumberHarga: h.sumber };
  };

  const pilihPelanggan = (kunci: string, member: Member) => {
    const b = baris.find(x => x.kunci === kunci);
    if (!b) return;
    ubah(kunci, { member, pelangganTeks: namaPelanggan(member), ...hargaOtomatis(b, member, b.gasType, b.size) });
    setError(null);
  };

  // Mengetik ulang setelah memilih membatalkan pilihannya.
  const ketikPelanggan = (kunci: string, teks: string) => {
    const b = baris.find(x => x.kunci === kunci);
    const lepas = b?.member && teks !== namaPelanggan(b.member);
    ubah(kunci, lepas ? { pelangganTeks: teks, member: null } : { pelangganTeks: teks });
  };

  const gantiJenis = (kunci: string, nilai: string) => {
    const b = baris.find(x => x.kunci === kunci);
    if (!b) return;
    const [gasType, size] = nilai.split('|');
    ubah(kunci, { gasType, size, ...hargaOtomatis(b, b.member, gasType, size) });
  };

  const tambahBaris = () => {
    const baru = barisKosong();
    setBaris(prev => [...prev, baru]);
    setFokusKunci(baru.kunci);
  };

  const hapusBaris = (kunci: string) =>
    setBaris(prev => (prev.length === 1 ? [barisKosong()] : prev.filter(b => b.kunci !== kunci)));

  const setJumlah = (kunci: string, n: number) => ubah(kunci, { jumlah: Math.max(0, Math.floor(n) || 0) });

  // Baris yang tidak disentuh sama sekali tidak dihitung, supaya baris cadangan di
  // ujung tabel tidak menghalangi simpan.
  const terisi = baris.filter(b => b.pelangganTeks || b.member);
  const pesan = periksaCatatan(tanggal, terisi);
  const bolehSimpan = !busy && !pesan;

  const totalTabung = terisi.reduce((n, b) => n + (b.jumlah || 0), 0);
  const totalHarga = terisi.reduce((n, b) => n + (b.jumlah || 0) * (b.harga || 0), 0);

  const simpan = async () => {
    if (!bolehSimpan) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(susunMenunggu(tanggal, terisi, namaPengguna));
      setSukses(`Tercatat: ${terisi.length} pelanggan, ${totalTabung} tabung. Nomor tabung diisi di tab "Isi Nomor Tabung".`);
      setBaris([barisKosong()]);
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan catatan pengiriman.');
    } finally {
      setBusy(false);
    }
  };

  // --- Render ---
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
    if (!b.member) return null;
    if (b.hargaManual) return { teks: 'Diubah manual', warna: 'text-gray-400' };
    if (b.sumberHarga === 'PELANGGAN') return { teks: 'Harga pelanggan', warna: 'text-green-600' };
    if (b.sumberHarga === 'TARIF') return { teks: 'Tarif', warna: 'text-gray-400' };
    return { teks: 'Tarif belum ada, isi manual', warna: 'text-red-500' };
  };

  const mundur = !!tanggal && tanggal < hariIni();
  const opsiJenis = jenisList.length > 0 ? jenisList : [awal];

  return (
    <div ref={wadah} className="max-w-5xl mx-auto space-y-4 md:space-y-5">
      {sukses && (
        <div className="fixed top-16 md:top-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 bg-green-600 text-white w-[92vw] md:w-auto md:max-w-[90vw]">
          <span className="material-icons text-lg">check_circle</span>
          <span className="font-medium text-sm">{sukses}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4 md:p-6">
        <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4">
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
            <span className="md:hidden">Nomor tabung diisi malam hari.</span>
            <span className="hidden md:inline">
              Catat pelanggan dan jumlah tabung yang dikirim. Nomor tabung diisi nanti malam di tab
              "Isi Nomor Tabung"; baru saat itu stok dan pemasukan tercatat.
            </span>
          </p>
        </div>

        {mundur && (
          <div className="mt-3 md:mt-4 flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2 text-xs font-medium">
            <span className="material-icons text-base">history</span>
            Laporan dicatat mundur ke tanggal ini, bukan hari ini.
          </div>
        )}
        {!tanggal && <p className="mt-3 text-xs font-medium text-red-600">Tanggal laporan wajib diisi.</p>}
      </div>

      <div className="lg:bg-white lg:rounded-2xl lg:shadow-sm lg:border lg:border-gray-100 lg:p-6">
        <div className={`hidden lg:grid ${GRID} gap-3 mb-2`}>
          <span />
          <span className={labelClass}>Nama Pelanggan</span>
          <span className={labelClass}>Jenis</span>
          <span className={labelClass}>Jumlah</span>
          <span className={labelClass}>Harga / Tabung</span>
          <span className={labelClass}>Bayar</span>
          <span />
        </div>

        <div className="space-y-3">
          {baris.map((b, i) => {
            const ket = keteranganHarga(b);
            const terakhir = i === baris.length - 1;

            return (
              <div
                key={b.kunci}
                className="bg-white lg:bg-transparent rounded-2xl lg:rounded-none shadow-sm lg:shadow-none border border-gray-100 lg:border-0 p-4 lg:p-0"
              >
                <div className={`grid grid-cols-2 ${GRID} gap-x-3 gap-y-3 lg:items-start`}>
                  {/* Nomor: kepala kartu di HP (dengan tombol hapus), kolom pertama di desktop. */}
                  <div className="lg:hidden order-1 col-span-2 flex items-center justify-between -mb-1">
                    <span className="text-xs font-bold text-gray-400 uppercase">Pengiriman {i + 1}</span>
                    <button
                      type="button"
                      onClick={() => hapusBaris(b.kunci)}
                      aria-label={`Hapus baris ${i + 1}`}
                      className="-mr-2 -my-2 h-11 w-11 flex items-center justify-center rounded-lg text-gray-400 active:text-red-600 active:bg-red-50"
                    >
                      <span className="material-icons text-xl">delete_outline</span>
                    </button>
                  </div>
                  <span className="hidden lg:flex lg:order-1 h-[38px] items-center justify-center text-xs font-bold text-gray-400">{i + 1}</span>

                  <div data-pelanggan={b.kunci} className="order-2 col-span-2 lg:col-span-1">
                    <KotakSaran
                      nilai={b.pelangganTeks}
                      onUbah={t => ketikPelanggan(b.kunci, t)}
                      saran={saranPelanggan(b)}
                      onPilih={key => {
                        const m = members.find(x => x.id === key);
                        if (m) pilihPelanggan(b.kunci, m);
                      }}
                      terpilih={!!b.member}
                      enterKeyHint="next"
                      placeholder="Ketik nama pelanggan"
                    />
                  </div>

                  <div className="order-6 lg:order-3 col-span-1">
                    <label className={`${labelClass} lg:hidden`}>Jenis</label>
                    <select
                      value={`${b.gasType}|${b.size}`}
                      onChange={e => gantiJenis(b.kunci, e.target.value)}
                      className={inputClass}
                    >
                      {opsiJenis.map(j => (
                        <option key={`${j.gasType}|${j.size}`} value={`${j.gasType}|${j.size}`}>{j.gasType} {j.size}</option>
                      ))}
                    </select>
                  </div>

                  <div className="order-3 lg:order-4 col-span-1">
                    <label className={`${labelClass} lg:hidden`}>Jumlah</label>
                    <div className="flex items-stretch gap-1.5">
                      <button
                        type="button"
                        onClick={() => setJumlah(b.kunci, (b.jumlah || 0) - 1)}
                        disabled={(b.jumlah || 0) <= 1}
                        aria-label="Kurangi jumlah"
                        className="lg:hidden shrink-0 h-[50px] w-11 rounded-lg border border-gray-300 bg-gray-50 text-gray-600 active:bg-gray-200 disabled:opacity-30 flex items-center justify-center"
                      >
                        <span className="material-icons text-xl">remove</span>
                      </button>
                      <input
                        type="number"
                        min={1}
                        inputMode="numeric"
                        value={b.jumlah || ''}
                        onChange={e => setJumlah(b.kunci, Number(e.target.value))}
                        onKeyDown={e => {
                          // Enter di baris terakhir yang sudah lengkap membuka baris berikutnya,
                          // supaya pencatatan siang tidak perlu menyentuh mouse.
                          if (e.key === 'Enter' && terakhir && b.member && b.jumlah >= 1) {
                            e.preventDefault();
                            tambahBaris();
                          }
                        }}
                        className={`${inputClass} min-w-0 text-center lg:text-right font-mono ${tanpaSpinner}`}
                      />
                      <button
                        type="button"
                        onClick={() => setJumlah(b.kunci, (b.jumlah || 0) + 1)}
                        aria-label="Tambah jumlah"
                        className="lg:hidden shrink-0 h-[50px] w-11 rounded-lg border border-gray-300 bg-gray-50 text-gray-600 active:bg-gray-200 flex items-center justify-center"
                      >
                        <span className="material-icons text-xl">add</span>
                      </button>
                    </div>
                  </div>

                  <div className="order-4 lg:order-5 col-span-1">
                    <label className={`${labelClass} lg:hidden`}>Harga / Tabung</label>
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={b.harga === 0 ? '' : b.harga}
                      placeholder="0"
                      onChange={e => ubah(b.kunci, { harga: Math.max(0, Number(e.target.value) || 0), hargaManual: true })}
                      className={`${inputClass} text-right font-mono ${tanpaSpinner}`}
                    />
                    {ket && <p className={`mt-1 text-[11px] text-right ${ket.warna}`}>{ket.teks}</p>}
                  </div>

                  {/* Bayar: tiga tombol satu ketukan di HP, pilihan biasa di desktop. */}
                  <div className="lg:hidden order-5 col-span-2">
                    <div className="grid grid-cols-3 gap-1 bg-gray-100 p-1 rounded-xl" role="group" aria-label="Cara bayar">
                      {CARA_BAYAR.map(c => {
                        const aktif = b.caraBayar === c.id;
                        const warna = !aktif
                          ? 'text-gray-500'
                          : c.id === 'BON' ? 'bg-amber-500 text-white shadow-sm' : 'bg-white text-indigo-600 shadow-sm';
                        return (
                          <button
                            key={c.id}
                            type="button"
                            aria-pressed={aktif}
                            onClick={() => ubah(b.kunci, { caraBayar: c.id })}
                            className={`h-11 rounded-lg text-sm font-bold transition-all ${warna}`}
                          >
                            {c.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="hidden lg:block lg:order-6">
                    <select
                      value={b.caraBayar}
                      onChange={e => ubah(b.kunci, { caraBayar: e.target.value as CaraBayarPengiriman })}
                      className={`${inputClass} ${b.caraBayar === 'BON' ? 'border-amber-400 bg-amber-50 text-amber-800 font-bold' : ''}`}
                    >
                      {CARA_BAYAR.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>

                  <div className="lg:hidden order-7 col-span-1 flex flex-col items-end justify-center">
                    <span className="text-[11px] text-gray-400 uppercase font-bold">Subtotal</span>
                    <span className="font-mono font-bold text-gray-900">{formatIDR((b.jumlah || 0) * (b.harga || 0))}</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => hapusBaris(b.kunci)}
                    aria-label={`Hapus baris ${i + 1}`}
                    className="hidden lg:flex lg:order-7 h-[38px] w-10 items-center justify-center rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <span className="material-icons text-lg">delete_outline</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={tambahBaris}
          className="mt-3 lg:mt-4 w-full lg:w-auto h-12 lg:h-auto justify-center lg:justify-start rounded-xl lg:rounded-none border border-dashed border-indigo-300 lg:border-0 bg-indigo-50/50 lg:bg-transparent flex items-center gap-1.5 text-sm font-bold text-indigo-600 hover:text-indigo-800"
        >
          <span className="material-icons text-lg">add_circle_outline</span>
          Tambah baris
        </button>

        <div className="hidden lg:flex mt-6 pt-4 border-t border-gray-100 flex-col items-end gap-1">
          <div className="flex items-baseline gap-4">
            <span className="text-sm font-bold text-gray-500 uppercase">Total ({totalTabung} tabung)</span>
            <span className="text-2xl font-bold text-gray-900 font-mono">{formatIDR(totalHarga)}</span>
          </div>
        </div>
      </div>

      {/*
        Bar simpan. Di HP `fixed` tepat di atas bottom-nav (tinggi sekitar 84px) dan di atas
        tombol chatbot yang melayang. Bukan `sticky`: area gulir di dalam Layout tidak pernah
        benar-benar menggulir (tingginya mengikuti isi, dokumenlah yang menggulir), sehingga
        sticky tidak aktif. Spacer di bawahnya menjaga isi terakhir tidak tertutup bar.
        Di desktop berupa baris biasa.
      */}
      <div className="md:hidden h-28" aria-hidden="true" />
      <div className="fixed bottom-[84px] left-3 right-3 md:static z-20 bg-white md:bg-transparent rounded-2xl md:rounded-none shadow-[0_-4px_16px_rgba(0,0,0,0.12)] md:shadow-none border border-gray-200 md:border-0 p-3 md:p-0 space-y-2 md:space-y-3">
        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-lg px-3 py-2 text-sm">
            <span className="material-icons text-base mt-0.5">error</span>
            <span>{error}</span>
          </div>
        )}

        {!busy && pesan && <p className="text-xs text-gray-500 lg:hidden">{pesan}</p>}

        <div className="flex items-center gap-3">
          <div className="lg:hidden min-w-0 flex-1">
            <div className="text-[11px] text-gray-400 uppercase font-bold">{totalTabung} tabung</div>
            <div className="text-lg font-bold font-mono text-gray-900 truncate">{formatIDR(totalHarga)}</div>
          </div>
          <button
            type="button"
            onClick={simpan}
            disabled={!bolehSimpan}
            className="flex-1 lg:flex-none h-12 md:h-auto md:py-3 px-6 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center justify-center gap-2"
          >
            <span className="material-icons text-lg">save</span>
            {busy ? 'Menyimpan...' : 'Simpan Catatan'}
          </button>
          {!busy && pesan && <span className="hidden lg:inline text-xs text-gray-500">{pesan}</span>}
        </div>
      </div>
    </div>
  );
};

export default LaporanPengirimanForm;
