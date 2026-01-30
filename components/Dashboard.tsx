
import React from 'react';
import { Episode, Booking, Task, Guest, User } from '../types';
import { STATUS_LABELS } from '../constants';

interface DashboardProps {
  episodes: Episode[];
  bookings: Booking[];
  tasks: Task[];
  guests: Guest[];
  currentUser: User;
  onEpisodeClick: (id: string) => void;
  addToast: (msg: string, type: any) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ episodes, bookings, tasks, guests, currentUser, onEpisodeClick }) => {
  const myEpisodes = episodes.filter(e => e.hostId === currentUser.id || currentUser.role === 'admin' || currentUser.role === 'producer');
  const upcomingBooking = bookings
    .filter(b => b.hostId === currentUser.id && new Date(b.date) >= new Date())
    .sort((a, b) => new Date(`${a.date}T${a.startTime}`).getTime() - new Date(`${b.date}T${b.startTime}`).getTime())[0];

  const pendingTasks = tasks.filter(t => t.assigneeId === currentUser.id && t.status === 'pending');

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Quick Stats */}
        <StatCard title="פרקים שלי" value={myEpisodes.length} icon="🎙️" color="bg-blue-500" />
        <StatCard title="משימות פתוחות" value={pendingTasks.length} icon="✅" color="bg-emerald-500" />
        <StatCard title="מרואיינים בקשר" value={guests.length} icon="👥" color="bg-purple-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Next Studio Session */}
        <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
          <h3 className="text-xl font-black mb-6 flex items-center gap-2">
            <span className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-xl">📅</span>
            סשן הקלטה קרוב
          </h3>
          {upcomingBooking ? (
            <div className="bg-gradient-to-br from-blue-600 to-indigo-700 p-8 rounded-3xl text-white shadow-xl shadow-blue-200">
              <p className="text-blue-100 font-bold uppercase tracking-widest text-xs mb-2">תאריך ושעה</p>
              <h4 className="text-3xl font-black mb-4">
                {new Date(upcomingBooking.date).toLocaleDateString('he-IL', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h4>
              <div className="flex items-center gap-6 text-blue-50">
                <div className="flex items-center gap-2">
                   <span className="text-lg">🕒</span>
                   <span className="font-bold">{upcomingBooking.startTime} - {upcomingBooking.endTime}</span>
                </div>
                <div className="flex items-center gap-2">
                   <span className="text-lg">{upcomingBooking.type === 'video' ? '📹' : '🎙️'}</span>
                   <span className="font-bold">{upcomingBooking.type === 'video' ? 'וידאו' : 'אודיו'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
              <p className="text-slate-500 font-bold mb-4">אין הקלטות מתוכננות כרגע</p>
              <button className="px-6 py-3 bg-blue-600 text-white rounded-2xl font-bold shadow-lg shadow-blue-200 hover:scale-105 transition-transform">שריין עכשיו</button>
            </div>
          )}
        </div>

        {/* My Tasks */}
        <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col">
          <h3 className="text-xl font-black mb-6 flex items-center gap-2">
            <span className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-xl">✅</span>
            משימות לביצוע
          </h3>
          <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar max-h-[300px]">
            {pendingTasks.length > 0 ? pendingTasks.map(task => (
              <div key={task.id} className="group p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-emerald-200 hover:bg-emerald-50 transition-all flex items-center gap-4">
                <input type="checkbox" className="w-5 h-5 rounded-lg border-2 border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                <div className="flex-1">
                  <p className="font-bold text-slate-800">{task.title}</p>
                  <p className="text-xs text-slate-500 font-medium">קטגוריה: {task.category}</p>
                </div>
                {task.dueDate && <span className="text-xs font-bold px-3 py-1 bg-white rounded-lg text-slate-500">{task.dueDate}</span>}
              </div>
            )) : (
              <p className="text-slate-400 text-center py-10 font-bold">כל הכבוד! אין משימות פתוחות</p>
            )}
          </div>
        </div>
      </div>

      {/* Recent Episodes */}
      <div className="bg-white p-8 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100">
        <h3 className="text-xl font-black mb-6 flex items-center gap-2">
          <span className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-xl">🚀</span>
          פרקים בתהליך
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {myEpisodes.slice(0, 3).map(ep => (
            <div key={ep.id} onClick={() => onEpisodeClick(ep.id)} className="p-6 bg-slate-50 rounded-3xl border border-transparent hover:border-blue-200 hover:bg-blue-50 transition-all cursor-pointer group">
              <div className="flex justify-between items-start mb-4">
                <span className="px-3 py-1 bg-white text-slate-600 rounded-full text-xs font-black shadow-sm">{STATUS_LABELS[ep.status]}</span>
                <span className="text-xs font-bold text-slate-400">{new Date(ep.createdAt).toLocaleDateString('he-IL')}</span>
              </div>
              <h4 className="text-lg font-black text-slate-800 group-hover:text-blue-700 transition-colors mb-2">{ep.title}</h4>
              <p className="text-sm text-slate-500 line-clamp-2 leading-relaxed">{ep.description || 'אין תיאור לפרק זה...'}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const StatCard: React.FC<{ title: string; value: number | string; icon: string; color: string }> = ({ title, value, icon, color }) => (
  <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-6">
    <div className={`w-16 h-16 ${color} rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-blue-100`}>
      {icon}
    </div>
    <div>
      <p className="text-slate-500 font-bold text-sm mb-1">{title}</p>
      <p className="text-4xl font-black text-slate-900 leading-none">{value}</p>
    </div>
  </div>
);

export default Dashboard;
