import React, { useMemo, useState } from 'react';
import { Transaction, UserRole } from '../types';
import { formatIDR, formatTanggal } from '../labels';
import { hariIni } from '../lib/laporanHarian';
import { bolehLihatKeuanganPenuh } from '../lib/peran';

export interface PengeluaranPayload {
  description: string;
  amount: number;
  date: string;
}

interface PengeluaranViewProps {
  transactions: Transaction[];
  role?: UserRole;
  onSubmit: (payload: PengeluaranPayload) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
const labelClass = 'block text-xs font-bold text-gray-500 uppercase mb-1.5';

const BATAS_RIWAYAT = 10;

/**
 * Belanja operasional harian -- galon air, ATK, tambahan solar mobil.
 *
 * Sengaja hanya keterangan dan nominal: yang dibeli terlalu beragam untuk dipaksa
 * masuk kategori, dan mengetik satu kalimat lebih cepat daripada memilih dari daftar
 * yang tidak pernah pas.
 *
 * Daftar di bawah form hanya untuk memastikan yang barusan diketik memang tersimpan,
 * bukan rekap -- totalnya ada di halaman Laporan.
 */
const PengeluaranView: React.FC<PengeluaranViewProps> = ({ transactions, role, onSubmit, onDelete }) => {
  const [keterangan, setKeterangan] = useState('');
  const [nominal, setNominal] = useState('');
  const [tanggal, setTanggal] = useState(hariIni);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [akanDihapus, setAkanDihapus] = useState<Transaction | null>(null);

  // Menghapus catatan pengeluaran ditahan di Administrator -- salah ketik memang
  // perlu bisa dibetulkan, tapi bukan oleh orang yang mencatat belanjanya sendiri.
  const bolehHapus = bolehLihatKeuanganPenuh(role);

  const riwayat = useMemo(
    () => transactions
      .filter(t => t.type === 'EXPENSE')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, BATAS_RIWAYAT),
    [transactions]);

  const jumlah = Number(nominal) || 0;
  const siap = keterangan.trim().length > 0 && jumlah > 0 && Boolean(tanggal);

  const simpan = async () => {
    if (!siap || busy) return;

    setBusy(true);
    try {
      await onSubmit({ description: keterangan.trim(), amount: jumlah, date: new Date(tanggal).toISOString() });
      setFeedback({ msg: `Pengeluaran ${formatIDR(jumlah)} tercatat.`, type: 'success' });
      setKeterangan('');
      setNominal('');
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
      setFeedback({ msg: 'Pengeluaran dihapus.', type: 'success' });
      setTimeout(() => setFeedback(null), 3500);
    } catch (e) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Gagal menghapus.', type: 'error' });
    } finally {
      setAkanDihapus(null);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in-up pb-20 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Pengeluaran</h1>
        <p className="text-gray-500 text-sm">
          Belanja operasional di luar isi ulang gas &mdash; galon air, ATK, solar mobil, dan sejenisnya.
        </p>
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
              placeholder="Contoh: Galon air 2 buah"
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="tanggal-pengeluaran">Tanggal</label>
            <input
              id="tanggal-pengeluaran"
              type="date"
              value={tanggal}
              max={hariIni()}
              onChange={e => setTanggal(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

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
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2"
          >
            <span className="material-icons text-lg">{busy ? 'hourglass_top' : 'save'}</span>
            {busy ? 'Menyimpan...' : 'Catat Pengeluaran'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-bold text-gray-800">Pengeluaran Terakhir</h2>
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
                    <td className="px-5 py-3 text-right font-bold text-red-600 whitespace-nowrap">{formatIDR(t.cost || 0)}</td>
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
            <span className="material-icons text-4xl text-gray-200 mb-2 block">receipt_long</span>
            <p className="text-sm text-gray-400">Belum ada pengeluaran yang dicatat.</p>
          </div>
        )}
      </div>

      {akanDihapus && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in-up">
            <div className="p-6 text-center">
              <span className="material-icons text-4xl text-red-500 mb-3 block">delete_forever</span>
              <h3 className="font-bold text-gray-800 mb-2">Hapus Pengeluaran?</h3>
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

export default PengeluaranView;
