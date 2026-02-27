
import React, { useState } from 'react';
import { User } from '../types';
import { LockClosedIcon } from './icons';
import { APP_VERSION } from '../utils/version';

interface AuthScreenProps {
  users: User[];
  onLogin: (user: User) => void;
  logoUrl: string | null;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ users, onLogin, logoUrl }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Safety check: ensure u.username exists before calling toLowerCase()
    const user = users.find(u => u.username && u.username.toLowerCase() === username.toLowerCase().trim());

    if (user && user.password === password) {
      onLogin(user);
    } else {
      setError('Usuário ou senha incorretos.');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="bg-white p-8 rounded-xl shadow-2xl max-w-md w-full border border-slate-200">
        <div className="text-center mb-8">
          <div className="h-24 w-auto flex items-center justify-center mx-auto mb-6">
            {logoUrl ? (
                <img src={logoUrl} alt="Todeschini Logo" className="max-h-full w-auto animate-fadeIn" />
            ) : (
                <div className="h-20 w-20 bg-blue-100 rounded-full flex items-center justify-center">
                    <LockClosedIcon className="h-10 w-10 text-blue-600" />
                </div>
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Acesso ao Sistema</h1>
          <p className="text-slate-500 mt-2">Supervisão de Montagem</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-md border border-red-200 text-center">
              {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Usuário</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="Digite seu usuário"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
              placeholder="Digite sua senha"
              required
            />
          </div>
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl"
          >
            Entrar
          </button>
        </form>
        <div className="mt-6 text-center">
           <p className="text-xs text-slate-400">Sistema de uso exclusivo</p>
           <p className="text-[10px] text-slate-300 mt-1">v{APP_VERSION}</p>
        </div>
      </div>
    </div>
  );
};

export default AuthScreen;
