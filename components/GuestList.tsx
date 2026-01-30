
import React, { useState } from 'react';
import { Guest, User } from '../types';
import { GUEST_STATUS_LABELS } from '../constants';

interface GuestListProps {
  guests: Guest[];
  setGuests: React.Dispatch<React.SetStateAction<Guest[]>>;
  currentUser: User;
  addToast: (msg: string, type: any) => void;
}

const GuestList: React.FC<GuestListProps> = ({ guests, setGuests, addToast }) => {
  const [search, setSearch] = useState('');

  const filteredGuests = guests.filter(g => g.name.toLowerCase().includes(search.toLowerCase()) || (g.email && g.email.toLowerCase().includes(search.toLowerCase())));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <input 
          type="text" 
          placeholder="חפש מרואיינים..." 
          className="flex-1 max-w-sm px-6 py-4 rounded-2xl bg-white border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button className="px-8 py-4 bg-purple-600 text-white rounded-2xl font-black shadow-xl shadow-purple-200 hover:scale-105 transition-transform">
          + מרואיין חדש
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredGuests.map(guest => (
          <div key={guest.id} className="bg-white p-8 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 hover:shadow-2xl transition-all cursor-pointer group text-center">
            <div className="w-20 h-20 bg-slate-100 rounded-3xl flex items-center justify-center text-4xl mx-auto mb-6 group-hover:scale-110 transition-transform">👤</div>
            <h3 className="text-xl font-black text-slate-800 mb-2 leading-none">{guest.name}</h3>
            <p className="text-xs font-black text-purple-600 uppercase tracking-widest mb-4">{GUEST_STATUS_LABELS[guest.status]}</p>
            <div className="space-y-2 mb-6">
              {guest.email && <p className="text-sm text-slate-500 font-medium truncate">{guest.email}</p>}
              {guest.phone && <p className="text-sm text-slate-500 font-medium">{guest.phone}</p>}
            </div>
            <div className="flex justify-center gap-3 pt-4 border-t border-slate-50">
               {guest.linkedin && <span className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center">💼</span>}
               {guest.instagram && <span className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center">📸</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default GuestList;
