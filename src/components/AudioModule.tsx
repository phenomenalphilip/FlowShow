import { useEffect, useState, useRef } from "react";
import { Mic, MicOff, BookOpen, Activity, AlertCircle, Sparkles, Check, ChevronRight, Settings, X, Send } from "lucide-react";
import { parseBibleReference, normalizeTranscript } from "../lib/parser";
import { detectVerseFromContext } from "../lib/ai";
import { FreeshowConfig, defaultFreeshowConfig, sendToFreeshow } from "../lib/freeshow";

interface AudioModuleProps {
  onVerseDetected: (reference: any) => void;
}

export function AudioModule({ onVerseDetected }: AudioModuleProps) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [lastDetected, setLastDetected] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  
  // FreeShow settings
  const [config, setConfig] = useState<FreeshowConfig>(defaultFreeshowConfig);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [integrationStatus, setIntegrationStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');

  // Load config from local storage
  useEffect(() => {
    const saved = localStorage.getItem('freeshow_config');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
          if (parsed.url === 'http://localhost:5506' || parsed.url === 'http://127.0.0.1:8080/api/action') {
             saveConfig(defaultFreeshowConfig);
          } else {
             setConfig(parsed);
          }
      } catch (e) {
        console.error("Failed to parse saved config");
      }
    }
  }, []);

  // Save config to local storage
  const saveConfig = (newConfig: FreeshowConfig) => {
    setConfig(newConfig);
    localStorage.setItem('freeshow_config', JSON.stringify(newConfig));
  };
  
  // We use a ref to store the recognition instance so we can stop it
  const recognitionRef = useRef<any>(null);
  const lastResolvedMatchIndexRef = useRef<number>(0);
  const transcriptRef = useRef(transcript);
  const latestDetectedJSONRef = useRef<string | null>(null);
  const accumulatedTranscriptRef = useRef<string>("");
  const shouldBeListeningRef = useRef<boolean>(false);

  // Keep transcriptRef up to date across renders for setInterval
  useEffect(() => {
    transcriptRef.current = transcript;
  }, [transcript]);

  // Hook to send to FreeShow when lastDetected changes
  useEffect(() => {
    if (lastDetected && config.enabled) {
      setIntegrationStatus('sending');
      sendToFreeshow(config, lastDetected.reference)
        .then(() => setIntegrationStatus('success'))
        .catch(() => setIntegrationStatus('error'));
    }
  }, [lastDetected, config]);

  useEffect(() => {
    // Stage 3 Contextual Buffering & AI trigger
    if (!isListening) return;
    
    let isFetching = false;
    
    const interval = setInterval(async () => {
      if (isFetching) return;
      
      const currentTranscript = transcriptRef.current;
      if (!currentTranscript) return;

      const startIndex = lastResolvedMatchIndexRef.current || 0;
      const unprocessedTranscript = currentTranscript.substring(startIndex);
      
      const words = unprocessedTranscript.split(/\s+/).filter(Boolean);
      const recentWords = words.slice(-30).join(" ");
      
      if (recentWords.length > 20) {
        const aiCheckPoint = currentTranscript.length;
        
        isFetching = true;
        setIsAiProcessing(true);
        
        try {
          const aiResult = await detectVerseFromContext(recentWords);
          
          if (aiResult) {
            if (lastResolvedMatchIndexRef.current > aiCheckPoint) {
              return;
            }

            if (aiResult.confidence && aiResult.confidence >= 75) {
              const stringified = JSON.stringify(aiResult.reference);
              if (stringified !== latestDetectedJSONRef.current) {
                latestDetectedJSONRef.current = stringified;
                setLastDetected(aiResult);
                onVerseDetected(aiResult.reference);
                lastResolvedMatchIndexRef.current = Math.max(lastResolvedMatchIndexRef.current, aiCheckPoint);
              }
            } else {
              setSuggestions((prev) => {
                const exists = prev.some(
                  (s) => JSON.stringify(s.reference) === JSON.stringify(aiResult.reference)
                );
                if (exists) return prev;
                return [aiResult, ...prev].slice(0, 5);
              });
            }
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsAiProcessing(false);
          isFetching = false;
        }
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [isListening, onVerseDetected]);

  useEffect(() => {
    // Setup SpeechRecognition
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setErrorMsg("Speech Recognition not supported in this browser. Try Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      setIsListening(true);
      setErrorMsg(null);
    };
    recognition.onend = () => {
      if (shouldBeListeningRef.current) {
        accumulatedTranscriptRef.current = transcriptRef.current;
        try {
          recognition.start();
        } catch (e) {
          console.error("Auto-restart error", e);
          setIsListening(false);
          shouldBeListeningRef.current = false;
        }
      } else {
        setIsListening(false);
      }
    };
    
    recognition.onerror = (event: any) => {
      if (event.error === 'no-speech') {
        // Ignore no-speech error, onend will restart it if needed
        return;
      }
      console.error("Speech recognition error", event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        shouldBeListeningRef.current = false;
        setIsListening(false);
        setErrorMsg(`Browser blocked microphone. Please ensure permissions are granted in your browser settings, then refresh.`);
      }
    };
    
    recognition.onresult = (event: any) => {
      let sessionTranscript = "";
      for (let i = 0; i < event.results.length; i++) {
        sessionTranscript += event.results[i][0].transcript;
      }
      
      const fullTranscript = accumulatedTranscriptRef.current + " " + sessionTranscript;
      setTranscript(fullTranscript);
      
      const detectedVerse = parseBibleReference(fullTranscript);
      if (detectedVerse) {
        const stringified = JSON.stringify(detectedVerse.reference);
        if (stringified !== latestDetectedJSONRef.current) {
           latestDetectedJSONRef.current = stringified;
           setLastDetected(detectedVerse);
           onVerseDetected(detectedVerse.reference);
           lastResolvedMatchIndexRef.current = fullTranscript.length;
        }
      }
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.stop();
    };
  }, [onVerseDetected]);

  const toggleListening = async () => {
    if (isListening) {
      shouldBeListeningRef.current = false;
      recognitionRef.current?.stop();
    } else {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
        }

        shouldBeListeningRef.current = true;
        accumulatedTranscriptRef.current = "";
        setErrorMsg(null);
        setTranscript("");
        setLastDetected(null);
        setSuggestions([]);
        lastResolvedMatchIndexRef.current = 0;
        
        recognitionRef.current?.start();
      } catch (err: any) {
        console.error("Microphone error:", err);
        setErrorMsg(`Microphone access blocked. Please allow microphone access.`);
      }
    }
  };

  const clearAndRestart = () => {
    accumulatedTranscriptRef.current = "";
    transcriptRef.current = "";
    setTranscript("");
    setLastDetected(null);
    setSuggestions([]);
    lastResolvedMatchIndexRef.current = 0;
    if (isListening) {
      // It will automatically restart due to the onend handler
      recognitionRef.current?.stop();
    }
  };

  const handleSelectSuggestion = (suggestion: any) => {
    const stringified = JSON.stringify(suggestion.reference);
    if (stringified !== latestDetectedJSONRef.current) {
      latestDetectedJSONRef.current = stringified;
      setLastDetected(suggestion);
      onVerseDetected(suggestion.reference);
    }
  };

  return (
    <div className="h-full flex flex-col items-center bg-[#141414] text-neutral-300">
      <div className="w-full max-w-3xl pb-20">
        
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight mb-1 text-white">Live Audio Transcriber</h1>
            <p className="text-neutral-500 text-sm">
              Speak naturally. Matches push directly to the live output screen.
            </p>
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 border border-neutral-700 bg-neutral-800 rounded-full text-neutral-400 hover:text-white hover:bg-neutral-700 transition-all"
            title="Integration Settings"
          >
            <Settings size={18} />
          </button>
        </header>

        <div className="bg-[#1a1a1a] rounded-2xl border border-neutral-800 p-6 mb-6 shadow-xl">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-3">
              <div className={`p-3 rounded-full ${isListening ? 'bg-red-500/10 text-red-500 animate-pulse' : 'bg-neutral-800 text-neutral-500'}`}>
                {isListening ? <Activity size={24} /> : <MicOff size={24} />}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">{isListening ? "Listening..." : "Microphone Off"}</h2>
                <div className="flex items-center space-x-2 text-sm text-neutral-500">
                  <p>Try: "Let's open to John chapter 3 verse 16"</p>
                  {isAiProcessing && (
                    <span className="flex items-center space-x-1 text-purple-400 animate-pulse">
                      <Sparkles size={14} />
                      <span>AI Thinking...</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-2">
              <button
                onClick={clearAndRestart}
                className="px-4 py-2 rounded-full font-medium transition-all bg-[#252525] border border-neutral-700 hover:bg-neutral-800 text-neutral-300"
              >
                Clear
              </button>
              <button
                onClick={toggleListening}
                className={`px-6 py-2 rounded-full font-medium transition-all ${
                  isListening 
                    ? "bg-red-600/20 text-red-500 hover:bg-red-600/30 border border-red-500/30" 
                    : "bg-blue-600 hover:bg-blue-500 text-white"
                }`}
              >
                {isListening ? "Stop listening" : "Start listening"}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 bg-red-900/20 border border-red-900/50 rounded-xl flex items-start space-x-3 text-red-400">
              <AlertCircle size={20} className="mt-0.5 shrink-0" />
              <div>
                <h3 className="font-semibold text-sm">Microphone Issue</h3>
                <p className="text-sm opacity-90">{errorMsg}</p>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div className="bg-[#141414] rounded-xl p-4 border border-neutral-800">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Live Transcript</span>
              </div>
              <p className="text-lg min-h-[4rem] text-neutral-200 font-medium leading-relaxed">
                {transcript || (
                  <span className="text-neutral-600 italic">Words will appear here...</span>
                )}
              </p>
            </div>

            {/* Extracted Data Box */}
            <div className={`rounded-xl p-4 border transition-colors ${
              lastDetected 
                ? (lastDetected.debug?.confidence?.includes("AI") ? "bg-purple-900/10 border-purple-800/50" : "bg-blue-900/10 border-blue-800/50")
                : "bg-[#141414] border-neutral-800"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  {lastDetected?.debug?.confidence?.includes("AI") ? (
                     <Sparkles size={16} className="text-purple-400" />
                  ) : (
                     <BookOpen size={16} className={lastDetected ? "text-blue-400" : "text-neutral-600"} />
                  )}
                  <span className={`text-xs font-semibold uppercase tracking-wider ${
                    lastDetected 
                      ? (lastDetected.debug?.confidence?.includes("AI") ? "text-purple-400" : "text-blue-400") 
                      : "text-neutral-500"
                  }`}>
                    Currently Pushed To Screen
                  </span>
                </div>
              </div>
              
              {lastDetected ? (
                <div className="space-y-3">
                  <div className="flex items-baseline space-x-2">
                    <span className={`text-2xl font-bold ${lastDetected.debug?.confidence?.includes("AI") ? "text-purple-300" : "text-blue-300"}`}>
                      {lastDetected.reference.book} {lastDetected.reference.chapters[0]}:{lastDetected.reference.verses?.[0]?.[0]}
                    </span>
                  </div>
                  <pre className="bg-black/50 p-3 rounded-lg text-sm text-neutral-400 font-mono overflow-x-auto border border-neutral-800/50">
                    {JSON.stringify(lastDetected.reference, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="text-sm text-neutral-600 py-2">
                  Waiting to detect a Bible reference...
                </p>
              )}
            </div>

            {/* AI Suggestions Box */}
            {suggestions.length > 0 && (
              <div className="rounded-xl p-4 border transition-colors bg-purple-900/10 border-purple-800/50">
                <div className="flex items-center space-x-2 mb-3">
                  <Sparkles size={16} className="text-purple-400" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                    AI Suggestions (Click to Push)
                  </span>
                </div>
                <div className="space-y-2">
                  {suggestions.map((suggestion, index) => {
                    const isSelected = 
                      lastDetected && 
                      JSON.stringify(lastDetected.reference) === JSON.stringify(suggestion.reference);

                    return (
                      <button
                        key={index}
                        onClick={() => handleSelectSuggestion(suggestion)}
                        className={`w-full text-left flex items-center justify-between p-3 rounded-lg border transition-all ${
                          isSelected
                            ? "bg-purple-600 border-transparent text-white shadow-md"
                            : "bg-[#141414] border-purple-900/30 hover:border-purple-500/50 text-neutral-300 hover:bg-[#1a1a1a]"
                        }`}
                      >
                        <div>
                          <p className={`font-semibold ${isSelected ? "text-white" : "text-purple-300"}`}>
                            {suggestion.reference.book} {suggestion.reference.chapters[0]}:{suggestion.reference.verses[0]?.[0]}
                          </p>
                          <p className={`text-xs mt-0.5 ${isSelected ? "text-purple-200" : "text-neutral-500"} line-clamp-1`}>
                            {suggestion.confidence ? `${suggestion.confidence}% match. ` : ''}From: "{suggestion.debug.originalMatch}"
                          </p>
                        </div>
                        {isSelected ? (
                          <div className="flex-shrink-0 ml-2 flex items-center justify-center bg-white/20 rounded-full w-6 h-6">
                            <Check size={14} className="text-white" />
                          </div>
                        ) : (
                          <ChevronRight size={18} className="text-purple-500 flex-shrink-0 ml-2" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

       {/* Settings Modal - Kept in tact but styled darker */}
       {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex flex-col">
          <div 
            className="absolute inset-0 bg-black/60 backdrop-blur-sm cursor-pointer" 
            onClick={() => setIsSettingsOpen(false)}
          ></div>
          
          <div className="flex-1 overflow-y-auto p-0 sm:p-6 flex flex-col justify-end sm:justify-center items-center relative z-10 pointer-events-none">
            <div 
              className="bg-[#1a1a1a] sm:rounded-2xl shadow-2xl w-full max-w-lg flex flex-col border-t sm:border border-neutral-700 animate-in slide-in-from-bottom duration-200 max-h-[90vh] pointer-events-auto rounded-t-2xl text-neutral-300"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between bg-[#141414] rounded-t-2xl">
                <h2 className="text-lg font-semibold flex items-center text-white">
                  <Settings size={18} className="mr-2 text-blue-500" />
                  Integration Settings
                </h2>
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-2 text-neutral-500 hover:text-white hover:bg-neutral-800 rounded-full"
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="p-5 space-y-6 overflow-y-auto">
                <div className="flex items-center justify-between p-4 border border-neutral-800 rounded-xl bg-[#252525]">
                  <div>
                    <h3 className="font-semibold text-white">Enable Webhook</h3>
                    <p className="text-sm text-neutral-400 mt-1">Send requests to an external software</p>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input 
                      type="checkbox" 
                      className="sr-only peer"
                      checked={config.enabled}
                      onChange={(e) => saveConfig({...config, enabled: e.target.checked})}
                    />
                    <div className="w-11 h-6 bg-neutral-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                  </label>
                </div>

                <div className={config.enabled ? "opacity-100 space-y-4" : "opacity-50 pointer-events-none space-y-4"}>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-1">URL</label>
                    <input 
                      type="text" 
                      value={config.url}
                      onChange={(e) => saveConfig({...config, url: e.target.value})}
                      className="w-full px-3 py-2 bg-[#141414] border border-neutral-700 rounded-lg focus:outline-none focus:border-blue-500 font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              <div className="px-5 py-4 bg-[#141414] border-t border-neutral-800 flex justify-end">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-500 font-medium"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
