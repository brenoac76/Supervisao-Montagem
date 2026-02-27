
import React, { useState } from 'react';
import { User, UserRole } from '../types';
import { TrashIcon, ShieldCheckIcon, UserIcon, PlusCircleIcon, KeyIcon } from './icons';
import Modal from './Modal';
import { generateUUID } from '../App';

interface UserManagementProps {
  currentUser: User;
  users: User[];
  onAddUser: (user: User) => void;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (userId: string) => void;
  onClose: () => void;
}

const UserManagement: React.FC<UserManagementProps> = ({ currentUser, users, onAddUser, onUpdateUser, onDeleteUser, onClose }) => {
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.OPERATIONAL);
  const [error, setError] = useState('');

  // States for resetting password
  const [resettingUserId, setResettingUserId] = useState<string | null>(null);
  const [newResetPassword, setNewResetPassword] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (users.some(u => u.username.toLowerCase() === newUsername.toLowerCase())) {
      setError('Este nome de usuário já existe.');
      return;
    }

    if (newPassword.length < 4) {
      setError('A senha deve ter pelo menos 4 caracteres.');
      return;
    }

    const newUser: User = {
      id: generateUUID(),
      username: newUsername.trim(),
      password: newPassword,
      role: newRole
    };

    onAddUser(newUser);
    setNewUsername('');
    setNewPassword('');
    setNewRole(UserRole.OPERATIONAL);
  };

  const handleResetPassword = (user: User) => {
      if (newResetPassword.length < 4) {
          alert('A nova senha deve ter pelo menos 4 caracteres.');
          return;
      }
      onUpdateUser({ ...user, password: newResetPassword });
      setResettingUserId(null);
      setNewResetPassword('');
      alert(`Senha de ${user.username} alterada com sucesso.`);
  };

  return (
    <Modal onClose={onClose}>
      <div className="p-2">
        <h2 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <ShieldCheckIcon className="w-8 h-8 text-blue-600" />
          Gerenciamento de Usuários
        </h2>

        {/* Add User Form */}
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
          <h3 className="text-lg font-semibold text-slate-700 mb-3">Cadastrar Novo Usuário</h3>
          {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
          <form onSubmit={handleAdd} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">USUÁRIO</label>
              <input
                type="text"
                value={newUsername}
                onChange={e => setNewUsername(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded text-sm"
                placeholder="Nome de login"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">SENHA</label>
              <input
                type="text"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded text-sm"
                placeholder="Senha"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">PERFIL</label>
              <select
                value={newRole}
                onChange={e => setNewRole(e.target.value as UserRole)}
                className="w-full p-2 border border-slate-300 rounded text-sm bg-white"
              >
                <option value={UserRole.OPERATIONAL}>Operacional</option>
                <option value={UserRole.MASTER}>Master</option>
              </select>
            </div>
            <button
              type="submit"
              className="bg-green-600 text-white p-2 rounded flex items-center justify-center gap-1 hover:bg-green-700 transition-colors h-[38px]"
            >
              <PlusCircleIcon className="w-5 h-5" /> Adicionar
            </button>
          </form>
        </div>

        {/* User List */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-100 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="p-3">Usuário</th>
                <th className="p-3">Perfil</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {users.map(user => (
                <tr key={user.id} className="hover:bg-slate-50">
                  <td className="p-3 flex items-center gap-2 font-medium text-slate-800">
                    <UserIcon className="w-4 h-4 text-slate-400" />
                    {user.username}
                    {user.id === currentUser.id && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">(Você)</span>}
                  </td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${user.role === UserRole.MASTER ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="p-3 text-right">
                    {resettingUserId === user.id ? (
                        <div className="flex items-center justify-end gap-2">
                            <input 
                                type="text" 
                                placeholder="Nova senha" 
                                className="border border-blue-300 rounded px-2 py-1 text-xs w-24 focus:outline-none"
                                value={newResetPassword}
                                onChange={(e) => setNewResetPassword(e.target.value)}
                                autoFocus
                            />
                            <button onClick={() => handleResetPassword(user)} className="text-green-600 hover:text-green-800 text-xs font-bold bg-green-50 px-2 py-1 rounded">OK</button>
                            <button onClick={() => setResettingUserId(null)} className="text-red-500 hover:text-red-700 text-xs font-bold bg-red-50 px-2 py-1 rounded">X</button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-end gap-2">
                            <button 
                                onClick={() => { setResettingUserId(user.id); setNewResetPassword(''); }}
                                className="text-blue-500 hover:bg-blue-50 p-1.5 rounded transition-colors"
                                title="Redefinir Senha"
                            >
                                <KeyIcon className="w-4 h-4" />
                            </button>
                            {user.id !== currentUser.id && user.username !== 'admin' && (
                            <button
                                onClick={() => onDeleteUser(user.id)}
                                className="text-red-500 hover:bg-red-50 p-1.5 rounded transition-colors"
                                title="Excluir Usuário"
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                            )}
                        </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
};

export default UserManagement;
