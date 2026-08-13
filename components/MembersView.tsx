import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { Member, MemberPrice, Transaction, Cylinder, MemberStatus, RentalTariff } from '../types';
import { labelStatusAnggota, labelStatusTabung, labelJenisTransaksi, formatTanggal } from '../labels';
import { supabase } from '../lib/supabase';
import { HARI_MASA_TUNGGU, RingkasanHolding, hitungSemuaHolding, hitungStatusMasaTunggu } from '../lib/memberExit';
import { cariDiKolom } from '../lib/cari';

interface MembersViewProps {
    members: Member[];
    prices: MemberPrice[];
    transactions: Transaction[];
    cylinders: Cylinder[];
    tariffs: RentalTariff[];
    onAddMember: (member: Member) => void;
    onUpdateMember: (member: Member) => void;
    onDeleteMember: (id: string) => void;
    onUpdatePrices: (prices: MemberPrice[]) => void;
    onPayDebt: (memberId: string, amount: number, billIds: string[]) => void;
    onRequestExit: (memberId: string) => void;
    onProcessRefund: (memberId: string, amount: number) => void;
}

const MembersView: React.FC<MembersViewProps> = ({
    members: initialMembers, // Renamed to avoid confusion, though we rely on server fetch now for the list
    prices,
    transactions,
    cylinders,
    tariffs,
    onAddMember,
    onUpdateMember,
    onDeleteMember,
    onUpdatePrices,
    onPayDebt,
    onRequestExit,
    onProcessRefund
}) => {
    // -- List State (Server Side) --
    const [pagedMembers, setPagedMembers] = useState<Member[]>([]);
    const [totalMembers, setTotalMembers] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [isLoadingMembers, setIsLoadingMembers] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const ITEMS_PER_PAGE = 15;

    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

    // Modals
    const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
    const [isEditingMember, setIsEditingMember] = useState(false);
    const [currentMember, setCurrentMember] = useState<Partial<Member>>({});

    const [isDebtModalOpen, setIsDebtModalOpen] = useState(false);
    const [paymentAmount, setPaymentAmount] = useState<string>('');

    const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);

    // Alur keluar pelanggan: keduanya memakai centang pernyataan, bukan blokir keras
    // -- aplikasi tidak pernah tahu barang sudah kembali secara fisik atau belum,
    // yang tahu adalah admin di depan gudang.
    const [isExitModalOpen, setIsExitModalOpen] = useState(false);
    const [exitAcknowledged, setExitAcknowledged] = useState(false);
    const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
    const [refundAcknowledged, setRefundAcknowledged] = useState(false);

    // History Server Side State
    const [historyTransactions, setHistoryTransactions] = useState<Transaction[]>([]);
    const [historyPage, setHistoryPage] = useState(1);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const HISTORY_PAGE_SIZE = 5;

    // Member Price State
    const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
    const [priceToDelete, setPriceToDelete] = useState<MemberPrice | null>(null);
    const [currentPrice, setCurrentPrice] = useState<Partial<MemberPrice>>({
        gasType: 'Oxygen' as any,
        size: '6m3' as any,
        price: 0
    });

    const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

    // -- 1. Debounce Search --
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearch(searchTerm);
            setCurrentPage(1); // Reset to page 1 on search change
        }, 500);
        return () => clearTimeout(handler);
    }, [searchTerm]);

    // -- 2. Fetch Members (Server Side) --
    const fetchMembers = useCallback(async () => {
        setIsLoadingMembers(true);
        try {
            let query = supabase.from('members').select('*', { count: 'exact' });

            if (debouncedSearch) {
                query = query.or(cariDiKolom(['name', 'companyName'], debouncedSearch));
            }

            const from = (currentPage - 1) * ITEMS_PER_PAGE;
            const to = from + ITEMS_PER_PAGE - 1;

            const { data, count, error } = await query
                .order('companyName', { ascending: true })
                .range(from, to);

            if (error) throw error;

            if (data) setPagedMembers(data);
            if (count !== null) setTotalMembers(count);
        } catch (err) {
            console.error("Error fetching members:", err);
        } finally {
            setIsLoadingMembers(false);
        }
    }, [currentPage, debouncedSearch]);

    useEffect(() => {
        fetchMembers();
    }, [fetchMembers]);

    // -- 3. Derived Selection --
    // Try to find selected member in paged list, fallback to initialMembers if needed (e.g. specialized lookup)
    const selectedMember = useMemo(() => {
        return pagedMembers.find(m => m.id === selectedMemberId) || initialMembers.find(m => m.id === selectedMemberId);
    }, [pagedMembers, initialMembers, selectedMemberId]);

    const ringkasanHolding = useMemo(
        () => hitungSemuaHolding(cylinders, transactions, tariffs, selectedMemberId),
        [cylinders, transactions, tariffs, selectedMemberId]);

    const memberHoldings = ringkasanHolding.tabungBerkode;

    const statusMasaTunggu = useMemo(
        () => selectedMember?.exitRequestDate ? hitungStatusMasaTunggu(selectedMember.exitRequestDate) : null,
        [selectedMember?.exitRequestDate]);

    // Fetch History Effect
    useEffect(() => {
        if (!selectedMemberId) {
            setHistoryTransactions([]);
            return;
        }

        const fetchHistory = async () => {
            setIsHistoryLoading(true);
            try {
                const from = (historyPage - 1) * HISTORY_PAGE_SIZE;
                const to = from + HISTORY_PAGE_SIZE - 1;

                const { data, count, error } = await supabase
                    .from('transactions')
                    .select('*', { count: 'exact' })
                    .eq('memberId', selectedMemberId)
                    .order('date', { ascending: false })
                    .range(from, to);

                if (error) throw error;

                if (data) setHistoryTransactions(data);
                if (count !== null) setHistoryTotal(count);
            } catch (err) {
                console.error("Error fetching history:", err);
            } finally {
                setIsHistoryLoading(false);
            }
        };

        fetchHistory();
    }, [selectedMemberId, historyPage, transactions]); // Depend on transactions to refresh if new one added globally

    // Reset page when member changes
    useEffect(() => {
        setHistoryPage(1);
    }, [selectedMemberId]);

    const historyTotalPages = Math.ceil(historyTotal / HISTORY_PAGE_SIZE);
    const totalPages = Math.ceil(totalMembers / ITEMS_PER_PAGE);

    // Handlers
    const handleOpenAdd = () => {
        setIsEditingMember(false);
        setCurrentMember({
            name: '', companyName: '', address: '', phone: '', status: MemberStatus.Active, totalDebt: 0, totalDeposit: 0
        });
        setIsMemberModalOpen(true);
    };

    const handleOpenEdit = (member: Member) => {
        setIsEditingMember(true);
        setCurrentMember({ ...member });
        setIsMemberModalOpen(true);
    };

    const handleMemberSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!currentMember.name || !currentMember.companyName) return;

        if (isEditingMember && currentMember.id) {
            onUpdateMember(currentMember as Member);
        } else {
            const newMember = {
                ...currentMember,
                id: `m-${Date.now()}`,
                joinDate: new Date().toISOString(),
                totalDebt: 0,
                totalDeposit: 0,
                status: MemberStatus.Active
            } as Member;
            onAddMember(newMember);
        }
        // Refresh list after mutation
        setTimeout(fetchMembers, 500);
        setIsMemberModalOpen(false);
    };

    const openPayDebtModal = () => {
        setPaymentAmount('');
        setIsDebtModalOpen(true);
    };

    const handlePayDebtSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedMember) return;
        const amount = parseFloat(paymentAmount);
        if (isNaN(amount) || amount <= 0) return;

        onPayDebt(selectedMember.id, amount, []);
        // Refresh list to update debt display
        setTimeout(fetchMembers, 500);
        setIsDebtModalOpen(false);
    };

    const openExitModal = () => {
        setExitAcknowledged(false);
        setIsExitModalOpen(true);
    };

    const confirmExitRequest = () => {
        if (!selectedMember) return;
        onRequestExit(selectedMember.id);
        setTimeout(fetchMembers, 500);
        setIsExitModalOpen(false);
    };

    const openRefundModal = () => {
        setRefundAcknowledged(false);
        setIsRefundModalOpen(true);
    };

    const confirmRefund = () => {
        if (!selectedMember || selectedMember.totalDeposit <= 0) return;
        onProcessRefund(selectedMember.id, selectedMember.totalDeposit);
        setTimeout(fetchMembers, 500);
        setIsRefundModalOpen(false);
    };

    // Pencairan deposit hanya lolos tanpa pernyataan kalau masa tunggu sudah lewat
    // DAN tidak ada barang tersisa. Tanggal pengajuan yang tidak tercatat dihitung
    // sebagai belum lewat -- tidak ada bukti, tidak ada kelonggaran.
    const exitPerluPernyataan = ringkasanHolding.totalBarang > 0;
    const refundPerluPernyataan = ringkasanHolding.totalBarang > 0 || !statusMasaTunggu?.sudahLewat;

    // -- Member Price Handlers --
    const handleOpenAddPrice = () => {
        setCurrentPrice({
            gasType: 'Oxygen' as any,
            size: '6m3' as any,
            price: 0
        });
        setIsPriceModalOpen(true);
    };

    const handlePriceSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedMember || !currentPrice.price) return;

        const newPricePayload = {
            id: crypto.randomUUID(),
            memberId: selectedMember.id,
            gasType: currentPrice.gasType,
            size: currentPrice.size,
            price: currentPrice.price
        };

        try {
            const { data, error } = await supabase
                .from('member_prices')
                .insert(newPricePayload)
                .select()
                .single();

            if (error) throw error;

            if (data) {
                const newPrice: MemberPrice = {
                    id: data.id,
                    memberId: data.memberId,
                    gasType: data.gasType,
                    size: data.size,
                    price: data.price
                };
                onUpdatePrices([...prices, newPrice]);
                setIsPriceModalOpen(false);
            }
        } catch (err) {
            console.error("Error saving price:", err);
            alert("Gagal menyimpan harga. Periksa console.");
        }
    };

    const handleDeletePrice = async (priceId: string) => {
        try {
            const { error } = await supabase
                .from('member_prices')
                .delete()
                .eq('id', priceId);

            if (error) throw error;

            onUpdatePrices(prices.filter(p => p.id !== priceId));
            setPriceToDelete(null);
        } catch (err) {
            console.error("Error deleting price:", err);
            alert("Gagal menghapus harga.");
        }
    };

    return (
        <div className="flex flex-col md:flex-row h-[calc(100vh-100px)] gap-6 animate-fade-in-up pb-20 md:pb-0">
            {/* Left List */}
            <div className="w-full md:w-1/3 flex flex-col gap-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-800">Data Pelanggan</h2>
                    <button onClick={handleOpenAdd} className="bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700">
                        + Add
                    </button>
                </div>

                <div className="relative">
                    <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
                    <input
                        type="text"
                        placeholder="Cari pelanggan..."
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="bg-white rounded-xl border border-gray-200 flex-1 overflow-hidden flex flex-col shadow-sm">
                    {/* List Content */}
                    <div className="flex-1 overflow-y-auto">
                        {isLoadingMembers ? (
                            <div className="flex flex-col items-center justify-center h-40 text-gray-400">
                                <div className="w-6 h-6 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-2"></div>
                                <p className="text-xs">Memuat data pelanggan...</p>
                            </div>
                        ) : pagedMembers.length > 0 ? (
                            pagedMembers.map(m => (
                                <div
                                    key={m.id}
                                    onClick={() => setSelectedMemberId(m.id)}
                                    className={`p-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors ${selectedMemberId === m.id ? 'bg-indigo-50 border-indigo-200' : ''}`}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <h3 className={`font-bold ${selectedMemberId === m.id ? 'text-indigo-700' : 'text-gray-800'}`}>{m.companyName}</h3>
                                        {m.status !== MemberStatus.Active && (
                                            <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded font-bold uppercase">{labelStatusAnggota(m.status)}</span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600 mb-1">{m.name}</p>
                                    <div className="flex justify-between items-end">
                                        <p className="text-xs text-gray-400">{m.phone}</p>
                                        {m.totalDebt > 0 && (
                                            <span className="text-xs font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                                                Debt: {formatIDR(m.totalDebt)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="p-8 text-center text-gray-400">
                                <p>Pelanggan tidak ditemukan.</p>
                            </div>
                        )}
                    </div>

                    {/* Pagination Controls */}
                    <div className="p-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1 || isLoadingMembers}
                            className="p-1.5 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 text-gray-600 transition-colors"
                        >
                            <span className="material-icons text-sm">chevron_left</span>
                        </button>
                        <span className="text-xs font-medium text-gray-600">
                            Halaman {currentPage} dari {totalPages || 1}
                        </span>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={currentPage === totalPages || totalPages === 0 || isLoadingMembers}
                            className="p-1.5 bg-white border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 text-gray-600 transition-colors"
                        >
                            <span className="material-icons text-sm">chevron_right</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Details */}
            <div className="w-full md:w-2/3 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                {selectedMember ? (
                    <div className="flex flex-col h-full overflow-y-auto">
                        {/* Header */}
                        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-start">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-800">{selectedMember.companyName}</h2>
                                <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                    <span className="flex items-center gap-1"><span className="material-icons text-xs">person</span> {selectedMember.name}</span>
                                    <span className="flex items-center gap-1"><span className="material-icons text-xs">phone</span> {selectedMember.phone}</span>
                                </div>
                                <p className="text-sm text-gray-500 mt-1 flex items-center gap-1">
                                    <span className="material-icons text-xs">place</span> {selectedMember.address}
                                </p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => handleOpenEdit(selectedMember)} className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all">
                                    <span className="material-icons">edit</span>
                                </button>
                                <button onClick={() => setMemberToDelete(selectedMember)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-white rounded-lg border border-transparent hover:border-gray-200 transition-all">
                                    <span className="material-icons">delete</span>
                                </button>
                            </div>
                        </div>
                        {/* Custom Prices Section */}
                        <div id='member-price' className="px-6 py-4 border-b border-gray-100">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">Harga Gas Khusus</h3>
                                <button
                                    onClick={handleOpenAddPrice}
                                    className="text-xs bg-indigo-50 text-indigo-600 px-2 py-1 rounded hover:bg-indigo-100 font-medium flex items-center gap-1"
                                >
                                    <span className="material-icons text-xs">add</span> Tambah Harga
                                </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {prices.filter(p => p.memberId === selectedMember.id).map(p => (
                                    <div key={p.id} className="bg-orange-50/50 border border-orange-100 rounded-lg p-3 flex justify-between items-center group hover:border-orange-200 transition-colors">
                                        <div>
                                            <p className="font-bold text-gray-800 text-sm">{p.gasType.split(' ')[0]}</p>
                                            <p className="text-xs text-gray-500">{p.size}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="font-bold text-orange-600 text-sm">{formatIDR(p.price)}</p>
                                            <button
                                                onClick={() => setPriceToDelete(p)}
                                                className="text-[10px] text-red-400 hover:text-red-600 hover:underline mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                Hapus
                                            </button>
                                        </div>
                                    </div>
                                ))}
                                {prices.filter(p => p.memberId === selectedMember.id).length === 0 && (
                                    <div className="col-span-full text-center py-4 border-2 border-dashed border-gray-100 rounded-lg">
                                        <p className="text-xs text-gray-400 italic">Belum ada harga khusus. Memakai harga standar.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* Stats Cards */}
                        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {/* Holding Card */}
                            <div className="bg-white p-4 rounded-xl border border-blue-100 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-6 -mt-6 pointer-events-none"></div>
                                <p className="text-xs text-gray-500 font-bold uppercase mb-1">Jumlah Tabung</p>
                                <p className="text-xl font-bold text-gray-800">{memberHoldings.length}</p>
                                <span className="material-icons absolute bottom-2 right-2 text-blue-100 text-4xl group-hover:text-blue-200 transition-colors pointer-events-none">propane</span>
                            </div>

                            {/* Deposit Card */}
                            <div className="bg-white p-4 rounded-xl border border-green-100 shadow-sm relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-green-50 rounded-bl-full -mr-6 -mt-6 pointer-events-none"></div>
                                <p className="text-xs text-gray-500 font-bold uppercase mb-1">Deposit Jaminan</p>
                                <p className="text-xl font-bold text-gray-800">{formatIDR(selectedMember.totalDeposit)}</p>
                                <span className="material-icons absolute bottom-2 right-2 text-green-100 text-4xl group-hover:text-green-200 transition-colors pointer-events-none">savings</span>

                                {/* Refund Action */}
                                {(selectedMember.status === MemberStatus.Pending_Exit || selectedMember.status === MemberStatus.Non_Active) && selectedMember.totalDeposit > 0 && (
                                    <button onClick={openRefundModal} className="mt-2 text-xs bg-green-600 text-white px-2 py-1 rounded shadow-sm hover:bg-green-700">
                                        Proses Pengembalian
                                    </button>
                                )}
                                {selectedMember.status === MemberStatus.Active && (
                                    <button onClick={openExitModal} className="mt-2 text-[10px] text-red-500 hover:underline">
                                        Ajukan Keluar
                                    </button>
                                )}
                            </div>

                            {/* Debt Card - Flex layout to prevent button overlap */}
                            <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm relative overflow-hidden group flex flex-col justify-between">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-red-50 rounded-bl-full -mr-6 -mt-6 pointer-events-none"></div>

                                <div className="relative z-10">
                                    <p className="text-xs text-gray-500 font-bold uppercase mb-1">Total Utang</p>
                                    <p className={`text-xl font-bold truncate ${selectedMember.totalDebt > 0 ? 'text-red-600' : 'text-gray-800'}`}>{formatIDR(selectedMember.totalDebt || 0)}</p>
                                </div>

                                <span className="material-icons absolute bottom-2 right-2 text-red-100 text-4xl group-hover:text-red-200 transition-colors pointer-events-none">money_off</span>

                                {selectedMember.totalDebt > 0 && selectedMember.status === MemberStatus.Active && (
                                    <div className="mt-3 relative z-10">
                                        <button
                                            onClick={openPayDebtModal}
                                            className="w-full text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-1.5 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-1 font-semibold"
                                        >
                                            <span className="material-icons text-xs">payments</span> Bayar Utang
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Content Tabs/Lists */}
                        <div className="px-6 pb-6 space-y-6">
                            {/* Holdings List */}
                            <div>
                                <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase tracking-wider">Tabung Dipegang</h3>
                                {memberHoldings.length > 0 ? (
                                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-gray-50 text-gray-500 font-medium">
                                                <tr>
                                                    <th className="px-4 py-2">Kode Seri</th>
                                                    <th className="px-4 py-2">Jenis Gas</th>
                                                    <th className="px-4 py-2">Ukuran</th>
                                                    <th className="px-4 py-2">Status</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-100">
                                                {memberHoldings.map(c => (
                                                    <tr key={c.id} className="hover:bg-gray-50">
                                                        <td className="px-4 py-2 font-mono font-bold text-gray-700">{c.serialCode}</td>
                                                        <td className="px-4 py-2">{c.gasType}</td>
                                                        <td className="px-4 py-2">{c.size}</td>
                                                        <td className="px-4 py-2"><span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{labelStatusTabung(c.status)}</span></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400 italic">Tidak ada tabung yang sedang dipegang.</p>
                                )}
                            </div>

                            {/* Recent Transactions (History) with Server Side Pagination */}
                            <div>
                                <h3 className="font-bold text-gray-800 mb-3 text-sm uppercase tracking-wider flex justify-between items-center">
                                    History
                                    {isHistoryLoading && <span className="text-xs text-gray-400 font-normal animate-pulse">Memuat...</span>}
                                </h3>

                                {/* Dashed Box Style similar to screenshot */}
                                <div className="border-2 border-dashed border-indigo-100 rounded-xl p-2 bg-indigo-50/30">
                                    <div className="space-y-2">
                                        {historyTransactions.length > 0 ? (
                                            historyTransactions.map(t => {
                                                const cyl = cylinders.find(c => c.id === t.cylinderId);
                                                return (
                                                    <div key={t.id} className="flex justify-between items-center p-3 bg-white rounded-lg border border-indigo-50 shadow-sm hover:shadow-md transition-shadow">
                                                        <div className="flex items-center gap-3">
                                                            <div className={`p-2 rounded-lg ${t.type === 'RENTAL_OUT' ? 'bg-blue-100 text-blue-600' :
                                                                t.type === 'RETURN' ? 'bg-green-100 text-green-600' :
                                                                    t.type === 'DEBT_PAYMENT' ? 'bg-teal-100 text-teal-600' :
                                                                        'bg-gray-200 text-gray-600'
                                                                }`}>
                                                                <span className="material-icons text-sm">
                                                                    {t.type === 'RENTAL_OUT' ? 'shopping_cart' :
                                                                        t.type === 'RETURN' ? 'assignment_return' :
                                                                            t.type === 'DEBT_PAYMENT' ? 'payments' : 'history'}
                                                                </span>
                                                            </div>
                                                            <div>
                                                                <p className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                                                    {labelJenisTransaksi(t.type)}
                                                                    {cyl && <span className="text-xs font-mono font-normal text-gray-500 bg-gray-100 px-1 rounded">#{cyl.serialCode}</span>}
                                                                </p>
                                                                <p className="text-xs text-gray-400">{new Date(t.date).toLocaleDateString('id-ID')}</p>
                                                            </div>
                                                        </div>
                                                        <div className="text-right">
                                                            {t.cost && (
                                                                <p className={`text-sm font-bold ${t.type === 'DEBT_PAYMENT' ? 'text-green-600' : 'text-gray-800'
                                                                    }`}>
                                                                    {t.type === 'DEBT_PAYMENT' ? '-' : ''}{formatIDR(t.cost)}
                                                                </p>
                                                            )}
                                                            {t.paymentStatus && (
                                                                <span className={`text-[10px] px-1.5 rounded font-bold uppercase ${t.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                                                                    }`}>
                                                                    {t.paymentStatus}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            })
                                        ) : (
                                            <p className="text-sm text-gray-400 italic p-2">Belum ada transaksi.</p>
                                        )}
                                    </div>

                                    {/* Pagination */}
                                    {historyTotal > HISTORY_PAGE_SIZE && (
                                        <div className="flex justify-between items-center mt-3 pt-2 border-t border-indigo-100 px-2">
                                            <span className="text-xs text-gray-500">Halaman {historyPage} dari {historyTotalPages}</span>
                                            <div className="flex gap-2">
                                                <button
                                                    disabled={historyPage === 1 || isHistoryLoading}
                                                    onClick={() => setHistoryPage(p => Math.max(1, p - 1))}
                                                    className="p-1 hover:bg-white rounded disabled:opacity-30 text-indigo-600 transition-colors"
                                                >
                                                    <span className="material-icons text-sm">chevron_left</span>
                                                </button>
                                                <button
                                                    disabled={historyPage >= historyTotalPages || isHistoryLoading}
                                                    onClick={() => setHistoryPage(p => Math.min(historyTotalPages, p + 1))}
                                                    className="p-1 hover:bg-white rounded disabled:opacity-30 text-indigo-600 transition-colors"
                                                >
                                                    <span className="material-icons text-sm">chevron_right</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-400">
                        <span className="material-icons text-5xl mb-4 text-gray-300">person_search</span>
                        <p className="text-lg">Pilih pelanggan untuk melihat detail</p>
                    </div>
                )}
            </div>

            {/* --- Modals --- */}

            {/* Member Edit/Add Modal */}
            {isMemberModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in-up">
                        <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
                            <h3 className="font-bold">{isEditingMember ? 'Edit Member' : 'Add New Member'}</h3>
                            <button onClick={() => setIsMemberModalOpen(false)} className="text-indigo-200 hover:text-white"><span className="material-icons">close</span></button>
                        </div>
                        <form onSubmit={handleMemberSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Perusahaan</label>
                                <input type="text" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={currentMember.companyName || ''} onChange={e => setCurrentMember({ ...currentMember, companyName: e.target.value })} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Nama Narahubung</label>
                                <input type="text" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    value={currentMember.name || ''} onChange={e => setCurrentMember({ ...currentMember, name: e.target.value })} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Telepon</label>
                                    <input type="text" required className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                        value={currentMember.phone || ''} onChange={e => setCurrentMember({ ...currentMember, phone: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Deposit Awal</label>
                                    <input type="number" disabled={isEditingMember} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50"
                                        value={currentMember.totalDeposit || 0} onChange={e => setCurrentMember({ ...currentMember, totalDeposit: parseFloat(e.target.value) })} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Alamat</label>
                                <textarea className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" rows={2}
                                    value={currentMember.address || ''} onChange={e => setCurrentMember({ ...currentMember, address: e.target.value })}></textarea>
                            </div>
                            <div className="pt-2 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsMemberModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
                                <button type="submit" className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium">Simpan</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Debt Payment Modal */}
            {isDebtModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                        <div className="bg-red-600 px-6 py-4 flex justify-between items-center text-white">
                            <h3 className="font-bold flex items-center gap-2"><span className="material-icons">payments</span> Bayar Utang</h3>
                            <button onClick={() => setIsDebtModalOpen(false)} className="text-red-200 hover:text-white"><span className="material-icons">close</span></button>
                        </div>
                        <form onSubmit={handlePayDebtSubmit} className="p-6">
                            <div className="mb-4">
                                <p className="text-sm text-gray-600 mb-2">Total Utang Belum Lunas</p>
                                <p className="text-2xl font-bold text-red-600">{formatIDR(selectedMember?.totalDebt || 0)}</p>
                            </div>
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Jumlah Pembayaran (Rp)</label>
                                <input
                                    type="number"
                                    required
                                    min="1"
                                    max={selectedMember?.totalDebt}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-lg font-bold text-gray-800 focus:ring-2 focus:ring-red-500 outline-none"
                                    value={paymentAmount}
                                    onChange={e => setPaymentAmount(e.target.value)}
                                    placeholder="0"
                                />
                            </div>
                            <div className="flex justify-end gap-3">
                                <button type="button" onClick={() => setIsDebtModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
                                <button type="submit" className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium">Konfirmasi Pembayaran</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation */}
            {memberToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                        <div className="bg-red-600 px-6 py-4 flex justify-between items-center text-white">
                            <h3 className="font-bold flex items-center gap-2"><span className="material-icons">warning</span> Hapus Pelanggan</h3>
                            <button onClick={() => setMemberToDelete(null)} className="text-red-200 hover:text-white"><span className="material-icons">close</span></button>
                        </div>
                        <div className="p-6 text-center">
                            <p className="text-gray-700 mb-6">Yakin ingin menghapus <strong>{memberToDelete.companyName}</strong>? This cannot be undone.</p>
                            <div className="flex justify-center gap-3">
                                <button onClick={() => setMemberToDelete(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
                                <button
                                    onClick={() => {
                                        onDeleteMember(memberToDelete.id);
                                        setMemberToDelete(null);
                                        if (selectedMemberId === memberToDelete.id) setSelectedMemberId(null);
                                        setTimeout(fetchMembers, 500); // Refresh list
                                    }}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
                                >
                                    Hapus
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
            {/* Price Add Modal */}
            {isPriceModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                        <div className="bg-orange-600 px-6 py-4 flex justify-between items-center text-white">
                            <h3 className="font-bold flex items-center gap-2"><span className="material-icons">sell</span> Atur Harga Pelanggan</h3>
                            <button onClick={() => setIsPriceModalOpen(false)} className="text-orange-200 hover:text-white"><span className="material-icons">close</span></button>
                        </div>
                        <form onSubmit={handlePriceSubmit} className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Jenis Gas</label>
                                <select
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                                    value={currentPrice.gasType}
                                    onChange={e => setCurrentPrice({ ...currentPrice, gasType: e.target.value as any })}
                                >
                                    <option value="Oxygen">Oxygen</option>
                                    <option value="Acetylene (C2H2)">Acetylene</option>
                                    <option value="Argon">Argon</option>
                                    <option value="CO2">CO2</option>
                                    <option value="Nitrogen">Nitrogen</option>
                                    <option value="LPG">LPG</option>
                                    <option value="Propane">Propane</option>
                                    <option value="Methane">Methane</option>
                                    <option value="Butane">Butane</option>
                                    <option value="Medical Oxygen">Medical Oxygen</option>
                                    <option value="Medical Air">Medical Air</option>
                                    <option value="Nitrous Oxide">Nitrous Oxide</option>
                                    <option value="Sulfur Hexafluoride">Sulfur Hexafluoride</option>
                                    <option value="Ammonia">Ammonia</option>
                                    <option value="Chlorine">Chlorine</option>
                                    <option value="Mix Gas">Mix Gas</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Ukuran Tabung</label>
                                <select
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                                    value={currentPrice.size}
                                    onChange={e => setCurrentPrice({ ...currentPrice, size: e.target.value as any })}
                                >
                                    <option value="1m3">Kecil (1m3)</option>
                                    <option value="2m3">Sedang (2m3)</option>
                                    <option value="6m3">Besar (6m3)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Harga Khusus (Rp)</label>
                                <div className="relative">
                                    <span className="absolute left-3 top-2 text-gray-500 text-sm">Rp</span>
                                    <input
                                        type="number"
                                        required
                                        min="0"
                                        className="w-full pl-10 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none font-semibold text-gray-800"
                                        value={currentPrice.price}
                                        onChange={e => setCurrentPrice({ ...currentPrice, price: parseFloat(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div className="pt-2 flex justify-end gap-3">
                                <button type="button" onClick={() => setIsPriceModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
                                <button type="submit" className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium">Simpan Harga</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Price Confirm */}
            {priceToDelete && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                        <div className="p-6 text-center">
                            <span className="material-icons text-4xl text-red-500 mb-3 block">delete_forever</span>
                            <h3 className="font-bold text-gray-800 mb-2">Hapus Harga Khusus?</h3>
                            <p className="text-sm text-gray-600 mb-6">
                                Yakin ingin menghapus harga khusus untuk <strong>{priceToDelete.gasType} ({priceToDelete.size})</strong>?
                            </p>
                            <div className="flex justify-center gap-3">
                                <button onClick={() => setPriceToDelete(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
                                <button
                                    onClick={() => handleDeletePrice(priceToDelete.id)}
                                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium"
                                >
                                    Hapus
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Ajukan Keluar */}
            {isExitModalOpen && selectedMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in-up">
                        <div className="bg-amber-600 px-6 py-4 flex justify-between items-center text-white">
                            <h3 className="font-bold flex items-center gap-2"><span className="material-icons">logout</span> Ajukan Keluar Pelanggan</h3>
                            <button onClick={() => setIsExitModalOpen(false)} className="text-amber-200 hover:text-white"><span className="material-icons">close</span></button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
                            <p className="text-sm text-gray-700">
                                <strong>{selectedMember.companyName}</strong> akan ditandai <strong>Menunggu Keluar</strong>.
                                Deposit {formatIDR(selectedMember.totalDeposit || 0)} baru boleh dicairkan setelah masa tunggu {HARI_MASA_TUNGGU} hari sejak hari ini.
                            </p>

                            <RingkasanBarangDipegang ringkasan={ringkasanHolding} />

                            {(selectedMember.totalDebt || 0) > 0 && (
                                <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
                                    Catatan: pelanggan ini masih punya utang {formatIDR(selectedMember.totalDebt)}. Utang tidak menghalangi pengajuan keluar, tapi sebaiknya diselesaikan sebelum deposit dicairkan.
                                </p>
                            )}

                            {exitPerluPernyataan && (
                                <PernyataanVerifikasi
                                    checked={exitAcknowledged}
                                    onChange={setExitAcknowledged}
                                    label="Saya sudah memverifikasi secara fisik bahwa seluruh barang di atas sudah dikembalikan ke toko."
                                />
                            )}
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                            <button onClick={() => setIsExitModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
                            <button
                                onClick={confirmExitRequest}
                                disabled={exitPerluPernyataan && !exitAcknowledged}
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
                            >
                                Ajukan Keluar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Proses Pengembalian Deposit */}
            {isRefundModalOpen && selectedMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in-up">
                        <div className="bg-green-600 px-6 py-4 flex justify-between items-center text-white">
                            <h3 className="font-bold flex items-center gap-2"><span className="material-icons">savings</span> Proses Pengembalian Deposit</h3>
                            <button onClick={() => setIsRefundModalOpen(false)} className="text-green-200 hover:text-white"><span className="material-icons">close</span></button>
                        </div>
                        <div className="p-6 space-y-4 max-h-[65vh] overflow-y-auto">
                            <div>
                                <p className="text-sm text-gray-600 mb-1">Deposit yang akan dikembalikan ke <strong>{selectedMember.companyName}</strong></p>
                                <p className="text-2xl font-bold text-green-600">{formatIDR(selectedMember.totalDeposit || 0)}</p>
                            </div>

                            {/* Masa tunggu */}
                            {!statusMasaTunggu ? (
                                <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
                                    <span className="material-icons text-gray-500 text-lg">help_outline</span>
                                    <div>
                                        <p className="text-sm font-semibold text-gray-800">Tanggal pengajuan keluar tidak tercatat</p>
                                        <p className="text-xs text-gray-600">Masa tunggu {HARI_MASA_TUNGGU} hari tidak bisa diperiksa untuk pelanggan ini.</p>
                                    </div>
                                </div>
                            ) : statusMasaTunggu.sudahLewat ? (
                                <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                                    <span className="material-icons text-green-600 text-lg">event_available</span>
                                    <div>
                                        <p className="text-sm font-semibold text-green-800">Masa tunggu {HARI_MASA_TUNGGU} hari sudah terlewati</p>
                                        <p className="text-xs text-green-700">Deposit boleh dicairkan sejak {formatTanggal(statusMasaTunggu.tanggalTarget, { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <span className="material-icons text-amber-600 text-lg">hourglass_top</span>
                                    <div>
                                        <p className="text-sm font-semibold text-amber-800">Masa tunggu belum selesai — sisa {statusMasaTunggu.sisaHari} hari</p>
                                        <p className="text-xs text-amber-700">Deposit baru boleh dicairkan mulai {formatTanggal(statusMasaTunggu.tanggalTarget, { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
                                    </div>
                                </div>
                            )}

                            <RingkasanBarangDipegang ringkasan={ringkasanHolding} />

                            {(selectedMember.totalDebt || 0) > 0 && (
                                <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg p-3">
                                    Catatan: pelanggan ini masih punya utang {formatIDR(selectedMember.totalDebt)}. Pencairan deposit di sini tidak memotong utang tersebut.
                                </p>
                            )}

                            {refundPerluPernyataan && (
                                <PernyataanVerifikasi
                                    checked={refundAcknowledged}
                                    onChange={setRefundAcknowledged}
                                    label="Saya tetap mencairkan deposit ini dengan sadar atas peringatan di atas."
                                />
                            )}
                        </div>
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                            <button onClick={() => setIsRefundModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Batal</button>
                            <button
                                onClick={confirmRefund}
                                disabled={refundPerluPernyataan && !refundAcknowledged}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium"
                            >
                                Cairkan Deposit
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

/**
 * Daftar barang toko yang masih tercatat di tangan pelanggan, dipakai modal
 * pengajuan keluar dan modal pencairan deposit. Rinci per barang supaya admin
 * bisa mencocokkannya satu per satu dengan yang benar-benar ada di gudang.
 */
const RingkasanBarangDipegang: React.FC<{ ringkasan: RingkasanHolding }> = ({ ringkasan }) => {
    if (ringkasan.totalBarang === 0) {
        return (
            <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg p-3">
                <span className="material-icons text-green-600 text-lg">check_circle</span>
                <div>
                    <p className="text-sm font-semibold text-green-800">Semua barang sudah dikembalikan</p>
                    <p className="text-xs text-green-700">Tidak ada tabung, botol curah, atau regulator yang tercatat masih dipegang pelanggan ini.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-3">
            <div className="flex items-start gap-2">
                <span className="material-icons text-amber-600 text-lg">warning</span>
                <div>
                    <p className="text-sm font-semibold text-amber-800">Masih ada {ringkasan.totalBarang} barang tercatat dipegang</p>
                    <p className="text-xs text-amber-700">Pastikan semuanya sudah kembali ke toko sebelum melanjutkan.</p>
                </div>
            </div>

            {ringkasan.tabungBerkode.length > 0 && (
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1">Tabung Berkode</p>
                    <ul className="space-y-1">
                        {ringkasan.tabungBerkode.map(c => (
                            <li key={c.id} className="text-xs text-gray-700 bg-white border border-amber-100 rounded px-2 py-1 flex justify-between gap-2">
                                <span className="font-mono font-bold">{c.serialCode}</span>
                                <span className="text-gray-500">{c.gasType} • {c.size}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {ringkasan.curah.length > 0 && (
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1">Botol Curah</p>
                    <ul className="space-y-1">
                        {ringkasan.curah.map(h => (
                            <li key={h.size} className="text-xs text-gray-700 bg-white border border-amber-100 rounded px-2 py-1">
                                {h.qty} botol {h.size}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {ringkasan.regulator.length > 0 && (
                <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 mb-1">Regulator Sewa</p>
                    <ul className="space-y-1">
                        {ringkasan.regulator.map(r => (
                            <li key={r.tariffId} className="text-xs text-gray-700 bg-white border border-amber-100 rounded px-2 py-1">
                                {r.qty} unit {r.nama}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

/** Centang pernyataan admin -- membuka tombol aksi yang sedang ditahan peringatan. */
const PernyataanVerifikasi: React.FC<{ checked: boolean; onChange: (v: boolean) => void; label: string }> = ({ checked, onChange, label }) => (
    <label className="flex items-start gap-2 text-xs text-gray-700 bg-white border border-gray-200 rounded-lg p-3 cursor-pointer hover:bg-gray-50">
        <input
            type="checkbox"
            checked={checked}
            onChange={e => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 accent-indigo-600"
        />
        <span>{label}</span>
    </label>
);

export default MembersView;