
import React, { useState } from 'react';
import { User, UserRole } from '../types';

interface LoginFormProps {
  onLogin: (user: User) => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real app, this would be a real API call.
    // For this demo, we mock a successful login based on any email.
    const mockUser: User = {
      id: 'user-' + Math.random().toString(36).substr(2, 5),
      name: email.split('@')[0],
      email: email,
      role: (email.includes('admin') ? 'admin' : email.includes('prod') ? 'producer' : 'host') as UserRole
    };
    onLogin(mockUser);
  };

  return (
    <div className="h-screen w-full bg-gradient-to-br from-blue-600 to-indigo-800 flex items-center justify-center p-6 font-['Assistant']" dir="rtl">
      <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl p-12 animate-in zoom-in-95 duration-500">
        <div className="text-center mb-12">
          <h1 className="text-5xl font-black text-blue-600 mb-4 tracking-tighter">PodCash</h1>
          <p className="text-slate-400 font-bold text-lg">ניהול פודקאסטים בעידן ה-AI</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-black text-slate-700 mb-2 mr-2">אימייל</label>
              <input 
                type="email" 
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full px-8 py-5 rounded-3xl bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all font-bold text-lg shadow-inner"
                placeholder="your@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-black text-slate-700 mb-2 mr-2">סיסמה</label>
              <input 
                type="password" 
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full px-8 py-5 rounded-3xl bg-slate-50 border-2 border-transparent focus:border-blue-500 focus:bg-white outline-none transition-all font-bold text-lg shadow-inner"
                placeholder="••••••••"
                required
              />
            </div>
          </div>

          <button 
            type="submit" 
            className="w-full py-6 bg-blue-600 text-white rounded-[28px] text-xl font-black shadow-2xl shadow-blue-200 hover:scale-[1.02] hover:bg-blue-700 active:scale-95 transition-all"
          >
            התחבר למערכת
          </button>
        </form>

        <div className="mt-12 text-center">
          <p className="text-slate-400 font-bold text-sm">אין לך חשבון? <span className="text-blue-600 hover:underline cursor-pointer">צור קשר עם מנהל המערכת</span></p>
        </div>
      </div>
    </div>
  );
};

export default LoginForm;
