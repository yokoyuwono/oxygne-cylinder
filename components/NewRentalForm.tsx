import React, { useState, useMemo } from 'react';
import { Cylinder, CylinderStatus, Member, RentalTariff, Regulator } from '../types';

export interface NewRentalItem {
  cylinderId: string;
  serialCode: string;
  gasType: string;
  size: string;
  depositAmount: number;
  rentalFee: number;
  gasPrice: number;
  regulatorRentId?: string;
  regulatorFee?: number;
  regulatorSaleId?: string;
  regulatorSalePrice?: number;
}

export interface NewRentalPayload {
  isNewMember: boolean;
  member: { id?: string; name: string; address: string; ktp: string; phone: string };
  rentalDate: string;
  source: 'TOKO' | 'DELIVERY';
  items: NewRentalItem[];
  totals: { deposit: number; revenue: number };
}

interface NewRentalFormProps {
  cylinders: Cylinder[];
  members: Member[];
  tariffs: RentalTariff[];
  regulators: Regulator[];
  onSubmit: (payload: NewRentalPayload) => Promise<void>;
  onCancel: () => void;
}

const hariIni = () => new Date().toISOString().slice(0, 10);

const NewRentalForm: React.FC<NewRentalFormProps> = ({ cylinders, members, tariffs, regulators, onSubmit, onCancel }) => {
  const [pelangganBaru, setPelangganBaru] = useState(true);
  const [nama, setNama] = useState('');
  const [alamat, setAlamat] = useState('');
  const [ktp, setKtp] = useState('');
  const [telepon, setTelepon] = useState('');
  const [memberLamaId, setMemberLamaId] = useState('');
  const [cariMember, setCariMember] = useState('');

  const [tanggal, setTanggal] = useState(hariIni());
  const [sumber, setSumber] = useState<'TOKO' | 'DELIVERY'>('TOKO');

  const [cariTabung, setCariTabung] = useState('');
  const [keranjang, setKeranjang] = useState<NewRentalItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formatIDR = (v: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v || 0);

  const tarifRegulator = useMemo(
    () => tariffs.find(t => t.kind === 'REGULATOR' && t.isActive),
    [tariffs]
  );

  const cariTarif = (gasType?: string, size?: string) =>
    tariffs.find(t => t.kind === 'CYLINDER' && t.isActive && t.gasType === gasType && t.size === size);

  // Hanya tabung tersedia yang belum masuk keranjang, dan yang tarifnya aktif.
  const hasilCariTabung = useMemo(() => {
    const q = cariTabung.trim().toLowerCase();
    if (!q) return [];
    return cylinders
      .filter(c => c.status === CylinderStatus.Available)
      .filter(c => !keranjang.some(k => k.cylinderId === c.id))
      .filter(c => c.serialCode.toLowerCase().includes(q) || (c.gasType || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [cariTabung, cylinders, keranjang]);

  const hasilCariMember = useMemo(() => {
    const q = cariMember.trim().toLowerCase();
    if (!q) return [];
    return members
      .filter(m => (m.name || '').toLowerCase().includes(q) || (m.companyName || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [cariMember, members]);

  const regulatorTersedia = useMemo(() => {
    const dipakai = new Set(
      keranjang.flatMap(k => [k.regulatorRentId, k.regulatorSaleId].filter(Boolean) as string[])
    );
    return regulators.filter(r => r.status === 'Available' && !dipakai.has(r.id));
  }, [regulators, keranjang]);

  const tambahTabung = (c: Cylinder) => {
    const tarif = cariTarif(c.gasType, c.size);
    if (!tarif) {
      setError(`Belum ada tarif aktif untuk ${c.gasType} ${c.size}. Atur dulu di Master Data Penyewaan.`);
      return;
    }
    setError(null);
    setKeranjang(prev => [...prev, {
      cylinderId: c.id,
      serialCode: c.serialCode,
      gasType: c.gasType,
      size: c.size,
      depositAmount: Number(tarif.depositAmount) || 0,
      rentalFee: Number(tarif.rentalFee) || 0,
      gasPrice: Number(tarif.gasPrice) || 0,
    }]);
    setCariTabung('');
  };

  const ubahItem = (idx: number, patch: Partial<NewRentalItem>) =>
    setKeranjang(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const hapusItem = (idx: number) => setKeranjang(prev => prev.filter((_, i) => i !== idx));

  const total = useMemo(() => {
    const deposit = keranjang.reduce((s, i) => s + i.depositAmount, 0);
    const sewa = keranjang.reduce((s, i) => s + i.rentalFee, 0);
    const gas = keranjang.reduce((s, i) => s + i.gasPrice, 0);
    const regSewa = keranjang.reduce((s, i) => s + (i.regulatorFee || 0), 0);
    const regJual = keranjang.reduce((s, i) => s + (i.regulatorSalePrice || 0), 0);
    const pendapatan = sewa + gas + regSewa + regJual;
    return { deposit, sewa, gas, regSewa, regJual, pendapatan, bayar: pendapatan + deposit };
  }, [keranjang]);

  const memberLama = members.find(m => m.id === memberLamaId);

  const bolehSimpan =
    keranjang.length > 0 &&
    (pelangganBaru
      ? nama.trim() && alamat.trim() && ktp.trim() && telepon.trim()
      : Boolean(memberLamaId));

  const handleSubmit = async () => {
    if (!bolehSimpan || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({
        isNewMember: pelangganBaru,
        member: pelangganBaru
          ? { name: nama.trim(), address: alamat.trim(), ktp: ktp.trim(), phone: telepon.trim() }
          : {
              id: memberLamaId,
              name: memberLama?.name || '',
              address: memberLama?.address || '',
              ktp: '',
              phone: memberLama?.phone || '',
            },
        rentalDate: new Date(tanggal).toISOString(),
        source: sumber,
        items: keranjang,
        totals: { deposit: total.deposit, revenue: total.pendapatan },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan sewa.');
    } finally {
      setBusy(false);
    }
  };

  const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
  const labelClass = 'block text-xs font-bold text-gray-500 uppercase mb-1.5';

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 animate-fade-in-up">
      {error && (
        <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-sm flex items-start gap-2">
          <span className="material-icons text-base">error</span>
          <span>{error}</span>
        </div>
      )}

      {/* 1. DATA PELANGGAN */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-800">1. Data Pelanggan</h3>
          <div className="bg-gray-100 p-1 rounded-lg flex gap-1">
            <button
              onClick={() => { setPelangganBaru(true); setMemberLamaId(''); }}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${pelangganBaru ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
            >
              Pelanggan Baru
            </button>
            <button
              onClick={() => setPelangganBaru(false)}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${!pelangganBaru ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
            >
              Pelanggan Lama
            </button>
          </div>
        </div>

        {pelangganBaru ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Nama</label>
              <input value={nama} onChange={e => setNama(e.target.value)} className={inputClass} placeholder="Nama lengkap" />
            </div>
            <div>
              <label className={labelClass}>No. KTP</label>
              <input value={ktp} onChange={e => setKtp(e.target.value)} className={`${inputClass} font-mono`} placeholder="16 digit" />
            </div>
            <div className="md:col-span-2">
              <label className={labelClass}>Alamat</label>
              <input value={alamat} onChange={e => setAlamat(e.target.value)} className={inputClass} placeholder="Alamat lengkap" />
            </div>
            <div>
              <label className={labelClass}>No. Telepon</label>
              <input value={telepon} onChange={e => setTelepon(e.target.value)} className={inputClass} placeholder="08xxxxxxxxxx" />
            </div>
            <div>
              <label className={labelClass}>Tanggal Sewa</label>
              <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className={inputClass} />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative">
              <label className={labelClass}>Cari Pelanggan</label>
              <input value={cariMember} onChange={e => { setCariMember(e.target.value); setMemberLamaId(''); }} className={inputClass} placeholder="Ketik nama pelanggan..." />
              {hasilCariMember.length > 0 && !memberLamaId && (
                <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {hasilCariMember.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setMemberLamaId(m.id); setCariMember(m.name); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 border-b border-gray-50 last:border-0"
                    >
                      <p className="text-sm font-bold text-gray-800">{m.name}</p>
                      <p className="text-xs text-gray-500">{m.address}</p>
                    </button>
                  ))}
                </div>
              )}
              {memberLama && (
                <p className="text-xs text-green-700 mt-1.5">
                  Terpilih: <strong>{memberLama.name}</strong> &middot; deposit tersimpan {formatIDR(memberLama.totalDeposit)}
                </p>
              )}
            </div>
            <div>
              <label className={labelClass}>Tanggal Sewa</label>
              <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className={inputClass} />
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-100">
          <label className={labelClass}>Transaksi di</label>
          <div className="bg-gray-100 p-1 rounded-lg inline-flex gap-1">
            {(['TOKO', 'DELIVERY'] as const).map(s => (
              <button
                key={s}
                onClick={() => setSumber(s)}
                className={`px-5 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 ${sumber === s ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500'}`}
              >
                <span className="material-icons text-sm">{s === 'TOKO' ? 'store' : 'local_shipping'}</span>
                {s === 'TOKO' ? 'Toko' : 'Pengiriman'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 2. TABUNG */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-bold text-gray-800 mb-1">2. Tabung yang Disewa</h3>
        <p className="text-xs text-gray-500 mb-4">Boleh lebih dari satu dan berbeda jenis. Deposit jaminan diakumulasi otomatis.</p>

        <div className="relative mb-4">
          <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
          <input
            value={cariTabung}
            onChange={e => setCariTabung(e.target.value)}
            className={`${inputClass} pl-9`}
            placeholder="Cari kode tabung yang tersedia..."
          />
          {hasilCariTabung.length > 0 && (
            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
              {hasilCariTabung.map(c => {
                const tarif = cariTarif(c.gasType, c.size);
                return (
                  <button
                    key={c.id}
                    onClick={() => tambahTabung(c)}
                    className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 border-b border-gray-50 last:border-0 flex justify-between items-center"
                  >
                    <span>
                      <span className="text-sm font-bold text-gray-800 font-mono">{c.serialCode}</span>
                      <span className="text-xs text-gray-500 ml-2">{c.gasType} {c.size}</span>
                    </span>
                    {tarif
                      ? <span className="text-xs text-green-600 font-medium">{formatIDR(Number(tarif.depositAmount) + Number(tarif.rentalFee) + Number(tarif.gasPrice))}</span>
                      : <span className="text-xs text-red-500 font-medium">tarif belum diatur</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {keranjang.length === 0 ? (
          <div className="border-2 border-dashed border-gray-200 rounded-xl py-10 text-center text-sm text-gray-400">
            Belum ada tabung dipilih.
          </div>
        ) : (
          <div className="space-y-3">
            {keranjang.map((it, idx) => (
              <div key={it.cylinderId} className="border border-gray-200 rounded-xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <p className="font-bold text-gray-800 font-mono">{it.serialCode}</p>
                    <p className="text-xs text-gray-500">{it.gasType} {it.size}</p>
                  </div>
                  <button onClick={() => hapusItem(idx)} className="text-gray-400 hover:text-red-500">
                    <span className="material-icons text-lg">close</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Deposit Jaminan</label>
                    <p className="text-sm font-mono text-gray-700 py-2">{formatIDR(it.depositAmount)}</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Biaya Sewa</label>
                    <p className="text-sm font-mono text-gray-700 py-2">{formatIDR(it.rentalFee)}</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">Harga Gas</label>
                    <input
                      type="number"
                      min={0}
                      step={1000}
                      value={it.gasPrice}
                      onChange={e => ubahItem(idx, { gasPrice: Number(e.target.value) })}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                {tarifRegulator && (
                  <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">
                        Sewa Regulator ({formatIDR(tarifRegulator.rentalFee)})
                      </label>
                      <select
                        value={it.regulatorRentId || ''}
                        onChange={e => ubahItem(idx, {
                          regulatorRentId: e.target.value || undefined,
                          regulatorFee: e.target.value ? Number(tarifRegulator.rentalFee) : undefined,
                        })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">-- tidak sewa --</option>
                        {it.regulatorRentId && <option value={it.regulatorRentId}>{regulators.find(r => r.id === it.regulatorRentId)?.code}</option>}
                        {regulatorTersedia.map(r => <option key={r.id} value={r.id}>{r.code}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">
                        Beli Regulator ({formatIDR(tarifRegulator.salePrice)})
                      </label>
                      <select
                        value={it.regulatorSaleId || ''}
                        onChange={e => ubahItem(idx, {
                          regulatorSaleId: e.target.value || undefined,
                          regulatorSalePrice: e.target.value ? Number(tarifRegulator.salePrice) : undefined,
                        })}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                      >
                        <option value="">-- tidak beli --</option>
                        {it.regulatorSaleId && <option value={it.regulatorSaleId}>{regulators.find(r => r.id === it.regulatorSaleId)?.code}</option>}
                        {regulatorTersedia.map(r => <option key={r.id} value={r.id}>{r.code}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {tarifRegulator && regulators.length === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
            Stok regulator masih kosong, jadi pilihan sewa dan beli regulator belum bisa dipakai. Daftarkan unitnya di Stok Tabung &rarr; Regulator.
          </p>
        )}
      </div>

      {/* 3. RINGKASAN */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
        <h3 className="font-bold text-gray-800 mb-4">3. Ringkasan Pembayaran</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between text-gray-600"><span>Biaya sewa tabung</span><span className="font-mono">{formatIDR(total.sewa)}</span></div>
          <div className="flex justify-between text-gray-600"><span>Harga gas</span><span className="font-mono">{formatIDR(total.gas)}</span></div>
          {total.regSewa > 0 && <div className="flex justify-between text-gray-600"><span>Sewa regulator</span><span className="font-mono">{formatIDR(total.regSewa)}</span></div>}
          {total.regJual > 0 && <div className="flex justify-between text-gray-600"><span>Pembelian regulator</span><span className="font-mono">{formatIDR(total.regJual)}</span></div>}
          <div className="flex justify-between font-bold text-gray-800 pt-2 border-t border-gray-100">
            <span>Subtotal pendapatan</span><span className="font-mono">{formatIDR(total.pendapatan)}</span>
          </div>
          <div className="flex justify-between text-gray-600 pt-2">
            <span>Deposit jaminan {keranjang.length > 1 && <span className="text-xs">({keranjang.length} tabung)</span>}</span>
            <span className="font-mono">{formatIDR(total.deposit)}</span>
          </div>
          <p className="text-[11px] text-gray-400 -mt-1">Titipan, dikembalikan saat pelanggan berhenti menyewa. Tidak dihitung sebagai pendapatan.</p>
          <div className="flex justify-between text-lg font-bold text-indigo-600 pt-3 border-t-2 border-gray-100">
            <span>Total dibayar sekarang</span><span className="font-mono">{formatIDR(total.bayar)}</span>
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onCancel} className="px-5 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
          <button
            onClick={handleSubmit}
            disabled={!bolehSimpan || busy}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold flex items-center gap-2"
          >
            <span className="material-icons text-lg">check_circle</span>
            {busy ? 'Menyimpan...' : 'Simpan Sewa'}
          </button>
        </div>
        {!bolehSimpan && (
          <p className="text-xs text-gray-400 text-right mt-2">
            {keranjang.length === 0 ? 'Pilih minimal satu tabung.' : 'Lengkapi data pelanggan dulu.'}
          </p>
        )}
      </div>
    </div>
  );
};

export default NewRentalForm;
