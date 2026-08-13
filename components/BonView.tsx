import React, { useMemo, useState } from 'react';
import { Member, Transaction } from '../types';
import { formatIDR, formatTanggal, labelJenisTransaksi } from '../labels';
import { hariIni } from '../lib/laporanHarian';
import { usePaginasi } from '../lib/usePaginasi';
import Paginasi from './Paginasi';
import {
  AMBANG_MENUNGGAK,
  BarisBon,
  UrutanBon,
  daftarBon,
  saringBon,
  urutkanBon,
} from '../lib/bon';

export interface BayarBonPayload {
  memberId: string;
  jumlah: number;
  /** Tagihan yang ikut ditandai lunas -- hanya diisi saat bonnya habis. */
  billIds: string[];
  tanggal: string;
  catatan?: string;
}

export interface TambahBonPayload {
  memberId: string;
  jumlah: number;
  tanggal: string;
}

interface BonViewProps {
  members: Member[];
  transactions: Transaction[];
  onBayar: (payload: BayarBonPayload) => Promise<void>;
  onTambah: (payload: TambahBonPayload) => Promise<void>;
}

const inputClass = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none';
const labelClass = 'block text-xs font-bold text-gray-500 uppercase mb-1.5';

const PER_HALAMAN = 15;

/**
 * Sebagian besar pelanggan lama tidak punya nomor telepon, dan kolomnya diisi '-'
 * saat pendataan. Tanpa saringan ini barisnya berbunyi "NAMA · -".
 */
const adaTelepon = (nomor?: string) => Boolean(nomor && nomor.trim() && nomor.trim() !== '-');

/**
 * Daftar siapa saja yang masih berbon, sekaligus tempat mencatat cicilannya.
 *
 * Sebelum ini bon hanya bisa dilihat satu per satu lewat detail pelanggan, jadi
 * pertanyaan yang sebenarnya dipakai sehari-hari -- siapa saja yang belum bayar dan
 * siapa yang paling lama menunggak -- menuntut membuka 1.300 kartu pelanggan satu
 * per satu. Beranda memang menampilkan totalnya, tapi berhenti di lima nama teratas
 * dan tidak punya tombol apa pun.
 *
 * Mencicil dan melunasi memakai satu form yang sama karena keduanya cuma berbeda
 * nominal; tombol "Lunasi" hanya mengisikan sisa bonnya ke kolom yang sama supaya
 * kasus paling sering tidak perlu mengetik angka panjang yang rawan salah.
 */
