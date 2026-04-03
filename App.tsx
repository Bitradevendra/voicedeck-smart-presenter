import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Slide, TransitionEffect, AppState, TRANSITIONS, SubtitleState } from './types';
import TransitionRender from './components/TransitionRender';
import { translateSubtitle, suggestWakeupWord } from './services/geminiService';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  MicrophoneIcon, 
  PresentationChartBarIcon, 
  PlusIcon, 
  TrashIcon, 
  SparklesIcon, 
  XMarkIcon,
  LanguageIcon,
  PhotoIcon,
  DocumentArrowUpIcon
} from '@heroicons/react/24/solid';

// Handle ESM import quirks for PDF.js (esm.sh often puts exports on default)
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// Configure PDF.js worker
if (pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://esm.sh/pdfjs-dist@3.11.174/build/pdf.worker.min.js`;
}

// Extend Window interface for Web Speech API
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// ---------------------------------------------------------------------------
// Main Application
// ---------------------------------------------------------------------------

const App: React.FC = () => {
  // --- State ---
  const [slides, setSlides] = useState<Slide[]>([]);
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [currentSlideIndex, setCurrentSlideIndex] = useState<number>(-1); // -1 is Blank/Start
  const [blankWakeupWord, setBlankWakeupWord] = useState("subtitles");
  const [inputLang, setInputLang] = useState("te-IN"); // Default Telugu
  const [status, setStatus] = useState<string>("Idle");
  const [isProcessingPdf, setIsProcessingPdf] = useState(false);
  
  // Subtitles State
  const [subtitle, setSubtitle] = useState<SubtitleState>({ original: '', translated: '', isTranslating: false });

  // Refs for Speech Recognition
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);

  // --- Helpers ---
  
  // Fuzzy match for voice commands
  const isMatch = (spoken: string, target: string) => {
    const cleanSpoken = spoken.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    const cleanTarget = target.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    return cleanSpoken.includes(cleanTarget) || cleanTarget.includes(cleanSpoken);
  };

  const handleSpeechResult = useCallback(async (text: string) => {
    console.log("Heard:", text);
    const lowerText = text.toLowerCase();
    let commandFound = false;

    // 1. Check for Slide Wakeup Words
    for (let i = 0; i < slides.length; i++) {
      if (slides[i].wakeupWord && isMatch(lowerText, slides[i].wakeupWord)) {
        console.log("Trigger slide:", slides[i].name);
        setCurrentSlideIndex(i);
        setSubtitle({ original: '', translated: '', isTranslating: false }); // Clear subs on slide change
        commandFound = true;
        break;
      }
    }

    // 2. Check for Blank/Subtitle Mode Wakeup Word
    if (!commandFound && isMatch(lowerText, blankWakeupWord)) {
      console.log("Trigger blank mode");
      setCurrentSlideIndex(-1);
      commandFound = true;
    }

    // 3. If in Blank Mode (-1), treat everything else as subtitle input
    if (currentSlideIndex === -1 && !commandFound) {
      setSubtitle(prev => ({ ...prev, original: text, isTranslating: true }));
      
      // Call Gemini for Translation with explicit source language
      const translated = await translateSubtitle(text, inputLang);
      setSubtitle({ original: text, translated: translated, isTranslating: false });
    }
  }, [slides, blankWakeupWord, currentSlideIndex, inputLang]);

  // --- Effects ---

  // Initialize Speech Recognition
  useEffect(() => {
    if (!('webkitSpeechRecognition' in window)) {
      alert("Browser not supported. Please use Chrome.");
      return;
    }

    const recognition = new window.webkitSpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false; // We want final results for commands
    recognition.lang = inputLang; 

    recognition.onstart = () => {
      isListeningRef.current = true;
      setStatus("Listening...");
    };

    recognition.onend = () => {
      isListeningRef.current = false;
      setStatus("Stopped");
      // Auto-restart if in presentation mode
      if (isPresentationMode) {
        recognition.start();
      }
    };

    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      handleSpeechResult(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech Error", event.error);
      setStatus("Error: " + event.error);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
    };
  }, [handleSpeechResult, inputLang, isPresentationMode]);

  // Toggle Listening based on Mode
  useEffect(() => {
    if (isPresentationMode) {
      try {
        recognitionRef.current?.start();
      } catch (e) { /* ignore if already started */ }
    } else {
      recognitionRef.current?.stop();
      setCurrentSlideIndex(-1); // Reset to blank on exit
    }
  }, [isPresentationMode]);

  // --- Handlers ---

  const handleAddSlideImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const newSlide: Slide = {
          id: Date.now().toString(),
          imageUrl: reader.result as string,
          wakeupWord: `slide ${slides.length + 1}`,
          transition: TransitionEffect.FADE,
          name: `Slide ${slides.length + 1}`
        };
        setSlides([...slides, newSlide]);
        
        // Auto-suggest specific wakeup word
        suggestWakeupWord(`Slide ${slides.length + 1}`).then(suggestion => {
             setSlides(prev => prev.map(s => s.id === newSlide.id ? { ...s, wakeupWord: suggestion } : s));
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImportPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') {
      alert("Please select a valid PDF file.");
      return;
    }

    setIsProcessingPdf(true);
    setStatus("Importing PDF...");

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument(arrayBuffer);
      const pdf = await loadingTask.promise;
      
      const newSlides: Slide[] = [];
      
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        
        // Render page to canvas
        const viewport = page.getViewport({ scale: 1.5 });
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
          await page.render({ canvasContext: context, viewport: viewport }).promise;
          const imageUrl = canvas.toDataURL('image/jpeg', 0.8);
          
          // Extract text for smart wakeup word
          const textContent = await page.getTextContent();
          const slideText = textContent.items.map((item: any) => item.str).join(' ');
          
          // Get AI suggestion for wakeup word
          const wakeupSuggestion = await suggestWakeupWord(slideText || `Slide ${i}`);

          newSlides.push({
            id: Date.now().toString() + i,
            imageUrl: imageUrl,
            wakeupWord: wakeupSuggestion,
            transition: TransitionEffect.FADE,
            name: `Slide ${i}`
          });
        }
      }

      setSlides(prev => [...prev, ...newSlides]);
      setStatus("Import Complete");
    } catch (error) {
      console.error("PDF Import Error", error);
      alert("Failed to import PDF. Please try again.");
    } finally {
      setIsProcessingPdf(false);
    }
  };

  const updateSlide = (id: string, field: keyof Slide, value: any) => {
    setSlides(slides.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const removeSlide = (id: string) => {
    setSlides(slides.filter(s => s.id !== id));
  };

  // -------------------------------------------------------------------------
  // Render View: PRESENTATION MODE
  // -------------------------------------------------------------------------
  if (isPresentationMode) {
    return (
      <div className="relative w-screen h-screen bg-black overflow-hidden cursor-none">
        
        {/* Controls Overlay (Hover to see) */}
        <div className="absolute top-4 right-4 z-50 opacity-0 hover:opacity-100 transition-opacity duration-300">
           <button 
             onClick={() => setIsPresentationMode(false)}
             className="bg-red-600 text-white px-4 py-2 rounded-full font-bold shadow-lg hover:bg-red-500"
           >
             Exit Presentation
           </button>
        </div>

        {/* Status Indicator */}
        <div className="absolute top-4 left-4 z-50 flex items-center gap-2">
            <div className={`w-3 h-3 rounded-full ${status === 'Listening...' ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            <span className="text-white/50 text-xs font-mono uppercase tracking-widest">{status}</span>
        </div>

        {/* Content Area */}
        <div className="w-full h-full relative">
            
            {/* Blank/Subtitle Screen */}
            {currentSlideIndex === -1 && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 p-20 text-center effect-fade">
                    <h1 className="text-6xl md:text-8xl font-serif text-transparent bg-clip-text bg-gradient-to-r from-brand-500 to-purple-500 mb-12">
                        Smart Presentation
                    </h1>
                    <div className="max-w-4xl w-full space-y-8">
                        {subtitle.original && (
                             <p className="text-2xl text-slate-400 font-light italic">
                                "{subtitle.original}"
                             </p>
                        )}
                        {subtitle.translated && (
                            <p className="text-4xl md:text-5xl text-white font-semibold leading-relaxed animate-pulse-slow">
                                {subtitle.translated}
                            </p>
                        )}
                        {subtitle.isTranslating && (
                            <div className="flex justify-center gap-2 mt-4">
                                <span className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0s'}}></span>
                                <span className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s'}}></span>
                                <span className="w-2 h-2 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s'}}></span>
                            </div>
                        )}
                        {!subtitle.original && (
                            <p className="text-slate-600 mt-20 text-sm">Waiting for voice command...</p>
                        )}
                    </div>
                </div>
            )}

            {/* Slides */}
            {slides.map((slide, index) => (
                <TransitionRender 
                    key={slide.id} 
                    effect={slide.transition} 
                    isActive={index === currentSlideIndex}
                >
                    <img 
                        src={slide.imageUrl} 
                        alt={slide.name} 
                        className="max-w-full max-h-full object-contain shadow-2xl" 
                    />
                     {/* Wakeup Word Hint (Optional, kept hidden for purity or show on hover) */}
                </TransitionRender>
            ))}
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Render View: SETUP DASHBOARD
  // -------------------------------------------------------------------------
  return (
    <div className="min-h-screen bg-slate-950 text-white p-6 md:p-12">
      <header className="max-w-7xl mx-auto mb-12 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-slate-800 pb-8">
        <div>
          <h1 className="text-4xl md:text-6xl font-serif font-bold bg-gradient-to-r from-sky-400 to-indigo-500 bg-clip-text text-transparent">
            VoiceDeck
          </h1>
          <p className="text-slate-400 mt-2 text-lg max-w-2xl">
            The Next-Gen Smart Presenter. Upload slides, assign wakeup words, and present with real-time AI translation.
          </p>
        </div>
        <button
          onClick={() => {
            if (slides.length === 0) return alert("Please upload at least one slide.");
            setIsPresentationMode(true);
          }}
          disabled={isProcessingPdf}
          className="group flex items-center gap-3 bg-brand-600 hover:bg-brand-500 text-white px-8 py-4 rounded-2xl transition-all shadow-[0_0_20px_rgba(14,165,233,0.3)] hover:shadow-[0_0_40px_rgba(14,165,233,0.5)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <PresentationChartBarIcon className="w-6 h-6 group-hover:scale-110 transition-transform" />
          <span className="text-xl font-semibold">{isProcessingPdf ? 'Processing...' : 'Start Presentation'}</span>
        </button>
      </header>

      <main className="max-w-7xl mx-auto space-y-12">
        
        {/* Global Configuration */}
        <section className="bg-slate-900/50 rounded-3xl p-8 border border-slate-800 backdrop-blur-sm">
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <SparklesIcon className="w-6 h-6 text-yellow-400" /> 
            Smart Configuration
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            
            {/* Blank Screen Settings */}
            <div className="space-y-4">
               <label className="block text-sm font-medium text-slate-400">Blank Slide Wakeup Word</label>
               <div className="relative">
                 <input 
                    type="text" 
                    value={blankWakeupWord}
                    onChange={(e) => setBlankWakeupWord(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-brand-500 focus:outline-none pl-12"
                 />
                 <MicrophoneIcon className="w-5 h-5 text-slate-500 absolute left-4 top-3.5" />
               </div>
               <p className="text-xs text-slate-500">Saying this phrase will show the subtitle screen.</p>
            </div>

            {/* Language Settings */}
            <div className="space-y-4">
              <label className="block text-sm font-medium text-slate-400">Speaker Source Language (for Subtitles)</label>
              <div className="relative">
                <select
                  value={inputLang}
                  onChange={(e) => setInputLang(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-brand-500 focus:outline-none pl-12 appearance-none"
                >
                  <option value="te-IN">Telugu (తెలుగు)</option>
                  <option value="hi-IN">Hindi (हिंदी)</option>
                  <option value="ta-IN">Tamil (தமிழ்)</option>
                  <option value="en-US">English (US)</option>
                  <option value="es-ES">Spanish (Español)</option>
                  <option value="fr-FR">French (Français)</option>
                  <option value="de-DE">German (Deutsch)</option>
                  <option value="ja-JP">Japanese (日本語)</option>
                </select>
                <LanguageIcon className="w-5 h-5 text-slate-500 absolute left-4 top-3.5" />
              </div>
              <p className="text-xs text-slate-500">
                Select the language you will speak. It will be translated to English.
              </p>
            </div>

          </div>
        </section>

        {/* Slides Grid */}
        <section>
          <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
            <h2 className="text-2xl font-bold">Your Slides</h2>
            <div className="flex gap-4">
                {/* PDF Import Button */}
                <div className="relative overflow-hidden group">
                    <input 
                        type="file" 
                        accept=".pdf" 
                        onChange={handleImportPdf} 
                        className="absolute inset-0 opacity-0 cursor-pointer w-full"
                        disabled={isProcessingPdf}
                    />
                    <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl transition-colors shadow-lg disabled:opacity-50">
                        {isProcessingPdf ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        ) : (
                            <DocumentArrowUpIcon className="w-5 h-5" />
                        )}
                        {isProcessingPdf ? 'Processing PDF...' : 'Import Presentation (PDF)'}
                    </button>
                </div>

                {/* Single Image Upload */}
                <div className="relative overflow-hidden group">
                    <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleAddSlideImage} 
                        className="absolute inset-0 opacity-0 cursor-pointer w-full"
                    />
                    <button className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-xl transition-colors border border-slate-700">
                        <PlusIcon className="w-5 h-5" />
                        Add Image
                    </button>
                </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {slides.length === 0 && (
                <div className="col-span-full py-20 border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-600">
                    <PhotoIcon className="w-16 h-16 mb-4 opacity-50" />
                    <p className="text-xl font-medium">No slides yet.</p>
                    <p className="text-sm mt-2">Import a PDF or upload images to begin.</p>
                    <p className="text-xs mt-1 text-slate-500 italic">(Save your PowerPoint as PDF for best results)</p>
                </div>
            )}

            {slides.map((slide, idx) => (
              <div key={slide.id} className="bg-slate-900 rounded-3xl overflow-hidden border border-slate-800 shadow-xl hover:shadow-2xl transition-all hover:border-brand-500/30 group">
                <div className="relative h-48 bg-slate-950">
                  <img src={slide.imageUrl} alt={slide.name} className="w-full h-full object-contain" />
                  <div className="absolute top-2 left-2 bg-black/60 px-2 py-1 rounded-lg text-xs font-mono">
                    #{idx + 1}
                  </div>
                  <button 
                    onClick={() => removeSlide(slide.id)}
                    className="absolute top-2 right-2 p-2 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  <div>
                    <label className="text-xs font-semibold text-brand-500 uppercase tracking-wider mb-1.5 block">Slide Name</label>
                    <input
                      type="text"
                      value={slide.name}
                      onChange={(e) => updateSlide(slide.id, 'name', e.target.value)}
                      className="w-full bg-transparent border-b border-slate-700 focus:border-brand-500 focus:outline-none py-1 text-sm transition-colors"
                      placeholder="Slide Name"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-brand-500 uppercase tracking-wider mb-1.5 block flex justify-between">
                        <span>Wakeup Word</span>
                        <span className="text-[10px] normal-case text-slate-500 flex items-center gap-1">
                             <MicrophoneIcon className="w-3 h-3" /> Auto-suggested from content
                        </span>
                    </label>
                    <input
                      type="text"
                      value={slide.wakeupWord}
                      onChange={(e) => updateSlide(slide.id, 'wakeupWord', e.target.value)}
                      className="w-full bg-slate-800/50 rounded-lg px-3 py-2 text-sm border border-slate-700 focus:border-brand-500 focus:outline-none"
                      placeholder="e.g. 'financials'"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-brand-500 uppercase tracking-wider mb-1.5 block">Transition Effect</label>
                    <select
                      value={slide.transition}
                      onChange={(e) => updateSlide(slide.id, 'transition', e.target.value)}
                      className="w-full bg-slate-800/50 rounded-lg px-3 py-2 text-sm border border-slate-700 focus:border-brand-500 focus:outline-none text-slate-300"
                    >
                      {TRANSITIONS.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};

export default App;