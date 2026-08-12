
import React, { useState } from 'react';
import { AppUser, UserRole } from '../types';
import { labelPeran } from '../labels';

interface AdminViewProps {
  users: AppUser[];
  onAddUser: (user: AppUser) => Promise<void>;
  onUpdateUser: (user: AppUser) => Promise<void>;
  onDeleteUser: (id: string) => Promise<void>;
  currentUser: AppUser | null;
}

/** Supabase menolak kata sandi yang lebih pendek; disamakan dengan Edge Function. */
const MIN_PASSWORD = 6;

const AdminView: React.FC<AdminViewProps> = ({ users, onAddUser, onUpdateUser, onDeleteUser, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');

  // CRUD State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<AppUser>>({ role: UserRole.Operator });

  // Pembuatan akun berjalan di Edge Function, jadi ada jeda yang harus terlihat dan
  // kegagalan yang harus terbaca -- email ganda, kata sandi terlalu pendek.
  const [sedangSimpan, setSedangSimpan] = useState(false);
  const [pesanGagal, setPesanGagal] = useState('');

  // Delete State
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);
  const [sedangHapus, setSedangHapus] = useState(false);
  const [gagalHapus, setGagalHapus] = useState('');

  const filteredUsers = users.filter(u =>
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenAdd = () => {
    setIsEditing(false);
    setEditingUser({ role: UserRole.Operator, name: '', email: '', password: '' });
    setPesanGagal('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: AppUser) => {
    setIsEditing(true);
    setEditingUser({ ...user, password: '' });
    setPesanGagal('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser.name) return;

    setPesanGagal('');
    setSedangSimpan(true);

    try {
      if (isEditing && editingUser.id) {
        // Email dan kata sandi ada di auth.users, tidak diubah dari layar ini.
        await onUpdateUser({
          id: editingUser.id,
          email: editingUser.email!,
          name: editingUser.name,
          role: editingUser.role!,
        });
      } else {
        // id-nya sementara: yang berlaku adalah uuid dari Supabase Auth, yang
        // dikembalikan Edge Function dan dipasang App saat menyimpan ke daftar.
        await onAddUser({
          id: '',
          email: editingUser.email!.trim().toLowerCase(),
          name: editingUser.name,
          role: editingUser.role!,
          password: editingUser.password,
        });
      }
      setIsModalOpen(false);
    } catch (err) {
      setPesanGagal(err instanceof Error ? err.message : 'Gagal menyimpan pengguna.');
    } finally {
      setSedangSimpan(false);
    }
  };

  const confirmDelete = async () => {
    if (!userToDelete) return;

    setGagalHapus('');
    setSedangHapus(true);
    try {
      await onDeleteUser(userToDelete.id);
      setUserToDelete(null);
    } catch (err) {
      setGagalHapus(err instanceof Error ? err.message : 'Gagal menghapus pengguna.');
    } finally {
      setSedangHapus(false);
    }
  };

  const getRoleBadge = (role: UserRole) => {
      switch(role) {
          case UserRole.Admin: return 'bg-purple-100 text-purple-700';
          case UserRole.Operator: return 'bg-blue-100 text-blue-700';
          default: return 'bg-gray-100 text-gray-700';
      }
  };

  return (
    <div className="space-y-6 animate-fade-in-up pb-20 md:pb-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-gray-800">Manajemen Pengguna</h2>
           <p className="text-gray-500 text-sm">Kelola akses sistem dan akun staf.</p>
        </div>
        
        <div className="flex w-full md:w-auto gap-3">
             <div className="relative flex-1 md:w-64">
                <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
                <input 
                    type="text" 
                    placeholder="Cari pengguna..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
            </div>
            <button 
                onClick={handleOpenAdd}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors whitespace-nowrap"
            >
                <span className="material-icons text-sm">person_add</span>
                Tambah Pengguna
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-gray-500 uppercase text-xs tracking-wider">
                    <th className="px-6 py-3">Pengguna</th>
                    <th className="px-6 py-3">Peran</th>
                    <th className="px-6 py-3">Login Terakhir</th>
                    <th className="px-6 py-3 text-right">Aksi</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
                {filteredUsers.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50 group">
                        <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-gray-200 text-gray-500 flex items-center justify-center font-bold">
                                    {u.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-bold text-gray-800">{u.name}</p>
                                    <p className="text-xs text-gray-500">{u.email || 'Tanpa email'}</p>
                                </div>
                            </div>
                        </td>
                        <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${getRoleBadge(u.role)}`}>
                                {labelPeran(u.role)}
                            </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                            {u.lastLogin ? new Date(u.lastLogin).toLocaleString('id-ID') : 'Belum pernah'}
                        </td>
                        <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-2 opacity-100 lg:opacity-50 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleOpenEdit(u)} className="p-1 hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 rounded">
                                    <span className="material-icons text-sm">edit</span>
                                </button>
                                {u.id !== currentUser?.id && ( // Prevent self-delete
                                    <button onClick={() => setUserToDelete(u)} className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded">
                                        <span className="material-icons text-sm">delete</span>
                                    </button>
                                )}
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
      </div>

      {/* USER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
                <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2">
                        <span className="material-icons">manage_accounts</span>
                        {isEditing ? 'Ubah Pengguna' : 'Tambah Pengguna'}
                    </h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-indigo-200 hover:text-white">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Nama Lengkap</label>
                        <input 
                            type="text" 
                            required
                            value={editingUser.name || ''}
                            onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="mis. Budi Santoso"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                        <input
                            type="email"
                            required
                            disabled={isEditing}
                            value={editingUser.email || ''}
                            onChange={(e) => setEditingUser({...editingUser, email: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                            placeholder="mis. budi@tokooksigen.com"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            {isEditing
                                ? 'Email tidak bisa diubah dari sini -- ia identitas login akun.'
                                : 'Dipakai untuk login. Harus email yang bisa dibuka staf yang bersangkutan.'}
                        </p>
                    </div>

                    {/* Kata sandi hanya saat membuat akun. Menggantinya berarti menyentuh
                        auth.users, yang belum disediakan alurnya -- kolom "Reset Password"
                        yang dulu ada di sini tidak pernah mengubah apa pun. */}
                    {!isEditing && (
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Kata Sandi Awal</label>
                            <input
                                type="password"
                                required
                                minLength={MIN_PASSWORD}
                                value={editingUser.password || ''}
                                onChange={(e) => setEditingUser({...editingUser, password: e.target.value})}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder={`Minimal ${MIN_PASSWORD} karakter`}
                            />
                        </div>
                    )}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Peran</label>
                        <select 
                            value={editingUser.role}
                            onChange={(e) => setEditingUser({...editingUser, role: e.target.value as UserRole})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        >
                            {/* Peninjau dihapus dari pilihan -- perilakunya tidak pernah
                                dibedakan dari Operator. Nilai enum-nya tetap ada supaya
                                akun lama yang terlanjur berperan itu masih punya label. */}
                            <option value={UserRole.Operator}>Operator</option>
                            <option value={UserRole.Admin}>Administrator</option>
                        </select>
                    </div>
                    
                    {pesanGagal && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            {pesanGagal}
                        </p>
                    )}

                    <div className="pt-2 flex justify-end gap-3">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            disabled={sedangSimpan}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            Batal
                        </button>
                        <button
                            type="submit"
                            disabled={sedangSimpan}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-60"
                        >
                            {sedangSimpan ? 'Menyimpan...' : 'Simpan Pengguna'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* DELETE CONFIRMATION */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                <div className="bg-red-600 px-6 py-4 border-b border-red-700 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2">
                        <span className="material-icons">warning</span>
                        Hapus Pengguna
                    </h3>
                    <button onClick={() => setUserToDelete(null)} className="text-red-100 hover:text-white">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-gray-700 text-sm mb-2">
                        Yakin ingin menghapus pengguna <strong>{userToDelete.email || userToDelete.name}</strong>?
                    </p>
                    <p className="text-xs text-gray-500 mb-4">
                        Akun loginnya ikut terhapus dan tidak bisa dikembalikan.
                    </p>

                    {gagalHapus && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">
                            {gagalHapus}
                        </p>
                    )}

                    <div className="flex justify-end gap-3">
                        <button
                            onClick={() => setUserToDelete(null)}
                            disabled={sedangHapus}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                        >
                            Batal
                        </button>
                        <button
                            onClick={confirmDelete}
                            disabled={sedangHapus}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-md shadow-red-200 transition-colors disabled:opacity-60"
                        >
                            {sedangHapus ? 'Menghapus...' : 'Hapus'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default AdminView;
