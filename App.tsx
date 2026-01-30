
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { User, Episode, Guest, Booking, Task, AppNotification, UserRole } from './types';
import { STATUS_LABELS, COLORS } from './constants';
import Dashboard from './components/Dashboard';
import EpisodeList from './components/EpisodeList';
import EpisodeDetail from './components/EpisodeDetail';
import GuestList from './components/GuestList';
import BookingCalendar from './components/BookingCalendar';
import LoginForm from './components/LoginForm';

// הכתובת שקיבלת מה-Deployment של Apps Script
const SHEET_API_URL = "https://script.google.com/macros/s/AKfycbxMZQLdPrDaDlmu6wCJLszWdz6rhiEEUzIjPSs_yT5mox420QEVf6Zf2t17Y9ifSaOH/exec"; 

const App: React.FC = () => {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  // App Data State
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  // UI State
  const [currentView, setCurrentView] = useState<'dashboard' | 'episodes' | 'guests' | 'bookings' | 'notifications'>('dashboard');
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState<{ id: number; message: string; type: 'success' | 'error' | 'info' }[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 3000);
  }, []);

  // Sync Data to Google Sheets
  const syncToCloud = useCallback(async (dataOverride?: any) => {
    if (!SHEET_API_URL) return;
    setIsSyncing(true);
    try {
      const payload = {
        action: "syncAll",
        data: dataOverride || { episodes, guests, bookings, tasks }
      };
      
      const response = await fetch(SHEET_API_URL, {
        method: 'POST',
        mode: 'no-cors', // Apps Script requires no-cors for simple posts
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      setLastSynced(new Date());
      addToast('המידע סונכרן לענן בהצלחה!', 'success');
    } catch (error) {
      console.error("Sync error:", error);
      addToast('שגיאה בסנכרון לענן', 'error');
    } finally {
      setIsSyncing(false);
    }
  }, [episodes, guests, bookings, tasks, addToast]);

  // Load Data from Cloud or Local
  useEffect(() => {
    const init = async () => {
      // 1. Check local user
      const savedUser = localStorage.getItem('podcash_user');
      if (savedUser) setCurrentUser(JSON.parse(savedUser));
      
      // 2. Try to load from Cloud
      if (SHEET_API_URL) {
        setIsSyncing(true);
        try {
          const response = await fetch(SHEET_API_URL);
          const cloudData = await response.json();
          if (cloudData.episodes) setEpisodes(cloudData.episodes);
          if (cloudData.guests) setGuests(cloudData.guests);
          if (cloudData.bookings) setBookings(cloudData.bookings);
          if (cloudData.tasks) setTasks(cloudData.tasks);
          setLastSynced(new Date());
        } catch (error) {
          console.error("Cloud load failed, falling back to local:", error);
          // Fallback to local
          const savedEpisodes = localStorage.getItem('podcash_episodes');
          if (savedEpisodes) setEpisodes(JSON.parse(savedEpisodes));
          const savedGuests = localStorage.getItem('podcash_guests');
          if (savedGuests) setGuests(JSON.parse(savedGuests));
          const savedBookings = localStorage.getItem('podcash_bookings');
          if (savedBookings) setBookings(JSON.parse(savedBookings));
          const savedTasks = localStorage.getItem('podcash_tasks');
          if (savedTasks) setTasks(JSON.parse(savedTasks));
        } finally {
          setIsSyncing(false);
        }
      } else {
        // Just local if no API URL
        const savedEpisodes = localStorage.getItem('podcash_episodes');
        if (savedEpisodes) setEpisodes(JSON.parse(savedEpisodes));
        const savedGuests = localStorage.getItem('podcash_guests');
        if (savedGuests) setGuests(JSON.parse(savedGuests));
        const savedBookings = localStorage.getItem('podcash_bookings');
        if (savedBookings) setBookings(JSON.parse(savedBookings));
        const savedTasks = localStorage.getItem('podcash_tasks');
        if (savedTasks) setTasks(JSON.parse(savedTasks));
      }
      setIsAuthChecking(false);
    };
    init();
  }, []);

  // Save Local Copy on changes
  useEffect(() => {
    localStorage.setItem('podcash_episodes', JSON.stringify(episodes));
    localStorage.setItem('podcash_guests', JSON.stringify(guests));
    localStorage.setItem('podcash_bookings', JSON.stringify(bookings));
    localStorage.setItem('podcash_tasks', JSON.stringify(tasks));
  }, [episodes, guests, bookings, tasks]);

  const handleLogin = (user: User) => {
    setCurrentUser(user);
    localStorage.setItem('podcash_user', JSON.stringify(user));
    addToast(`ברוך הבא, ${user.name}!`, 'success');
  };

  const handleLogout = () => {
    setCurrentUser(null);
    localStorage.removeItem('podcash_user');
    addToast('התנתקת מהמערכת', 'info');
  };

  if (isAuthChecking) return (
    <div className="h-full flex flex-col items-center justify-center bg-slate-50">
      <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <p className="font-black text-blue-900 animate-pulse">מתחבר למסד הנתונים...</p>
    </div>
  );

  if (!currentUser) {
    return <LoginForm onLogin={handleLogin} />;
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-['Assistant']" dir="rtl">
      {/* Toast Container */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`${toast.type === 'success' ? 'bg-green-600' : toast.type === 'error' ? 'bg-red-600' : 'bg-blue-600'} text-white px-6 py-3 rounded-xl shadow-2xl pointer-events-auto transition-all animate-bounce`}>
            {toast.message}
          </div>
        ))}
      </div>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 right-0 z-50 w-72 bg-white border-l shadow-2xl transition-transform lg:translate-x-0 lg:static lg:shadow-none ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex flex-col h-full">
          <div className="p-8 border-b">
            <h1 className="text-3xl font-black text-blue-600 tracking-tight">פודק״ש</h1>
            <p className="text-slate-400 text-sm font-medium">ניהול פודקאסט קהילתי</p>
          </div>

          <nav className="flex-1 p-4 space-y-2 overflow-y-auto custom-scrollbar">
            <NavButton active={currentView === 'dashboard'} onClick={() => { setCurrentView('dashboard'); setSidebarOpen(false); }}>
              <span className="text-xl">🏠</span> דשבורד
            </NavButton>
            <NavButton active={currentView === 'episodes'} onClick={() => { setCurrentView('episodes'); setSelectedEpisodeId(null); setSidebarOpen(false); }}>
              <span className="text-xl">🎙️</span> פרקים
            </NavButton>
            <NavButton active={currentView === 'guests'} onClick={() => { setCurrentView('guests'); setSidebarOpen(false); }}>
              <span className="text-xl">👥</span> מרואיינים
            </NavButton>
            <NavButton active={currentView === 'bookings'} onClick={() => { setCurrentView('bookings'); setSidebarOpen(false); }}>
              <span className="text-xl">📅</span> יומן אולפן
            </NavButton>
          </nav>

          <div className="p-4 border-t bg-slate-50">
            {/* Sync Button */}
            <button 
              onClick={() => syncToCloud()}
              disabled={isSyncing || !SHEET_API_URL}
              className={`w-full mb-4 py-3 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all ${isSyncing ? 'bg-slate-200 text-slate-400' : 'bg-white border border-blue-100 text-blue-600 hover:bg-blue-50 shadow-sm'}`}
            >
              <span className={isSyncing ? 'animate-spin' : ''}>{isSyncing ? '🔄' : '☁️'}</span>
              {isSyncing ? 'מסנכרן...' : 'סנכרן ל-Sheets'}
            </button>

            <div className="flex items-center gap-3 p-3 bg-white rounded-2xl shadow-sm">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold relative">
                {currentUser.name.charAt(0)}
                <div className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${lastSynced ? 'bg-green-500' : 'bg-slate-300'}`}></div>
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="font-bold text-sm truncate">{currentUser.name}</p>
                <p className="text-[10px] text-slate-500 uppercase font-black tracking-widest leading-none">
                  {lastSynced ? `סונכרן: ${lastSynced.toLocaleTimeString('he-IL', {hour:'2-digit', minute:'2-digit'})}` : 'לא סונכרן'}
                </p>
              </div>
              <button onClick={handleLogout} className="p-2 text-slate-400 hover:text-red-500 transition-colors">
                🚪
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden p-2 bg-slate-100 rounded-xl">
              ☰
            </button>
            <h2 className="text-xl font-extrabold text-slate-800">
              {currentView === 'dashboard' ? 'סקירה כללית' : 
               currentView === 'episodes' ? 'פרקים' : 
               currentView === 'guests' ? 'מרואיינים' : 
               currentView === 'bookings' ? 'שריון אולפן' : ''}
            </h2>
          </div>

          <div className="flex items-center gap-4">
             {!SHEET_API_URL && (
               <div className="hidden md:flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-xl border border-amber-100 text-xs font-bold">
                 ⚠️ חסר לינק ל-Apps Script
               </div>
             )}
             <button className="relative w-12 h-12 flex items-center justify-center bg-slate-100 rounded-2xl hover:bg-slate-200 transition-colors">
               <span className="text-xl">🔔</span>
               {unreadCount > 0 && (
                 <span className="absolute -top-1 -left-1 bg-red-500 text-white text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-white font-bold">
                   {unreadCount}
                 </span>
               )}
             </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto custom-scrollbar p-8">
          {selectedEpisodeId ? (
            <EpisodeDetail 
              episodeId={selectedEpisodeId} 
              episodes={episodes}
              guests={guests}
              tasks={tasks}
              setEpisodes={setEpisodes}
              setTasks={setTasks}
              onBack={() => setSelectedEpisodeId(null)}
              addToast={addToast}
              currentUser={currentUser}
            />
          ) : (
            <>
              {currentView === 'dashboard' && (
                <Dashboard 
                  episodes={episodes} 
                  bookings={bookings} 
                  tasks={tasks}
                  guests={guests}
                  currentUser={currentUser}
                  onEpisodeClick={(id) => setSelectedEpisodeId(id)}
                  addToast={addToast}
                />
              )}
              {currentView === 'episodes' && (
                <EpisodeList 
                  episodes={episodes} 
                  setEpisodes={setEpisodes}
                  onEpisodeClick={(id) => setSelectedEpisodeId(id)}
                  currentUser={currentUser}
                  addToast={addToast}
                />
              )}
              {currentView === 'guests' && (
                <GuestList 
                  guests={guests}
                  setGuests={setGuests}
                  currentUser={currentUser}
                  addToast={addToast}
                />
              )}
              {currentView === 'bookings' && (
                <BookingCalendar 
                  bookings={bookings}
                  setBookings={setBookings}
                  currentUser={currentUser}
                  addToast={addToast}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
};

const NavButton: React.FC<{ active: boolean; onClick: () => void; children: React.ReactNode }> = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`w-full text-right px-4 py-4 rounded-2xl font-bold transition-all duration-300 flex items-center gap-3 ${
      active ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 translate-x-1' : 'text-slate-600 hover:bg-slate-100'
    }`}
  >
    {children}
  </button>
);

export default App;
