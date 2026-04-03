import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// Translation cache to avoid repetitive calls for same phrases
const translationCache = new Map<string, string>();

/**
 * Translates text from a specified source language to English.
 * Optimized for subtitle presentation.
 */
export const translateSubtitle = async (text: string, sourceLang: string): Promise<string> => {
  if (!ai || !text.trim()) return "";
  
  const cacheKey = `${sourceLang}:${text.trim().toLowerCase()}`;
  if (translationCache.has(cacheKey)) {
    return translationCache.get(cacheKey)!;
  }

  // Map common codes to readable names for better AI context
  const langMap: Record<string, string> = {
    'te-IN': 'Telugu',
    'hi-IN': 'Hindi',
    'en-US': 'English',
    'es-ES': 'Spanish',
    'fr-FR': 'French',
    'de-DE': 'German',
    'ja-JP': 'Japanese',
    'ta-IN': 'Tamil'
  };

  const languageName = langMap[sourceLang] || sourceLang;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: `You are a professional real-time translator for a presentation.
      Task: Translate the following ${languageName} text into clear, concise English suitable for subtitles.
      Input Text: "${text}"
      
      Rules:
      1. If the input is already English, correct any grammar but keep it essentially the same.
      2. Keep it brief and easy to read.
      3. Return ONLY the translation, no explanations.`,
    });

    const translatedText = response.text?.trim() || "";
    if (translatedText) {
      translationCache.set(cacheKey, translatedText);
    }
    return translatedText;
  } catch (error) {
    console.error("Gemini Translation Error:", error);
    return ""; 
  }
};

/**
 * Generates a smart wakeup word suggestion based on slide text content.
 */
export const suggestWakeupWord = async (slideContent: string): Promise<string> => {
    if (!ai) return "next slide";
    
    // Truncate content to avoid token limits if PDF extraction is huge
    const context = slideContent.slice(0, 1000);

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: `Analyze the following text from a presentation slide and suggest a unique, memorable, and short (1-3 words) voice command (wakeup word) to trigger this slide.
            
            Slide Context: "${context}"
            
            Rules:
            - Prefer nouns or key themes (e.g., "financials", "strategy", "timeline").
            - Avoid generic words like "slide" or "page" unless necessary.
            - Return ONLY the wakeup phrase in lowercase, no punctuation.`,
        });
        return response.text?.trim() || "next slide";
    } catch (e) {
        return "next slide";
    }
}