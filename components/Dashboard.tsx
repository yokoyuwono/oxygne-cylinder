import React, { useMemo } from 'react';
import { Cylinder, Transaction, Member, GasOrder, RefillStation, RentalTariff } from '../types';
import { AMBANG_PESANAN_LAMA, RingkasanAntrian, daftarAntrian } from '../lib/antrianIsi';
import { sebutanBarang } from '../lib/bulkStock';
import { frasaKeluar } from '../lib/regulator';
import {
  ItemTindakan,
  KesiapanStok,
  NadaTindakan,
  RingkasanBon,
  RingkasanSewa,
  hitungAntrianTindakan,
  hitungBon,
  hitungKesiapanStok,
  hitungSewaTerlama,
} from '../lib/beranda';
import { formatIDR, formatJam, formatTanggal, labelJenisTransaksi } from '../labels';
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

  const antrian = useMemo(
    () => hitungAntrianTindakan(cylinders, transactions, members, tariffs, gasOrders),
    [cylinders, transactions, members, tariffs, gasOrders]);

  const stok = useMemo(
    () => hitungKesiapanStok(cylinders, transactions, tariffs),
    [cylinders, transactions, tariffs]);

  const sewa = useMemo(
    () => hitungSewaTerlama(cylinders, transactions, members),
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

  const aktivitasTerbaru = useMemo(
    () => ringkasAktivitas(transactions, cylinders, members, stations),
    [transactions, cylinders, members, stations]);

  return (
    <div className="space-y-6 pb-20 md:pb-0 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Beranda</h1>
        <p className="text-sm text-gray-500">
          {formatTanggal(new Date(), { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      <AntrianTindakan antrian={antrian} onBuka={navigate} />

      <KesiapanStokBlok stok={stok} />

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

      <AktivitasTerbaru aktivitas={aktivitasTerbaru} onLihatSemua={() => navigate('/history')} />
    </div>
  );
};

// ------------------------------------------------------------------ Perlu tindakan

const NADA: Record<NadaTindakan, { wadah: string; ikon: string }> = {
  bahaya: { wadah: 'bg-red-50 border-red-100 hover:bg-red-100', ikon: 'bg-red-100 text-red-600' },
  peringatan: { wadah: 'bg-amber-50 border-amber-100 hover:bg-amber-100', ikon: 'bg-amber-100 text-amber-600' },
  info: { wadah: 'bg-green-50 border-green-100 hover:bg-green-100', ikon: 'bg-green-100 text-green-600' },
};

const AntrianTindakan: React.FC<{ antrian: ItemTindakan[]; onBuka: (tujuan: string) => void }> = ({ antrian, onBuka }) => (
  <div className={`${KARTU} p-6`}>
    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Perlu Tindakan</h2>

    {antrian.length === 0 ? (
      <div className="flex items-center gap-3 text-gray-500">
        <span className="material-icons text-green-500">check_circle</span>
        <p className="text-sm">Tidak ada yang perlu ditindak hari ini.</p>
      </div>
    ) : (
      <div className="space-y-2">
        {antrian.map(item => {
          const nada = NADA[item.nada];
          return (
            <button
              key={item.id}
              onClick={() => onBuka(item.tujuan)}
              className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${nada.wadah}`}
            >
              <span className={`shrink-0 p-2 rounded-lg ${nada.ikon}`}>
                <span className="material-icons text-lg align-middle">{item.ikon}</span>
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-gray-800">{item.teks}</span>
                {item.detail && <span className="block text-xs text-gray-600 truncate">{item.detail}</span>}
              </span>
              <span className="material-icons text-gray-400 shrink-0">chevron_right</span>
            </button>
          );
        })}
      </div>
    )}
  </div>
);

// ------------------------------------------------------------------- Kesiapan stok

const UBIN = [
  { kunci: 'siapSewa' as const, label: 'Siap Sewa', ikon: 'check_circle', warna: 'bg-green-50 text-green-600' },
  { kunci: 'kosongPerluIsi' as const, label: 'Kosong', ikon: 'local_gas_station', warna: 'bg-orange-50 text-orange-600' },
  { kunci: 'diVendor' as const, label: 'Di Vendor', ikon: 'factory', warna: 'bg-yellow-50 text-yellow-600' },
  { kunci: 'dalamPengiriman' as const, label: 'Pengiriman', ikon: 'local_shipping', warna: 'bg-cyan-50 text-cyan-600' },
];

const KesiapanStokBlok: React.FC<{ stok: KesiapanStok }> = ({ stok }) => (
  <div className={`${KARTU} p-6 space-y-5`}>
    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider">Kesiapan Stok</h2>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {UBIN.map(u => (
        <div key={u.kunci} className="flex items-center gap-3">
          <span className={`shrink-0 p-3 rounded-xl ${u.warna}`}>
            <span className="material-icons align-middle">{u.ikon}</span>
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-bold text-gray-800 leading-tight">{stok[u.kunci]}</p>
            <p className="text-xs text-gray-500">{u.label}</p>
          </div>
        </div>
      ))}
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

// -------------------------------------------------------------- Tabung di pelanggan

const TabungDiPelanggan: React.FC<{ sewa: RingkasanSewa; onBuka: () => void }> = ({ sewa, onBuka }) => (
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
              {sewa.terlama.map(b => (
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
        <button
          onClick={onBuka}
          className="w-full px-6 py-3 text-sm font-medium text-indigo-600 hover:bg-indigo-50 border-t border-gray-100"
        >
          Buka Stok Tabung
        </button>
      </>
    ) : (
      <div className="p-8 text-center">
        <span className="material-icons text-4xl text-green-500 mb-2 block">check_circle</span>
        <p className="text-sm text-gray-500">Tidak ada tabung yang sedang disewa.</p>
      </div>
    )}
  </div>
);

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

// --------------------------------------------------------------------- Aktivitas

interface BarisAktivitas {
  id: string;
  tanggal: string;
  keterangan: string;
  ikon: string;
  warna: string;
}

/** Lima transaksi terakhir, sudah diterjemahkan jadi kalimat yang bisa dibaca. */
function ringkasAktivitas(
  transactions: Transaction[],
  cylinders: Cylinder[],
  members: Member[],
  stations: RefillStation[]
): BarisAktivitas[] {
  const terakhir = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  return terakhir.map(tx => {
    const cyl = cylinders.find(c => c.id === tx.cylinderId);
    const member = members.find(m => m.id === tx.memberId);
    const station = stations.find(s => s.id === tx.refillStationId);
    const barang = sebutanBarang(tx, cyl?.serialCode);

    switch (tx.type) {
      case 'RENTAL_OUT':
        return baris(tx, `${frasaKeluar(tx, cyl?.serialCode)} ke ${member?.companyName}`, 'shopping_cart_checkout', 'text-blue-600 bg-blue-50');
      case 'RETURN':
        return baris(tx, `Menerima ${barang} dari ${member?.companyName}`, 'assignment_return', 'text-green-600 bg-green-50');
      case 'REFILL_OUT':
        return baris(tx, `Mengirim ${barang} ke ${station?.name}`, 'local_shipping', 'text-orange-600 bg-orange-50');
      case 'REFILL_IN':
        return baris(tx, `Menerima kembali ${barang} dari isi ulang`, 'inventory', 'text-indigo-600 bg-indigo-50');
      case 'DEPOSIT_REFUND':
        return baris(tx, `Mengembalikan deposit ke ${member?.companyName}`, 'savings', 'text-purple-600 bg-purple-50');
      case 'DEBT_PAYMENT':
        return baris(tx, `Pembayaran utang dari ${member?.companyName}`, 'payments', 'text-emerald-600 bg-emerald-50');
      case 'DEBT_ADD':
        return baris(tx, `Bon dicatat atas nama ${member?.companyName}`, 'post_add', 'text-amber-600 bg-amber-50');
      case 'DELIVERY':
        return baris(tx, `Mengirim ${barang} untuk pengiriman`, 'local_shipping', 'text-cyan-600 bg-cyan-50');
      case 'GAS_EXCHANGE':
        // memberId boleh kosong -- tukar isi terbuka untuk pembeli lepas.
        return baris(tx, `Tukar isi ${sebutanBarang(tx)} ${member ? `untuk ${member.companyName}` : '(pembeli lepas)'}`, 'swap_horiz', 'text-teal-600 bg-teal-50');
      case 'CYLINDER_SWAP':
        // Keterangannya menyebut kode seri penggantinya, dan itu satu-satunya isi baris
        // ini -- tidak ada uang yang berpindah di sini.
        return baris(tx, `${barang}: ${tx.description || 'ditukar pabrik'}`, 'swap_horiz', 'text-amber-600 bg-amber-50');
      case 'EXPENSE':
        return baris(tx, `Biaya operasional: ${tx.description || 'tanpa keterangan'}`, 'receipt_long', 'text-rose-600 bg-rose-50');
      case 'INCOME':
        return baris(tx, `Penjualan: ${tx.description || 'tanpa keterangan'}`, 'trending_up', 'text-green-600 bg-green-50');
      default:
        // Jenis yang belum dikenal tetap muncul dengan namanya sendiri, bukan
        // gelembung kosong tanpa teks.
        return baris(tx, `${labelJenisTransaksi(tx.type)} ${barang}`, 'receipt_long', 'text-gray-600 bg-gray-100');
    }
  });
}

const baris = (tx: Transaction, keterangan: string, ikon: string, warna: string): BarisAktivitas => ({
  id: tx.id,
  tanggal: tx.date,
  keterangan,
  ikon,
  warna,
});

const AktivitasTerbaru: React.FC<{ aktivitas: BarisAktivitas[]; onLihatSemua: () => void }> = ({ aktivitas, onLihatSemua }) => (
  <div className={`${KARTU} p-6`}>
    <div className="flex justify-between items-center mb-4">
      <h2 className="font-bold text-gray-800">Aktivitas Terbaru</h2>
      <button onClick={onLihatSemua} className="text-sm font-medium text-indigo-600 hover:underline">
        Lihat Semua
      </button>
    </div>

    {aktivitas.length === 0 ? (
      <p className="text-sm text-gray-400 italic">Belum ada aktivitas.</p>
    ) : (
      <div className="space-y-4">
        {aktivitas.map(a => (
          <div key={a.id} className="flex items-start gap-4 pb-4 border-b border-gray-50 last:border-0 last:pb-0">
            <span className={`shrink-0 p-2 rounded-full ${a.warna}`}>
              <span className="material-icons text-lg align-middle">{a.ikon}</span>
            </span>
            <div className="min-w-0">
              <p className="text-sm text-gray-700">{a.keterangan}</p>
              <p className="text-xs text-gray-400">{formatTanggal(a.tanggal)} • {formatJam(a.tanggal)}</p>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default Dashboard;
