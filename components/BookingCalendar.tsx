
import React, { useState } from 'react';
import { Booking, User } from '../types';

interface BookingCalendarProps {
  bookings: Booking[];
  setBookings: React.Dispatch<React.SetStateAction<Booking[]>>;
  currentUser: User;
  addToast: (msg: string, type: any) => void;
}

const BookingCalendar: React.FC<BookingCalendarProps> = ({ bookings, setBookings, currentUser, addToast }) => {
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newBooking, setNewBooking] = useState({ date: '', startTime: '10:00', endTime: '12:00', type: 'audio' as const });

  const getWeekDays = (offset: number) => {
    const today = new Date();
    const sunday = new Date(today.setDate(today.getDate() - today.getDay() + (offset * 7)));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i);
      return d;
    });
  };

  const days = getWeekDays(weekOffset);
  const hours = Array.from({ length: 14 }, (_, i) => i + 8); // 8:00 to 22:00

  const handleAddBooking = (e: React.FormEvent) => {
    e.preventDefault();
    const id = Math.random().toString(36).substr(2, 9);
    setBookings(prev => [...prev, { ...newBooking, id, status: 'approved', hostId: currentUser.id }]);
    setShowAddModal(false);
    addToast('שריון אולפן נוסף בהצלחה!', 'success');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => setWeekOffset(prev => prev - 1)} className="px-6 py-3 bg-white border border-slate-200 rounded-2xl font-bold shadow-sm hover:bg-slate-50">שבוע קודם</button>
          <h3 className="text-xl font-black text-slate-800">
            {days[0].toLocaleDateString('he-IL')} - {days[6].toLocaleDateString('he-IL')}
          </h3>
          <button onClick={() => setWeekOffset(prev => prev + 1)} className="px-6 py-3 bg-white border border-slate-200 rounded-2xl font-bold shadow-sm hover:bg-slate-50">שבוע הבא</button>
        </div>
        <button onClick={() => setShowAddModal(true)} className="px-8 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-xl shadow-blue-200 hover:scale-105 transition-transform">
          + שריון חדש
        </button>
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[1000px] border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="p-4 border-l border-b border-slate-200 w-24">שעה</th>
                {days.map(day => (
                  <th key={day.toISOString()} className={`p-4 border-l border-b border-slate-200 ${day.toDateString() === new Date().toDateString() ? 'bg-blue-50 text-blue-700' : ''}`}>
                    <p className="font-black text-sm">{day.toLocaleDateString('he-IL', { weekday: 'long' })}</p>
                    <p className="text-xs font-bold text-slate-400">{day.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' })}</p>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map(hour => (
                <tr key={hour}>
                  <td className="p-4 border-l border-b border-slate-100 text-center font-black text-slate-400 text-sm bg-slate-50/50">{hour}:00</td>
                  {days.map(day => {
                    const dateStr = day.toISOString().split('T')[0];
                    const slotBookings = bookings.filter(b => b.date === dateStr && parseInt(b.startTime.split(':')[0]) === hour);
                    
                    return (
                      <td key={`${dateStr}-${hour}`} className="p-2 border-l border-b border-slate-100 h-24 relative hover:bg-slate-50/50 transition-colors">
                        {slotBookings.map(b => (
                          <div key={b.id} className={`absolute inset-1 p-3 rounded-xl border shadow-sm flex flex-col justify-between ${b.hostId === currentUser.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-slate-100 border-slate-200 text-slate-600 opacity-60'}`}>
                            <p className="font-black text-[10px] leading-none mb-1">{b.startTime} - {b.endTime}</p>
                            <p className="font-black text-xs truncate leading-none">{b.hostId === currentUser.id ? 'השריון שלך' : 'משוריין'}</p>
                            <p className="text-[10px] opacity-80">{b.type === 'video' ? '📹 וידאו' : '🎙️ אודיו'}</p>
                          </div>
                        ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl p-8">
            <h3 className="text-2xl font-black mb-6">שריון אולפן חדש</h3>
            <form onSubmit={handleAddBooking} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-slate-600 mb-2">תאריך</label>
                  <input type="date" className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 font-bold" value={newBooking.date} onChange={e => setNewBooking({ ...newBooking, date: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">שעת התחלה</label>
                  <input type="time" className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 font-bold" value={newBooking.startTime} onChange={e => setNewBooking({ ...newBooking, startTime: e.target.value })} required />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-600 mb-2">שעת סיום</label>
                  <input type="time" className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 font-bold" value={newBooking.endTime} onChange={e => setNewBooking({ ...newBooking, endTime: e.target.value })} required />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-slate-600 mb-2">סוג הפקה</label>
                  <div className="flex gap-4">
                    <button type="button" onClick={() => setNewBooking({ ...newBooking, type: 'audio' })} className={`flex-1 py-4 rounded-2xl font-black transition-all ${newBooking.type === 'audio' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500'}`}>🎙️ אודיו</button>
                    <button type="button" onClick={() => setNewBooking({ ...newBooking, type: 'video' })} className={`flex-1 py-4 rounded-2xl font-black transition-all ${newBooking.type === 'video' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500'}`}>📹 וידאו</button>
                  </div>
                </div>
              </div>
              <div className="flex gap-4 pt-4">
                <button type="submit" className="flex-1 px-8 py-4 bg-blue-600 text-white rounded-2xl font-black shadow-lg shadow-blue-200">שריין אולפן</button>
                <button type="button" onClick={() => setShowAddModal(false)} className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default BookingCalendar;
