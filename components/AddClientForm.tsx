
import React, { useState } from 'react';
import { Client, UnitType, Assembler } from '../types';

interface AddClientFormProps {
  assemblers?: Assembler[];
  onAddClient: (client: Omit<Client, 'id' | 'environments' | 'visitLogs'>) => void;
  onCancel: () => void;
}

const AddClientForm: React.FC<AddClientFormProps> = ({ assemblers = [], onAddClient, onCancel }) => {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [unitType, setUnitType] = useState<UnitType>(UnitType.House);
  const [assembler, setAssembler] = useState('');
  const [observations, setObservations] = useState('');
  const [startDate, setStartDate] = useState('');

  // Filter out helpers for the Assembler dropdown
  const filteredAssemblers = assemblers.filter(a => {
      const r = (a.role || '').toLowerCase();
      return !r.includes('ajudante') && !r.includes('auxiliar');
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim() && address.trim()) {
      onAddClient({ name, address, unitType, assembler, observations, startDate: startDate || undefined });
      setName('');
      setAddress('');
      setUnitType(UnitType.House);
      setAssembler('');
      setObservations('');
      setStartDate('');
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-lg border border-slate-200">
        <h2 className="text-xl font-bold text-slate-700 mb-4">Adicionar Novo Cliente</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
        <div>
            <label htmlFor="client-name" className="block text-sm font-medium text-slate-600 mb-1">Nome do Cliente</label>
            <input
            id="client-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ex: João da Silva"
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
            />
        </div>
        <div>
            <label htmlFor="client-address" className="block text-sm font-medium text-slate-600 mb-1">Endereço Completo</label>
            <input
            id="client-address"
            type="text"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="Ex: Rua das Flores, 123, Bairro, Cidade - Estado, CEP"
            className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            required
            />
        </div>
        <div>
            <label htmlFor="client-assembler" className="block text-sm font-medium text-slate-600 mb-1">Montador Responsável</label>
            {assemblers.length > 0 ? (
                <select
                    id="client-assembler"
                    value={assembler}
                    onChange={e => setAssembler(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                    <option value="">Selecione um montador...</option>
                    {filteredAssemblers.map(a => (
                        <option key={a.id} value={a.name}>{a.name} - {a.role}</option>
                    ))}
                </select>
            ) : (
                <div className="p-2 bg-yellow-50 border border-yellow-200 text-yellow-800 text-sm rounded">
                    Nenhum montador cadastrado. Vá em "Gestão de Equipe" para adicionar.
                </div>
            )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
                <label htmlFor="unit-type" className="block text-sm font-medium text-slate-600 mb-1">Tipo de Unidade</label>
                <select
                id="unit-type"
                value={unitType}
                onChange={e => setUnitType(e.target.value as UnitType)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                <option value={UnitType.House}>Casa</option>
                <option value={UnitType.Apartment}>Apartamento</option>
                </select>
            </div>
             <div>
                <label htmlFor="start-date" className="block text-sm font-medium text-slate-600 mb-1">Data de Início da Montagem</label>
                <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
        </div>
        <div>
            <label htmlFor="client-observations" className="block text-sm font-medium text-slate-600 mb-1">Observações Gerais</label>
            <textarea
                id="client-observations"
                value={observations}
                onChange={e => setObservations(e.target.value)}
                placeholder="Adicione notas gerais sobre o cliente ou projeto..."
                rows={4}
                className="w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
        </div>
        <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-slate-200 text-slate-700 font-semibold rounded-md hover:bg-slate-300 transition duration-300"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700 transition duration-300"
            >
              Salvar Cliente
            </button>
        </div>
        </form>
    </div>
  );
};

export default AddClientForm;
