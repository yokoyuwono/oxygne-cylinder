import React, { useMemo, useState } from 'react';
import {
  Cylinder, CylinderSize, CylinderStatus, GasOrder, GasType, JenisPesanan,
  Member, MetodeBayar, RentalTariff,
} from '../types';
import {
  AMBANG_PESANAN_LAMA, BarisAntrian, JENIS_PESANAN, daftarAntrian,
} from '../lib/antrianIsi';
import { formatIDR, formatTanggal } from '../labels';
import { usePaginasi } from '../lib/usePaginasi';
import PilihMetodeBayar from './PilihMetodeBayar';

export interface BuatPesananPayload {
  jenis: JenisPesanan;
  /** Wajib untuk TUKAR_BESAR -- tabung berkode selalu tercatat atas nama seseorang. */
  memberId?: string;
  namaPembeli: string;
  gasType?: GasType;
  size?: CylinderSize;
  quantity: number;
  cylinderMasukId?: string;
  serialTitipan?: string;
  harga?: number;
  catatan?: string;
  tanggal: string;
  bayarSekarang?: { jumlah: number; metodeBayar: MetodeBayar };
}

export interface BayarPesananPayload {
  pesananId: string;
  jumlah: number;
  metodeBayar: MetodeBayar;
  tanggal: string;
}

export interface SerahPesananPayload {
  pesananId: string;
  /** Wajib untuk TUKAR_BESAR -- tabung penuh yang diserahkan, dipilih saat ini juga. */
  cylinderKeluarId?: string;
  /** Kosong berarti pesanannya memang sudah dibayar sebelumnya. `bon` menjadikannya utang. */
  bayar?: { jumlah: number; metodeBayar?: MetodeBayar; bon?: boolean };
}

interface AntrianIsiViewProps {
  orders: GasOrder[];
  members: Member[];
  cylinders: Cylinder[];
  tariffs: RentalTariff[];
  onBuat: (p: BuatPesananPayload) => Promise<void>;
  onBayar: (p: BayarPesananPayload) => Promise<void>;
  onSerahkan: (p: SerahPesananPayload) => Promise<void>;
  onBatalkan: (id: string, alasan: string) => Promise<void>;
}

type Tab = 'menunggu' | 'tambah' | 'riwayat';

const hariIni = () => new Date().toISOString().slice(0, 10);

const inputClass =
  'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
const labelClass = 'block text-xs font-bold text-gray-500 uppercase mb-1.5';

const JENIS_PILIHAN: { id: JenisPesanan; ikon: string; keterangan: string }[] = [
  { id: 'TITIP_ISI', ikon: 'inventory', keterangan: 'Tabung milik pelanggan sendiri' },
  { id: 'TUKAR_BESAR', ikon: 'propane_tank', keterangan: 'Tabung berkode, stok isi habis' },
  { id: 'TUKAR_KECIL', ikon: 'swap_horiz', keterangan: 'Botol tanpa kode, stok isi habis' },
];

/**
 * Antrian isi: pesanan yang isinya belum diserahkan.
 *
 * Halaman ini menjawab satu pertanyaan yang selama ini cuma ada di kepala petugas:
 * siapa yang isinya belum kita serahkan, sejak kapan, dan sudah bayar atau belum.
 *
 * Uang dan barang dua tombol yang berbeda, dan itu disengaja. Pelanggan bisa bayar
 * saat menaruh tabung, saat mengambil isinya, atau belakangan sebagai bon -- kalau
 * keduanya dijadikan satu tombol, salah satu tanggalnya pasti dikarang.
 */