const BonView: React.FC<BonViewProps> = ({ members, transactions, onBayar, onTambah }) => {
  const [kataKunci, setKataKunci] = useState('');
  const [urutan, setUrutan] = useState<UrutanBon>('terbesar');
  const [dibuka, setDibuka] = useState<string | null>(null);
  const [bayar, setBayar] = useState<BarisBon | null>(null);
  const [tambah, setTambah] = useState(false);
  const [feedback, setFeedback] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const ringkasan = useMemo(() => daftarBon(members, transactions), [members, transactions]);

  const terlihat = useMemo(
    () => urutkanBon(saringBon(ringkasan.baris, kataKunci), urutan),
    [ringkasan.baris, kataKunci, urutan]);

  const { halamanIni, halaman, totalHalaman, totalBaris, setHalaman } = usePaginasi(terlihat, PER_HALAMAN);

  const selesaiBayar = (pesan: string) => {
    setFeedback({ msg: pesan, type: 'success' });
    setTimeout(() => setFeedback(null), 4000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-5 animate-fade-in-up pb-20 md:pb-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Bon Pelanggan</h1>
          <p className="text-gray-500 text-sm">
            Pelanggan yang belum melunasi sewa atau tukar isi, beserta pencatatan cicilannya.
          </p>
        </div>
        <button
          onClick={() => setTambah(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold"
        >
          <span className="material-icons text-lg">add</span>
          Tambah Bon
        </button>
      </div>

      {feedback && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium border ${feedback.type === 'success' ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
          {feedback.msg}
        </div>
      )}

      {/* Di HP tiga kartu bertumpuk mendorong daftarnya keluar layar, padahal daftar
          itu isi halamannya. Totalnya tetap selebar layar, dua angka pendukungnya
          berbagi satu baris. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
        <Kartu ikon="receipt_long" judul="Total Bon" nilai={formatIDR(ringkasan.total)} warna="text-red-600" lebar />
        <Kartu ikon="groups" judul="Pelanggan Berbon" nilai={`${ringkasan.baris.length}`} warna="text-gray-800" />
        <Kartu
          ikon="schedule"
          judul={`Lewat ${AMBANG_MENUNGGAK} Hari`}
          nilai={`${ringkasan.jumlahMenunggak}`}
          warna={ringkasan.jumlahMenunggak > 0 ? 'text-amber-600' : 'text-gray-800'}
        />
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <span className="material-icons absolute left-3 top-2 text-gray-400 text-lg">search</span>
            <input
              type="text"
              value={kataKunci}
              onChange={e => setKataKunci(e.target.value)}
              className={`${inputClass} pl-10`}
              placeholder="Cari nama, usaha, atau nomor telepon"
            />
          </div>
          <select
            value={urutan}
            onChange={e => setUrutan(e.target.value as UrutanBon)}
            className={`${inputClass} sm:w-52`}
          >
            <option value="terbesar">Bon terbesar</option>
            <option value="terlama">Paling lama menunggak</option>
            <option value="nama">Nama usaha (A-Z)</option>
          </select>
        </div>

        {halamanIni.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Pelanggan</th>
                  <th className="px-4 py-2 font-medium w-36">Bon Sejak</th>
                  <th className="px-4 py-2 font-medium text-right w-36">Sisa Bon</th>
                  <th className="px-4 py-2 font-medium w-48 text-right">Tindakan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {halamanIni.map(b => (
                  <BarisPelanggan
                    key={b.member.id}
                    baris={b}
                    terbuka={dibuka === b.member.id}
                    onBuka={() => setDibuka(dibuka === b.member.id ? null : b.member.id)}
                    onBayar={() => setBayar(b)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <span className="material-icons text-4xl text-gray-200 mb-2 block">receipt_long</span>
            <p className="text-sm text-gray-400">
              {kataKunci ? 'Tidak ada pelanggan berbon yang cocok dengan pencarian.' : 'Tidak ada bon yang belum lunas.'}
            </p>
          </div>
        )}
      </div>

      <Paginasi
        halaman={halaman}
        totalHalaman={totalHalaman}
        totalBaris={totalBaris}
        perHalaman={PER_HALAMAN}
        onPindah={setHalaman}
      />

      {bayar && (
        <FormBayar
          baris={bayar}
          onTutup={() => setBayar(null)}
          onSimpan={onBayar}
          onSelesai={selesaiBayar}
        />
      )}

      {tambah && (
        <FormTambah
          members={members}
          onTutup={() => setTambah(false)}
          onSimpan={onTambah}
          onSelesai={selesaiBayar}
        />
      )}
    </div>
  );
};

// --------------------------------------------------------------------------- Kartu

const Kartu: React.FC<{
  ikon: string;
  judul: string;
  nilai: string;
  warna: string;
  lebar?: boolean;
}> = ({ ikon, judul, nilai, warna, lebar }) => (
  <div className={`bg-white rounded-2xl shadow-sm border border-gray-100 p-4 sm:p-5 ${lebar ? 'col-span-2 sm:col-span-1' : ''}`}>
    <div className="flex items-center gap-2 text-gray-400 mb-1">
      <span className="material-icons text-base sm:text-lg">{ikon}</span>
      <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider leading-tight">{judul}</p>
    </div>
    <p className={`text-xl sm:text-2xl font-bold ${warna}`}>{nilai}</p>
  </div>
);

// --------------------------------------------------------------------------- Baris

const BarisPelanggan: React.FC<{
  baris: BarisBon;
  terbuka: boolean;
  onBuka: () => void;
  onBayar: () => void;
}> = ({ baris, terbuka, onBuka, onBayar }) => {
  const menunggak = (baris.umurHari ?? 0) >= AMBANG_MENUNGGAK;

  return (
    <>
      <tr className="hover:bg-gray-50 align-top">
        <td className="px-4 py-3">
          <button onClick={onBuka} className="text-left group">
            <p className="font-bold text-gray-800 group-hover:text-indigo-600 flex items-center gap-1">
              <span className="material-icons text-base text-gray-300 group-hover:text-indigo-500">
                {terbuka ? 'expand_more' : 'chevron_right'}
              </span>
              {baris.member.companyName}
            </p>
            <p className="text-xs text-gray-500 pl-5">
              {baris.member.name}
              {adaTelepon(baris.member.phone) && ` · ${baris.member.phone}`}
            </p>
          </button>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          {baris.sejak ? (
            <>
              <p className="text-gray-600">{formatTanggal(baris.sejak)}</p>
              <p className={`text-xs font-medium ${menunggak ? 'text-amber-600' : 'text-gray-400'}`}>
                {baris.umurHari} hari
              </p>
            </>
          ) : (
            <span className="text-xs text-gray-400">Tidak tercatat</span>
          )}
        </td>
        <td className="px-4 py-3 text-right whitespace-nowrap">
          <p className="font-bold text-red-600">{formatIDR(baris.sisa)}</p>
          {baris.totalDibayar > 0 && (
            <p className="text-xs text-green-600">sudah dicicil {formatIDR(baris.totalDibayar)}</p>
          )}
        </td>
        <td className="px-4 py-3 text-right">
          <button
            onClick={onBayar}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold"
          >
            <span className="material-icons text-sm">payments</span>
            Catat Pembayaran
          </button>
        </td>
      </tr>

      {terbuka && (
        <tr className="bg-gray-50/70">
          <td colSpan={4} className="px-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Rincian
                judul="Asal Bon"
                kosong="Bon ini tidak punya jejak transaksi -- kemungkinan saldo awal yang dicatat langsung."
                catatan={
                  baris.tagihan.length > 0
                    ? 'Tagihan yang belum pernah ditandai lunas. Cicilan tidak memotong daftar ini, jadi jumlahnya bisa lebih besar dari sisa bon di sebelah.'
                    : undefined
                }
                isi={baris.tagihan.map(t => ({
                  id: t.id,
                  tanggal: t.date,
                  teks: labelJenisTransaksi(t.type),
                  nominal: t.cost || 0,
                  warna: 'text-gray-800',
                }))}
              />
              <Rincian
                judul="Riwayat Cicilan"
                kosong="Belum ada cicilan yang masuk."
                isi={baris.cicilan.map(t => ({
                  id: t.id,
                  tanggal: t.date,
                  teks: t.description || 'Pembayaran',
                  nominal: t.cost || 0,
                  warna: 'text-green-600',
                }))}
              />
            </div>
          </td>
        </tr>
      )}
    </>
  );
};

const Rincian: React.FC<{
  judul: string;
  kosong: string;
  catatan?: string;
  isi: { id: string; tanggal: string; teks: string; nominal: number; warna: string }[];
}> = ({ judul, kosong, catatan, isi }) => (
  <div>
    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">{judul}</h3>
    {isi.length > 0 ? (
      <>
        <ul className="space-y-1.5">
          {isi.map(r => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-gray-500 text-xs whitespace-nowrap">{formatTanggal(r.tanggal)}</span>
              <span className="flex-1 text-gray-700 truncate">{r.teks}</span>
              <span className={`font-medium whitespace-nowrap ${r.warna}`}>{formatIDR(r.nominal)}</span>
            </li>
          ))}
        </ul>
        {catatan && <p className="text-xs text-gray-400 mt-2 leading-relaxed">{catatan}</p>}
      </>
    ) : (
      <p className="text-sm text-gray-400">{kosong}</p>
    )}
  </div>
);

// --------------------------------------------------------------------------- Form bayar

const FormBayar: React.FC<{
  baris: BarisBon;
  onTutup: () => void;
  onSimpan: (payload: BayarBonPayload) => Promise<void>;
  onSelesai: (pesan: string) => void;
}> = ({ baris, onTutup, onSimpan, onSelesai }) => {
  const [nominal, setNominal] = useState('');
  const [tanggal, setTanggal] = useState(hariIni);
  const [catatan, setCatatan] = useState('');
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const jumlah = Number(nominal) || 0;
  const lunas = jumlah >= baris.sisa;
  const sisaSetelah = Math.max(0, baris.sisa - jumlah);
  const siap = jumlah > 0 && jumlah <= baris.sisa && Boolean(tanggal);

  const simpan = async () => {
    if (!siap || busy) return;

    setBusy(true);
    setGalat(null);
    try {
      await onSimpan({
        memberId: baris.member.id,
        jumlah,
        // Tagihan hanya ditandai lunas saat bonnya benar-benar habis. Cicilan
        // sebagian tidak bisa ditunjuk melunasi tagihan yang mana, dan menebaknya
        // membuat catatan tagihan berbeda dari uang yang benar-benar masuk.
        billIds: lunas ? baris.tagihan.map(t => t.id) : [],
        tanggal: new Date(tanggal).toISOString(),
        catatan: catatan.trim() || undefined,
      });
      onSelesai(
        lunas
          ? `Bon ${baris.member.companyName} lunas.`
          : `Cicilan ${formatIDR(jumlah)} dari ${baris.member.companyName} tercatat. Sisa bon ${formatIDR(sisaSetelah)}.`
      );
      onTutup();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Gagal menyimpan pembayaran.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
        <div className="bg-red-600 px-6 py-4 flex justify-between items-center text-white">
          <h3 className="font-bold flex items-center gap-2">
            <span className="material-icons">payments</span> Catat Pembayaran Bon
          </h3>
          <button onClick={onTutup} className="text-red-200 hover:text-white">
            <span className="material-icons">close</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="font-bold text-gray-800">{baris.member.companyName}</p>
            <p className="text-xs text-gray-500 mb-2">{baris.member.name}</p>
            <p className="text-xs text-gray-500 uppercase font-bold">Sisa Bon</p>
            <p className="text-2xl font-bold text-red-600">{formatIDR(baris.sisa)}</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`${labelClass} mb-0`} htmlFor="nominal-bon">Jumlah Dibayar</label>
              <button
                onClick={() => setNominal(String(baris.sisa))}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
              >
                Lunasi semua
              </button>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500 text-sm">Rp</span>
              <input
                id="nominal-bon"
                type="number"
                min={1}
                max={baris.sisa}
                value={nominal}
                onChange={e => setNominal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') simpan(); }}
                className={`${inputClass} pl-10 font-bold text-lg`}
                placeholder="0"
                autoFocus
              />
            </div>
            {jumlah > baris.sisa && (
              <p className="text-xs text-red-600 mt-1">Melebihi sisa bon. Kelebihan uang dicatat lewat Uang Masuk, bukan di sini.</p>
            )}
            {siap && (
              <p className="text-xs text-gray-500 mt-1.5">
                {lunas ? 'Bon jadi lunas.' : `Sisa bon setelah ini ${formatIDR(sisaSetelah)}.`}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="tanggal-bon">Tanggal Bayar</label>
              <input
                id="tanggal-bon"
                type="date"
                value={tanggal}
                max={hariIni()}
                onChange={e => setTanggal(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="catatan-bon">Catatan (opsional)</label>
              <input
                id="catatan-bon"
                type="text"
                value={catatan}
                onChange={e => setCatatan(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') simpan(); }}
                className={inputClass}
                placeholder="Cicilan ke-2"
              />
            </div>
          </div>

          {galat && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{galat}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onTutup} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">
              Batal
            </button>
            <button
              onClick={simpan}
              disabled={!siap || busy}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold flex items-center gap-2"
            >
              <span className="material-icons text-base">{busy ? 'hourglass_top' : 'check'}</span>
              {busy ? 'Menyimpan...' : lunas && siap ? 'Lunasi Bon' : 'Catat Cicilan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --------------------------------------------------------------------------- Form tambah

/** Sebanyak-banyaknya nama yang ditawarkan sekaligus saat mengetik. */
const BATAS_SARAN = 8;

/**
 * Mencatat bon yang tidak lahir dari sewa atau tukar isi di sistem ini -- umumnya
 * tagihan yang sudah berjalan di buku sebelum sistem dipakai.
 *
 * Pelanggan dipilih lewat ketik-cari, bukan daftar gulung: ada 1.300 nama, dan
 * memilih dari daftar sepanjang itu lebih lambat daripada mengetik tiga huruf.
 */
const FormTambah: React.FC<{
  members: Member[];
  onTutup: () => void;
  onSimpan: (payload: TambahBonPayload) => Promise<void>;
  onSelesai: (pesan: string) => void;
}> = ({ members, onTutup, onSimpan, onSelesai }) => {
  const [cari, setCari] = useState('');
  const [dipilih, setDipilih] = useState<Member | null>(null);
  const [nominal, setNominal] = useState('');
  const [tanggal, setTanggal] = useState(hariIni);
  const [busy, setBusy] = useState(false);
  const [galat, setGalat] = useState<string | null>(null);

  const saran = useMemo(() => {
    const kunci = cari.trim().toLowerCase();
    if (!kunci) return [];

    return members
      .filter(m =>
        [m.companyName, m.name, m.phone].some(nilai => (nilai || '').toLowerCase().includes(kunci)))
      .slice(0, BATAS_SARAN);
  }, [members, cari]);

  const jumlah = Number(nominal) || 0;
  const siap = Boolean(dipilih) && jumlah > 0 && Boolean(tanggal);

  const simpan = async () => {
    if (!siap || !dipilih || busy) return;

    setBusy(true);
    setGalat(null);
    try {
      await onSimpan({
        memberId: dipilih.id,
        jumlah,
        tanggal: new Date(tanggal).toISOString(),
      });
      onSelesai(`Bon ${formatIDR(jumlah)} atas nama ${dipilih.companyName} tercatat.`);
      onTutup();
    } catch (e) {
      setGalat(e instanceof Error ? e.message : 'Gagal menyimpan bon.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
        <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
          <h3 className="font-bold flex items-center gap-2">
            <span className="material-icons">post_add</span> Tambah Bon
          </h3>
          <button onClick={onTutup} className="text-indigo-200 hover:text-white">
            <span className="material-icons">close</span>
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <label className={labelClass} htmlFor="cari-pelanggan">Nama Pelanggan</label>

            {dipilih ? (
              <div className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="font-bold text-gray-800 text-sm truncate">{dipilih.companyName}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {dipilih.name}
                    {adaTelepon(dipilih.phone) && ` · ${dipilih.phone}`}
                  </p>
                </div>
                <button
                  onClick={() => { setDipilih(null); setCari(''); }}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-700 whitespace-nowrap"
                >
                  Ganti
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <span className="material-icons absolute left-3 top-2 text-gray-400 text-lg">search</span>
                  <input
                    id="cari-pelanggan"
                    type="text"
                    value={cari}
                    onChange={e => setCari(e.target.value)}
                    className={`${inputClass} pl-10`}
                    placeholder="Ketik nama pelanggan"
                    autoFocus
                  />
                </div>

                {cari.trim() && (
                  <div className="mt-2 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-52 overflow-y-auto">
                    {saran.length > 0 ? saran.map(m => (
                      <button
                        key={m.id}
                        onClick={() => setDipilih(m)}
                        className="w-full text-left px-3 py-2 hover:bg-indigo-50"
                      >
                        <p className="text-sm font-medium text-gray-800 truncate">{m.companyName}</p>
                        <p className="text-xs text-gray-500 truncate">
                          {m.name}
                          {(m.totalDebt || 0) > 0 && ` · sudah berbon ${formatIDR(m.totalDebt)}`}
                        </p>
                      </button>
                    )) : (
                      <p className="px-3 py-3 text-sm text-gray-400">Tidak ada pelanggan yang cocok.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelClass} htmlFor="nominal-tambah">Nominal Bon</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500 text-sm">Rp</span>
                <input
                  id="nominal-tambah"
                  type="number"
                  min={1}
                  value={nominal}
                  onChange={e => setNominal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') simpan(); }}
                  className={`${inputClass} pl-10 font-bold`}
                  placeholder="0"
                />
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="tanggal-tambah">Tanggal Bon</label>
              <input
                id="tanggal-tambah"
                type="date"
                value={tanggal}
                max={hariIni()}
                onChange={e => setTanggal(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>

          {dipilih && (dipilih.totalDebt || 0) > 0 && jumlah > 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {dipilih.companyName} sudah punya bon {formatIDR(dipilih.totalDebt)}. Setelah ini jadi{' '}
              {formatIDR((dipilih.totalDebt || 0) + jumlah)}.
            </p>
          )}

          <p className="text-xs text-gray-400 leading-relaxed">
            Bon yang dicatat di sini tidak dihitung sebagai pendapatan hari ini — barangnya
            sudah terjual sebelumnya. Sewa baru yang belum dibayar tetap dicatat lewat
            Tukar Besar &amp; Sewa.
          </p>

          {galat && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{galat}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <button onClick={onTutup} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">
              Batal
            </button>
            <button
              onClick={simpan}
              disabled={!siap || busy}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold flex items-center gap-2"
            >
              <span className="material-icons text-base">{busy ? 'hourglass_top' : 'save'}</span>
              {busy ? 'Menyimpan...' : 'Simpan Bon'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BonView;
