import React, { useState } from 'react';
import { RentalTariff, GasType, CylinderSize } from '../types';
import { supabase } from '../lib/supabase';

interface MasterDataViewProps {
  tariffs: RentalTariff[];
  onRefresh: () => Promise<void>;
}

type Draft = Partial<RentalTariff>;

const MasterDataView: React.FC<MasterDataViewProps> = ({ tariffs, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'cylinder' | 'regulator'>('cylinder');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [isEditing, setIsEditing] = useState(false);
  const [toDelete, setToDelete] = useState<RentalTariff | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const formatIDR = (val: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val || 0);

  const showFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 3000);
  };

  const cylinderTariffs = tariffs
    .filter(t => t.kind === 'CYLINDER')
    .sort((a, b) => (a.gasType || '').localeCompare(b.gasType || '') || (a.size || '').localeCompare(b.size || ''));

  const regulatorTariffs = tariffs
    .filter(t => t.kind === 'REGULATOR')
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const openAdd = () => {
    setIsEditing(false);
    setDraft(
      activeTab === 'cylinder'
        ? { kind: 'CYLINDER', gasType: GasType.Oxygen, size: CylinderSize.Large, depositAmount: 0, rentalFee: 0, gasPrice: 0, salePrice: 0, isActive: true }
        : { kind: 'REGULATOR', name: '', rentalFee: 0, salePrice: 0, depositAmount: 0, gasPrice: 0, isActive: true }
    );
    setIsModalOpen(true);
  };

  const openEdit = (t: RentalTariff) => {
    setIsEditing(true);
    setDraft({ ...t });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (draft.kind === 'REGULATOR' && !draft.name?.trim()) return;
    setBusy(true);

    const row = {
      id: draft.id || `rt-${Date.now()}`,
      kind: draft.kind,
      name: draft.kind === 'REGULATOR' ? draft.name?.trim() : null,
      gasType: draft.kind === 'CYLINDER' ? draft.gasType : null,
      size: draft.kind === 'CYLINDER' ? draft.size : null,
      depositAmount: Number(draft.depositAmount) || 0,
      rentalFee: Number(draft.rentalFee) || 0,
      gasPrice: Number(draft.gasPrice) || 0,
      salePrice: Number(draft.salePrice) || 0,
      isActive: draft.isActive ?? true,
    };

    const { error } = isEditing
      ? await supabase.from('rental_tariffs').update(row).eq('id', row.id)
      : await supabase.from('rental_tariffs').insert(row);

    setBusy(false);

    if (error) {
      // Unique index rental_tariffs_cylinder_uniq: satu tarif per jenis gas + ukuran.
      const bentrok = error.code === '23505';
      showFeedback(
        bentrok ? 'Tarif untuk jenis gas dan ukuran itu sudah ada.' : `Gagal menyimpan: ${error.message}`,
        'error'
      );
      return;
    }

    setIsModalOpen(false);
    await onRefresh();
    showFeedback(isEditing ? 'Tarif diperbarui.' : 'Tarif ditambahkan.');
  };

  const toggleActive = async (t: RentalTariff) => {
    const { error } = await supabase.from('rental_tariffs').update({ isActive: !t.isActive }).eq('id', t.id);
    if (error) { showFeedback(`Gagal mengubah status: ${error.message}`, 'error'); return; }
    await onRefresh();
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    const { error } = await supabase.from('rental_tariffs').delete().eq('id', toDelete.id);
    setBusy(false);
    setToDelete(null);
    if (error) { showFeedback(`Gagal menghapus: ${error.message}`, 'error'); return; }
    await onRefresh();
    showFeedback('Tarif dihapus.');
  };

  const numberField = (label: string, key: keyof RentalTariff, hint?: string) => (
    <div>
      <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">{label}</label>
      <input
        type="number"
        min={0}
        step={1000}
        value={(draft[key] as number) ?? 0}
        onChange={e => setDraft({ ...draft, [key]: Number(e.target.value) })}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
      />
      {hint && <p className="text-[11px] text-gray-400 mt-1">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-6 animate-fade-in-up pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Master Data Penyewaan</h2>
          <p className="text-gray-500 text-sm">Atur tarif sewa tabung dan regulator. Perubahan di sini tidak mengubah transaksi yang sudah tercatat.</p>
        </div>
        <button
          onClick={openAdd}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap"
        >
          <span className="material-icons text-sm">add</span>
          Tambah Tarif
        </button>
      </div>

      {feedback && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${feedback.type === 'success' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
          {feedback.msg}
        </div>
      )}

      <div className="flex gap-6 border-b border-gray-200">
        {[
          { id: 'cylinder', label: 'Tarif Tabung', icon: 'propane' },
          { id: 'regulator', label: 'Tarif Regulator', icon: 'settings_input_component' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'cylinder' | 'regulator')}
            className={`pb-4 px-2 text-sm font-medium transition-all relative flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <span className="material-icons text-lg">{tab.icon}</span>
            {tab.label}
            {activeTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
          </button>
        ))}
      </div>

      {activeTab === 'cylinder' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-gray-500 uppercase text-xs tracking-wider">
                  <th className="px-6 py-3">Jenis Gas</th>
                  <th className="px-6 py-3">Ukuran</th>
                  <th className="px-6 py-3 text-right">Deposit Jaminan</th>
                  <th className="px-6 py-3 text-right">Biaya Sewa</th>
                  <th className="px-6 py-3 text-right">Harga Gas</th>
                  <th className="px-6 py-3 text-center">Aktif</th>
                  <th className="px-6 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {cylinderTariffs.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-10 text-center text-gray-400">Belum ada tarif tabung.</td></tr>
                ) : cylinderTariffs.map(t => (
                  <tr key={t.id} className={`hover:bg-gray-50 group ${!t.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4 font-bold text-gray-800">{t.gasType}</td>
                    <td className="px-6 py-4 text-gray-600">{t.size}</td>
                    <td className="px-6 py-4 text-right font-mono text-gray-700">{formatIDR(t.depositAmount)}</td>
                    <td className="px-6 py-4 text-right font-mono text-gray-700">{formatIDR(t.rentalFee)}</td>
                    <td className="px-6 py-4 text-right font-mono text-gray-700">{formatIDR(t.gasPrice)}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleActive(t)}
                        title={t.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        className={`w-11 h-6 rounded-full transition-colors relative ${t.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${t.isActive ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-100 lg:opacity-50 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(t)} className="p-1 hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 rounded">
                          <span className="material-icons text-sm">edit</span>
                        </button>
                        <button onClick={() => setToDelete(t)} className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded">
                          <span className="material-icons text-sm">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-3 bg-amber-50 border-t border-amber-100 text-xs text-amber-800">
            Tarif yang dinonaktifkan tidak muncul di form Sewa Baru, tapi riwayat transaksinya tetap utuh.
          </div>
        </div>
      )}

      {activeTab === 'regulator' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-gray-500 uppercase text-xs tracking-wider">
                  <th className="px-6 py-3">Nama</th>
                  <th className="px-6 py-3 text-right">Biaya Sewa</th>
                  <th className="px-6 py-3 text-right">Harga Jual</th>
                  <th className="px-6 py-3 text-center">Aktif</th>
                  <th className="px-6 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {regulatorTariffs.length === 0 ? (
                  <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">Belum ada tarif regulator.</td></tr>
                ) : regulatorTariffs.map(t => (
                  <tr key={t.id} className={`hover:bg-gray-50 group ${!t.isActive ? 'opacity-50' : ''}`}>
                    <td className="px-6 py-4 font-bold text-gray-800">{t.name}</td>
                    <td className="px-6 py-4 text-right font-mono text-gray-700">{formatIDR(t.rentalFee)}</td>
                    <td className="px-6 py-4 text-right font-mono text-gray-700">{formatIDR(t.salePrice)}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleActive(t)}
                        title={t.isActive ? 'Nonaktifkan' : 'Aktifkan'}
                        className={`w-11 h-6 rounded-full transition-colors relative ${t.isActive ? 'bg-green-500' : 'bg-gray-300'}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${t.isActive ? 'left-[22px]' : 'left-0.5'}`} />
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-100 lg:opacity-50 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => openEdit(t)} className="p-1 hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 rounded">
                          <span className="material-icons text-sm">edit</span>
                        </button>
                        <button onClick={() => setToDelete(t)} className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded">
                          <span className="material-icons text-sm">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH / UBAH */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-xl w-full max-w-lg animate-fade-in-up">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">
                {isEditing ? 'Ubah Tarif' : draft.kind === 'REGULATOR' ? 'Tambah Tarif Regulator' : 'Tambah Tarif Tabung'}
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons">close</span>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {draft.kind === 'CYLINDER' ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Jenis Gas</label>
                      <select
                        value={draft.gasType}
                        onChange={e => setDraft({ ...draft, gasType: e.target.value as GasType })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {Object.values(GasType).map(g => <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Ukuran</label>
                      <select
                        value={draft.size}
                        onChange={e => setDraft({ ...draft, size: e.target.value as CylinderSize })}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        {Object.values(CylinderSize).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {numberField('Deposit Jaminan', 'depositAmount', 'Titipan, dikembalikan saat pelanggan berhenti')}
                    {numberField('Biaya Sewa', 'rentalFee', 'Sekali bayar di awal')}
                  </div>
                  {numberField('Harga Gas', 'gasPrice', 'Bisa diubah per pelanggan saat mengisi form sewa')}
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Nama</label>
                    <input
                      type="text"
                      required
                      value={draft.name || ''}
                      onChange={e => setDraft({ ...draft, name: e.target.value })}
                      placeholder="mis. Regulator Standar"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    {numberField('Biaya Sewa', 'rentalFee')}
                    {numberField('Harga Jual', 'salePrice')}
                  </div>
                </>
              )}

              <label className="flex items-center gap-2 text-sm text-gray-700 pt-2">
                <input
                  type="checkbox"
                  checked={draft.isActive ?? true}
                  onChange={e => setDraft({ ...draft, isActive: e.target.checked })}
                  className="rounded border-gray-300"
                />
                Aktif -- muncul sebagai pilihan di form Sewa Baru
              </label>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors">
                Batal
              </button>
              <button type="submit" disabled={busy} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors">
                {busy ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL HAPUS */}
      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-fade-in-up">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-800">Hapus Tarif</h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-sm mb-4">
                Yakin ingin menghapus tarif <strong>{toDelete.kind === 'REGULATOR' ? toDelete.name : `${toDelete.gasType} ${toDelete.size}`}</strong>?
              </p>
              <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded">
                Transaksi yang sudah tercatat tidak terpengaruh. Kalau hanya ingin menyembunyikannya dari form sewa, lebih baik nonaktifkan saja.
              </p>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setToDelete(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors">
                Batal
              </button>
              <button onClick={confirmDelete} disabled={busy} className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold transition-colors">
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterDataView;
