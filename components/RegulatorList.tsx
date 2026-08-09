import React, { useState, useRef, useMemo } from 'react';
import { Regulator, RegulatorStatus } from '../types';
import { labelStatusRegulator, STATUS_REGULATOR } from '../labels';
import { supabase } from '../lib/supabase';

interface RegulatorListProps {
  regulators: Regulator[];
  onRefresh: () => Promise<void>;
}

const RegulatorList: React.FC<RegulatorListProps> = ({ regulators, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<Partial<Regulator>>({});
  const [toDelete, setToDelete] = useState<Regulator | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  // -- Impor CSV --
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [imported, setImported] = useState<{ code: string; notes?: string }[]>([]);
  const [importErrors, setImportErrors] = useState<Record<number, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const showFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 3500);
  };

  const statusColor = (s: RegulatorStatus) => {
    switch (s) {
      case 'Available': return 'bg-green-100 text-green-800';
      case 'Rented': return 'bg-blue-100 text-blue-800';
      case 'Sold': return 'bg-purple-100 text-purple-800';
      case 'Damaged': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return regulators
      .filter(r => filterStatus === 'All' || r.status === filterStatus)
      .filter(r => !q || r.code.toLowerCase().includes(q) || (r.currentHolder || '').toLowerCase().includes(q))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [regulators, search, filterStatus]);

  const ringkasan = useMemo(() => {
    const c: Record<string, number> = { Available: 0, Rented: 0, Sold: 0, Damaged: 0 };
    regulators.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [regulators]);

  const openAdd = () => {
    setIsEditing(false);
    setDraft({ code: '', status: 'Available', notes: '' });
    setIsModalOpen(true);
  };

  const openEdit = (r: Regulator) => {
    setIsEditing(true);
    setDraft({ ...r });
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.code?.trim()) return;
    setBusy(true);

    const row = {
      id: draft.id || `reg-${Date.now()}`,
      code: draft.code.trim(),
      status: draft.status || 'Available',
      currentHolder: draft.currentHolder || null,
      memberId: draft.memberId || null,
      notes: draft.notes?.trim() || null,
    };

    const { error } = isEditing
      ? await supabase.from('regulators').update(row).eq('id', row.id)
      : await supabase.from('regulators').insert(row);

    setBusy(false);
    if (error) {
      showFeedback(error.code === '23505' ? `Kode ${row.code} sudah dipakai regulator lain.` : `Gagal menyimpan: ${error.message}`, 'error');
      return;
    }
    setIsModalOpen(false);
    await onRefresh();
    showFeedback(isEditing ? 'Regulator diperbarui.' : 'Regulator ditambahkan.');
  };

  const confirmDelete = async () => {
    if (!toDelete) return;
    setBusy(true);
    const { error } = await supabase.from('regulators').delete().eq('id', toDelete.id);
    setBusy(false);
    setToDelete(null);
    if (error) { showFeedback(`Gagal menghapus: ${error.message}`, 'error'); return; }
    await onRefresh();
    showFeedback('Regulator dihapus.');
  };

  // --- Impor CSV: satu kolom wajib (code), satu opsional (notes) ---
  const downloadTemplate = () => {
    const csv = ['code,notes', 'REG-001,', 'REG-002,regulator cadangan'].join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template_regulator.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const lines = String(ev.target?.result || '').split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { showFeedback('Berkas CSV kosong atau tidak punya baris judul.', 'error'); return; }

      const rows: { code: string; notes?: string }[] = [];
      const errs: Record<number, string> = {};
      const kodeAda = new Set(regulators.map(r => r.code.toLowerCase()));
      const kodeBaru = new Set<string>();

      lines.slice(1).forEach((line, i) => {
        const [code, notes] = line.split(',').map(s => (s || '').trim());
        if (!code) { errs[i] = 'Kode kosong'; }
        else if (kodeAda.has(code.toLowerCase())) { errs[i] = 'Kode sudah ada di stok'; }
        else if (kodeBaru.has(code.toLowerCase())) { errs[i] = 'Kode ganda di dalam berkas'; }
        else kodeBaru.add(code.toLowerCase());
        rows.push({ code, notes });
      });

      setImported(rows);
      setImportErrors(errs);
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const confirmImport = async () => {
    const valid = imported.filter((_, i) => !importErrors[i]);
    if (!valid.length) return;
    setBusy(true);
    const rows = valid.map((r, i) => ({
      id: `reg-${Date.now()}-${i}`,
      code: r.code,
      status: 'Available',
      notes: r.notes || null,
    }));
    const { error } = await supabase.from('regulators').insert(rows);
    setBusy(false);
    if (error) { showFeedback(`Gagal mengimpor: ${error.message}`, 'error'); return; }
    setIsImportOpen(false);
    setImported([]);
    setImportErrors({});
    await onRefresh();
    showFeedback(`${rows.length} regulator berhasil diimpor.`);
  };

  const jumlahValid = imported.length - Object.keys(importErrors).length;

  return (
    <div className="space-y-4">
      {feedback && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${feedback.type === 'success' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
          {feedback.msg}
        </div>
      )}

      {regulators.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-10 text-center">
          <span className="material-icons text-5xl text-gray-300">settings_input_component</span>
          <h3 className="font-bold text-gray-800 mt-3">Stok regulator masih kosong</h3>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
            Daftarkan unit regulator dulu agar bisa dipilih saat menyewakan. Kalau daftarnya banyak, impor CSV lebih cepat daripada input satu per satu.
          </p>
          <div className="flex justify-center gap-3 mt-5">
            <button onClick={() => setIsImportOpen(true)} className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium flex items-center gap-2">
              <span className="material-icons text-sm">upload_file</span> Impor CSV
            </button>
            <button onClick={openAdd} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold flex items-center gap-2">
              <span className="material-icons text-sm">add</span> Tambah Regulator
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {(Object.keys(STATUS_REGULATOR) as RegulatorStatus[]).map(s => (
              <div key={s} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                <p className="text-xs text-gray-500 uppercase font-bold">{labelStatusRegulator(s)}</p>
                <p className="text-2xl font-bold text-gray-800">{ringkasan[s] || 0}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 flex flex-col md:flex-row gap-3 md:items-center justify-between border-b border-gray-100">
              <div className="flex gap-3 flex-1">
                <div className="relative flex-1 md:max-w-xs">
                  <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
                  <input
                    type="text"
                    placeholder="Cari kode atau pemegang..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="All">Semua Status</option>
                  {(Object.keys(STATUS_REGULATOR) as RegulatorStatus[]).map(s => (
                    <option key={s} value={s}>{labelStatusRegulator(s)}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setIsImportOpen(true)} className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                  <span className="material-icons text-sm">upload_file</span> Impor
                </button>
                <button onClick={openAdd} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
                  <span className="material-icons text-sm">add</span> Tambah
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr className="text-gray-500 uppercase text-xs tracking-wider">
                    <th className="px-6 py-3">Kode</th>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">Pemegang</th>
                    <th className="px-6 py-3">Catatan</th>
                    <th className="px-6 py-3 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400">Tidak ada regulator yang cocok dengan pencarian Anda.</td></tr>
                  ) : filtered.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50 group">
                      <td className="px-6 py-4 font-mono font-bold text-gray-800">{r.code}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${statusColor(r.status)}`}>
                          {labelStatusRegulator(r.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-600">{r.currentHolder || '-'}</td>
                      <td className="px-6 py-4 text-gray-500 text-xs">{r.notes || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-100 lg:opacity-50 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEdit(r)} className="p-1 hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 rounded">
                            <span className="material-icons text-sm">edit</span>
                          </button>
                          <button onClick={() => setToDelete(r)} className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded">
                            <span className="material-icons text-sm">delete</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
              {filtered.length} dari {regulators.length} regulator
            </div>
          </div>
        </>
      )}

      {/* MODAL TAMBAH / UBAH */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-fade-in-up">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">{isEditing ? 'Ubah Regulator' : 'Tambah Regulator'}</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Kode Unit</label>
                <input
                  type="text"
                  required
                  value={draft.code || ''}
                  onChange={e => setDraft({ ...draft, code: e.target.value })}
                  placeholder="mis. REG-001"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Status</label>
                <select
                  value={draft.status || 'Available'}
                  onChange={e => setDraft({ ...draft, status: e.target.value as RegulatorStatus })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  {(Object.keys(STATUS_REGULATOR) as RegulatorStatus[]).map(s => (
                    <option key={s} value={s}>{labelStatusRegulator(s)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1.5">Catatan</label>
                <input
                  type="text"
                  value={draft.notes || ''}
                  onChange={e => setDraft({ ...draft, notes: e.target.value })}
                  placeholder="opsional"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
              <button type="submit" disabled={busy} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold">
                {busy ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL IMPOR */}
      {isImportOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl animate-fade-in-up max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-800">Impor Regulator</h3>
              <button onClick={() => { setIsImportOpen(false); setImported([]); setImportErrors({}); }} className="text-gray-400 hover:text-gray-600">
                <span className="material-icons">close</span>
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              <button onClick={downloadTemplate} className="text-sm text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1">
                <span className="material-icons text-sm">download</span> Unduh Template CSV
              </button>

              <div className="bg-gray-50 rounded-lg p-4 text-xs text-gray-600">
                <p className="font-bold mb-1">Petunjuk:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Berkas harus berformat <strong>.csv</strong>.</li>
                  <li>Urutan kolom: <strong>code, notes</strong>. Kolom notes boleh dikosongkan.</li>
                  <li>Semua regulator masuk dengan status <strong>Tersedia</strong>.</li>
                  <li>Kode yang sudah ada di stok akan ditolak.</li>
                </ul>
              </div>

              <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="w-full border-2 border-dashed border-gray-300 rounded-lg py-8 text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
                <span className="material-icons text-3xl text-gray-400">upload_file</span>
                <p className="text-sm text-gray-600 mt-1">Klik untuk unggah berkas CSV</p>
              </button>

              {imported.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-bold text-gray-700">Pratinjau Data</p>
                    <button onClick={() => { setImported([]); setImportErrors({}); }} className="text-sm text-red-500 hover:text-red-700">
                      Hapus &amp; Unggah Ulang
                    </button>
                  </div>
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr className="text-gray-500 uppercase">
                          <th className="px-4 py-2 text-left">Status</th>
                          <th className="px-4 py-2 text-left">Kode</th>
                          <th className="px-4 py-2 text-left">Catatan</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {imported.map((r, i) => (
                          <tr key={i} className={importErrors[i] ? 'bg-red-50' : ''}>
                            <td className="px-4 py-2">
                              {importErrors[i] ? (
                                <span className="text-red-600 font-bold">{importErrors[i]}</span>
                              ) : (
                                <span className="text-green-600 font-bold">Valid</span>
                              )}
                            </td>
                            <td className="px-4 py-2 font-mono">{r.code || '-'}</td>
                            <td className="px-4 py-2 text-gray-500">{r.notes || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-between items-center">
              <span className="text-sm text-gray-500">
                {imported.length > 0 && `${jumlahValid} valid, ${Object.keys(importErrors).length} ditolak`}
              </span>
              <div className="flex gap-3">
                <button onClick={() => { setIsImportOpen(false); setImported([]); setImportErrors({}); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
                <button onClick={confirmImport} disabled={busy || jumlahValid === 0} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-lg text-sm font-bold">
                  {busy ? 'Mengimpor...' : `Impor ${jumlahValid} Regulator`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL HAPUS */}
      {toDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md animate-fade-in-up">
            <div className="px-6 py-4 border-b border-gray-100"><h3 className="font-bold text-gray-800">Hapus Regulator</h3></div>
            <div className="p-6">
              <p className="text-gray-700 text-sm mb-4">Yakin ingin menghapus regulator <strong>{toDelete.code}</strong>?</p>
              {toDelete.status === 'Rented' && (
                <p className="text-xs text-red-600 bg-red-50 p-2 rounded">
                  Regulator ini sedang disewa {toDelete.currentHolder ? `oleh ${toDelete.currentHolder}` : ''}. Menghapusnya membuat unit itu hilang dari catatan padahal barangnya masih di luar.
                </p>
              )}
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setToDelete(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
              <button onClick={confirmDelete} disabled={busy} className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold">Hapus</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegulatorList;
