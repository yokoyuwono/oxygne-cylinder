
import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { AppUser } from '../types';
import { bolehKelolaPengguna } from '../lib/peran';
import { labelPeran } from '../labels';

interface LayoutProps {
  children: React.ReactNode;
  currentUser?: AppUser | null;
  onLogout?: () => void;
}

interface ItemMenu {
  to: string;
  ikon: string;
  label: string;
  hanyaAdmin?: boolean;
}

interface GrupMenu {
  judul: string;
  ikon: string;
  item: ItemMenu[];
}

/**
 * Menu samping dikelompokkan, bukan satu daftar panjang.
 *
 * Sebelas tautan sejajar menuntut dibaca seluruhnya setiap kali, padahal sehari-hari
 * yang dipakai cuma dua atau tiga. Dikelompokkan begini yang terlihat saat diam hanya
 * empat baris, dan grup yang sedang dibuka terbuka sendiri -- jadi tidak ada langkah
 * tambahan untuk sampai ke halaman yang sedang dikerjakan.
 *
 * Beranda sengaja di luar grup: itu tujuan paling sering, dan menyembunyikannya di
 * balik satu klik justru menambah kerja.
 */
const MENU: GrupMenu[] = [
  {
    judul: 'Transaksi',
    ikon: 'point_of_sale',
    item: [
      { to: '/rental', ikon: 'shopping_cart_checkout', label: 'Tukar Besar & Sewa' },
      { to: '/tukar-isi', ikon: 'swap_horiz', label: 'Tukar Kecil' },
      { to: '/kas', ikon: 'account_balance_wallet', label: 'Uang Masuk & Keluar' },
      { to: '/bon', ikon: 'receipt_long', label: 'Bon Pelanggan' },
    ],
  },
  {
    judul: 'Operasional',
    ikon: 'inventory_2',
    item: [
      { to: '/delivery', ikon: 'local_shipping', label: 'Pengiriman' },
      { to: '/refill', ikon: 'local_gas_station', label: 'Pabrik' },
      { to: '/inventory', ikon: 'inventory_2', label: 'Stok Tabung' },
    ],
  },
  {
    judul: 'Administrasi',
    ikon: 'settings',
    item: [
      { to: '/members', ikon: 'people', label: 'Data Pelanggan' },
      { to: '/reports', ikon: 'assessment', label: 'Laporan & Riwayat' },
      { to: '/master-data', ikon: 'tune', label: 'Master Data' },
      { to: '/admin', ikon: 'admin_panel_settings', label: 'Pengguna', hanyaAdmin: true },
    ],
  },
];

/** Grup yang memuat halaman yang sedang dibuka -- dipakai untuk membukanya sendiri. */
const grupAktif = (path: string) =>
  MENU.find(g => g.item.some(i => path === i.to || path.startsWith(`${i.to}/`)))?.judul ?? null;

