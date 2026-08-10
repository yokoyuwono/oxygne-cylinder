import React, { useState, useMemo } from 'react';
import { Cylinder, CylinderStatus, Member, RentalTariff, Transaction } from '../types';
import { totalRegulatorBeredar } from '../lib/bulkStock';

export interface NewRentalItem {
  /** Kosong untuk baris curah -- botolnya tidak berkode, jadi tidak ada unit tertentu. */
  cylinderId?: string;
  serialCode?: string;
  gasType: string;
  size: string;
  /** Selalu 1 untuk tabung berkode; bisa lebih untuk stok curah. */
  quantity: number;
  /** Nominal PER BOTOL. Total baris = nominal x quantity. */
  depositAmount: number;
  rentalFee: number;
  gasPrice: number;
  regulatorTariffId?: string;
  regulatorRented?: boolean;
  regulatorFee?: number;
  regulatorSold?: boolean;
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
  transactions: Transaction[];
  onSubmit: (payload: NewRentalPayload) => Promise<void>;
  onCancel: () => void;
}

const hariIni = () => new Date().toISOString().slice(0, 10);

const NewRentalForm: React.FC<NewRentalFormProps> = ({ cylinders, members, tariffs, transactions, onSubmit, onCancel }) => {
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

  // Ukuran tanpa kode: botolnya saling gantikan, jadi dipilih lewat jumlah,
  // bukan lewat pencarian kode tabung.
  const tarifCurah = useMemo(
    () => tariffs.filter(t => t.kind === 'CYLINDER' && t.isActive && !t.isCoded),
    [tariffs]
  );
  const [curahId, setCurahId] = useState('');
  const [curahQty, setCurahQty] = useState(1);

  // Hanya tabung tersedia yang belum masuk keranjang, dan yang tarifnya aktif.
  const hasilCariTabung = useMemo(() => {
    const q = cariTabung.trim().toLowerCase();
    if (!q) return [];
    return cylinders
      .filter(c => c.status === CylinderStatus.Available)
      // Ukuran tanpa kode tidak boleh muncul di sini walau ada barisnya di cylinders.
      .filter(c => cariTarif(c.gasType, c.size)?.isCoded !== false)
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

  /**
   * Stok regulator tersisa untuk SATU baris keranjang tertentu: kepemilikan
   * dikurangi yang sudah beredar (transaksi lama) dan yang sudah dipilih di
   * baris keranjang lain -- baris itu sendiri tidak ikut dikurangi, supaya
   * centangnya tidak langsung terkunci begitu dipilih.
   */
  const sisaRegulator = (idxSaatIni: number) => {
    if (!tarifRegulator) return { sisaSewa: 0, sisaJual: 0 };
    const dipakaiSewa = keranjang.filter((k, i) => i !== idxSaatIni && k.regulatorRented).length;
    const dipakaiJual = keranjang.filter((k, i) => i !== idxSaatIni && k.regulatorSold).length;
    const beredar = totalRegulatorBeredar(transactions, tarifRegulator.id);
    return {
      sisaSewa: Math.max(0, (tarifRegulator.regulatorUsedStock || 0) - beredar - dipakaiSewa),
      sisaJual: Math.max(0, (tarifRegulator.regulatorNewStock || 0) - dipakaiJual),
    };
  };

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
      quantity: 1,
      depositAmount: Number(tarif.depositAmount) || 0,
      rentalFee: Number(tarif.rentalFee) || 0,
      gasPrice: Number(tarif.gasPrice) || 0,
    }]);
    setCariTabung('');
  };

  /** Tambah botol tanpa kode: satu baris keranjang berjumlah, tanpa unit tertentu. */
  const tambahCurah = () => {
    const tarif = tarifCurah.find(t => t.id === curahId);
    if (!tarif || curahQty < 1) return;
    setError(null);
    setKeranjang(prev => {
      // Gabungkan kalau ukuran yang sama sudah ada, supaya tidak ada baris kembar.
      const idx = prev.findIndex(k => !k.cylinderId && k.gasType === tarif.gasType && k.size === tarif.size);
      if (idx >= 0) {
        return prev.map((k, i) => (i === idx ? { ...k, quantity: k.quantity + curahQty } : k));
      }
      return [...prev, {
        gasType: tarif.gasType as string,
        size: tarif.size as string,
        quantity: curahQty,
        depositAmount: Number(tarif.depositAmount) || 0,
        rentalFee: Number(tarif.rentalFee) || 0,
        gasPrice: Number(tarif.gasPrice) || 0,
      }];
    });
    setCurahQty(1);
  };

  const ubahItem = (idx: number, patch: Partial<NewRentalItem>) =>
    setKeranjang(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const hapusItem = (idx: number) => setKeranjang(prev => prev.filter((_, i) => i !== idx));

  const total = useMemo(() => {
    // Nominal pada tiap baris berlaku PER BOTOL; baris curah bisa lebih dari satu.
    const deposit = keranjang.reduce((s, i) => s + i.depositAmount * i.quantity, 0);
    const sewa = keranjang.reduce((s, i) => s + i.rentalFee * i.quantity, 0);
    const gas = keranjang.reduce((s, i) => s + i.gasPrice * i.quantity, 0);
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

        {/* Ukuran tanpa kode dipilih lewat jumlah -- botolnya tidak punya kode untuk dicari. */}
        {tarifCurah.length > 0 && (
          <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 mb-4">
            <p className="text-xs font-bold text-amber-800 uppercase mb-2">Tabung tanpa kode</p>
            <div className="flex flex-col md:flex-row gap-2 md:items-end">
              <div className="flex-1">
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Jenis &amp; Ukuran</label>
                <select
                  value={curahId}
                  onChange={e => setCurahId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">-- pilih --</option>
                  {tarifCurah.map(t => (
                    <option key={t.id} value={t.id}>{t.gasType} {t.size} &middot; stok {t.stockQty}</option>
                  ))}
                </select>
              </div>
              <div className="w-full md:w-32">
                <label className="block text-[11px] font-bold text-gray-500 uppercase mb-1">Jumlah</label>
                <input
                  type="number"
                  min={1}
                  value={curahQty}
                  onChange={e => setCurahQty(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-center font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <button
                onClick={tambahCurah}
                disabled={!curahId}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-40 text-white rounded-lg text-sm font-bold whitespace-nowrap"
              >
                Tambah
              </button>
            </div>
          </div>
        )}

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
              <div key={it.cylinderId || `curah-${it.gasType}-${it.size}`} className="border border-gray-200 rounded-xl p-4">
                <div className="flex justify-between items-start mb-3">
                  <div>
                    {it.cylinderId ? (
                      <p className="font-bold text-gray-800 font-mono">{it.serialCode}</p>
                    ) : (
                      <p className="font-bold text-gray-800 flex items-center gap-2">
                        {it.quantity} botol
                        <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">tanpa kode</span>
                      </p>
                    )}
                    <p className="text-xs text-gray-500">{it.gasType} {it.size}</p>
                  </div>
                  <button onClick={() => hapusItem(idx)} className="text-gray-400 hover:text-red-500">
                    <span className="material-icons text-lg">close</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">
                      Deposit Jaminan{it.quantity > 1 && <span className="normal-case font-normal"> ({it.quantity}x)</span>}
                    </label>
                    <p className="text-sm font-mono text-gray-700 py-2">{formatIDR(it.depositAmount * it.quantity)}</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">
                      Biaya Sewa{it.quantity > 1 && <span className="normal-case font-normal"> ({it.quantity}x)</span>}
                    </label>
                    <p className="text-sm font-mono text-gray-700 py-2">{formatIDR(it.rentalFee * it.quantity)}</p>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-gray-400 uppercase mb-1">
                      Harga Gas{it.quantity > 1 && <span className="normal-case font-normal"> (per botol)</span>}
                    </label>
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

                {/* Regulator dipasangkan ke unit tertentu, jadi hanya untuk baris berkode. */}
                {tarifRegulator && it.cylinderId && (() => {
                  const { sisaSewa, sisaJual } = sisaRegulator(idx);
                  return (
                    <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2 ${sisaSewa > 0 || it.regulatorRented ? 'border-gray-200 cursor-pointer' : 'border-gray-100 text-gray-300 cursor-not-allowed'}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(it.regulatorRented)}
                          disabled={!it.regulatorRented && sisaSewa <= 0}
                          onChange={e => ubahItem(idx, {
                            regulatorRented: e.target.checked,
                            regulatorTariffId: (e.target.checked || it.regulatorSold) ? tarifRegulator.id : undefined,
                            regulatorFee: e.target.checked ? Number(tarifRegulator.rentalFee) : undefined,
                          })}
                          className="rounded border-gray-300"
                        />
                        Sewa Regulator ({formatIDR(tarifRegulator.rentalFee)})
                        {sisaSewa <= 0 && !it.regulatorRented && <span className="text-[10px]">stok habis</span>}
                      </label>
                      <label className={`flex items-center gap-2 text-sm rounded-lg border px-3 py-2 ${sisaJual > 0 || it.regulatorSold ? 'border-gray-200 cursor-pointer' : 'border-gray-100 text-gray-300 cursor-not-allowed'}`}>
                        <input
                          type="checkbox"
                          checked={Boolean(it.regulatorSold)}
                          disabled={!it.regulatorSold && sisaJual <= 0}
                          onChange={e => ubahItem(idx, {
                            regulatorSold: e.target.checked,
                            regulatorTariffId: (e.target.checked || it.regulatorRented) ? tarifRegulator.id : undefined,
                            regulatorSalePrice: e.target.checked ? Number(tarifRegulator.salePrice) : undefined,
                          })}
                          className="rounded border-gray-300"
                        />
                        Beli Regulator ({formatIDR(tarifRegulator.salePrice)})
                        {sisaJual <= 0 && !it.regulatorSold && <span className="text-[10px]">stok habis</span>}
                      </label>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        )}

        {tarifRegulator && (tarifRegulator.regulatorNewStock || 0) === 0 && (tarifRegulator.regulatorUsedStock || 0) === 0 && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-3">
            Stok regulator masih kosong, jadi pilihan sewa dan beli regulator belum bisa dipakai. Isi stoknya di Master Data &rarr; Tarif Regulator.
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
