/*
  Skrip `npm run lint` sudah ada di package.json sejak awal, tapi berkas
  konfigurasinya tidak pernah dibuat -- jadi perintahnya selalu gagal sebelum
  memeriksa apa pun. Ini konfigurasinya.

  Nadanya sengaja longgar: tujuannya menangkap kesalahan yang benar-benar
  berbahaya (aturan Hooks, variabel tak terdefinisi), bukan memaksa gaya
  penulisan pada 1.500-an baris kode yang sudah berjalan di toko.
*/
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  // dist/ hasil build, supabase/functions berjalan di Deno (global & import
  // jsr: miliknya tak dikenal di sini -- sama seperti pengecualian di tsconfig).
  ignorePatterns: ['dist', 'node_modules', 'supabase/functions', '.claude', '.hermes'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint', 'react-hooks', 'react-refresh'],
  rules: {
    ...require('eslint-plugin-react-hooks').configs.recommended.rules,

    // Dependensi useEffect yang salah = data basi di layar, susah dilacak.
    // Peringatan, bukan error: sebagian sengaja dikosongkan agar hanya jalan sekali.
    'react-hooks/exhaustive-deps': 'warn',

    // Kode ini banyak memakai `any` untuk hasil query Supabase yang belum diketik.
    // Menyalakannya sekarang hanya menghasilkan ratusan keluhan tanpa perbaikan.
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'no-unused-vars': 'off',

    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

    // console.error dipakai untuk melaporkan kegagalan query; jangan diributkan.
    'no-console': 'off',
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
};
