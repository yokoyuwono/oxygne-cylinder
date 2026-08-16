import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MetodeBayar, Transaction, UserRole } from '../types';
import { formatIDR, formatTanggal } from '../labels';
import { hariIni } from '../lib/laporanHarian';
import { bolehLihatKeuanganPenuh } from '../lib/peran';
import PilihMetodeBayar from './PilihMetodeBayar';

/** Uang masuk yang tidak lewat tabung, dan uang keluar di luar isi ulang. */
export type JenisKas = 'INCOME' | 'EXPENSE';

export interface KasPayload {
  jenis: JenisKas;
  description: string;
  amount: number;
  date: string;

  /**
   * Pos belanja, hanya terisi kalau pengeluarannya dicatat dari tab Keuangan.
   * Halaman ini sengaja tidak menanyakannya -- lihat lib/pengeluaran.ts.
   */
  kategori?: string;

  /**
   * Tunai atau transfer, hanya untuk sisi Uang Masuk.
   *
   * Uang Keluar tidak ditanyai: yang dipisah di Laporan Harian baru sisi pemasukan,
   * dan menambah satu pilihan yang belum dipakai laporan mana pun cuma memperlambat
   * pencatatan belanja harian.
   */
  metodeBayar?: MetodeBayar;
}

interface KasViewProps {
  transactions: Transaction[];
  role?: UserRole;
  onSubmit: (payload: KasPayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
const labelClass = 'block text-xs font-bold text-gray-500 uppercase mb-1.5';

const BATAS_RIWAYAT = 10;

/**
 * Dua sisi kas harian yang sama-sama cuma keterangan dan nominal.
 *
 * PEMASUKAN menampung barang yang dijual putus dan tidak punya alur sendiri: selang
 * regulator, kran oksigen, mur baut. Alur sewa dan tukar isi tidak bisa dipakai untuk
 * itu -- keduanya menuntut tabung atau ukuran botol, sementara barang-barang ini tidak
 * punya keduanya dan tidak pernah kembali.
 *
 * PENGELUARAN menampung belanja operasional harian -- galon air, ATK, solar mobil.
 *
 * Keduanya sengaja hanya keterangan dan nominal: yang dijual dan yang dibeli terlalu
 * beragam untuk dipaksa masuk kategori, dan mengetik satu kalimat lebih cepat daripada
 * memilih dari daftar yang tidak pernah pas. Karena bentuk isiannya persis sama,
 * keduanya satu halaman dengan dua tab, bukan dua menu yang berjauhan di samping.
 *
 * Daftar di bawah form hanya untuk memastikan yang barusan diketik memang tersimpan,
 * bukan rekap -- totalnya ada di halaman Laporan.
 */
const KONFIG: Record<JenisKas, {
  judul: string;
  penjelasan: string;
  contoh: string;
  tombol: string;
  ikon: string;
  warnaNominal: string;
  warnaTombol: string;
  kosong: string;
}> = {
  INCOME: {
    judul: 'Uang Masuk',
    penjelasan: 'Penjualan lepas di luar sewa dan tukar isi — selang regulator, kran oksigen, dan sejenisnya.',
    contoh: 'Contoh: Selang regulator 2 meter',
    tombol: 'Catat Pemasukan',
    ikon: 'trending_up',
    warnaNominal: 'text-green-600',
    warnaTombol: 'bg-green-600 hover:bg-green-700',
    kosong: 'Belum ada pemasukan lain yang dicatat.',
  },
  EXPENSE: {
    judul: 'Uang Keluar',
    penjelasan: 'Belanja operasional di luar isi ulang gas — galon air, ATK, solar mobil, dan sejenisnya.',
    contoh: 'Contoh: Galon air 2 buah',
    tombol: 'Catat Pengeluaran',
    ikon: 'trending_down',
    warnaNominal: 'text-red-600',
    warnaTombol: 'bg-indigo-600 hover:bg-indigo-700',
    kosong: 'Belum ada pengeluaran yang dicatat.',
  },
};

/** Tab dibaca dari URL supaya tautan seperti /kas?jenis=keluar langsung membuka sisi yang benar. */
const dariUrl = (nilai: string | null): JenisKas => (nilai === 'keluar' ? 'EXPENSE' : 'INCOME');
const keUrl = (jenis: JenisKas) => (jenis === 'EXPENSE' ? 'keluar' : 'masuk');

const KasView: React.FC<KasViewProps> = ({ transactions, role, onSubmit, onDelete }) => {
  const [paramUrl, setParamUrl] = useSearchParams();
  const jenis = dariUrl(paramUrl.get('jenis'));
  const konfig = KONFIG[jenis];

  const [keterangan, setKeterangan] = useState('');
  const [nominal, setNominal] = useState('');
  const [tanggal, setTanggal] = useState(hariIni);
  const [metodeBayar, setMetodeBayar] = useState<MetodeBayar>('CASH');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [akanDihapus, setAkanDihapus] = useState<Transaction | null>(null);

  // Menghapus catatan kas ditahan di Administrator -- salah ketik memang perlu bisa
  // dibetulkan, tapi bukan oleh orang yang mencatat uangnya sendiri.
  const bolehHapus = bolehLihatKeuanganPenuh(role);

  const riwayat = useMemo(
    () => transactions
      .filter(t => t.type === jenis)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, BATAS_RIWAYAT),
    [transactions, jenis]);

  const gantiJenis = (baru: JenisKas) => {
    if (baru === jenis) return;
    setParamUrl({ jenis: keUrl(baru) }, { replace: true });
    // Isian dikosongkan: kalimat yang sudah diketik untuk satu sisi hampir tidak
    // pernah benar untuk sisi lainnya, dan menyisakannya mengundang salah catat arah.
    setKeterangan('');
    setNominal('');
    setMetodeBayar('CASH');
    setFeedback(null);
  };

  const jumlah = Number(nominal) || 0;
  const siap = keterangan.trim().length > 0 && jumlah > 0 && Boolean(tanggal);

  const simpan = async () => {
    if (!siap || busy) return;

    setBusy(true);
    try {
      await onSubmit({
        jenis,
        description: keterangan.trim(),
        amount: jumlah,
        date: new Date(tanggal).toISOString(),
        // Uang Keluar tidak punya pemilihnya, jadi tidak dibawa sama sekali.
        metodeBayar: jenis === 'INCOME' ? metodeBayar : undefined,
      });
      setFeedback({ msg: `${konfig.judul} ${formatIDR(jumlah)} tercatat.`, type: 'success' });
      setKeterangan('');
      setNominal('');
      // Kembali ke Tunai, sama seperti isian lain. Pilihan yang menempel dari catatan
      // sebelumnya adalah cara paling mudah menandai pembayaran tunai jadi transfer.
      setMetodeBayar('CASH');
      setTimeout(() => setFeedback(null), 3500);
    } catch (e) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Gagal menyimpan.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const hapus = async () => {
    if (!akanDihapus) return;
    try {
      await onDelete(akanDihapus.id);
      setFeedback({ msg: 'Catatan dihapus.', type: 'success' });
      setTimeout(() => setFeedback(null), 3500);
    } catch (e) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Gagal menghapus.', type: 'error' });
    } finally {
      setAkanDihapus(null);
    }
  };

  const tabClass = (milik: JenisKas) =>
    `flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all ${
      jenis === milik ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in-up pb-20 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Uang Masuk &amp; Keluar</h1>
        <p className="text-gray-500 text-sm">{konfig.penjelasan}</p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl border border-gray-200 max-w-md">
        <button onClick={() => gantiJenis('INCOME')} className={tabClass('INCOME')}>
          <span className="material-icons text-lg text-green-600">trending_up</span>
          Uang Masuk
        </button>
        <button onClick={() => gantiJenis('EXPENSE')} className={tabClass('EXPENSE')}>
          <span className="material-icons text-lg text-red-500">trending_down</span>
          Uang Keluar
        </button>
      </div>

      {feedback && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${feedback.type === 'success' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
          {feedback.msg}
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass} htmlFor="keterangan">Keterangan</label>
            <input
              id="keterangan"
              type="text"
              value={keterangan}
              onChange={e => setKeterangan(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') simpan(); }}
              className={inputClass}
              placeholder={konfig.contoh}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="tanggal-kas">Tanggal</label>
            <input
              id="tanggal-kas"
              type="date"
              value={tanggal}
              max={hariIni()}
              onChange={e => setTanggal(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {jenis === 'INCOME' && (
          <PilihMetodeBayar nilai={metodeBayar} onGanti={setMetodeBayar} />
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2">
            <label className={labelClass} htmlFor="nominal">Nominal</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500 text-sm">Rp</span>
              <input
                id="nominal"
                type="number"
                min={0}
                value={nominal}
                onChange={e => setNominal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') simpan(); }}
                className={`${inputClass} pl-10 font-bold text-lg`}
                placeholder="0"
              />
            </div>
          </div>
          <button
            onClick={simpan}
            disabled={!siap || busy}
            className={`w-full py-3 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${konfig.warnaTombol}`}
          >
            <span className="material-icons text-lg">{busy ? 'hourglass_top' : 'save'}</span>
            {busy ? 'Menyimpan...' : konfig.tombol}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">{konfig.judul} Terakhir</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {BATAS_RIWAYAT} catatan terbaru. Rekap totalnya ada di halaman Laporan.
          </p>
        </div>

        {riwayat.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-5 py-2 font-medium w-32">Tanggal</th>
                  <th className="px-5 py-2 font-medium">Keterangan</th>
                  <th className="px-5 py-2 font-medium text-right">Nominal</th>
                  {bolehHapus && <th className="px-5 py-2 w-12"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {riwayat.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{formatTanggal(t.date)}</td>
                    <td className="px-5 py-3 text-gray-800">{t.description || '-'}</td>
                    <td className={`px-5 py-3 text-right font-bold whitespace-nowrap ${konfig.warnaNominal}`}>{formatIDR(t.cost || 0)}</td>
                    {bolehHapus && (
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => setAkanDihapus(t)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          title="Hapus"
                        >
                          <span className="material-icons text-lg align-middle">delete_outline</span>
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-10 text-center">
            <span className="material-icons text-4xl text-gray-200 mb-2 block">{konfig.ikon}</span>
            <p className="text-sm text-gray-400">{konfig.kosong}</p>
          </div>
        )}
      </div>

      {akanDihapus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in-up">
            <div className="p-6 text-center">
              <span className="material-icons text-4xl text-red-500 mb-3 block">delete_forever</span>
              <h3 className="font-bold text-gray-800 mb-2">Hapus Catatan Ini?</h3>
              <p className="text-sm text-gray-600 mb-6">
                <strong>{akanDihapus.description}</strong> sebesar {formatIDR(akanDihapus.cost || 0)} akan dihapus dari laporan.
              </p>
              <div className="flex justify-center gap-3">
                <button onClick={() => setAkanDihapus(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
                <button onClick={hapus} className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">Hapus</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default KasView;
