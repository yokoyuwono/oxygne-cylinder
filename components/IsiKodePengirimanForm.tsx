import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Cylinder, Member, PengirimanMenunggu, RefillPrice, RentalTariff, Transaction } from '../types';
import { formatIDR, formatTanggal } from '../labels';
import { hariIni } from '../lib/laporanHarian';
import {
  PenyelesaianPengiriman,
  biayaIsiPabrik,
  cariTabung,
  cocokkanKode,
  kodeLengkap,
  tabungBisaDikirim,
  tabungDiPabrik,
  uraiKode,
} from '../lib/laporanPengiriman';
import KotakSaran, { Saran } from './KotakSaran';

interface IsiKodePengirimanFormProps {
  menunggu: PengirimanMenunggu[];
  members: Member[];
  cylinders: Cylinder[];
  tariffs: RentalTariff[];
  transactions: Transaction[];
  refillPrices: RefillPrice[];
  onSelesaikan: (penyelesaian: PenyelesaianPengiriman[]) => Promise<void>;
  onHapus: (id: string) => Promise<void>;
}

/** Yang sudah diketik malam ini untuk satu catatan. Hanya hidup di layar. */
interface IsianKartu {
  tabungIds: string[];
  teks: string;
  galat: string[];
  biaya: Record<string, number>;
  biayaTidakKetemu: Record<string, boolean>;
}

const KOSONG: IsianKartu = { tabungIds: [], teks: '', galat: [], biaya: {}, biayaTidakKetemu: {} };

const LABEL_BAYAR: Record<string, string> = { CASH: 'Tunai', TRANSFER: 'Transfer', BON: 'Bon' };

const namaPelanggan = (m?: Member) => (m ? m.companyName || m.name : 'Pelanggan tidak ditemukan');

/** Selisih hari kalender antara tanggal laporan dan hari ini; positif bila laporan sudah lewat. */
const hariLewat = (tanggal: string) =>
  Math.round((new Date(`${hariIni()}T00:00`).getTime() - new Date(`${tanggal}T00:00`).getTime()) / 86400000);

/**
 * Isi nomor tabung malam hari untuk pengiriman yang dicatat siang.
 *
 * Tiap kartu satu catatan: ketik atau pindai kode lalu Enter (atau ketuk Tambah di HP),
 * kodenya jadi chip dan kotak kosong lagi untuk kode berikutnya. Menempel banyak kode
 * sekaligus juga bisa. Kartu baru bisa disimpan ketika jumlah kodenya persis sama dengan
 * jumlah tabung; yang belum lengkap tetap menunggu, bahkan sampai besok.
 *
 * Begitu sebuah kartu lengkap, fokus pindah ke kartu berikutnya yang belum lengkap, jadi
 * seluruh daftar bisa diisi beruntun tanpa mencari kotaknya satu per satu.
 */
