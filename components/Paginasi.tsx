import React from 'react';

interface PaginasiProps {
  halaman: number;
  totalHalaman: number;
  totalBaris: number;
  perHalaman: number;
  onPindah: (halaman: number) => void;
}

/**
 * Nomor halaman yang layak ditampilkan: selalu yang pertama, terakhir, dan sekitar
 * halaman aktif. Sisanya diringkas jadi elipsis supaya deretannya tidak memanjang
 * mengikuti jumlah halaman.
 */
function nomorHalaman(halaman: number, total: number): (number | '...')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const penting = [1, total, halaman, halaman - 1, halaman + 1];
  const urut = [...new Set(penting)]
    .filter(n => n >= 1 && n <= total)
    .sort((a, b) => a - b);

  const hasil: (number | '...')[] = [];
  urut.forEach((n, i) => {
    if (i > 0 && n - urut[i - 1] > 1) hasil.push('...');
    hasil.push(n);
  });
  return hasil;
}

const tombolDasar = 'inline-flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed';

/**
 * Kontrol paginasi bersama untuk seluruh daftar panjang.
 *
 * Sebelumnya kontrol yang sama ditulis dua kali -- di HistoryView dan di tab
 * Pengiriman -- dengan perilaku dan bahasa tombol yang berbeda. Keduanya juga
 * didefinisikan di dalam komponen induknya, sehingga tiap render menghasilkan tipe
 * komponen baru dan React membongkar-pasang ulang DOM-nya.
 *
 * Di layar sempit deretan nomor diganti dua tombol lebar: nomor halaman berdesakan
 * di HP, dan yang dibutuhkan di sana cuma maju-mundur.
 */
const Paginasi: React.FC<PaginasiProps> = ({ halaman, totalHalaman, totalBaris, perHalaman, onPindah }) => {
  if (totalBaris === 0) return null;

  const dari = (halaman - 1) * perHalaman + 1;
  const sampai = Math.min(halaman * perHalaman, totalBaris);

  // Daftar yang muat dalam satu halaman tidak perlu tombol maju-mundur. Di desktop
  // ringkasan jumlahnya masih berguna, tapi di HP yang tersisa cuma sepasang tombol
  // mati -- jadi di sana seluruh kontrolnya disembunyikan.
  const satuHalaman = totalHalaman === 1;

  const keSebelumnya = () => onPindah(Math.max(1, halaman - 1));
  const keBerikutnya = () => onPindah(Math.min(totalHalaman, halaman + 1));

  return (
    <div className={`bg-white border border-gray-200 rounded-xl px-3 py-2 shadow-sm ${satuHalaman ? 'hidden sm:block' : ''}`}>
      {/* HP: dua tombol lebar dengan tinggi sentuh nyaman */}
      <div className={`items-center justify-between gap-3 sm:hidden ${satuHalaman ? 'hidden' : 'flex'}`}>
        <button
          onClick={keSebelumnya}
          disabled={halaman === 1}
          className={`${tombolDasar} min-h-[44px] px-4 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50`}
        >
          <span className="material-icons text-base">chevron_left</span>
          Sebelumnya
        </button>

        <span className="text-xs text-gray-500 text-center leading-tight">
          Halaman <span className="font-bold text-gray-800">{halaman}</span>
          <br />dari {totalHalaman}
        </span>

        <button
          onClick={keBerikutnya}
          disabled={halaman === totalHalaman}
          className={`${tombolDasar} min-h-[44px] px-4 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50`}
        >
          Berikutnya
          <span className="material-icons text-base">chevron_right</span>
        </button>
      </div>

      {/* Desktop: ringkasan jumlah + nomor halaman */}
      <div className="hidden sm:flex sm:items-center sm:justify-between">
        <p className="text-sm text-gray-600">
          Menampilkan <span className="font-medium text-gray-900">{dari}</span>
          {sampai > dari && <>–<span className="font-medium text-gray-900">{sampai}</span></>}
          {' '}dari <span className="font-medium text-gray-900">{totalBaris}</span>
        </p>

        {totalHalaman > 1 && (
          <nav className="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Navigasi halaman">
            <button
              onClick={keSebelumnya}
              disabled={halaman === 1}
              className={`${tombolDasar} rounded-l-md px-2 py-2 text-gray-500 ring-1 ring-inset ring-gray-300 hover:bg-gray-50`}
            >
              <span className="sr-only">Sebelumnya</span>
              <span className="material-icons text-sm">chevron_left</span>
            </button>

            {nomorHalaman(halaman, totalHalaman).map((n, i) =>
              n === '...' ? (
                <span key={`sela-${i}`} className="inline-flex items-center px-3 py-2 text-sm text-gray-400 ring-1 ring-inset ring-gray-300">
                  …
                </span>
              ) : (
                <button
                  key={n}
                  onClick={() => onPindah(n)}
                  aria-current={halaman === n ? 'page' : undefined}
                  className={`${tombolDasar} px-4 py-2 text-sm font-semibold ${
                    halaman === n
                      ? 'z-10 bg-indigo-600 text-white'
                      : 'text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {n}
                </button>
              )
            )}

            <button
              onClick={keBerikutnya}
              disabled={halaman === totalHalaman}
              className={`${tombolDasar} rounded-r-md px-2 py-2 text-gray-500 ring-1 ring-inset ring-gray-300 hover:bg-gray-50`}
            >
              <span className="sr-only">Berikutnya</span>
              <span className="material-icons text-sm">chevron_right</span>
            </button>
          </nav>
        )}
      </div>
    </div>
  );
};

export default Paginasi;
