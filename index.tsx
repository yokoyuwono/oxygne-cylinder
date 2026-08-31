import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import LayarSetupEnv from './components/LayarSetupEnv';
import { perluSetupEnv } from './lib/supabase';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {/*
      Pemilihannya di sini, di luar App, karena `perluSetupEnv` menentukan
      apakah aplikasinya dijalankan sama sekali -- bukan apa yang dirender App.
      Menaruhnya di dalam App berarti sebuah `return` mendahului 14 pemanggilan
      hook, dan App yang tidak jadi berjalan tetap menembakkan fetch data.
    */}
    {perluSetupEnv ? <LayarSetupEnv /> : <App />}
  </React.StrictMode>
);
