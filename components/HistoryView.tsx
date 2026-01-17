import React, { useState, useEffect } from 'react';
import { Cylinder, Transaction, Member, RefillStation } from '../types';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

interface HistoryViewProps {
    transactions: Transaction[]; // Kept for interface compatibility but we fetch our own data
    cylinders: Cylinder[];
    members: Member[];
    stations: RefillStation[];
}

const HistoryView: React.FC<HistoryViewProps> = ({ cylinders, members, stations }) => {
    const navigate = useNavigate();
    const [historyData, setHistoryData] = useState<Transaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const ITEMS_PER_PAGE = 15;

    useEffect(() => {
        fetchHistory(page);
    }, [page]);

    const fetchHistory = async (pageNo: number) => {
        setLoading(true);
        const from = (pageNo - 1) * ITEMS_PER_PAGE;
        const to = from + ITEMS_PER_PAGE - 1;

        try {
            const { data, count, error } = await supabase
                .from('transactions')
                .select('*', { count: 'exact' })
                .order('date', { ascending: false })
                .range(from, to);

            if (data) {
                setHistoryData(data as Transaction[]);
            }
            if (count !== null) setTotalCount(count);
            if (error) console.error("Error fetching history:", error);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

    const PaginationControls = () => (
        <div className="flex items-center justify-between bg-white px-4 py-3 border-t border-b border-gray-100 sm:px-6">
            <div className="flex flex-1 justify-between sm:hidden">
                <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="relative inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Previous
                </button>
                <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="relative ml-3 inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                    Next
                </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
                <div>
                    <p className="text-sm text-gray-700">
                        Showing <span className="font-medium">{((page - 1) * ITEMS_PER_PAGE) + 1}</span> to <span className="font-medium">{Math.min(page * ITEMS_PER_PAGE, totalCount)}</span> of <span className="font-medium">{totalCount}</span> results
                    </p>
                </div>
                <div>
                    <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
                        <button
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            disabled={page === 1}
                            className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span className="sr-only">Previous</span>
                            <span className="material-icons text-sm">chevron_left</span>
                        </button>
                        {/* Simple Pagination Numbers Logic */}
                        {[...Array(totalPages)].map((_, i) => {
                            const p = i + 1;
                            // Show first, last, current, and adjacent pages logic could go here, keeping it simple for now as requested
                            if (totalPages > 7 && (p !== 1 && p !== totalPages && Math.abs(page - p) > 1)) {
                                if (Math.abs(page - p) === 2) return <span key={p} className="px-2 py-2 text-gray-400">...</span>;
                                return null;
                            }
                            return (
                                <button
                                    key={p}
                                    onClick={() => setPage(p)}
                                    aria-current={page === p ? 'page' : undefined}
                                    className={`relative inline-flex items-center px-4 py-2 text-sm font-semibold ${page === p
                                            ? 'z-10 bg-indigo-600 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600'
                                            : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0'
                                        }`}
                                >
                                    {p}
                                </button>
                            );
                        })}
                        <button
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            disabled={page === totalPages}
                            className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-20 focus:outline-offset-0 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <span className="sr-only">Next</span>
                            <span className="material-icons text-sm">chevron_right</span>
                        </button>
                    </nav>
                </div>
            </div>
        </div>
    );

    return (
        <div className="p-6 space-y-6 animate-fade-in-up">
            {/* Header dengan tombol kembali */}
            <div className="flex items-center gap-4">
                <button
                    onClick={() => navigate('/')}
                    className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <span className="material-icons text-gray-600">arrow_back</span>
                </button>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Transaction History</h1>
                    <p className="text-sm text-gray-500">Semua riwayat aktivitas (Server-Side Pagination)</p>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <PaginationControls />

                <div className="divide-y divide-gray-100">
                    {loading ? (
                        <div className="p-12 flex justify-center">
                            <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                        </div>
                    ) : historyData.length > 0 ? (
                        historyData.map(tx => {
                            // Cari data terkait untuk setiap transaksi
                            const cyl = cylinders.find(c => c.id === tx.cylinderId);
                            const member = members.find(m => m.id === tx.memberId);
                            const station = stations.find(s => s.id === tx.refillStationId);

                            let description = '';
                            let icon = '';
                            let colorClass = '';

                            // Tentukan tampilan berdasarkan tipe transaksi
                            switch (tx.type) {
                                case 'RENTAL_OUT':
                                    description = `Rented ${cyl?.gasType} (${cyl?.serialCode}) to ${member?.companyName}`;
                                    icon = 'shopping_cart_checkout';
                                    colorClass = 'text-blue-600 bg-blue-50';
                                    break;
                                case 'RETURN':
                                    description = `Received ${cyl?.serialCode} from ${member?.companyName}`;
                                    icon = 'assignment_return';
                                    colorClass = 'text-green-600 bg-green-50';
                                    break;
                                case 'REFILL_OUT':
                                    description = `Sent ${cyl?.serialCode} to ${station?.name}`;
                                    icon = 'local_shipping';
                                    colorClass = 'text-orange-600 bg-orange-50';
                                    break;
                                case 'REFILL_IN':
                                    description = `Restocked ${cyl?.serialCode} from refill`;
                                    icon = 'inventory';
                                    colorClass = 'text-indigo-600 bg-indigo-50';
                                    break;
                                case 'DEPOSIT_REFUND':
                                    description = `Refunded deposit to ${member?.companyName}`;
                                    icon = 'savings';
                                    colorClass = 'text-purple-600 bg-purple-50';
                                    break;
                                case 'DEBT_PAYMENT':
                                    description = `Debt payment from ${member?.companyName}`;
                                    icon = 'payments';
                                    colorClass = 'text-emerald-600 bg-emerald-50';
                                    break;
                                case 'DELIVERY':
                                    description = `Dispatched ${cyl?.serialCode} for delivery`;
                                    icon = 'local_shipping';
                                    colorClass = 'text-cyan-600 bg-cyan-50';
                                    break;
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
                                                {new Date(tx.date).toLocaleDateString()} • {new Date(tx.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                            {tx.cost && (
                                                <p className="text-xs font-bold text-gray-600">
                                                    Rp {tx.cost.toLocaleString()}
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

                <PaginationControls />
            </div>
        </div>
    );
};

export default HistoryView;
