import React, { useMemo } from 'react';
import { Cylinder, Transaction, Member, RefillStation } from '../types';
import { sebutanBarang } from '../lib/bulkStock';
import { labelJenisTransaksi } from '../labels';
import { usePaginasi } from '../lib/usePaginasi';
import Paginasi from './Paginasi';
import { useNavigate } from 'react-router-dom';

interface HistoryViewProps {
    transactions: Transaction[];
    cylinders: Cylinder[];
    members: Member[];
    stations: RefillStation[];
}

const BARIS_PER_HALAMAN = 15;

const HistoryView: React.FC<HistoryViewProps> = ({ transactions, cylinders, members, stations }) => {
    const navigate = useNavigate();

    // Dulu layar ini menembak Supabase sendiri dengan count: 'exact' setiap pindah
    // halaman -- dua permintaan untuk baris yang sudah ikut terunduh saat login dan
    // sudah diterima lewat prop `transactions` yang selama ini diabaikan.
    //
    // Sekalian memperbaiki: transaksi yang baru dicatat kini langsung muncul, karena
    // array ini yang di-update App setiap kali menyimpan.
    const riwayat = useMemo(
        () => [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
        [transactions]);

    const halaman = usePaginasi(riwayat, BARIS_PER_HALAMAN);

    // Peta menggantikan .find() per baris -- dengan 1.829 tabung dan 1.290 pelanggan,
    // pemindaian linear per baris jauh lebih mahal daripada barisnya sendiri.
    const petaTabung = useMemo(() => new Map(cylinders.map(c => [c.id, c])), [cylinders]);
    const petaPelanggan = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
    const petaVendor = useMemo(() => new Map(stations.map(s => [s.id, s])), [stations]);

    const kontrol = (
        <Paginasi
            halaman={halaman.halaman}
            totalHalaman={halaman.totalHalaman}
            totalBaris={halaman.totalBaris}
            perHalaman={halaman.perHalaman}
            onPindah={halaman.setHalaman}
        />
    );

    return (
        <div className="p-4 sm:p-6 space-y-6 animate-fade-in-up">
            {/* Header dengan tombol kembali */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/')}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <span className="material-icons text-gray-600">arrow_back</span>
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Riwayat Transaksi</h1>
                    <p className="text-sm text-gray-500">Semua riwayat aktivitas</p>
                </div>
            </div>

            {kontrol}

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="divide-y divide-gray-100">
                    {halaman.halamanIni.length > 0 ? (
                        halaman.halamanIni.map(tx => {
                            const cyl = petaTabung.get(tx.cylinderId ?? '');
                            const member = petaPelanggan.get(tx.memberId ?? '');
                            const station = petaVendor.get(tx.refillStationId ?? '');

                            let description = '';
                            let icon = '';
                            let colorClass = '';

                            // Tentukan tampilan berdasarkan tipe transaksi
                            switch (tx.type) {
                                case 'RENTAL_OUT':
                                    description = `Menyewakan ${sebutanBarang(tx, cyl?.serialCode)} ke ${member?.companyName}`;
                                    icon = 'shopping_cart_checkout';
                                    colorClass = 'text-blue-600 bg-blue-50';
                                    break;
                                case 'RETURN':
                                    description = `Menerima ${sebutanBarang(tx, cyl?.serialCode)} dari ${member?.companyName}`;
                                    icon = 'assignment_return';
                                    colorClass = 'text-green-600 bg-green-50';
                                    break;
                                case 'REFILL_OUT':
                                    description = `Mengirim ${sebutanBarang(tx, cyl?.serialCode)} ke ${station?.name}`;
                                    icon = 'local_shipping';
                                    colorClass = 'text-orange-600 bg-orange-50';
                                    break;
                                case 'REFILL_IN':
                                    description = `Menerima kembali ${sebutanBarang(tx, cyl?.serialCode)} dari isi ulang`;
                                    icon = 'inventory';
                                    colorClass = 'text-indigo-600 bg-indigo-50';
                                    break;
                                case 'DEPOSIT_REFUND':
                                    description = `Mengembalikan deposit ke ${member?.companyName}`;
                                    icon = 'savings';
                                    colorClass = 'text-purple-600 bg-purple-50';
                                    break;
                                case 'DEBT_PAYMENT':
                                    description = `Pembayaran utang dari ${member?.companyName}`;
                                    icon = 'payments';
                                    colorClass = 'text-emerald-600 bg-emerald-50';
                                    break;
                                case 'DEBT_ADD':
                                    description = `Bon dicatat atas nama ${member?.companyName}`;
                                    icon = 'post_add';
                                    colorClass = 'text-amber-600 bg-amber-50';
                                    break;
                                case 'DELIVERY':
                                    description = `Mengirim ${sebutanBarang(tx, cyl?.serialCode)} untuk pengiriman`;
                                    icon = 'local_shipping';
                                    colorClass = 'text-cyan-600 bg-cyan-50';
                                    break;
                                case 'GAS_EXCHANGE':
                                    // memberId boleh kosong -- tukar isi terbuka untuk pembeli lepas.
                                    description = `Tukar isi ${sebutanBarang(tx)} ${member ? `untuk ${member.companyName}` : '(pembeli lepas)'}`;
                                    icon = 'swap_horiz';
                                    colorClass = 'text-teal-600 bg-teal-50';
                                    break;
                                case 'CYLINDER_SWAP':
                                    // Keterangannya menyebut kode seri penggantinya, dan itu
                                    // satu-satunya isi baris ini -- tidak ada uang di sini.
                                    description = `${sebutanBarang(tx, cyl?.serialCode)}: ${tx.description || 'ditukar pabrik'}`;
                                    icon = 'swap_horiz';
                                    colorClass = 'text-amber-600 bg-amber-50';
                                    break;
                                case 'EXPENSE':
                                    description = `Biaya operasional: ${tx.description || 'tanpa keterangan'}`;
                                    icon = 'receipt_long';
                                    colorClass = 'text-rose-600 bg-rose-50';
                                    break;
                                case 'INCOME':
                                    description = `Penjualan: ${tx.description || 'tanpa keterangan'}`;
                                    icon = 'trending_up';
                                    colorClass = 'text-green-600 bg-green-50';
                                    break;
                                default:
                                    // Jenis yang belum dikenal tetap muncul dengan namanya sendiri --
                                    // tanpa cabang ini barisnya kosong melompong.
                                    description = `${labelJenisTransaksi(tx.type)} ${sebutanBarang(tx, cyl?.serialCode)}`;
                                    icon = 'receipt_long';
                                    colorClass = 'text-gray-600 bg-gray-100';
                            }

                            return (
                                <div key={tx.id} className="p-4 hover:bg-gray-50 transition-colors flex items-start gap-4">
                                    <div className={`p-2 rounded-full flex-shrink-0 mt-1 ${colorClass}`}>
                                        <span className="material-icons text-sm">{icon}</span>
                                    </div>
                                    <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-800">{description}</p>
                                        <div className="flex justify-between items-center mt-1">
                                            <p className="text-xs text-gray-400">
                                                {new Date(tx.date).toLocaleDateString('id-ID')} • {new Date(tx.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                            {tx.cost && (
                                                <p className="text-xs font-bold text-gray-600">
                                                    Rp {tx.cost.toLocaleString('id-ID')}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="p-8 text-center text-gray-400">
                            Tidak ada riwayat aktivitas.
                        </div>
                    )}
                </div>
            </div>

            {kontrol}
        </div>
    );
};

export default HistoryView;
