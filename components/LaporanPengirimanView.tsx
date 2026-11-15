import React, { useState } from 'react';
import { Cylinder, Member, MemberPrice, PengirimanMenunggu, RefillPrice, RentalTariff, Transaction } from '../types';
import { PenyelesaianPengiriman } from '../lib/laporanPengiriman';
import LaporanPengirimanForm from './LaporanPengirimanForm';
import IsiKodePengirimanForm from './IsiKodePengirimanForm';
import RiwayatPengirimanView from './RiwayatPengirimanView';

interface LaporanPengirimanViewProps {
  cylinders: Cylinder[];
  members: Member[];
  memberPrices: MemberPrice[];
  tariffs: RentalTariff[];
  transactions: Transaction[];
  refillPrices: RefillPrice[];
  pengirimanMenunggu: PengirimanMenunggu[];
  namaPengguna?: string;
  onCatat: (baris: PengirimanMenunggu[]) => Promise<void>;
  onHapus: (id: string) => Promise<void>;
  onSelesaikan: (penyelesaian: PenyelesaianPengiriman[]) => Promise<void>;
}

/**
 * Laporan Pengiriman dalam dua tahap: catat siang hari, isi nomor tabung malam hari,
 * ditambah Riwayat untuk pengiriman yang nomornya sudah disimpan.
 *
 * Tab kedua membawa jumlah catatan yang masih menunggu, supaya malam hari kelihatan
 * langsung ada yang harus diselesaikan -- catatan yang tidak pernah diberi nomor berarti
 * pemasukan dan perpindahan tabungnya tidak pernah tercatat.
 */
const LaporanPengirimanView: React.FC<LaporanPengirimanViewProps> = ({
  cylinders, members, memberPrices, tariffs, transactions, refillPrices,
  pengirimanMenunggu, namaPengguna, onCatat, onHapus, onSelesaikan,
}) => {
  const [tab, setTab] = useState<'catat' | 'kode' | 'riwayat'>('catat');

  // Tiga kolom selebar layar di HP (target sentuh besar, label dipersingkat), pil di tengah di desktop.
  const kelasTab = (aktif: boolean) =>
    `h-11 md:h-auto md:px-5 md:py-2 px-2 rounded-lg text-[13px] md:text-sm font-bold transition-all flex items-center justify-center gap-2 ${
      aktif ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
    }`;

  return (
    <div className="space-y-4 md:space-y-5">
      <div className="md:flex md:justify-center">
        <div className="bg-gray-100 p-1 rounded-xl grid grid-cols-3 md:flex gap-1">
          <button type="button" onClick={() => setTab('catat')} className={kelasTab(tab === 'catat')}>
            <span className="material-icons text-lg hidden md:inline">edit_note</span>
            <span className="md:hidden">Catat</span>
            <span className="hidden md:inline">Catat Pengiriman</span>
          </button>
          <button type="button" onClick={() => setTab('kode')} className={kelasTab(tab === 'kode')}>
            <span className="material-icons text-lg hidden md:inline">qr_code_scanner</span>
            <span className="md:hidden">Isi Nomor</span>
            <span className="hidden md:inline">Isi Nomor Tabung</span>
            {pengirimanMenunggu.length > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-amber-500 text-white text-[11px] flex items-center justify-center">
                {pengirimanMenunggu.length}
              </span>
            )}
          </button>
          <button type="button" onClick={() => setTab('riwayat')} className={kelasTab(tab === 'riwayat')}>
            <span className="material-icons text-lg hidden md:inline">history</span>
            Riwayat
          </button>
        </div>
      </div>

      {/*
        Ketiganya tetap termuat dan hanya disembunyikan. Kode yang setengah terketik malam
        hari hanya hidup di state formnya; membongkarnya setiap pindah tab (mis. mengintip
        Riwayat) membuat semua ketikan hilang.
      */}
      <div className={tab === 'catat' ? '' : 'hidden'}>
        <LaporanPengirimanForm
          members={members}
          memberPrices={memberPrices}
          tariffs={tariffs}
          namaPengguna={namaPengguna}
          onSubmit={onCatat}
        />
      </div>
      <div className={tab === 'kode' ? '' : 'hidden'}>
        <IsiKodePengirimanForm
          menunggu={pengirimanMenunggu}
          members={members}
          cylinders={cylinders}
          tariffs={tariffs}
          transactions={transactions}
          refillPrices={refillPrices}
          onSelesaikan={onSelesaikan}
          onHapus={onHapus}
        />
      </div>
      <div className={tab === 'riwayat' ? '' : 'hidden'}>
        <RiwayatPengirimanView transactions={transactions} cylinders={cylinders} members={members} />
      </div>
    </div>
  );
};

export default LaporanPengirimanView;
