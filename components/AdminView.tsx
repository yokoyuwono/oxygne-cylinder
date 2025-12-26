
import React, { useState } from 'react';
import { AppUser, UserRole } from '../types';

interface AdminViewProps {
  users: AppUser[];
  onAddUser: (user: AppUser) => void;
  onUpdateUser: (user: AppUser) => void;
  onDeleteUser: (id: string) => void;
  currentUser: AppUser | null;
}

const AdminView: React.FC<AdminViewProps> = ({ users, onAddUser, onUpdateUser, onDeleteUser, currentUser }) => {
  const [searchTerm, setSearchTerm] = useState('');
  
  // CRUD State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingUser, setEditingUser] = useState<Partial<AppUser>>({ role: UserRole.Operator });

  // Delete State
  const [userToDelete, setUserToDelete] = useState<AppUser | null>(null);

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.username.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleOpenAdd = () => {
    setIsEditing(false);
    setEditingUser({ role: UserRole.Operator, name: '', username: '', password: '' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: AppUser) => {
    setIsEditing(true);
    // Don't pre-fill password for editing
    setEditingUser({ ...user, password: '' }); 
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser.username || !editingUser.name) return;

    if (isEditing && editingUser.id) {
        // If password is blank, don't update it (keep existing)
        // In a real app, backend handles this. Here we just logic it.
        const updated: AppUser = {
            id: editingUser.id,
            username: editingUser.username,
            name: editingUser.name,
            role: editingUser.role!,
            password: editingUser.password ? editingUser.password : (users.find(u => u.id === editingUser.id)?.password || ''),
            lastLogin: users.find(u => u.id === editingUser.id)?.lastLogin
        };
        onUpdateUser(updated);
    } else {
        // Add new
        const newUser: AppUser = {
            id: `u-${Date.now()}`,
            username: editingUser.username,
            name: editingUser.name,
            role: editingUser.role!,
            password: editingUser.password || 'password123', // Default
            lastLogin: undefined
        };
        onAddUser(newUser);
    }
    setIsModalOpen(false);
  };

  const confirmDelete = () => {
    if (userToDelete) {
        onDeleteUser(userToDelete.id);
        setUserToDelete(null);
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
           <h2 className="text-2xl font-bold text-gray-800">Admin Management</h2>
           <p className="text-gray-500 text-sm">Manage system access and staff accounts.</p>
        </div>
        
        <div className="flex w-full md:w-auto gap-3">
             <div className="relative flex-1 md:w-64">
                <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
                <input 
                    type="text" 
                    placeholder="Search users..." 
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
                Add User
            </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-100">
                <tr className="text-gray-500 uppercase text-xs tracking-wider">
                    <th className="px-6 py-3">User</th>
                    <th className="px-6 py-3">Role</th>
                    <th className="px-6 py-3">Last Login</th>
                    <th className="px-6 py-3 text-right">Actions</th>
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
                                    <p className="text-xs text-gray-500">@{u.username}</p>
                                </div>
                            </div>
                        </td>
                        <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase ${getRoleBadge(u.role)}`}>
                                {u.role}
                            </span>
                        </td>
                        <td className="px-6 py-4 text-gray-500 font-mono text-xs">
                            {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}
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
                        {isEditing ? 'Edit User' : 'Add New User'}
                    </h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-indigo-200 hover:text-white">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                        <input 
                            type="text" 
                            required
                            value={editingUser.name || ''}
                            onChange={(e) => setEditingUser({...editingUser, name: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="e.g. John Doe"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                        <input 
                            type="text" 
                            required
                            value={editingUser.username || ''}
                            onChange={(e) => setEditingUser({...editingUser, username: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="username"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            {isEditing ? 'Reset Password (optional)' : 'Password'}
                        </label>
                        <input 
                            type="password" 
                            required={!isEditing}
                            value={editingUser.password || ''}
                            onChange={(e) => setEditingUser({...editingUser, password: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder={isEditing ? 'Leave blank to keep current' : 'Enter password'}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
                        <select 
                            value={editingUser.role}
                            onChange={(e) => setEditingUser({...editingUser, role: e.target.value as UserRole})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        >
                            <option value={UserRole.Operator}>Operator</option>
                            <option value={UserRole.Admin}>Administrator</option>
                            <option value={UserRole.Viewer}>Viewer</option>
                        </select>
                    </div>
                    
                    <div className="pt-2 flex justify-end gap-3">
                        <button 
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            Save User
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
                        Delete User
                    </h3>
                    <button onClick={() => setUserToDelete(null)} className="text-red-100 hover:text-white">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-gray-700 text-sm mb-4">
                        Are you sure you want to delete user <strong>@{userToDelete.username}</strong>?
                    </p>
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setUserToDelete(null)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmDelete}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-md shadow-red-200 transition-colors"
                        >
                            Delete
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
