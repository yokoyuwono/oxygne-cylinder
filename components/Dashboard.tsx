import React, { useMemo, useState } from 'react';
import { Cylinder, Transaction, Member, GasOrder, RefillStation, RentalTariff, CylinderStatus } from '../types';
import { AMBANG_PESANAN_LAMA, RingkasanAntrian, daftarAntrian } from '../lib/antrianIsi';
import { LaporanHarian, hariIni, hitungLaporanHarian } from '../lib/laporanHarian';
import {
  KesiapanStok,
  RincianKodeTabung,
  RingkasanBon,
  RingkasanSewa,
  hitungBon,
  hitungKesiapanStok,
  hitungSewaTerlama,
} from '../lib/beranda';
import { formatIDR, formatTanggal } from '../labels';
import { useNavigate } from 'react-router-dom';

interface DashboardProps {
  cylinders: Cylinder[];
  transactions: Transaction[];
  members: Member[];
  stations: RefillStation[];
  tariffs: RentalTariff[];
  gasOrders: GasOrder[];
}

const KARTU = 'bg-white rounded-xl shadow-sm border border-gray-100';

const Dashboard: React.FC<DashboardProps> = ({ cylinders, transactions, members, stations, tariffs, gasOrders }) => {
  const navigate = useNavigate();

  const laporan = useMemo(
    () => hitungLaporanHarian(transactions, hariIni()),
    [transactions]);

  const stok = useMemo(
    () => hitungKesiapanStok(cylinders, transactions, tariffs),
    [cylinders, transactions, tariffs]);

  // batasBaris dinaikkan dari default 5: tabel di Beranda sekarang bisa expand
  // sampai 20 baris tanpa perlu pindah halaman, cukup untuk kebanyakan kasus
  // sebelum benar-benar butuh Stok Tabung penuh.
  const sewa = useMemo(
    () => hitungSewaTerlama(cylinders, transactions, members, undefined, 20),
    [cylinders, transactions, members]);

  const bon = useMemo(() => hitungBon(members), [members]);

  // Memakai ulang daftarAntrian, bukan menghitung sendiri: kalau Beranda dan halaman
  // Antrian Isi memakai dua perhitungan yang berbeda, keduanya bisa menunjukkan
  // jumlah yang tidak sama dan tidak ada yang tahu mana yang benar.
  const kodeTabung = useMemo(
    () => new Map(cylinders.map(c => [c.id, c.serialCode])),
    [cylinders]);

  const antrianIsi = useMemo(
    () => daftarAntrian(gasOrders, members, kodeTabung),
    [gasOrders, members, kodeTabung]);

  return (
    <div className="space-y-6 pb-20 md:pb-0 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Beranda</h1>
        <p className="text-sm text-gray-500">
          {formatTanggal(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <RingkasanHariIni laporan={laporan} onBuka={() => navigate('/kas')} />

      <KesiapanStokBlok
        stok={stok}
        onBuka={(status) => navigate(`/inventory?status=${encodeURIComponent(status)}`)}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2">
          <TabungDiPelanggan sewa={sewa} onBuka={() => navigate('/inventory')} />
        </div>

        <div className="space-y-6">
          <AksiCepat onBuka={navigate} />
          <AntrianIsiBlok antrian={antrianIsi} onBuka={() => navigate('/antrian')} />
          <BonPelanggan bon={bon} onBuka={() => navigate('/bon')} />
        </div>
      </div>
    </div>
  );
};

// -------------------------------------------------------------- Ringkasan hari ini

/**
 * Yang pertama dilihat pemilik tiap pagi: uang masuk/keluar hari ini, bukan
 * kemarin atau bulan ini. Memakai ulang hitungLaporanHarian yang sama dengan
 * Laporan -- kalau Beranda menghitung sendiri, dua angka bisa beda dan tidak ada
 * yang tahu mana yang benar (pola yang sama dipakai di Antrian Isi di bawah).
 */
const RingkasanHariIni: React.FC<{ laporan: LaporanHarian; onBuka: () => void }> = ({ laporan, onBuka }) => {
  const bersih = laporan.uangMasuk - laporan.uangKeluar;

  return (
    <button
      type="button"
      onClick={onBuka}
      className={`${KARTU} p-6 w-full text-left transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200`}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Ringkasan Hari Ini</h2>
        <span className="text-xs text-gray-400">{laporan.jumlahTransaksi} transaksi</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-500 mb-1">Uang Masuk</p>
          <p className="text-xl font-bold text-green-600">{formatIDR(laporan.uangMasuk)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500 mb-1">Uang Keluar</p>
          <p className="text-xl font-bold text-rose-600">{formatIDR(laporan.uangKeluar)}</p>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-xs text-gray-500 mb-1">Selisih Bersih</p>
          <p className={`text-xl font-bold ${bersih >= 0 ? 'text-gray-800' : 'text-rose-600'}`}>
            {bersih >= 0 ? '+' : ''}{formatIDR(bersih)}
          </p>
        </div>
      </div>
    </button>
  );
};

// ------------------------------------------------------------------- Kesiapan stok

const UBIN = [
  { kunci: 'siapSewa' as const, label: 'Siap Sewa', ikon: 'check_circle', warna: 'bg-green-50 text-green-600', status: CylinderStatus.Available },
  { kunci: 'kosongPerluIsi' as const, label: 'Kosong', ikon: 'local_gas_station', warna: 'bg-orange-50 text-orange-600', status: CylinderStatus.EmptyRefill },
  { kunci: 'diVendor' as const, label: 'Di Vendor', ikon: 'factory', warna: 'bg-yellow-50 text-yellow-600', status: CylinderStatus.Refilling },
  { kunci: 'dalamPengiriman' as const, label: 'Pengiriman', ikon: 'local_shipping', warna: 'bg-cyan-50 text-cyan-600', status: CylinderStatus.Delivery },
];

/**
 * Baris kecil di bawah tiap ubin, mis. "8.M 1.R 2.C2H2".
 *
 * Titik dipakai sebagai pemisah supaya angka dan kodenya tidak menyatu jadi satu kata:
 * "8M" terbaca seperti satu kode tabung, "8.M" jelas delapan tabung berkode M.
 */
const formatRincianKode = (rincian: RincianKodeTabung[]): string =>
  rincian.map(r => `${r.qty}.${r.prefiks}`).join(' ');

const KesiapanStokBlok: React.FC<{ stok: KesiapanStok; onBuka: (status: CylinderStatus) => void }> = ({ stok, onBuka }) => {
  // Total armada gudang -- di luar yang sedang disewa (dihitung terpisah di blok
  // Tabung di Tangan Pelanggan). Persentase ini menjawab "8 Siap Sewa itu bagus atau
  // tidak?" tanpa harus pemilik menjumlahkan sendiri di kepala.
  const totalGudang = stok.siapSewa + stok.kosongPerluIsi + stok.diVendor + stok.dalamPengiriman;
  const persenSiap = totalGudang > 0 ? Math.round((stok.siapSewa / totalGudang) * 100) : 0;

  return (
    <div className={`${KARTU} p-6 space-y-5`}>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Kesiapan Stok</h2>
        {totalGudang > 0 && (
          <span className="text-xs font-bold text-gray-500">{persenSiap}% siap dari {totalGudang} tabung gudang</span>
        )}
      </div>

      {totalGudang > 0 && (
        <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all"
            style={{ width: `${persenSiap}%` }}
          />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {UBIN.map(u => {
          const rincian = stok.rincian[u.kunci];
          return (
            <button
              key={u.kunci}
              type="button"
              onClick={() => onBuka(u.status)}
              className="flex items-center gap-3 text-left rounded-xl -m-2 p-2 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            >
              <span className={`shrink-0 p-3 rounded-xl ${u.warna}`}>
                <span className="material-icons align-middle">{u.ikon}</span>
              </span>
              <div className="min-w-0">
                <p className="text-2xl font-bold text-gray-800 leading-tight">{stok[u.kunci]}</p>
                <p className="text-xs text-gray-500">{u.label}</p>
                {rincian.length > 0 && (
                  <p
                    className="text-[11px] text-gray-400 mt-0.5 truncate"
                    title={rincian.map(r => `${r.qty} ${r.prefiks}`).join(', ')}
                  >
                    {formatRincianKode(rincian)}
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {(stok.curah.length > 0 || stok.regulator.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-100">
          {stok.curah.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Botol Curah</p>
              <ul className="space-y-1">
                {stok.curah.map(c => (
                  <li key={`${c.gasType}-${c.size}`} className="text-sm text-gray-700 flex justify-between items-baseline gap-2">
                    <span className="text-gray-500 truncate min-w-0">{c.gasType} {c.size}</span>
                    <span className="font-bold shrink-0 whitespace-nowrap">{c.qty} botol</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {stok.regulator.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Regulator</p>
              <ul className="space-y-1">
                {stok.regulator.map(r => (
                  <li key={r.nama} className="text-sm text-gray-700 flex justify-between items-baseline gap-2">
                    <span className="text-gray-500 truncate min-w-0">{r.nama}</span>
                    <span className="font-bold shrink-0 whitespace-nowrap">
                      {r.tersediaSewa} sewa <span className="text-gray-300">·</span> {r.stokBaru} baru
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// -------------------------------------------------------------- Tabung di pelanggan

/** Baris yang tampil sebelum "Lihat Semua" diklik. */
const BATAS_BARIS_SEWA = 5;

const TabungDiPelanggan: React.FC<{ sewa: RingkasanSewa; onBuka: () => void }> = ({ sewa, onBuka }) => {
  const [expanded, setExpanded] = useState(false);
  const adaLebihBanyak = sewa.terlama.length > BATAS_BARIS_SEWA;
  const baris = expanded ? sewa.terlama : sewa.terlama.slice(0, BATAS_BARIS_SEWA);

  return (
    <div className={`${KARTU} overflow-hidden`}>
      <div className="p-6 border-b border-gray-100 flex items-start justify-between gap-4">
        <div>
          <h2 className="font-bold text-gray-800">Tabung di Tangan Pelanggan</h2>
          <p className="text-sm text-gray-500 mt-0.5">{sewa.totalDisewa} tabung sedang disewa</p>
        </div>
        {sewa.lewatAmbang > 0 && (
          <span className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-red-50 text-red-700 border border-red-100">
            {sewa.lewatAmbang} lebih dari {sewa.ambangHari} hari
          </span>
        )}
      </div>

      {sewa.terlama.length > 0 ? (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-6 py-2 font-medium">Tabung</th>
                  <th className="px-6 py-2 font-medium">Pelanggan</th>
                  <th className="px-6 py-2 font-medium">Tanggal Sewa</th>
                  <th className="px-6 py-2 font-medium text-right">Durasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {baris.map(b => (
                  <tr key={b.cylinderId} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <p className="font-mono font-bold text-gray-700">{b.serialCode}</p>
                      <p className="text-[10px] text-gray-400">{b.gasType}</p>
                    </td>
                    <td className="px-6 py-3 text-gray-700">{b.namaPelanggan}</td>
                    <td className="px-6 py-3 text-gray-500">{formatTanggal(b.tanggalSewa)}</td>
                    <td className="px-6 py-3 text-right">
                      <span
                        className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                          b.hari > sewa.ambangHari ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {b.hari} hari
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex border-t border-gray-100">
            {adaLebihBanyak && (
              <button
                onClick={() => setExpanded(v => !v)}
                className="flex-1 px-6 py-3 text-sm font-medium text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1"
              >
                {expanded ? 'Tampilkan Lebih Sedikit' : `Lihat ${sewa.terlama.length - BATAS_BARIS_SEWA} Lainnya`}
                <span className="material-icons text-base">{expanded ? 'expand_less' : 'expand_more'}</span>
              </button>
            )}
            <button
              onClick={onBuka}
              className={`flex-1 px-6 py-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 ${
                adaLebihBanyak ? 'border-l border-gray-100' : ''
              }`}
            >
              Buka Stok Tabung
            </button>
          </div>
        </>
      ) : (
        <div className="p-8 text-center">
          <span className="material-icons text-4xl text-green-500 mb-2 block">check_circle</span>
          <p className="text-sm text-gray-500">Tidak ada tabung yang sedang disewa.</p>
        </div>
      )}
    </div>
  );
};

// ----------------------------------------------------------------------- Aksi cepat

// Sewa dan pengembalian dilayani satu layar yang sama di RentalForm -- keranjang sewa
// dan daftar kembali ada berdampingan di sana, jadi satu tombol saja.
const AKSI = [
  { label: 'Sewa & Kembali', ikon: 'shopping_cart', tujuan: '/rental', warna: 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100' },
  { label: 'Tukar Isi', ikon: 'swap_horiz', tujuan: '/tukar-isi', warna: 'bg-teal-50 text-teal-600 hover:bg-teal-100' },
  { label: 'Pengiriman', ikon: 'local_shipping', tujuan: '/delivery', warna: 'bg-cyan-50 text-cyan-600 hover:bg-cyan-100' },
  { label: 'Isi Ulang', ikon: 'local_gas_station', tujuan: '/refill', warna: 'bg-orange-50 text-orange-600 hover:bg-orange-100' },
  // Dua sisi kas dipisah di sini walau halamannya sama: yang dicari saat menekan
  // tombol ini selalu satu arah tertentu, dan tab yang salah adalah satu klik lagi.
  { label: 'Uang Masuk', ikon: 'trending_up', tujuan: '/kas?jenis=masuk', warna: 'bg-green-50 text-green-600 hover:bg-green-100' },
  { label: 'Uang Keluar', ikon: 'trending_down', tujuan: '/kas?jenis=keluar', warna: 'bg-rose-50 text-rose-600 hover:bg-rose-100' },
];

const AksiCepat: React.FC<{ onBuka: (tujuan: string) => void }> = ({ onBuka }) => (
  <div className={`${KARTU} p-6`}>
    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Aksi Cepat</h2>
    <div className="grid grid-cols-2 gap-3">
      {AKSI.map(a => (
        <button
          key={a.tujuan}
          onClick={() => onBuka(a.tujuan)}
          className={`flex flex-col items-center justify-center gap-1 p-4 rounded-xl transition-colors ${a.warna}`}
        >
          <span className="material-icons">{a.ikon}</span>
          <span className="text-xs font-bold text-center">{a.label}</span>
        </button>
      ))}
    </div>
  </div>
);

// --------------------------------------------------------------------------- Bon

const BonPelanggan: React.FC<{ bon: RingkasanBon; onBuka: () => void }> = ({ bon, onBuka }) => (
  <div className={`${KARTU} p-6`}>
    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Bon Pelanggan</h2>

    {bon.pelanggan.length === 0 ? (
      <div className="flex items-center gap-3 text-gray-500">
        <span className="material-icons text-green-500">check_circle</span>
        <p className="text-sm">Tidak ada bon yang belum lunas.</p>
      </div>
    ) : (
      <>
        <p className="text-2xl font-bold text-red-600">{formatIDR(bon.total)}</p>
        <p className="text-xs text-gray-500 mb-4">dari {bon.pelanggan.length} pelanggan</p>

        <ul className="space-y-2">
          {bon.pelanggan.map(p => (
            <li key={p.id} className="flex justify-between items-center gap-2 text-sm">
              <span className="text-gray-700 truncate">{p.nama}</span>
              <span className="font-bold text-gray-800 shrink-0">{formatIDR(p.jumlah)}</span>
            </li>
          ))}
        </ul>

        <button onClick={onBuka} className="mt-4 text-sm font-medium text-indigo-600 hover:underline">
          Buka Data Pelanggan
        </button>
      </>
    )}
  </div>
);

// ------------------------------------------------------------------- Antrian isi

/** Sebanyak-banyaknya pesanan yang disebut namanya di Beranda; sisanya dihitung saja. */
const BATAS_BARIS_ANTRIAN = 5;

/**
 * Pesanan yang isinya belum diserahkan.
 *
 * Sejajar dengan Bon Pelanggan di bawahnya, dan itu disengaja: keduanya utang yang
 * belum selesai, cuma berlawanan arah. Bon adalah uang yang belum masuk; antrian isi
 * adalah barang yang belum keluar, dan yang menagihnya pelanggan, bukan toko.
 *
 * Yang ditonjolkan jumlah pesanan, bukan nominalnya. Harga di pesanan cuma taksiran
 * -- untuk titip isi sering baru diketahui setelah pabrik menagih -- jadi
 * menjumlahkannya jadi satu angka besar di Beranda akan menampilkan rupiah yang tidak
 * pernah dijanjikan siapa pun.
 */
const AntrianIsiBlok: React.FC<{ antrian: RingkasanAntrian; onBuka: () => void }> = ({ antrian, onBuka }) => (
  <div className={`${KARTU} p-6`}>
    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Antrian Isi</h2>

    {antrian.jumlahMenunggu === 0 ? (
      <div className="flex items-center gap-3 text-gray-500">
        <span className="material-icons text-green-500">check_circle</span>
        <p className="text-sm">Tidak ada isi yang belum diserahkan.</p>
      </div>
    ) : (
      <>
        <p className="text-2xl font-bold text-indigo-600">{antrian.jumlahMenunggu} pesanan</p>
        <p className="text-xs text-gray-500 mb-4">
          menunggu isi
          {antrian.belumBayar > 0 && ` · ${antrian.belumBayar} belum dibayar`}
          {antrian.lewatAmbang > 0 && ` · ${antrian.lewatAmbang} lewat ${AMBANG_PESANAN_LAMA} hari`}
        </p>

        <ul className="space-y-2">
          {antrian.menunggu.slice(0, BATAS_BARIS_ANTRIAN).map(b => (
            <li key={b.pesanan.id} className="flex justify-between items-start gap-2 text-sm">
              <span className="min-w-0">
                <span className="block text-gray-700 truncate">{b.nama}</span>
                <span className="block text-xs text-gray-400 truncate">{b.ringkasBarang}</span>
              </span>
              <span
                className={`shrink-0 font-bold ${
                  b.umurHari >= AMBANG_PESANAN_LAMA ? 'text-red-600' : 'text-gray-800'
                }`}
              >
                {b.umurHari === 0 ? 'hari ini' : `${b.umurHari} hari`}
              </span>
            </li>
          ))}
        </ul>

        {antrian.jumlahMenunggu > BATAS_BARIS_ANTRIAN && (
          <p className="text-xs text-gray-400 mt-2">
            dan {antrian.jumlahMenunggu - BATAS_BARIS_ANTRIAN} lainnya
          </p>
        )}

        <button onClick={onBuka} className="mt-4 text-sm font-medium text-indigo-600 hover:underline">
          Buka Antrian Isi
        </button>
      </>
    )}
  </div>
);

export default Dashboard;
