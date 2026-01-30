
import React from 'react';

export const STATUS_LABELS: Record<string, string> = {
  idea: '💡 רעיון',
  planned: '📋 מתוכנן',
  needs_assets: '📎 חסרים נכסים',
  booked: '📅 משוריין',
  recorded: '🎙️ הוקלט',
  editing: '✏️ בעריכה',
  for_approval: '👁️ לאישור',
  ready: '✅ מוכן',
  scheduled: '⏰ מתוזמן',
  published: '🎉 פורסם'
};

export const GUEST_STATUS_LABELS: Record<string, string> = {
  idea: '💡 רעיון',
  contacted: '📧 פנייה',
  confirmed: '✓ אישר',
  scheduled: '📅 תואם',
  recorded: '🎙️ הוקלט'
};

export const EPISODE_REQUIREMENTS = {
  ready: [
    { id: 'has_guest', label: 'יש מרואיין משויך' },
    { id: 'has_description', label: 'יש תיאור מלא' },
    { id: 'has_recording', label: 'הפרק הוקלט' }
  ],
  published: [
    { id: 'is_ready', label: 'סטטוס "מוכן"' },
    { id: 'has_image', label: 'הועלתה תמונת קאבר' },
    { id: 'has_show_notes', label: 'הוכנו תקציר והערות פרק' }
  ]
};

export const COLORS = {
  primary: '#3b82f6',
  secondary: '#8b5cf6',
  accent: '#06b6d4',
  success: '#22c55e',
  danger: '#ef4444',
  warning: '#f59e0b'
};
