import React, { useState } from 'react';
import { KeyIcon } from './icons';
import Modal from './Modal';

interface ChangePasswordModalProps {
  onClose: () => void;
  onChangePassword: (oldPass: string, newPass: string) => void;
}

const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ onClose, onChangePassword }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 4) {
      setError('A nova senha deve ter pelo menos 4 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('As novas senhas não coincidem.');
      return;
    }

    if (oldPassword === newPassword) {
        setError('A nova senha não pode ser igual à anterior.');
        return;
    }

    onChangePassword(oldPassword, newPassword);
  };

  return (
    <Modal onClose={onClose}>
      <div className="p-2">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <KeyIcon className="w-6 h-6 text-blue-600" />
          Alterar Senha
        </h2>
        
        {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm mb-4">
                {error}
            </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-500 mb-1">SENHA ATUAL</label>
            <input
              type="password"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded"
              required
            />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">NOVA SENHA</label>
                <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded"
                required
                />
            </div>
            <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">CONFIRMAR NOVA SENHA</label>
                <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                className="w-full p-2 border border-slate-300 rounded"
                required
                />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            >
              Alterar Senha
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
};

export default ChangePasswordModal;