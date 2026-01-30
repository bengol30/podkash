
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

export const geminiService = {
  async generateShowNotes(episodeTitle: string, guestName: string, description: string) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `אני מנהל פודקאסט. כתוב לי תקציר מקצועי ושיווקי (Show Notes) לפרק בשם "${episodeTitle}" עם המרואיין "${guestName}". 
        תיאור ראשוני של הפרק: ${description}.
        כלול:
        1. תקציר מושך ב-2-3 משפטים.
        2. 5 נקודות מפתח שידונו בפרק.
        3. קריאה לפעולה (CTA).
        השתמש בעברית רהוטה ומקצועית.`,
      });
      return response.text;
    } catch (error) {
      console.error("Gemini Error:", error);
      return "שגיאה ביצירת תקציר. אנא נסה שוב מאוחר יותר.";
    }
  },

  async suggestTitles(topic: string) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `הצע 5 כותרות קליטות ומסקרנות לפודקאסט בנושא: ${topic}. הכותרות צריכות להיות בעברית מודרנית ומושכת.`,
      });
      return response.text;
    } catch (error) {
      console.error("Gemini Error:", error);
      return null;
    }
  }
};