const Layout: React.FC<LayoutProps> = ({ children, currentUser, onLogout }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const [grupTerbuka, setGrupTerbuka] = useState<string | null>(() => grupAktif(location.pathname));

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location]);

  // Berpindah halaman lewat jalan lain -- Aksi Cepat di Beranda, tombol "Lihat Semua",
  // penanda buku -- ikut membuka grupnya, supaya menu tidak menunjukkan posisi yang
  // berbeda dari isi layar.
  useEffect(() => {
    const aktif = grupAktif(location.pathname);
    if (aktif) setGrupTerbuka(aktif);
  }, [location.pathname]);

  const navLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium ${isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`;

  const bottomNavLinkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-1 text-[10px] font-medium p-2 rounded-xl transition-all active:scale-95 ${isActive ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50 hover:text-gray-600'}`;

  const handleLogout = () => {
    if (onLogout) onLogout();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 text-gray-900 font-sans">

      {/* Mobile Header */}
      <header className="md:hidden bg-slate-900 text-white px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="material-icons text-white text-lg">propane</span>
          </div>
          <span className="font-bold text-lg tracking-tight">Central Gas</span>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 hover:bg-slate-800 rounded-lg transition-colors active:scale-95"
          aria-label="Buka Menu"
        >
          <span className="material-icons">menu</span>
        </button>
      </header>

      {/* Mobile Sidebar Backdrop */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-slate-900/60 z-40 md:hidden backdrop-blur-sm animate-fade-in"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar (Desktop & Mobile Drawer) */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 text-slate-300 border-r border-slate-800 flex flex-col
        transform transition-transform duration-300 cubic-bezier(0.4, 0, 0.2, 1)
        md:translate-x-0 md:static md:inset-auto md:h-screen
        ${isMobileMenuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}
      `}>
        <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/50">
              <span className="material-icons text-white text-lg">propane</span>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">Central Gas</span>
          </div>
          {/* Close button for mobile */}
          <button
            onClick={() => setIsMobileMenuOpen(false)}
            className="md:hidden p-1 text-slate-400 hover:text-white transition-colors"
          >
            <span className="material-icons">close</span>
          </button>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto custom-scrollbar">
          <NavLink to="/" end className={navLinkClass}>
            <span className="material-icons">dashboard</span>
            Beranda
          </NavLink>

          {MENU.map(grup => {
            const item = grup.item.filter(i => !i.hanyaAdmin || bolehKelolaPengguna(currentUser?.role));
            if (item.length === 0) return null;

            const terbuka = grupTerbuka === grup.judul;
            const memuatHalamanIni = grupAktif(location.pathname) === grup.judul;

            return (
              <div key={grup.judul} className="pt-2">
                <button
                  onClick={() => setGrupTerbuka(terbuka ? null : grup.judul)}
                  aria-expanded={terbuka}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors font-medium ${
                    memuatHalamanIni && !terbuka ? 'text-white bg-slate-800' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <span className="material-icons">{grup.ikon}</span>
                  <span className="flex-1 text-left">{grup.judul}</span>
                  <span className={`material-icons text-lg transition-transform ${terbuka ? 'rotate-180' : ''}`}>
                    expand_more
                  </span>
                </button>

                {terbuka && (
                  <div className="mt-1 space-y-1 pl-3 border-l border-slate-800 ml-6">
                    {item.map(i => (
                      <NavLink key={i.to} to={i.to} className={navLinkClass}>
                        <span className="material-icons text-lg">{i.ikon}</span>
                        <span className="text-sm">{i.label}</span>
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800 bg-slate-900">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-800/50 transition-colors">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-lg border-2 border-slate-700">
              {currentUser ? currentUser.name.charAt(0).toUpperCase() : 'G'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">{currentUser?.name || 'Tamu'}</p>
              <p className="text-xs text-slate-400 truncate">{labelPeran(currentUser?.role) }</p>
            </div>
            <button onClick={handleLogout} className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded" title="Keluar">
              <span className="material-icons text-sm">logout</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-[calc(100vh-64px)] md:h-screen overflow-hidden bg-slate-50 relative">
        <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth w-full">
          <div className="max-w-7xl mx-auto pb-24 md:pb-0">
            {children}
          </div>
        </div>

        {/* Mobile Bottom Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex justify-between items-center px-2 py-2 z-30 shadow-[0_-4px_20px_-5px_rgba(0,0,0,0.1)]">
          <NavLink to="/" className={bottomNavLinkClass}>
            <span className="material-icons text-2xl">dashboard</span>
            Beranda
          </NavLink>
          <NavLink to="/rental" className={bottomNavLinkClass}>
            <span className="material-icons text-2xl">shopping_cart</span>
            Sewa
          </NavLink>
          <NavLink to="/delivery" className={bottomNavLinkClass}>
            <span className="material-icons text-2xl">local_shipping</span>
            Kirim
          </NavLink>
          <NavLink to="/inventory" className={bottomNavLinkClass}>
            <span className="material-icons text-2xl">inventory_2</span>
            Stok
          </NavLink>
          <button
            onClick={() => setIsMobileMenuOpen(true)}
            className={`flex flex-col items-center gap-1 text-[10px] font-medium p-2 rounded-xl transition-all active:scale-95 ${isMobileMenuOpen ? 'text-blue-600 bg-blue-50' : 'text-gray-400 hover:bg-gray-50'}`}
          >
            <span className="material-icons text-2xl">menu</span>
            Menu
          </button>
        </nav>
      </main>
    </div>
  );
};

export default Layout;
