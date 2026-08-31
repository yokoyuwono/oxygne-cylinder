import React from 'react';

/**
 * Layar penahan saat `npm run dev` berjalan tanpa kredensial dari lingkungan.
 *
 * Berdiri sebagai komponen tersendiri, bukan cabang di dalam `App`, supaya `App`
 * bebas dari percabangan yang mendahului pemanggilan hook -- percabangan begitu
 * membuat jumlah hook berbeda antar render, dan React mencocokkan hook menurut
 * urutan panggilan, bukan menurut namanya. Pemilihannya dilakukan di index.tsx.
 */
const LayarSetupEnv: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
    <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg border border-gray-100 text-center animate-fade-in-up">
      <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
        <span className="material-icons text-3xl">settings_alert</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-800 mb-2">Konfigurasi Diperlukan</h1>
      <p className="text-gray-500 mb-6">
        Dev server berjalan tanpa kredensial Supabase yang terisi — belum ada, atau
        masih berupa nilai contoh dari <span className="font-mono text-xs bg-gray-100 px-1 rounded">.env.example</span>.
        Tanpa keduanya, aplikasi akan tersambung ke{' '}
        <strong className="text-red-600">database toko yang asli</strong>.
      </p>

      <div className="bg-slate-900 rounded-lg p-4 text-left overflow-x-auto mb-6">
        <p className="text-slate-400 text-xs uppercase font-bold mb-2">.env.local</p>
        <code className="text-green-400 text-sm font-mono block mb-1">VITE_SUPABASE_URL=your_project_url</code>
        <code className="text-green-400 text-sm font-mono block">VITE_SUPABASE_ANON_KEY=your_anon_key</code>
      </div>

      <p className="text-sm text-gray-400">
        Salin <span className="font-mono bg-gray-100 px-1 rounded">.env.example</span> menjadi{' '}
        <span className="font-mono bg-gray-100 px-1 rounded">.env.local</span> di folder utama proyek,
        isi nilainya, lalu jalankan ulang dev server.
      </p>
    </div>
  </div>
);

export default LayarSetupEnv;
