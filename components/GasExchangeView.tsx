import React, { useState, useMemo } from 'react';
import { Member, RentalTariff, Transaction, CylinderSize, GasType, MetodeBayar } from '../types';
import { tarifCurahAktif } from '../lib/bulkStock';
import { formatTanggal } from '../labels';
import PilihMetodeBayar from './PilihMetodeBayar';

export interface GasExchangePayload {
  gasType: GasType;
  size: CylinderSize;
  quantity: number;
  pricePerUnit: number;
  memberId?: string;
  date: string;
  metodeBayar: MetodeBayar;
}

interface GasExchangeViewProps {
  tariffs: RentalTariff[];
  members: Member[];
  transactions: Transaction[];
  onSubmit: (payload: GasExchangePayload) => Promise<void>;
}

const hariIni = () => new Date().toISOString().slice(0, 10);

/**
 * Tukar isi tabung tanpa kode.
 *
 * Transaksi harian yang paling sering terjadi, jadi sengaja dibuat sesingkat
 * mungkin: tidak butuh pelanggan, tidak butuh kode tabung, tidak ada deposit.
 * Pembeli datang bawa botol kosong, bayar gasnya, pulang bawa yang penuh.
 *
 * Stok tidak berubah karena botolnya bertukar -- satu masuk, satu keluar.
 */