const AntrianIsiView: React.FC<AntrianIsiViewProps> = ({
  orders, members, cylinders, tariffs, onBuat, onBayar, onSerahkan, onBatalkan,
}) => {
  const [tab, setTab] = useState<Tab>('menunggu');
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const beri = (msg: string, type: 'success' | 'error') => {
    setFeedback({ msg, type });
    setTimeout(() => setFeedback(null), 4000);
  };

  const kodeTabung = useMemo(
    () => new Map(cylinders.map(c => [c.id, c.serialCode])),
    [cylinders]
  );

  const ringkasan = useMemo(
    () => daftarAntrian(orders, members, kodeTabung),
    [orders, members, kodeTabung]
  );

  const tarifTabung = useMemo(
    () => tariffs.filter(t => t.kind === 'CYLINDER' && t.isActive),
    [tariffs]
  );

  // ------------------------------------------------------------- Form tambah

  const [jenis, setJenis] = useState<JenisPesanan>('TITIP_ISI');
  const [memberId, setMemberId] = useState('');
  const [cariMember, setCariMember] = useState('');
  const [namaLepas, setNamaLepas] = useState('');
  const [tarifId, setTarifId] = useState('');
  const [jumlah, setJumlah] = useState(1);
  const [cylinderMasukId, setCylinderMasukId] = useState('');
  const [serialTitipan, setSerialTitipan] = useState('');
  const [harga, setHarga] = useState(0);
  const [catatan, setCatatan] = useState('');
  const [tanggal, setTanggal] = useState(hariIni());
  const [bayarSekarang, setBayarSekarang] = useState(false);
  const [metodeBayar, setMetodeBayar] = useState<MetodeBayar>('CASH');

  const memberTerpilih = members.find(m => m.id === memberId);
  const tarifTerpilih = tarifTabung.find(t => t.id === tarifId);

  const hasilCariMember = useMemo(() => {
    const q = cariMember.trim().toLowerCase();
    if (!q || memberId) return [];
    return members
      .filter(m =>
        (m.name || '').toLowerCase().includes(q) ||
        (m.companyName || '').toLowerCase().includes(q))
      .slice(0, 6);
  }, [cariMember, members, memberId]);

  // Hanya tabung yang memang tercatat atas nama pelanggan ini. Menulis pengembalian
  // untuk tabung milik orang lain memindahkan catatan pemegangnya ke orang yang
  // salah, dan pembatalan nanti mengembalikannya ke nama yang keliru pula.
  const tabungPelanggan = useMemo(
    () => (memberId ? cylinders.filter(c => c.currentHolder === memberId) : []),
    [cylinders, memberId]
  );

  const butuhMember = jenis === 'TUKAR_BESAR';
  const tabungMasuk = cylinders.find(c => c.id === cylinderMasukId);

  const bisaSimpan =
    !busy &&
    (butuhMember ? Boolean(memberId && cylinderMasukId) : Boolean(namaLepas.trim() || memberId)) &&
    (jenis === 'TUKAR_BESAR' || Boolean(tarifTerpilih)) &&
    (!bayarSekarang || harga > 0);

  const resetForm = () => {
    setMemberId('');
    setCariMember('');
    setNamaLepas('');
    setCylinderMasukId('');
    setSerialTitipan('');
    setJumlah(1);
    setHarga(0);
    setCatatan('');
    setBayarSekarang(false);
    // Metode bayar dikembalikan ke tunai, alasan yang sama seperti di Tukar Kecil:
    // yang menempel dari pesanan sebelumnya adalah cara paling mudah menandai
    // pembayaran tunai sebagai transfer.
    setMetodeBayar('CASH');
  };

  const simpan = async () => {
    if (!bisaSimpan) return;
    setBusy(true);
    try {
      await onBuat({
        jenis,
        memberId: memberId || undefined,
        namaPembeli: memberTerpilih?.companyName || namaLepas.trim() || 'Pembeli Lepas',
        gasType: (jenis === 'TUKAR_BESAR' ? tabungMasuk?.gasType : tarifTerpilih?.gasType) as GasType | undefined,
        size: (jenis === 'TUKAR_BESAR' ? tabungMasuk?.size : tarifTerpilih?.size) as CylinderSize | undefined,
        quantity: jenis === 'TUKAR_KECIL' ? jumlah : 1,
        cylinderMasukId: jenis === 'TUKAR_BESAR' ? cylinderMasukId : undefined,
        serialTitipan: jenis === 'TITIP_ISI' ? serialTitipan.trim() || undefined : undefined,
        harga: harga > 0 ? harga : undefined,
        catatan: catatan.trim() || undefined,
        tanggal: new Date(tanggal).toISOString(),
        bayarSekarang: bayarSekarang && harga > 0 ? { jumlah: harga, metodeBayar } : undefined,
      });
      beri('Pesanan tercatat dan masuk antrian.', 'success');
      resetForm();
      setTab('menunggu');
    } catch (e) {
      beri(e instanceof Error ? e.message : 'Gagal menyimpan pesanan.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------ Dialog

  const [dialogSerah, setDialogSerah] = useState<BarisAntrian | null>(null);
  const [dialogBayar, setDialogBayar] = useState<BarisAntrian | null>(null);
  const [dialogBatal, setDialogBatal] = useState<BarisAntrian | null>(null);

  const tutupDialog = () => {
    setDialogSerah(null);
    setDialogBayar(null);
    setDialogBatal(null);
  };

  const jalankan = async (kerja: () => Promise<void>, pesanSukses: string) => {
    setBusy(true);
    try {
      await kerja();
      beri(pesanSukses, 'success');
      tutupDialog();
    } catch (e) {
      beri(e instanceof Error ? e.message : 'Gagal memproses.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------------------------ Render

  const riwayat = useMemo(
    () => [...ringkasan.selesai, ...ringkasan.batal].sort((a, b) =>
      new Date(b.pesanan.tanggalSelesai || b.pesanan.tanggalMasuk).getTime() -
      new Date(a.pesanan.tanggalSelesai || a.pesanan.tanggalMasuk).getTime()),
    [ringkasan]
  );

  const paginasi = usePaginasi(riwayat, 15);

  const TabTombol: React.FC<{ id: Tab; label: string; jumlah?: number }> = ({ id, label, jumlah }) => (
    <button
      onClick={() => setTab(id)}
      className={`px-4 py-2.5 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${
        tab === id ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label}
      {jumlah !== undefined && jumlah > 0 && (
        <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${
          tab === id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-200 text-gray-600'
        }`}>{jumlah}</span>
      )}
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-5 animate-fade-in-up pb-20 md:pb-0">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Antrian Isi</h1>
        <p className="text-gray-500 text-sm">
          Pesanan yang tabungnya sudah ditaruh tapi isinya belum diserahkan.
        </p>
      </div>

      {feedback && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${
          feedback.type === 'success'
            ? 'bg-green-50 text-green-700 border-green-100'
            : 'bg-red-50 text-red-700 border-red-100'
        }`}>
          {feedback.msg}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 font-bold uppercase">Menunggu Isi</p>
          <p className="text-2xl font-bold text-gray-800 mt-1">{ringkasan.jumlahMenunggu}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 font-bold uppercase">Belum Dibayar</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{ringkasan.belumBayar}</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-4">
          <p className="text-xs text-gray-500 font-bold uppercase">Lewat {AMBANG_PESANAN_LAMA} Hari</p>
          <p className={`text-2xl font-bold mt-1 ${ringkasan.lewatAmbang > 0 ? 'text-red-600' : 'text-gray-800'}`}>
            {ringkasan.lewatAmbang}
          </p>
        </div>
      </div>

      <div className="bg-gray-100 p-1 rounded-xl inline-flex gap-1">
        <TabTombol id="menunggu" label="Menunggu" jumlah={ringkasan.jumlahMenunggu} />
        <TabTombol id="tambah" label="Tambah Pesanan" />
        <TabTombol id="riwayat" label="Riwayat" />
      </div>

      {tab === 'menunggu' && (
        <div className="space-y-3">
          {ringkasan.menunggu.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 text-center">
              <span className="material-icons text-5xl text-gray-300">task_alt</span>
              <h3 className="font-bold text-gray-800 mt-3">Tidak ada yang menunggu isi</h3>
              <p className="text-sm text-gray-500 mt-2">
                Semua pesanan sudah diserahkan.
              </p>
            </div>
          ) : ringkasan.menunggu.map(b => (
            <div key={b.pesanan.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                      {JENIS_PESANAN[b.pesanan.jenis] || b.pesanan.jenis}
                    </span>
                    {!b.sudahBayar && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                        Belum Dibayar
                      </span>
                    )}
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      b.umurHari >= AMBANG_PESANAN_LAMA
                        ? 'bg-red-50 text-red-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {b.umurHari === 0 ? 'Hari ini' : `${b.umurHari} hari`}
                    </span>
                  </div>
                  <p className="font-bold text-gray-800 mt-2">{b.nama}</p>
                  <p className="text-sm text-gray-500">{b.ringkasBarang}</p>
                  {b.pesanan.catatan && (
                    <p className="text-xs text-gray-400 mt-1 italic">{b.pesanan.catatan}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono font-bold text-gray-800">
                    {b.pesanan.harga ? formatIDR(b.pesanan.harga) : <span className="text-gray-400 text-sm">harga belum diisi</span>}
                  </p>
                  <p className="text-xs text-gray-400">Masuk {formatTanggal(b.pesanan.tanggalMasuk)}</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-gray-100">
                <button
                  onClick={() => setDialogSerah(b)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold flex items-center gap-1.5"
                >
                  <span className="material-icons text-base">outbox</span>
                  Serahkan Isi
                </button>
                {!b.sudahBayar && (
                  <button
                    onClick={() => setDialogBayar(b)}
                    className="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-bold flex items-center gap-1.5"
                  >
                    <span className="material-icons text-base">payments</span>
                    Catat Bayar
                  </button>
                )}
                <button
                  onClick={() => setDialogBatal(b)}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-bold"
                >
                  Batalkan
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'tambah' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
          <div>
            <label className={labelClass}>Jenis Pesanan</label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {JENIS_PILIHAN.map(j => (
                <button
                  key={j.id}
                  onClick={() => { setJenis(j.id); setCylinderMasukId(''); setSerialTitipan(''); }}
                  className={`text-left p-3 rounded-xl border-2 transition-all ${
                    jenis === j.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className={`material-icons text-xl ${jenis === j.id ? 'text-indigo-600' : 'text-gray-400'}`}>
                    {j.ikon}
                  </span>
                  <p className="font-bold text-sm text-gray-800 mt-1">{JENIS_PESANAN[j.id]}</p>
                  <p className="text-[11px] text-gray-500 leading-snug mt-0.5">{j.keterangan}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <label className={labelClass}>
              Pelanggan {butuhMember ? '(wajib)' : '(opsional)'}
            </label>
            <input
              value={cariMember}
              onChange={e => { setCariMember(e.target.value); setMemberId(''); setCylinderMasukId(''); }}
              className={inputClass}
              placeholder={butuhMember ? 'Cari nama atau nama usaha' : 'Kosongkan kalau pembeli lepas'}
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
                    <p className="text-xs text-gray-500">{m.companyName}</p>
                  </button>
                ))}
              </div>
            )}
            {memberTerpilih && (
              <button
                onClick={() => { setMemberId(''); setCariMember(''); setCylinderMasukId(''); }}
                className="text-xs text-gray-500 hover:text-red-500 mt-1.5"
              >
                Terpilih: <strong>{memberTerpilih.companyName}</strong> &mdash; klik untuk lepas
              </button>
            )}
            {butuhMember && !memberId && (
              <p className="text-[11px] text-amber-600 mt-1.5">
                Tukar besar memakai tabung berkode milik toko, dan tabung itu selalu tercatat
                atas nama seseorang. Pembeli lepas tidak bisa dicatat di sini.
              </p>
            )}
          </div>

          {!butuhMember && !memberId && (
            <div>
              <label className={labelClass}>Nama Pembeli</label>
              <input
                value={namaLepas}
                onChange={e => setNamaLepas(e.target.value)}
                className={inputClass}
                placeholder="Nama yang menaruh tabung"
              />
            </div>
          )}

          {jenis === 'TUKAR_BESAR' ? (
            <div>
              <label className={labelClass}>Tabung Kosong yang Ditaruh</label>
              {!memberId ? (
                <p className="text-sm text-gray-400 py-2">Pilih pelanggannya dulu.</p>
              ) : tabungPelanggan.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">
                  Tidak ada tabung yang tercatat atas nama pelanggan ini.
                </p>
              ) : (
                <select
                  value={cylinderMasukId}
                  onChange={e => setCylinderMasukId(e.target.value)}
                  className={inputClass}
                >
                  <option value="">-- pilih tabung --</option>
                  {tabungPelanggan.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.serialCode} &mdash; {c.gasType} {c.size}
                    </option>
                  ))}
                </select>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Jenis &amp; Ukuran Gas</label>
                <select value={tarifId} onChange={e => setTarifId(e.target.value)} className={inputClass}>
                  <option value="">-- pilih --</option>
                  {tarifTabung.map(t => (
                    <option key={t.id} value={t.id}>{t.gasType} {t.size}</option>
                  ))}
                </select>
              </div>
              {jenis === 'TITIP_ISI' ? (
                <div>
                  <label className={labelClass}>Kode Tabung Pelanggan</label>
                  <input
                    value={serialTitipan}
                    onChange={e => setSerialTitipan(e.target.value)}
                    className={inputClass}
                    placeholder="Ditulis apa adanya dari badan tabung"
                  />
                  <p className="text-[11px] text-gray-400 mt-1">
                    Tabung ini milik pelanggan &mdash; tidak masuk stok toko.
                  </p>
                </div>
              ) : (
                <div>
                  <label className={labelClass}>Jumlah Botol</label>
                  <input
                    type="number"
                    min={1}
                    value={jumlah}
                    onChange={e => setJumlah(Math.max(1, Number(e.target.value) || 1))}
                    className={`${inputClass} font-mono`}
                  />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Harga (boleh dikosongkan)</label>
              <input
                type="number"
                min={0}
                step={1000}
                value={harga || ''}
                onChange={e => setHarga(Number(e.target.value) || 0)}
                className={`${inputClass} font-mono`}
                placeholder="0"
              />
              <p className="text-[11px] text-gray-400 mt-1">
                Untuk titip isi harganya sering baru ketahuan setelah pabrik menagih.
              </p>
            </div>
            <div>
              <label className={labelClass}>Tanggal Tabung Masuk</label>
              <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className={inputClass} />
            </div>
          </div>

          <div>
            <label className={labelClass}>Catatan (opsional)</label>
            <input value={catatan} onChange={e => setCatatan(e.target.value)} className={inputClass} />
          </div>

          <div className="pt-4 border-t border-gray-100 space-y-3">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={bayarSekarang}
                onChange={e => setBayarSekarang(e.target.checked)}
                className="w-4 h-4 rounded accent-indigo-600"
              />
              <span className="text-sm font-bold text-gray-700">Bayar sekarang</span>
              <span className="text-xs text-gray-400">Uangnya tercatat pada tanggal di atas</span>
            </label>
            {bayarSekarang && (
              <>
                <PilihMetodeBayar nilai={metodeBayar} onGanti={setMetodeBayar} />
                {harga <= 0 && (
                  <p className="text-[11px] text-amber-600">Isi harganya dulu untuk mencatat pembayaran.</p>
                )}
              </>
            )}
          </div>

          <button
            onClick={simpan}
            disabled={!bisaSimpan}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold flex items-center justify-center gap-2"
          >
            <span className="material-icons text-lg">pending_actions</span>
            {busy ? 'Menyimpan...' : 'Catat Pesanan'}
          </button>
        </div>
      )}

      {tab === 'riwayat' && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          {riwayat.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-gray-400">Belum ada pesanan yang selesai.</p>
          ) : (
            <>
              <div className="divide-y divide-gray-100">
                {paginasi.halamanIni.map(b => (
                  <div key={b.pesanan.id} className="px-6 py-4 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                          b.pesanan.status === 'SELESAI'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}>
                          {b.pesanan.status === 'SELESAI' ? 'Diserahkan' : 'Dibatalkan'}
                        </span>
                        <span className="text-xs text-gray-400">
                          {JENIS_PESANAN[b.pesanan.jenis] || b.pesanan.jenis}
                        </span>
                      </div>
                      <p className="font-bold text-gray-800 text-sm mt-1">{b.nama}</p>
                      <p className="text-xs text-gray-500">{b.ringkasBarang}</p>
                      {b.pesanan.alasanBatal && (
                        <p className="text-xs text-red-500 mt-0.5 italic">{b.pesanan.alasanBatal}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm text-gray-700">
                        {b.pesanan.harga ? formatIDR(b.pesanan.harga) : '-'}
                      </p>
                      <p className="text-xs text-gray-400">
                        {formatTanggal(b.pesanan.tanggalSelesai || b.pesanan.tanggalMasuk)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {paginasi.totalHalaman > 1 && (
                <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    Halaman {paginasi.halaman} dari {paginasi.totalHalaman}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => paginasi.setHalaman(h => Math.max(1, h - 1))}
                      disabled={paginasi.halaman <= 1}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
                    >
                      Sebelumnya
                    </button>
                    <button
                      onClick={() => paginasi.setHalaman(h => h + 1)}
                      disabled={paginasi.halaman >= paginasi.totalHalaman}
                      className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40"
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {dialogSerah && (
        <DialogSerah
          baris={dialogSerah}
          cylinders={cylinders}
          busy={busy}
          onTutup={tutupDialog}
          onKirim={p => jalankan(() => onSerahkan(p), 'Isi diserahkan, pesanan selesai.')}
        />
      )}

      {dialogBayar && (
        <DialogBayar
          baris={dialogBayar}
          busy={busy}
          onTutup={tutupDialog}
          onKirim={p => jalankan(() => onBayar(p), 'Pembayaran tercatat.')}
        />
      )}

      {dialogBatal && (
        <DialogBatal
          baris={dialogBatal}
          busy={busy}
          onTutup={tutupDialog}
          onKirim={alasan => jalankan(() => onBatalkan(dialogBatal.pesanan.id, alasan), 'Pesanan dibatalkan.')}
        />
      )}
    </div>
  );
};

// ------------------------------------------------------------------- Dialog

const Bingkai: React.FC<{ judul: string; onTutup: () => void; children: React.ReactNode }> = ({
  judul, onTutup, children,
}) => (
  <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onTutup}>
    <div
      className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4 animate-fade-in-up"
      onClick={e => e.stopPropagation()}
    >
      <h3 className="font-bold text-lg text-gray-800">{judul}</h3>
      {children}
    </div>
  </div>
);

/**
 * Penyerahan isi.
 *
 * Untuk tukar besar, tabung penuhnya dipilih di sini -- bukan saat pesanan dibuat.
 * Waktu tabung kosongnya masuk, isi memang sedang habis; tabung mana yang akhirnya
 * diserahkan baru diketahui setelah stok datang.
 */
const DialogSerah: React.FC<{
  baris: BarisAntrian;
  cylinders: Cylinder[];
  busy: boolean;
  onTutup: () => void;
  onKirim: (p: SerahPesananPayload) => void;
}> = ({ baris, cylinders, busy, onTutup, onKirim }) => {
  const { pesanan, sudahBayar } = baris;
  const perluTabung = pesanan.jenis === 'TUKAR_BESAR';

  const [cylinderKeluarId, setCylinderKeluarId] = useState('');
  const [caraBayar, setCaraBayar] = useState<'tunda' | 'sekarang' | 'bon'>(sudahBayar ? 'tunda' : 'sekarang');
  const [jumlah, setJumlah] = useState(Number(pesanan.harga) || 0);
  const [metodeBayar, setMetodeBayar] = useState<MetodeBayar>('CASH');

  const siap = useMemo(
    () => cylinders.filter(c =>
      c.status === CylinderStatus.Available &&
      (!pesanan.gasType || c.gasType === pesanan.gasType) &&
      (!pesanan.size || c.size === pesanan.size)),
    [cylinders, pesanan.gasType, pesanan.size]
  );

  const bisaKirim =
    !busy &&
    (!perluTabung || Boolean(cylinderKeluarId)) &&
    (sudahBayar || caraBayar === 'tunda' || jumlah > 0) &&
    (caraBayar !== 'bon' || Boolean(pesanan.memberId));

  return (
    <Bingkai judul="Serahkan Isi" onTutup={onTutup}>
      <div className="bg-gray-50 rounded-xl p-3 text-sm">
        <p className="font-bold text-gray-800">{baris.nama}</p>
        <p className="text-gray-500">{baris.ringkasBarang}</p>
      </div>

      {perluTabung && (
        <div>
          <label className={labelClass}>Tabung Penuh yang Diserahkan</label>
          {siap.length === 0 ? (
            <p className="text-sm text-amber-600 py-2">
              Belum ada tabung siap sewa yang cocok. Isi stoknya dulu lewat halaman Pabrik.
            </p>
          ) : (
            <select value={cylinderKeluarId} onChange={e => setCylinderKeluarId(e.target.value)} className={inputClass}>
              <option value="">-- pilih tabung --</option>
              {siap.map(c => (
                <option key={c.id} value={c.id}>{c.serialCode} &mdash; {c.gasType} {c.size}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {sudahBayar ? (
        <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-3 py-2">
          Pesanan ini sudah dibayar. Tidak ada uang yang dicatat lagi hari ini.
        </p>
      ) : (
        <div className="space-y-3">
          <label className={labelClass}>Pembayaran</label>
          <div className="flex flex-wrap gap-2">
            {([
              { id: 'sekarang', label: 'Bayar sekarang' },
              { id: 'bon', label: 'Bayar nanti (bon)' },
              { id: 'tunda', label: 'Catat belakangan' },
            ] as const).map(o => (
              <button
                key={o.id}
                onClick={() => setCaraBayar(o.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border-2 ${
                  caraBayar === o.id ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-500'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {caraBayar !== 'tunda' && (
            <div>
              <label className={labelClass}>Jumlah</label>
              <input
                type="number"
                min={0}
                step={1000}
                value={jumlah || ''}
                onChange={e => setJumlah(Number(e.target.value) || 0)}
                className={`${inputClass} font-mono`}
              />
            </div>
          )}

          {caraBayar === 'sekarang' && <PilihMetodeBayar nilai={metodeBayar} onGanti={setMetodeBayar} />}

          {caraBayar === 'bon' && !pesanan.memberId && (
            <p className="text-[11px] text-red-600">
              Bon hanya bisa untuk pelanggan terdaftar &mdash; pesanan ini atas nama pembeli lepas.
            </p>
          )}
          {caraBayar === 'bon' && pesanan.memberId && (
            <p className="text-[11px] text-gray-500">
              Masuk daftar Bon Pelanggan, sama seperti sewa yang dibayar nanti.
            </p>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button onClick={onTutup} className="flex-1 py-2.5 border border-gray-300 rounded-xl font-bold text-gray-600">
          Batal
        </button>
        <button
          onClick={() => onKirim({
            pesananId: pesanan.id,
            cylinderKeluarId: perluTabung ? cylinderKeluarId : undefined,
            bayar: sudahBayar || caraBayar === 'tunda'
              ? undefined
              : { jumlah, metodeBayar: caraBayar === 'bon' ? undefined : metodeBayar, bon: caraBayar === 'bon' },
          })}
          disabled={!bisaKirim}
          className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold"
        >
          {busy ? 'Memproses...' : 'Serahkan'}
        </button>
      </div>
    </Bingkai>
  );
};

const DialogBayar: React.FC<{
  baris: BarisAntrian;
  busy: boolean;
  onTutup: () => void;
  onKirim: (p: BayarPesananPayload) => void;
}> = ({ baris, busy, onTutup, onKirim }) => {
  const [jumlah, setJumlah] = useState(Number(baris.pesanan.harga) || 0);
  const [metodeBayar, setMetodeBayar] = useState<MetodeBayar>('CASH');
  const [tanggal, setTanggal] = useState(hariIni());

  return (
    <Bingkai judul="Catat Pembayaran" onTutup={onTutup}>
      <div className="bg-gray-50 rounded-xl p-3 text-sm">
        <p className="font-bold text-gray-800">{baris.nama}</p>
        <p className="text-gray-500">{baris.ringkasBarang}</p>
      </div>

      <div>
        <label className={labelClass}>Jumlah</label>
        <input
          type="number"
          min={0}
          step={1000}
          value={jumlah || ''}
          onChange={e => setJumlah(Number(e.target.value) || 0)}
          className={`${inputClass} font-mono`}
        />
      </div>

      <div>
        <label className={labelClass}>Tanggal Uang Diterima</label>
        <input type="date" value={tanggal} onChange={e => setTanggal(e.target.value)} className={inputClass} />
      </div>

      <PilihMetodeBayar nilai={metodeBayar} onGanti={setMetodeBayar} />

      <div className="flex gap-2 pt-2">
        <button onClick={onTutup} className="flex-1 py-2.5 border border-gray-300 rounded-xl font-bold text-gray-600">
          Batal
        </button>
        <button
          onClick={() => onKirim({
            pesananId: baris.pesanan.id,
            jumlah,
            metodeBayar,
            tanggal: new Date(tanggal).toISOString(),
          })}
          disabled={busy || jumlah <= 0}
          className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold"
        >
          {busy ? 'Menyimpan...' : 'Simpan'}
        </button>
      </div>
    </Bingkai>
  );
};

const DialogBatal: React.FC<{
  baris: BarisAntrian;
  busy: boolean;
  onTutup: () => void;
  onKirim: (alasan: string) => void;
}> = ({ baris, busy, onTutup, onKirim }) => {
  const [alasan, setAlasan] = useState('');

  return (
    <Bingkai judul="Batalkan Pesanan" onTutup={onTutup}>
      <p className="text-sm text-gray-600">
        Tabung dan catatan uangnya dikembalikan ke keadaan sebelum pesanan ini dibuat.
        {baris.sudahBayar && ' Uang yang sudah diterima tidak ikut dikembalikan — catat pengembaliannya lewat Uang Keluar.'}
      </p>

      <div>
        <label className={labelClass}>Alasan (wajib)</label>
        <input
          value={alasan}
          onChange={e => setAlasan(e.target.value)}
          className={inputClass}
          placeholder="Salah catat, pelanggan membatalkan, ..."
        />
      </div>

      <div className="flex gap-2 pt-2">
        <button onClick={onTutup} className="flex-1 py-2.5 border border-gray-300 rounded-xl font-bold text-gray-600">
          Tutup
        </button>
        <button
          onClick={() => onKirim(alasan.trim())}
          disabled={busy || !alasan.trim()}
          className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl font-bold"
        >
          {busy ? 'Memproses...' : 'Batalkan'}
        </button>
      </div>
    </Bingkai>
  );
};

export default AntrianIsiView;