const IsiKodePengirimanForm: React.FC<IsiKodePengirimanFormProps> = ({
  menunggu, members, cylinders, tariffs, transactions, refillPrices, onSelesaikan, onHapus,
}) => {
  // --- State ---
  const [kartu, setKartu] = useState<Record<string, IsianKartu>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sukses, setSukses] = useState<string | null>(null);
  const [hapusId, setHapusId] = useState<string | null>(null);
  /** Id kartu yang baru saja lengkap; fokus berpindah ke kartu sesudahnya. */
  const [selesaiBaru, setSelesaiBaru] = useState<string | null>(null);
  const wadah = useRef<HTMLDivElement>(null);

  const bisaDikirim = useMemo(() => tabungBisaDikirim(cylinders, tariffs), [cylinders, tariffs]);

  const urut = useMemo(
    () => [...menunggu].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || (a.createdAt || '').localeCompare(b.createdAt || '')),
    [menunggu]
  );

  // --- Effects ---
  useEffect(() => {
    if (!sukses) return;
    const t = setTimeout(() => setSukses(null), 3500);
    return () => clearTimeout(t);
  }, [sukses]);

  // Catatan yang hilang dari daftar (selesai di perangkat lain, dihapus) tidak boleh
  // meninggalkan isian yatim yang memakai kode tabung.
  useEffect(() => {
    const ada = new Set(menunggu.map(m => m.id));
    setKartu(prev => {
      const sisa = Object.fromEntries(Object.entries(prev).filter(([id]) => ada.has(id)));
      return Object.keys(sisa).length === Object.keys(prev).length ? prev : sisa;
    });
  }, [menunggu]);

  // Kartu baru saja lengkap: pindahkan fokus ke kotak kode kartu berikutnya yang belum
  // lengkap (menyambung ke awal bila sudah di ujung). Hanya dipicu dari ketikan pengguna,
  // bukan saat halaman dibuka, supaya keyboard layar tidak muncul sendiri.
  useEffect(() => {
    if (!selesaiBaru) return;
    setSelesaiBaru(null);

    const awal = urut.findIndex(m => m.id === selesaiBaru);
    const kandidat = [...urut.slice(awal + 1), ...urut.slice(0, Math.max(awal, 0))];
    const berikut = kandidat.find(m => (kartu[m.id]?.tabungIds.length ?? 0) < m.jumlah);
    if (!berikut) return;

    const input = wadah.current?.querySelector<HTMLInputElement>(`[data-kartu="${berikut.id}"] input`);
    input?.focus();
    input?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [selesaiBaru, urut, kartu]);

  // --- Handlers ---
  const isian = (id: string): IsianKartu => kartu[id] ?? KOSONG;

  const idTerpakaiSemua = Object.values(kartu).flatMap(k => k.tabungIds);

  const ubahKartu = (id: string, patch: (k: IsianKartu) => IsianKartu) =>
    setKartu(prev => ({ ...prev, [id]: patch(prev[id] ?? KOSONG) }));

  /** Proses satu ketikan atau tempelan: tiap kode dicocokkan, yang gagal jadi galat. */
  const prosesKode = (m: PengirimanMenunggu, teks: string) => {
    const token = uraiKode(teks);
    if (token.length === 0) {
      ubahKartu(m.id, k => ({ ...k, teks: '' }));
      return;
    }

    const sekarang = isian(m.id);
    const terpakai = [...idTerpakaiSemua];
    const ids = [...sekarang.tabungIds];
    const biaya = { ...sekarang.biaya };
    const tidakKetemu = { ...sekarang.biayaTidakKetemu };
    const galat: string[] = [];

    for (const kode of token) {
      if (ids.length >= m.jumlah) {
        galat.push(`${kode}: jumlah tabung sudah lengkap (${m.jumlah}).`);
        continue;
      }
      const hasil = cocokkanKode(kode, cylinders, { gasType: m.gasType, size: m.size }, terpakai);
      if ('galat' in hasil) {
        galat.push(hasil.galat);
        continue;
      }
      const t = hasil.tabung;
      ids.push(t.id);
      terpakai.push(t.id);
      if (tabungDiPabrik(t)) {
        const b = biayaIsiPabrik(t, transactions, refillPrices);
        biaya[t.id] = b ?? 0;
        tidakKetemu[t.id] = b === null;
      }
    }

    ubahKartu(m.id, () => ({ tabungIds: ids, teks: '', galat, biaya, biayaTidakKetemu: tidakKetemu }));
    if (ids.length === m.jumlah && sekarang.tabungIds.length < m.jumlah) setSelesaiBaru(m.id);
  };

  const lepasKode = (id: string, tabungId: string) =>
    ubahKartu(id, k => ({ ...k, tabungIds: k.tabungIds.filter(x => x !== tabungId), galat: [] }));

  const ketik = (m: PengirimanMenunggu, teks: string) => {
    // Spasi, koma, atau titik koma sesudah kode berarti "kode ini sudah selesai".
    if (/[\s,;]$/.test(teks) && teks.trim()) prosesKode(m, teks);
    else ubahKartu(m.id, k => ({ ...k, teks }));
  };

  const bangun = (m: PengirimanMenunggu): PenyelesaianPengiriman | null => {
    const member = members.find(x => x.id === m.memberId);
    const k = isian(m.id);
    if (!member) return null;
    return {
      menunggu: m,
      member,
      tabung: k.tabungIds.map(id => cylinders.find(c => c.id === id)).filter((c): c is Cylinder => !!c),
      biayaIsi: k.biaya,
    };
  };

  const lengkapSemua = urut.map(bangun).filter((p): p is PenyelesaianPengiriman => !!p && kodeLengkap(p));

  const selesaikan = async (daftar: PenyelesaianPengiriman[]) => {
    if (busy || daftar.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await onSelesaikan(daftar);
      const jumlah = daftar.reduce((n, p) => n + p.tabung.length, 0);
      setSukses(`Tersimpan: ${daftar.length} pelanggan, ${jumlah} tabung.`);
      setKartu(prev => {
        const sisa = { ...prev };
        daftar.forEach(p => delete sisa[p.menunggu.id]);
        return sisa;
      });
    } catch (e: any) {
      setError(e?.message || 'Gagal menyimpan nomor tabung.');
    } finally {
      setBusy(false);
    }
  };

  const hapus = async (id: string) => {
    setBusy(true);
    setError(null);
    try {
      await onHapus(id);
      setHapusId(null);
      setKartu(prev => {
        const sisa = { ...prev };
        delete sisa[id];
        return sisa;
      });
    } catch (e: any) {
      setError(e?.message || 'Gagal menghapus catatan.');
    } finally {
      setBusy(false);
    }
  };

  // --- Render ---
  const saranKode = (m: PengirimanMenunggu): Saran[] => {
    const k = isian(m.id);
    if (k.tabungIds.length >= m.jumlah) return [];
    return cariTabung(bisaDikirim, k.teks, idTerpakaiSemua, { gasType: m.gasType, size: m.size }).map(c => ({
      key: c.id,
      label: c.serialCode,
      detail: `${c.gasType} ${c.size}`,
      badge: tabungDiPabrik(c) ? 'Di pabrik' : 'Tersedia',
      badgePeringatan: tabungDiPabrik(c),
    }));
  };

  if (urut.length === 0) {
    return (
      <div className="max-w-5xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-8 md:p-10 text-center">
        <span className="material-icons text-4xl text-green-500">task_alt</span>
        <p className="mt-2 font-bold text-gray-800">Tidak ada pengiriman yang menunggu nomor tabung</p>
        <p className="text-sm text-gray-500 mt-1">Catat pengiriman siang hari di tab "Catat Pengiriman".</p>
      </div>
    );
  }

  let tanggalSebelumnya = '';

  return (
    <div ref={wadah} className="max-w-5xl mx-auto space-y-3 md:space-y-4">
      {sukses && (
        <div className="fixed top-16 md:top-6 left-1/2 -translate-x-1/2 px-5 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 bg-green-600 text-white w-[92vw] md:w-auto md:max-w-[90vw]">
          <span className="material-icons text-lg">check_circle</span>
          <span className="font-medium text-sm">{sukses}</span>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-100 text-red-700 rounded-lg px-3 py-2 text-sm">
          <span className="material-icons text-base mt-0.5">error</span>
          <span>{error}</span>
        </div>
      )}

      {urut.map(m => {
        const member = members.find(x => x.id === m.memberId);
        const k = isian(m.id);
        const lengkap = k.tabungIds.length === m.jumlah;
        const kepala = m.tanggal !== tanggalSebelumnya;
        tanggalSebelumnya = m.tanggal;
        const lewat = hariLewat(m.tanggal);
        const penyelesaian = bangun(m);
        const sisa = m.jumlah - k.tabungIds.length;

        return (
          <React.Fragment key={m.id}>
            {kepala && (
              <div className="flex items-center gap-2 pt-2">
                <h3 className="text-sm font-bold text-gray-700">
                  {formatTanggal(`${m.tanggal}T00:00`, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </h3>
                {lewat > 0 && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                    Lewat {lewat} hari
                  </span>
                )}
              </div>
            )}

            <div
              data-kartu={m.id}
              className={`bg-white rounded-2xl shadow-sm border p-4 md:p-5 ${lengkap ? 'border-green-300' : 'border-gray-100'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-bold text-gray-900 leading-snug break-words">{namaPelanggan(member)}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {m.gasType} {m.size} · {m.jumlah} × {formatIDR(m.harga)}
                  </div>
                  <div className="text-xs mt-0.5 flex items-center gap-2">
                    <b className="text-gray-700">= {formatIDR(m.jumlah * m.harga)}</b>
                    <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] uppercase ${m.caraBayar === 'BON' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'}`}>
                      {LABEL_BAYAR[m.caraBayar] ?? m.caraBayar}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 -mr-2 md:mr-0 -mt-1 md:mt-0">
                  <span className={`text-sm font-mono font-bold px-2.5 py-1 rounded-lg ${lengkap ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {k.tabungIds.length}/{m.jumlah}
                  </span>
                  <button
                    type="button"
                    onClick={() => setHapusId(hapusId === m.id ? null : m.id)}
                    aria-label="Hapus catatan"
                    className="h-11 w-11 md:h-8 md:w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-red-600 active:text-red-600 hover:bg-red-50 active:bg-red-50"
                  >
                    <span className="material-icons text-xl md:text-lg">delete_outline</span>
                  </button>
                </div>
              </div>

              {hapusId === m.id && (
                <div className="mt-2 flex flex-col md:flex-row md:items-center gap-2 bg-red-50 border border-red-100 rounded-xl p-3">
                  <span className="text-sm font-bold text-red-700 md:flex-1">Hapus catatan pengiriman ini?</span>
                  <div className="grid grid-cols-2 md:flex gap-2">
                    <button type="button" onClick={() => setHapusId(null)} className="h-11 md:h-9 md:px-4 rounded-lg bg-white border border-gray-200 text-gray-600 font-bold text-sm">
                      Batal
                    </button>
                    <button type="button" disabled={busy} onClick={() => hapus(m.id)} className="h-11 md:h-9 md:px-4 rounded-lg bg-red-600 text-white font-bold text-sm disabled:opacity-50">
                      Ya, hapus
                    </button>
                  </div>
                </div>
              )}

              {k.tabungIds.length > 0 && (
                <div className="mt-3 flex flex-col md:flex-row md:flex-wrap gap-2">
                  {k.tabungIds.map(id => {
                    const t = cylinders.find(c => c.id === id);
                    if (!t) return null;
                    const pabrik = tabungDiPabrik(t);
                    return (
                      <div
                        key={id}
                        className={`rounded-lg border px-3 py-1.5 text-sm ${pabrik ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'}`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-gray-800">{t.serialCode}</span>
                          {pabrik && <span className="text-[10px] font-bold text-amber-700">Di pabrik</span>}
                          <button
                            type="button"
                            onClick={() => lepasKode(m.id, id)}
                            aria-label={`Lepas ${t.serialCode}`}
                            className="ml-auto -mr-2.5 -my-2 md:my-0 md:mr-0 h-11 w-11 md:h-6 md:w-6 flex items-center justify-center text-gray-400 hover:text-red-600 active:text-red-600"
                          >
                            <span className="material-icons text-xl md:text-base">close</span>
                          </button>
                        </div>
                        {pabrik && (
                          <div className="mt-1 pb-1">
                            <label className="flex items-center gap-2 text-xs md:text-[11px] text-amber-800">
                              Biaya isi
                              <input
                                type="number"
                                min={0}
                                inputMode="numeric"
                                value={k.biaya[id] ? k.biaya[id] : ''}
                                placeholder="0"
                                onChange={e => ubahKartu(m.id, x => ({
                                  ...x,
                                  biaya: { ...x.biaya, [id]: Math.max(0, Number(e.target.value) || 0) },
                                  biayaTidakKetemu: { ...x.biayaTidakKetemu, [id]: false },
                                }))}
                                className="flex-1 md:flex-none md:w-24 h-11 md:h-auto border border-amber-200 bg-white rounded-lg md:rounded px-2 md:px-1.5 md:py-0.5 text-base md:text-sm text-right font-mono outline-none focus:ring-2 focus:ring-amber-400"
                              />
                            </label>
                            {k.biayaTidakKetemu[id] && (
                              <div className="text-xs md:text-[11px] text-red-600 font-medium mt-1 md:mt-0.5">
                                Harga vendor tidak ketemu, isi sendiri. Kosong berarti Rp 0.
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {!lengkap && (
                <div className="mt-3">
                  <KotakSaran
                    kode
                    nilai={k.teks}
                    onUbah={t => ketik(m, t)}
                    saran={saranKode(m)}
                    onPilih={key => {
                      const c = cylinders.find(x => x.id === key);
                      if (c) prosesKode(m, c.serialCode);
                    }}
                    onEnterKosong={() => prosesKode(m, k.teks)}
                    onTempel={t => prosesKode(m, t)}
                    enterKeyHint="done"
                    aksi={{ ikon: 'add', label: 'Tambah', onKlik: () => prosesKode(m, k.teks) }}
                    placeholder="Ketik atau pindai kode"
                  />
                  <p className="mt-1.5 text-xs text-gray-400">
                    {sisa} kode lagi. Beberapa kode sekaligus: pisahkan dengan spasi atau tempel.
                  </p>
                </div>
              )}

              {k.galat.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {k.galat.map((g, i) => (
                    <li key={i} className="text-xs font-medium text-red-600 flex items-start gap-1">
                      <span className="material-icons text-sm">error_outline</span>{g}
                    </li>
                  ))}
                </ul>
              )}

              {lengkap && (
                <div className="mt-3 flex items-center justify-end">
                  <button
                    type="button"
                    disabled={busy || !penyelesaian}
                    onClick={() => penyelesaian && selesaikan([penyelesaian])}
                    className="w-full md:w-auto h-12 md:h-auto md:py-2 px-5 rounded-lg bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-gray-300 text-white font-bold text-sm flex items-center justify-center gap-1.5"
                  >
                    <span className="material-icons text-base">save</span>
                    {busy ? 'Menyimpan...' : 'Simpan'}
                  </button>
                </div>
              )}
            </div>
          </React.Fragment>
        );
      })}

      {/*
        Bar simpan semua. Di HP `fixed` tepat di atas bottom-nav (tinggi sekitar 84px) dan di
        atas tombol chatbot yang melayang. Bukan `sticky`: area gulir di dalam Layout tidak
        pernah benar-benar menggulir (tingginya mengikuti isi, dokumenlah yang menggulir),
        sehingga sticky tidak aktif. Spacer di bawahnya menjaga kartu terakhir tidak tertutup
        bar. Di desktop berupa baris biasa.
      */}
      <div className="md:hidden h-24" aria-hidden="true" />
      <div className="fixed bottom-[84px] left-3 right-3 md:static z-20 bg-white md:bg-transparent rounded-2xl md:rounded-none shadow-[0_-4px_16px_rgba(0,0,0,0.12)] md:shadow-none border border-gray-200 md:border-0 p-3 md:py-3 md:px-0 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-gray-800">{lengkapSemua.length} dari {urut.length} lengkap</div>
          <div className="hidden md:block text-xs text-gray-500">Yang belum lengkap tetap menunggu.</div>
        </div>
        <button
          type="button"
          disabled={busy || lengkapSemua.length === 0}
          onClick={() => selesaikan(lengkapSemua)}
          className="shrink-0 h-12 md:h-auto md:py-2.5 px-5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-bold text-sm flex items-center gap-2"
        >
          <span className="material-icons text-lg">done_all</span>
          {busy ? 'Menyimpan...' : (
            <>
              <span className="md:hidden">Simpan {lengkapSemua.length}</span>
              <span className="hidden md:inline">Simpan semua yang lengkap ({lengkapSemua.length})</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default IsiKodePengirimanForm;