const GasExchangeView: React.FC<GasExchangeViewProps> = ({ tariffs, members, transactions, onSubmit }) => {
  const curah = useMemo(() => tarifCurahAktif(tariffs), [tariffs]);

  const [tarifId, setTarifId] = useState<string>(curah[0]?.id || '');
  const [jumlah, setJumlah] = useState(1);
  const [harga, setHarga] = useState<number>(Number(curah[0]?.gasPrice) || 0);
  const [tanggal, setTanggal] = useState(hariIni());
  const [metodeBayar, setMetodeBayar] = useState<MetodeBayar>('CASH');
  const [memberId, setMemberId] = useState('');
  const [cariMember, setCariMember] = useState('');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const formatIDR = (v: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v || 0);

  const tarif = curah.find(t => t.id === tarifId);

  const pilihTarif = (id: string) => {
    setTarifId(id);
    const t = curah.find(x => x.id === id);
    if (t) setHarga(Number(t.gasPrice) || 0);
  };

  const hasilCariMember = useMemo(() => {
    const q = cariMember.trim().toLowerCase();
    if (!q || memberId) return [];
    return members.filter(m => (m.name || '').toLowerCase().includes(q)).slice(0, 6);
  }, [cariMember, members, memberId]);

  const memberTerpilih = members.find(m => m.id === memberId);
  const total = harga * jumlah;

  const riwayat = useMemo(
    () => transactions
      .filter(t => t.type === 'GAS_EXCHANGE')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 8),
    [transactions]
  );

  const simpan = async () => {
    if (!tarif || jumlah < 1 || busy) return;
    setBusy(true);
    try {
      await onSubmit({
        gasType: tarif.gasType as GasType,
        size: tarif.size as CylinderSize,
        quantity: jumlah,
        pricePerUnit: harga,
        memberId: memberId || undefined,
        date: new Date(tanggal).toISOString(),
        metodeBayar,
      });
      setFeedback({ msg: `Tukar isi ${jumlah} botol tercatat.`, type: 'success' });
      setJumlah(1);
      setMemberId('');
      setCariMember('');
      // Jenis dan harga sengaja tetap -- pembeli berikutnya biasanya menukar yang sama.
      // Metode bayarnya tidak: yang menempel dari pembeli sebelumnya adalah cara paling
      // mudah menandai pembayaran tunai sebagai transfer.
      setMetodeBayar('CASH');
      setTimeout(() => setFeedback(null), 3500);
    } catch (e) {
      setFeedback({ msg: e instanceof Error ? e.message : 'Gagal menyimpan.', type: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
  const labelClass = 'block text-xs font-bold text-gray-500 uppercase mb-1.5';

  if (curah.length === 0) {
    return (
      <div className="max-w-xl mx-auto bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center animate-fade-in-up">
        <span className="material-icons text-5xl text-gray-300">swap_horiz</span>
        <h3 className="font-bold text-gray-800 mt-3">Belum ada ukuran tanpa kode</h3>
        <p className="text-sm text-gray-500 mt-2 max-w-sm mx-auto">
          Tukar isi hanya berlaku untuk ukuran yang botolnya tidak berkode. Buka Master Data
          Penyewaan, matikan centang &ldquo;Tabung berkode&rdquo; pada ukuran yang sesuai, lalu
          pastikan tarifnya aktif.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in-up pb-20 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Tukar Isi</h1>
        <p className="text-gray-500 text-sm">
          Untuk tabung tanpa kode. Tidak perlu pelanggan terdaftar &mdash; siapa pun boleh menukar isi.
        </p>
      </div>

      {feedback && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${feedback.type === 'success' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Jenis &amp; Ukuran</label>
              <select value={tarifId} onChange={e => pilihTarif(e.target.value)} className={inputClass}>
                {curah.map(t => (
                  <option key={t.id} value={t.id}>{t.gasType} {t.size}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Tanggal</label>
              <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Jumlah Botol</label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setJumlah(n => Math.max(1, n - 1))}
                  className="w-10 h-10 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600 flex items-center justify-center shrink-0"
                >
                  <span className="material-icons text-lg">remove</span>
                </button>
                <input
                  type="number"
                  min={1}
                  value={jumlah}
                  onChange={e => setJumlah(Math.max(1, Number(e.target.value) || 1))}
                  className={`${inputClass} text-center font-bold text-lg`}
                />
                <button
                  onClick={() => setJumlah(n => n + 1)}
                  className="w-10 h-10 rounded-lg border border-gray-300 hover:bg-gray-50 text-gray-600 flex items-center justify-center shrink-0"
                >
                  <span className="material-icons text-lg">add</span>
                </button>
              </div>
            </div>
            <div>
              <label className={labelClass}>Harga per Botol</label>
              <input
                type="number"
                min={0}
                step={1000}
                value={harga}
                onChange={e => setHarga(Number(e.target.value) || 0)}
                className={`${inputClass} font-mono`}
              />
              <p className="text-[11px] text-gray-400 mt-1">Terisi otomatis dari master data, boleh diubah.</p>
            </div>
          </div>

          <div className="pt-4 border-t border-gray-100 relative">
            <label className={labelClass}>Pelanggan (opsional)</label>
            <input
              value={cariMember}
              onChange={e => { setCariMember(e.target.value); setMemberId(''); }}
              className={inputClass}
              placeholder="Kosongkan kalau pembeli lepas"
            />
            {hasilCariMember.length > 0 && (
              <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {hasilCariMember.map(m => (
                  <button
                    key={m.id}
                    onClick={() => { setMemberId(m.id); setCariMember(m.name); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 border-b border-gray-50 last:border-0"
                  >
                    <p className="text-sm font-bold text-gray-800">{m.name}</p>
                    <p className="text-xs text-gray-500">{m.address}</p>
                  </button>
                ))}
              </div>
            )}
            {memberTerpilih && (
              <button onClick={() => { setMemberId(''); setCariMember(''); }} className="text-xs text-gray-500 hover:text-red-500 mt-1.5">
                Terpilih: <strong>{memberTerpilih.name}</strong> &mdash; klik untuk lepas
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col">
          <h3 className="font-bold text-gray-800 mb-4">Ringkasan</h3>
          <div className="space-y-2 text-sm flex-1">
            <div className="flex justify-between text-gray-600">
              <span>{tarif?.gasType} {tarif?.size}</span>
              <span className="font-mono">{jumlah} botol</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>Harga per botol</span>
              <span className="font-mono">{formatIDR(harga)}</span>
            </div>
            <div className="flex justify-between text-lg font-bold text-indigo-600 pt-3 mt-2 border-t-2 border-gray-100">
              <span>Total</span>
              <span className="font-mono">{formatIDR(total)}</span>
            </div>
            <p className="text-[11px] text-gray-400 pt-2">
              Jumlah stok tidak berubah &mdash; botol masuk satu, keluar satu.
            </p>
          </div>
          <div className="pt-4 mt-4 border-t border-gray-100">
            <PilihMetodeBayar nilai={metodeBayar} onGanti={setMetodeBayar} />
          </div>
          <button
            onClick={simpan}
            disabled={busy || jumlah < 1}
            className="mt-5 w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <span className="material-icons text-lg">swap_horiz</span>
            {busy ? 'Menyimpan...' : 'Catat Tukar Isi'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
          <h3 className="font-bold text-gray-800 text-sm">Tukar Isi Terakhir</h3>
        </div>
        {riwayat.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-gray-400">Belum ada tukar isi tercatat.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr className="text-gray-500 uppercase text-xs tracking-wider">
                <th className="px-6 py-3">Tanggal</th>
                <th className="px-6 py-3">Ukuran</th>
                <th className="px-6 py-3 text-right">Jumlah</th>
                <th className="px-6 py-3">Pelanggan</th>
                <th className="px-6 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {riwayat.map(t => (
                <tr key={t.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 text-gray-600">{formatTanggal(t.date)}</td>
                  <td className="px-6 py-3 text-gray-600">{t.size}</td>
                  <td className="px-6 py-3 text-right font-mono">{t.quantity} botol</td>
                  <td className="px-6 py-3 text-gray-500">
                    {members.find(m => m.id === t.memberId)?.name || <span className="italic text-gray-400">pembeli lepas</span>}
                  </td>
                  <td className="px-6 py-3 text-right font-mono text-gray-800">{formatIDR(t.cost || 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

export default GasExchangeView;
