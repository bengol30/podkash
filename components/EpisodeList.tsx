
import React, { useState, useMemo } from 'react';
import { Episode, User } from '../types';
import { STATUS_LABELS } from '../constants';

interface EpisodeListProps {
  episodes: Episode[];
  setEpisodes: React.Dispatch<React.SetStateAction<Episode[]>>;
  onEpisodeClick: (id: string) => void;
  currentUser: User;
  addToast: (msg: string, type: any) => void;
}

const EpisodeList: React.FC<EpisodeListProps> = ({ episodes, setEpisodes, onEpisodeClick, currentUser, addToast }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const filteredEpisodes = useMemo(() => {
    return episodes.filter(ep => {
      const matchSearch = ep.title.toLowerCase().includes(search.toLowerCase()) || ep.description.toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === 'all' || ep.status === filter;
      return matchSearch && matchFilter;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [episodes, search, filter]);

  const handleAddEpisode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle) return;
    
    const newEpisode: Episode = {
      id: Math.random().toString(36).substr(2, 9),
      title: newTitle,
      description: '',
      status: 'idea',
      type: 'interview',
      hostId: currentUser.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setEpisodes([newEpisode, ...episodes]);
    setNewTitle('');
    setShowAddModal(false);
    addToast('הפרק נוסף בהצלחה!', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4 flex-1">
          <input 
            type="text" 
            placeholder="חפש פרקים..." 
            className="flex-1 max-w-sm px-6 py-4 rounded-2xl bg-white border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select 
            className="px-6 py-4 rounded-2xl bg-white border border-slate-200 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">כל הסטטוסים</option>
            {Object.entries(STATUS_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-200 hover:scale-105 transition-transform shrink-0"
        >
          + פרק חדש
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filteredEpisodes.map(ep => (
          <div 
            key={ep.id} 
            onClick={() => onEpisodeClick(ep.id)}
            className="group bg-white p-8 rounded-3xl border border-slate-100 shadow-lg shadow-slate-200/50 hover:shadow-2xl hover:shadow-blue-200/30 transition-all cursor-pointer flex flex-col h-full"
          >
             <div className="flex justify-between items-center mb-6">
                <span className="px-4 py-1.5 bg-blue-50 text-blue-700 rounded-full text-xs font-black shadow-sm border border-blue-100">{STATUS_LABELS[ep.status]}</span>
                <span className="text-[10px] uppercase font-black tracking-widest text-slate-400">{ep.type}</span>
             </div>
             <h3 className="text-xl font-black text-slate-800 mb-4 leading-snug group-hover:text-blue-700 transition-colors">{ep.title}</h3>
             <p className="text-slate-500 text-sm flex-1 leading-relaxed line-clamp-3 mb-6">{ep.description || 'עדיין לא הוגדר תיאור לפרק זה.'}</p>
             <div className="pt-6 border-t border-slate-50 flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
               <span>{new Date(ep.createdAt).toLocaleDateString('he-IL')}</span>
               <span className="group-hover:translate-x-[-4px] transition-transform">פרטים מלאים ←</span>
             </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-8 animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black mb-6">יצירת פרק חדש</h3>
            <form onSubmit={handleAddEpisode} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-600 mb-2">כותרת הפרק</label>
                <input 
                  autoFocus
                  type="text" 
                  className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  placeholder="לדוגמה: פרק 1 - איך להתחיל פודקאסט"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button type="submit" className="flex-1 px-8 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors">צור פרק</button>
                <button type="button" onClick={() => setShowAddModal(false)} className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black hover:bg-slate-200 transition-colors">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default EpisodeList;
