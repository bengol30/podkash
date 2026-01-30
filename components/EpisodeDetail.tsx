
import React, { useState } from 'react';
import { Episode, Guest, Task, User } from '../types';
import { STATUS_LABELS, EPISODE_REQUIREMENTS } from '../constants';
import { geminiService } from '../services/geminiService';

interface EpisodeDetailProps {
  episodeId: string;
  episodes: Episode[];
  guests: Guest[];
  tasks: Task[];
  setEpisodes: React.Dispatch<React.SetStateAction<Episode[]>>;
  setTasks: React.Dispatch<React.SetStateAction<Task[]>>;
  onBack: () => void;
  addToast: (msg: string, type: any) => void;
  currentUser: User;
}

const EpisodeDetail: React.FC<EpisodeDetailProps> = ({ episodeId, episodes, guests, tasks, setEpisodes, setTasks, onBack, addToast, currentUser }) => {
  const episode = episodes.find(e => e.id === episodeId);
  const [isEditing, setIsEditing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editedTitle, setEditedTitle] = useState(episode?.title || '');
  const [editedDesc, setEditedDesc] = useState(episode?.description || '');
  const [editedStatus, setEditedStatus] = useState(episode?.status || 'idea');

  if (!episode) return null;

  const episodeGuests = guests.filter(g => g.relatedEpisodeId === episode.id);
  const episodeTasks = tasks.filter(t => t.relatedId === episode.id);

  const handleSave = () => {
    setEpisodes(prev => prev.map(e => e.id === episode.id ? { ...e, title: editedTitle, description: editedDesc, status: editedStatus as any, updatedAt: new Date().toISOString() } : e));
    setIsEditing(false);
    addToast('השינויים נשמרו בהצלחה', 'success');
  };

  const handleGenerateNotes = async () => {
    if (!episode.description) {
      addToast('אנא הוסף תיאור קצר לפרק לפני יצירת תקציר AI', 'info');
      return;
    }
    setIsGenerating(true);
    const guestNames = episodeGuests.map(g => g.name).join(', ') || 'אורח כללי';
    const result = await geminiService.generateShowNotes(episode.title, guestNames, episode.description);
    if (result) {
      setEditedDesc(prev => prev + '\n\n---\n✨ תקציר AI מומלץ:\n' + result);
      setIsEditing(true);
      addToast('תקציר AI נוצר בהצלחה!', 'success');
    }
    setIsGenerating(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-right-8 duration-500 pb-20">
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="w-12 h-12 flex items-center justify-center bg-white border border-slate-200 rounded-2xl shadow-sm hover:bg-slate-50 transition-colors text-xl">
          →
        </button>
        <div className="flex-1">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">{episode.title}</h2>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-1">מזהה פרק: {episode.id}</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={handleGenerateNotes} 
            disabled={isGenerating}
            className={`px-6 py-3 rounded-2xl font-black shadow-lg shadow-purple-100 flex items-center gap-2 transition-all ${isGenerating ? 'bg-slate-200 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:scale-105'}`}
          >
            {isGenerating ? 'מעבד...' : '✨ צור תקציר AI'}
          </button>
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className="px-6 py-3 bg-white border border-slate-200 text-slate-800 rounded-2xl font-black shadow-sm hover:bg-slate-50 transition-colors">
              ערוך פרק
            </button>
          ) : (
            <button onClick={handleSave} className="px-8 py-3 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors">
              שמור שינויים
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Details */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
            <h3 className="text-xl font-black mb-6">פרטי הפרק</h3>
            {isEditing ? (
              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">כותרת</label>
                  <input value={editedTitle} onChange={e => setEditedTitle(e.target.value)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 font-bold focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                   <label className="block text-sm font-bold text-slate-600 mb-2">סטטוס</label>
                   <select value={editedStatus} onChange={e => setEditedStatus(e.target.value as any)} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 font-bold focus:ring-2 focus:ring-blue-500">
                      {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                   </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">תיאור ותקציר</label>
                  <textarea value={editedDesc} onChange={e => setEditedDesc(e.target.value)} rows={10} className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 font-bold focus:ring-2 focus:ring-blue-500 custom-scrollbar" />
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                   <span className="px-4 py-1.5 bg-blue-600 text-white rounded-full text-xs font-black shadow-md">{STATUS_LABELS[episode.status]}</span>
                   <span className="text-slate-400 font-bold text-xs">עודכן לאחרונה: {new Date(episode.updatedAt).toLocaleDateString('he-IL')}</span>
                </div>
                <div className="prose max-w-none">
                  <p className="text-slate-700 leading-loose text-lg whitespace-pre-wrap">{episode.description || 'אין תיאור לפרק זה. לחץ על ערוך כדי להוסיף תוכן.'}</p>
                </div>
              </div>
            )}
          </div>

          <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black">משימות לפרק</h3>
              <button className="text-blue-600 font-bold text-sm">+ הוסף משימה</button>
            </div>
            <div className="space-y-4">
              {episodeTasks.length > 0 ? episodeTasks.map(task => (
                <div key={task.id} className="p-4 bg-slate-50 rounded-2xl flex items-center gap-4">
                   <input type="checkbox" checked={task.status === 'completed'} readOnly className="w-5 h-5 rounded-lg border-2 border-slate-300 text-blue-600" />
                   <span className={`font-bold ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.title}</span>
                </div>
              )) : <p className="text-slate-400 font-bold text-center py-6">אין משימות ספציפיות לפרק זה</p>}
            </div>
          </div>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-8">
           <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
              <h3 className="text-xl font-black mb-6">מרואיינים</h3>
              <div className="space-y-4">
                {episodeGuests.map(guest => (
                  <div key={guest.id} className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl hover:bg-blue-50 transition-colors group cursor-pointer">
                    <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-xl shadow-sm">👤</div>
                    <div className="flex-1">
                      <p className="font-black text-slate-800 text-sm">{guest.name}</p>
                      <p className="text-xs text-slate-400 font-bold">{guest.status}</p>
                    </div>
                  </div>
                ))}
                <button className="w-full py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-sm hover:bg-slate-200 transition-colors">
                  + שייך מרואיין
                </button>
              </div>
           </div>

           <div className="bg-emerald-50 p-8 rounded-3xl border border-emerald-100">
              <h3 className="text-xl font-black text-emerald-900 mb-6 flex items-center gap-2">
                <span>🎯</span> צ׳ק-ליסט סיום
              </h3>
              <div className="space-y-4">
                {EPISODE_REQUIREMENTS.ready.map(req => {
                  const isDone = (req.id === 'has_description' && !!episode.description) || (req.id === 'has_guest' && episodeGuests.length > 0);
                  return (
                    <div key={req.id} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${isDone ? 'bg-emerald-500 text-white' : 'bg-white border-2 border-emerald-200'}`}>
                        {isDone ? '✓' : ''}
                      </div>
                      <span className={`text-sm font-bold ${isDone ? 'text-emerald-800' : 'text-emerald-400'}`}>{req.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-8 pt-8 border-t border-emerald-100">
                 <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest mb-4">מוכן לפרסום?</p>
                 <button className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-black shadow-lg shadow-emerald-200 hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100" disabled={episode.status === 'published'}>
                   {episode.status === 'published' ? 'פורסם!' : 'שדרג לסטטוס "מוכן"'}
                 </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default EpisodeDetail;
