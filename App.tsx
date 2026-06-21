import React, { useState, useEffect, useRef } from 'react';
import { 
  BookOpen, Sparkles, Rocket, Trophy, Play, CheckCircle, 
  ChevronRight, Volume2, VolumeX, Shield, ArrowLeft, Plus, 
  Trash2, Eye, Award, Clock, GraduationCap, Monitor, FileText,
  User, ShieldCheck, HelpCircle, Laptop, Lightbulb, Users,
  ListRestart, Check, X, SignalLow, SignalMedium, SignalHigh,
  Settings, LogOut, Info, RefreshCw, Mic, MicOff, Download, Printer
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  QuestionType, StudyFocus, TestRecord, StudyMaterial,
  UserProfile, QuizQuestion, QuizSession, DifficultyLevel,
  Group, ClassroomSession, AppScreen
} from './types';
import { Button } from './components/Button';
import { db, auth, loginWithGoogle, loginAnonymously, logout, handleFirestoreError, OperationType } from './firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { generateQuizQuestions, speakTextLocal } from './services/geminiService';
import * as pdfjsLib from 'pdfjs-dist';
import { get as get_idb, set as set_idb } from 'idb-keyval';

// Configure pdfjs worker source via jsDelivr CDN
const pdfjsVersion = pdfjsLib.version || '5.6.205';
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.mjs`;

// --- Browser-Native Audio Feedback Synthesizer ---
let audioCtx: AudioContext | null = null;

const playAudioFeedback = (isCorrect: boolean) => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    } else if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const now = audioCtx.currentTime;

    if (isCorrect) {
      // Pleasant rising bright two-tone chime (Interval of major third / perfect fifth)
      // Note A: C5 (523.25 Hz)
      const osc1 = audioCtx.createOscillator();
      const gain1 = audioCtx.createGain();
      
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(523.25, now);
      osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.08); // slide cleanly up to E5
      
      gain1.gain.setValueAtTime(0.001, now);
      gain1.gain.linearRampToValueAtTime(0.12, now + 0.02);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      
      osc1.connect(gain1);
      gain1.connect(audioCtx.destination);
      
      osc1.start(now);
      osc1.stop(now + 0.25);

      // Note B: E5 (659.25 Hz) -> A5 (880.00 Hz)
      const osc2 = audioCtx.createOscillator();
      const gain2 = audioCtx.createGain();
      
      const delay = 0.08;
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(659.25, now + delay);
      osc2.frequency.exponentialRampToValueAtTime(880.00, now + delay + 0.12);
      
      gain2.gain.setValueAtTime(0.001, now + delay);
      gain2.gain.linearRampToValueAtTime(0.15, now + delay + 0.02);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.35);
      
      osc2.connect(gain2);
      gain2.connect(audioCtx.destination);
      
      osc2.start(now + delay);
      osc2.stop(now + delay + 0.35);
    } else {
      // Soft low-passed descending buzz tone (Triangle wave filters out harsh harmonics, pleasant design)
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const filter = audioCtx.createBiquadFilter();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150.00, now);
      osc.frequency.linearRampToValueAtTime(110.00, now + 0.3);
      
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(600, now);
      
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start(now);
      osc.stop(now + 0.3);
    }
  } catch (error) {
    console.warn("Native audio synthesizer blocked or unsupported:", error);
  }
};

// --- Sub-Component: MotivationalPopup ---
interface MotivationalPopupProps {
  show: boolean;
  label?: string;
  onClose: () => void;
}
const MotivationalPopup: React.FC<MotivationalPopupProps> = ({ show, label = "Spectacular!", onClose }) => {
  useEffect(() => {
    if (show) {
      const timer = setTimeout(onClose, 2500);
      return () => clearTimeout(timer);
    }
  }, [show, onClose]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.8, y: 50 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: -50 }}
          className="fixed bottom-10 left-1/2 -translate-x-1/2 z-50 bg-secondary text-on-secondary px-8 py-4 rounded-[2rem] shadow-2xl flex items-center gap-3 font-headline font-extrabold text-sm uppercase italic tracking-widest neon-glow-secondary"
        >
          <Sparkles className="w-5 h-5 text-white animate-spin" />
          <span>{label}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// --- Sub-Component: MaterialManager ---
interface MaterialManagerProps {
  isOpen: boolean;
  onClose: () => void;
  materials: StudyMaterial[];
  onAdd: (title: string, content: string) => void;
  onDelete: (id: string) => void;
  onSelect: (id: string | null) => void;
  selectedId: string | null;
}
const MaterialManager: React.FC<MaterialManagerProps> = ({
  isOpen, onClose, materials, onAdd, onDelete, onSelect, selectedId
}) => {
  const [activeTab, setActiveTab] = useState<'text' | 'pdf'>('text');

  // Manual text tab state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  // PDF Book tab state
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfProgress, setPdfProgress] = useState({ current: 0, total: 0 });
  const [dragActive, setDragActive] = useState(false);

  const [error, setError] = useState('');
  const pdfInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError('Please fill in both title and contents.');
      return;
    }
    onAdd(title.trim(), content.trim());
    setTitle('');
    setContent('');
    setError('');
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handlePdfFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handlePdfFile(e.target.files[0]);
    }
  };

  const handlePdfFile = async (file: File) => {
    if (!file) return;

    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith('.pdf')) {
      setError("Please select a valid PDF file (.pdf format).");
      return;
    }

    setPdfParsing(true);
    setError("");
    setPdfProgress({ current: 0, total: 0 });

    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;
      setPdfProgress({ current: 0, total: totalPages });

      let fullText = "";

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        setPdfProgress({ current: pageNum, total: totalPages });
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        
        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .join(' ');

        fullText += `--- Page ${pageNum} ---\n` + pageText + '\n\n';
      }

      const trimmedText = fullText.trim();
      if (!trimmedText || trimmedText.length < 15) {
        throw new Error("Could not extract any extractable text from this digital book. Ensure it is not an image-only scan or completely blank.");
      }

      // Format readable title by omitting extension & spacing symbols
      const displayTitle = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[_-]/g, " ")
        .trim();

      onAdd(displayTitle, trimmedText);
      setPdfParsing(false);
      setPdfProgress({ current: 0, total: 0 });
    } catch (err: any) {
      console.error("PDF Parsing exception:", err);
      setError(err?.message || "Failure parsing full book contents. Try another PDF or paste text chapters.");
      setPdfParsing(false);
      setPdfProgress({ current: 0, total: 0 });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface border border-white/10 rounded-[2rem] shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <BookOpen className="w-6 h-6 text-primary" />
            <h3 className="text-xl font-headline font-extrabold text-on-surface tracking-tighter">Study Material Hub</h3>
          </div>
          <button 
            onClick={onClose} 
            disabled={pdfParsing}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-full bg-white/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto no-scrollbar space-y-6 flex-1">
          {error && <p className="text-xs text-error font-body font-bold">{error}</p>}

          {/* Interactive Navigation Tabs switcher */}
          <div className="flex gap-2 p-1.5 bg-white/5 rounded-2xl border border-white/5">
            <button
              onClick={() => { if (!pdfParsing) setActiveTab('text'); }}
              disabled={pdfParsing}
              type="button"
              className={`flex-1 py-2 rounded-xl text-xs font-headline font-extrabold transition-all cursor-pointer ${activeTab === 'text' ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-on-surface opacity-70'} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              Paste Reading Text
            </button>
            <button
              onClick={() => { if (!pdfParsing) setActiveTab('pdf'); }}
              disabled={pdfParsing}
              type="button"
              className={`flex-1 py-2 rounded-xl text-xs font-headline font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${activeTab === 'pdf' ? 'bg-primary text-on-primary shadow-lg' : 'text-on-surface-variant hover:text-on-surface opacity-70'} disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <FileText className="w-3.5 h-3.5" /> Book Uploader (.PDF)
            </button>
          </div>

          {activeTab === 'text' ? (
            <form onSubmit={handleSubmit} className="space-y-4 bg-white/5 p-5 rounded-2xl border border-white/5">
              <p className="text-xs font-headline font-extrabold uppercase text-primary tracking-wider italic">Add Curriculum Text</p>
              <input 
                type="text" 
                placeholder="Material Title (e.g. NCERT Science Chapter 12)" 
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-surface-container border border-white/5 text-sm font-body font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <textarea 
                placeholder="Paste official textbook reading segments, curriculum syllabus points, or study notes here..." 
                value={content}
                rows={4}
                onChange={e => setContent(e.target.value)}
                className="w-full px-4 py-3 rounded-xl bg-surface-container border border-white/5 text-sm font-body font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <Button type="submit" className="py-2.5">Ingest Material</Button>
            </form>
          ) : (
            <div className="space-y-4 bg-white/5 p-5 rounded-2xl border border-white/5">
              <div className="flex justify-between items-center">
                <p className="text-xs font-headline font-extrabold uppercase text-primary tracking-wider italic">Upload Entire Textbook Book</p>
                <span className="text-[10px] font-mono font-bold bg-primary/15 text-primary px-2 py-0.5 rounded-full">Offline Storage Only</span>
              </div>

              {pdfParsing ? (
                <div className="border border-primary/20 bg-primary/5 rounded-2xl p-6 text-center space-y-4">
                  <div className="flex justify-center">
                    <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-sm font-headline font-extrabold text-on-surface">Extracting Full Study Companion</p>
                    <p className="text-xs text-on-surface-variant">Page {pdfProgress.current} of {pdfProgress.total || 'estimating...'}</p>
                  </div>
                  
                  {/* Visual Progress Bar */}
                  <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/5">
                    <div 
                      className="bg-primary h-full rounded-full transition-all duration-150" 
                      style={{ width: `${pdfProgress.total ? (pdfProgress.current / pdfProgress.total) * 100 : 0}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-primary/80 font-mono tracking-widest uppercase">Converting Digital Layout Offline...</p>
                </div>
              ) : (
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => pdfInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${dragActive ? 'border-primary bg-primary/10' : 'border-white/10 hover:border-primary/45 hover:bg-white/5'}`}
                >
                  <input 
                    ref={pdfInputRef}
                    type="file" 
                    accept="application/pdf"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-3">
                    <FileText className="w-10 h-10 text-primary/70" />
                    <div className="space-y-1.5">
                      <p className="text-sm font-headline font-extrabold text-on-surface">Drag &amp; Drop textbook book file here</p>
                      <p className="text-xs text-on-surface-variant">or <span className="text-primary hover:underline font-bold">browse local files (.pdf)</span></p>
                    </div>
                    <p className="text-[10px] uppercase text-on-surface-variant/40 font-mono tracking-wider">IndexedDB client side cache handles entire files safely offline</p>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-3">
            <p className="text-xs font-headline font-extrabold uppercase text-on-surface-variant tracking-wider">Your Source Library ({materials.length})</p>
            {materials.length === 0 ? (
              <p className="text-xs text-on-surface-variant/70 italic text-center py-6">No custom reading materials added yet. The AI Tutor is operating in default Curriculum mode.</p>
            ) : (
              <div className="space-y-2">
                {materials.map(m => (
                  <div key={m.id} className={`flex items-center justify-between p-4 rounded-xl border ${selectedId === m.id ? 'bg-primary/10 border-primary/40' : 'bg-surface-container-lowest border-white/5'} transition-all`}>
                    <button 
                      onClick={() => onSelect(selectedId === m.id ? null : m.id)}
                      disabled={pdfParsing}
                      className="flex-1 text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <p className="text-sm font-headline font-extrabold text-on-surface flex items-center gap-2">
                        {selectedId === m.id && <Check className="w-4 h-4 text-primary" />}
                        {m.title}
                      </p>
                      <p className="text-xs text-on-surface-variant line-clamp-1 mt-0.5">{m.content}</p>
                    </button>
                    <button 
                      onClick={() => onDelete(m.id)}
                      disabled={pdfParsing}
                      className="text-error/70 hover:text-error p-2 hover:bg-white/5 rounded-xl transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

// --- Sub-Component: ClassroomSetupView ---
interface ClassroomSetupViewProps {
  onStart: (groups: Group[], timer: number) => void;
  onCancel: () => void;
  initialTimer?: number;
}
const ClassroomSetupView: React.FC<ClassroomSetupViewProps> = ({ onStart, onCancel, initialTimer = 45 }) => {
  const [groups, setGroups] = useState<Group[]>([
    { id: '1', name: 'Alpha Squad', score: 0, members: [] },
    { id: '2', name: 'Beta Brains', score: 0, members: [] },
    { id: '3', name: 'Gamma Giants', score: 0, members: [] },
    { id: '4', name: 'Delta Dynamos', score: 0, members: [] },
  ]);
  const [timer, setTimer] = useState<number>(initialTimer);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addGroup = () => {
    if (groups.length >= 5) return;
    const newId = Math.max(...groups.map(g => parseInt(g.id) || 0), 0) + 1;
    const idStr = newId.toString();
    setGroups([...groups, { id: idStr, name: `Group ${idStr}`, score: 0, members: [] }]);
  };

  const removeGroup = (id: string) => {
    if (groups.length <= 2) return;
    setGroups(groups.filter(g => g.id !== id));
  };

  const updateGroupName = (id: string, name: string) => {
    setGroups(groups.map(g => g.id === id ? { ...g, name } : g));
  };

  const updateGroupDifficulty = (id: string, difficulty: DifficultyLevel) => {
    setGroups(groups.map(g => g.id === id ? { ...g, difficulty } : g));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const names = text.split(/[\n,]/).map(n => n.trim()).filter(n => n !== "");
      const newGroups: Group[] = names.slice(0, 5).map((name, idx) => ({
        id: (idx + 1).toString(),
        name: name,
        score: 0,
        members: []
      }));
      if (newGroups.length >= 2) {
        setGroups(newGroups);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in pb-10 max-w-4xl mx-auto">
      <div className="bg-surface-container-lowest/80 glass-card p-6 md:p-10 rounded-[2rem] shadow-2xl border border-white/10 space-y-6">
        <div className="flex justify-between items-center">
          <h2 className="text-2xl md:text-4xl font-headline font-extrabold text-on-surface tracking-tighter italic tv-text-shadow">Battle Setup</h2>
          <Button onClick={onCancel} variant="outline" className="rounded-full w-10 h-10 min-h-0 flex items-center justify-center border-white/10 p-0">
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="flex justify-between items-center">
          <h3 className="text-xs md:text-sm font-headline font-extrabold text-on-surface-variant uppercase tracking-widest italic">Group Configuration</h3>
          <div className="flex gap-2.5">
             <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".txt,.csv" className="hidden" />
             <button 
               onClick={() => fileInputRef.current?.click()}
               className="text-[10px] font-headline font-extrabold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors uppercase"
             >
               Load TXT/CSV Lists
             </button>
             <span className="text-xs font-headline font-extrabold text-on-surface bg-surface-container px-3 py-1.5 rounded-lg">{groups.length}/5</span>
          </div>
        </div>

        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.id} className="flex gap-3 items-center bg-white/5 p-4 rounded-xl border border-white/5">
              <div className="flex-1 space-y-2">
                <input 
                  type="text" 
                  value={group.name} 
                  onChange={e => updateGroupName(group.id, e.target.value)} 
                  className="w-full px-4 py-2 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold" 
                  placeholder={`Group ${group.id} Name`}
                />
                <div className="flex gap-1">
                  {Object.values(DifficultyLevel).filter(l => l !== DifficultyLevel.DEFAULT).map(level => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => updateGroupDifficulty(group.id, level)}
                      className={`flex-1 py-1 rounded-lg text-[8px] font-headline font-extrabold uppercase border transition-all flex items-center justify-center gap-1 ${
                        (group.difficulty || DifficultyLevel.LOW) === level 
                          ? 'bg-primary text-on-primary border-primary' 
                          : 'bg-surface-container-lowest text-outline border-outline-variant/10 hover:border-primary-container'
                      }`}
                    >
                      {level === DifficultyLevel.LOW && <SignalLow className="w-2.5 h-2.5" />}
                      {level === DifficultyLevel.MEDIUM && <SignalMedium className="w-2.5 h-2.5" />}
                      {level === DifficultyLevel.HIGH && <SignalHigh className="w-2.5 h-2.5" />}
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <button 
                onClick={() => removeGroup(group.id)}
                className="w-8 h-8 flex items-center justify-center rounded-lg bg-error-container/30 text-error hover:bg-error-container transition-all"
                disabled={groups.length <= 2}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {groups.length < 5 && (
          <button 
            onClick={addGroup}
            className="w-full py-3 rounded-xl border border-dashed border-white/10 text-on-surface-variant text-xs font-headline font-extrabold uppercase hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 bg-white/5"
          >
            <Plus className="w-4 h-4" /> Add Team
          </button>
        )}

        <div className="pt-4 border-t border-white/5 flex justify-between items-center text-xs">
          <label className="font-headline font-extrabold text-on-surface-variant uppercase tracking-widest italic">Question Timer</label>
          <select 
            value={timer} 
            onChange={(e) => setTimer(Number(e.target.value))}
            className="bg-surface-container border border-white/5 rounded-lg px-3 py-1.5 font-body font-bold text-on-surface focus:outline-none text-xs"
          >
            <option value={0}>Practice (Untimed)</option>
            <option value={30}>30 Secs</option>
            <option value={45}>45 Secs (Rec)</option>
            <option value={60}>60 Secs</option>
          </select>
        </div>
      </div>

      <div className="grid gap-3">
        <Button onClick={() => onStart(groups, timer)} className="h-16 rounded-[2rem] font-headline font-extrabold uppercase tracking-widest text-xs shadow-2xl shadow-primary/40 neon-glow-primary">
          Launch Classroom Battle
        </Button>
        <Button onClick={onCancel} variant="outline" className="h-12 rounded-[1.5rem] font-headline font-extrabold uppercase tracking-widest text-[9px] border-white/10 bg-surface-container-lowest/10">
          Cancel Setup
        </Button>
      </div>
    </div>
  );
};

// --- Sub-Component: ProgressScreen ---
const ProgressScreen: React.FC<{ user: UserProfile, onBack: () => void }> = ({ user, onBack }) => {
  const history = user.testHistory || [];

  return (
    <div className="p-4 md:p-6 space-y-6 animate-fade-in pb-10 max-w-4xl mx-auto">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <Award className="w-6 h-6 text-primary" />
          <h2 className="text-xl md:text-2xl font-headline font-extrabold text-on-surface tracking-tighter">My Diagnostics Record</h2>
        </div>
        <Button onClick={onBack} variant="outline" className="h-9 px-4 w-auto text-[9px] font-headline font-extrabold uppercase tracking-widest">Back</Button>
      </div>

      <div className="grid grid-cols-2 gap-3.5">
        <div className="bg-primary/10 border border-primary/20 p-5 rounded-2xl text-on-surface shadow-md">
          <p className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-primary italic">Total Accumulated Points</p>
          <p className="text-2xl font-headline font-extrabold tracking-tighter mt-1">{user.totalPoints.toLocaleString() || 0} pts</p>
        </div>
        <div className="bg-secondary/10 border border-secondary/20 p-5 rounded-2xl text-on-surface shadow-md">
          <p className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-secondary italic">Current Mastery Level</p>
          <p className="text-2xl font-headline font-extrabold tracking-tighter mt-1">Level {user.level}</p>
        </div>
      </div>

      <div className="bg-surface-container-lowest border border-white/10 p-5 rounded-2xl space-y-4">
        <p className="text-xs font-headline font-extrabold uppercase tracking-wider text-on-surface-variant">Diagnostics History ({history.length})</p>
        
        {history.length === 0 ? (
          <p className="text-xs text-on-surface-variant/70 italic text-center py-8">No tests taken yet. Perform adaptive quizzes to begin logging diagnostic milestones.</p>
        ) : (
          <div className="space-y-3 overflow-y-auto max-h-[50vh] no-scrollbar">
            {history.map((record, i) => (
              <div key={i} className="p-4 rounded-xl bg-surface border border-white/5 flex items-center justify-between">
                <div>
                  <p className="text-xs font-headline font-extrabold text-on-surface flex items-center gap-1.5 uppercase tracking-wide">
                    {record.topic}
                    <span className={`text-[8px] font-bold px-2 py-0.5 rounded-full ${record.type === 'classroom' ? 'bg-secondary/20 text-secondary' : 'bg-primary/20 text-primary'}`}>
                      {record.type}
                    </span>
                  </p>
                  <p className="text-[10px] text-on-surface-variant/80 mt-1 font-body font-bold">{record.date} • {record.subject} • Grade {record.grade || 'N/A'} • {record.score * 10} pts</p>
                </div>
                <div className="text-right">
                  <p className="text-base font-headline font-extrabold text-on-surface">{record.score}/5</p>
                  <p className="text-[8px] font-bold uppercase tracking-wider text-primary">Points Earned</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- MAIN SCREEN ENTRY EXPORT ---
export default function App() {
  // --- Firebase Synchronization & Auth States ---
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      console.warn("Google Sign-In caught error in sandbox:", err);
      setAuthError(
        "Browser sandbox restrictions blocked the Google Sign-In popup. " +
        "You can click 'Open in new tab' in settings to use Google, or click below to join with an instant Guest Account!"
      );
    }
  };

  const handleAnonymousLogin = async () => {
    setAuthLoading(true);
    setAuthError(null);
    try {
      await loginAnonymously();
    } catch (err: any) {
      console.error("Anonymous Sign-In failed:", err);
      setAuthError("Failed to sign in as guest: " + (err.message || err));
    } finally {
      setAuthLoading(false);
    }
  };

  // --- Core Domain State ---
  const [user, setUser] = useState<UserProfile>({
    name: '',
    gradeLevel: '10',
    board: 'CBSE',
    subject: 'Science',
    focus: StudyFocus.SYLLABUS,
    topic: 'Light - Reflection and Refraction',
    level: 1,
    totalQuizzes: 0,
    totalPoints: 0,
    testHistory: [],
    educationLevel: 'School'
  });

  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.ENTRY);
  const [currentQuestions, setCurrentQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [userAnswers, setUserAnswers] = useState<(number | null)[]>([]);
  const [activeQuiz, setActiveQuiz] = useState<QuizSession | null>(null);
  const [feedback, setFeedback] = useState<{ selected: number; isCorrect: boolean } | null>(null);

  // --- Adaptive Visuals HUD Modes ---
  const [fontSizeMode, setFontSizeMode] = useState<'normal' | 'large' | 'tv'>('normal');
  const [screenViewMode, setScreenViewMode] = useState<'standard' | 'presentation' | 'mobile'>('standard');

  // --- Timing HUD and Clock positioning ---
  const [timeLeft, setTimeLeft] = useState<number>(45);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);
  const [dragOffset, setDragOffset] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const isDragging = useRef(false);
  const originalPos = useRef({ x: 0, y: 0 });

  // --- Reading Aloud Audio state ---
  const [isReadingAloud, setIsReadingAloud] = useState<boolean>(false);
  const [soundEffectsEnabled, setSoundEffectsEnabled] = useState<boolean>(true);

  // --- Voice Answer Recorder Web Speech API states ---
  const [isRecordingAnswer, setIsRecordingAnswer] = useState<boolean>(false);
  const [spokenAnswerText, setSpokenAnswerText] = useState<string>("");
  const [speechError, setSpeechError] = useState<string>("");
  const recognitionRef = useRef<any>(null);
  const autoAdvanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const matchSpokenTextToOption = (spoken: string, options: string[]): number => {
    const text = spoken.toLowerCase().trim();
    const words = text.split(/\s+/);
    
    // 1. Spoken letters map (A, B, C, D)
    const letterMap: Record<string, number> = {
      'a': 0, 'alpha': 0, 'apple': 0, 'awesome': 0, 'first': 0,
      'b': 1, 'bee': 1, 'be': 1, 'beta': 1, 'boy': 1, 'second': 1,
      'c': 2, 'see': 2, 'sea': 2, 'charlie': 2, 'cat': 2, 'third': 2,
      'd': 3, 'dee': 3, 'delta': 3, 'dog': 3, 'the': 3, 'four': 3, 'fourth': 3
    };

    for (const word of words) {
      const cleanWord = word.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
      if (letterMap[cleanWord] !== undefined) {
        return letterMap[cleanWord];
      }
    }

    for (const letter of ['a', 'b', 'c', 'd']) {
      if (text.includes(`option ${letter}`) || text.includes(`choice ${letter}`) || text.includes(`select ${letter}`) || text.includes(`answer ${letter}`)) {
        return letter.charCodeAt(0) - 97;
      }
    }

    // 2. Numeric indices map
    const numberMap: Record<string, number> = {
      '1': 0, 'one': 0,
      '2': 1, 'two': 1, 'to': 1, 'too': 1,
      '3': 2, 'three': 2,
      '4': 3, 'four': 3, 'for': 3
    };

    for (const word of words) {
      const cleanWord = word.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "");
      if (numberMap[cleanWord] !== undefined) {
        return numberMap[cleanWord];
      }
    }

    // 3. Exact or loose options content matching
    let bestMatchIndex = -1;
    let bestMatchScore = 0;

    options.forEach((option, idx) => {
      const optText = option.toLowerCase().trim();
      if (text === optText) {
        bestMatchIndex = idx;
        bestMatchScore = 100;
      } else if (text.includes(optText) && optText.length > 3 && optText.length > bestMatchScore) {
        bestMatchIndex = idx;
        bestMatchScore = optText.length;
      } else if (optText.includes(text) && text.length > 3 && text.length > bestMatchScore) {
        bestMatchIndex = idx;
        bestMatchScore = text.length;
      }
    });

    if (bestMatchIndex !== -1) {
      return bestMatchIndex;
    }

    // 4. Overlap fallback
    let maxOverlap = 0;
    options.forEach((option, idx) => {
      const optWords = option.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").split(/\s+/).filter(w => w.length > 2);
      const spokenWords = text.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").split(/\s+/).filter(w => w.length > 2);
      const overlap = optWords.filter(w => spokenWords.includes(w)).length;
      if (overlap > maxOverlap) {
        maxOverlap = overlap;
        bestMatchIndex = idx;
      }
    });

    if (maxOverlap > 0) {
      return bestMatchIndex;
    }

    return -1;
  };

  const startRecordingAnswer = () => {
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsReadingAloud(false);
    
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setSpeechError("Speech recognition not supported in this browser. Please use Chrome, Edge, or Safari.");
      setTimeout(() => setSpeechError(""), 4000);
      return;
    }

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const rec = new SpeechRecognition();
      rec.continuous = false;
      rec.interimResults = false;
      rec.lang = 'en-US';

      rec.onstart = () => {
        setIsRecordingAnswer(true);
        setSpokenAnswerText("");
        setSpeechError("");
      };

      rec.onresult = (event: any) => {
        if (event.results && event.results[0] && event.results[0][0]) {
          const result = event.results[0][0].transcript;
          setSpokenAnswerText(result);
          
          const currentQ = currentQuestions[currentQuestionIndex];
          if (currentQ) {
            const matchedIdx = matchSpokenTextToOption(result, currentQ.options);
            if (matchedIdx !== -1) {
              handleOptionClick(matchedIdx);
            } else {
              setSpeechError(`Could not match voice input: "${result}". Speak an option letter (e.g., "Option A") or opt text.`);
              setTimeout(() => setSpeechError(""), 5000);
            }
          }
        }
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        if (event.error === 'not-allowed') {
          setSpeechError("Microphone access denied. Please allow microphone permission in your browser.");
        } else if (event.error === 'no-speech') {
          setSpeechError("No speech detected. Please speak louder or closer to the microphone.");
        } else if (event.error === 'network') {
          setSpeechError("Network error occurred. The browser's speech recognition service is temporarily unreachable. Please check your internet or retry.");
        } else {
          setSpeechError(`Speech recognition error: ${event.error}`);
        }
        setIsRecordingAnswer(false);
        setTimeout(() => setSpeechError(""), 6000);
      };

      rec.onend = () => {
        setIsRecordingAnswer(false);
      };

      recognitionRef.current = rec;
      rec.start();
    } catch (err: any) {
      console.error(err);
      setSpeechError("Failed to initialize speech recognition.");
      setIsRecordingAnswer(false);
      setTimeout(() => setSpeechError(""), 4000);
    }
  };

  const stopRecordingAnswer = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {
        console.error(e);
      }
    }
    setIsRecordingAnswer(false);
  };

  const toggleRecordingAnswer = () => {
    if (isRecordingAnswer) {
      stopRecordingAnswer();
    } else {
      startRecordingAnswer();
    }
  };

  // --- Classroom Multiplayer Battle stats ---
  const [classroomSession, setClassroomSession] = useState<ClassroomSession | null>(null);

  // --- Source Ingest Materials Storage ---
  const [materials, setMaterials] = useState<StudyMaterial[]>([
    { id: '1', title: 'CBSE Physics Ch-1 Syllabus Guideline', content: 'Reflection of light by curved surfaces; Images formed by spherical mirrors, centre of curvature, principal axis, principal focus, focal length, mirror formula, magnification, Refraction; Laws of refraction, refractive index.', timestamp: Date.now() }
  ]);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [isMaterialManagerOpen, setIsMaterialManagerOpen] = useState<boolean>(false);

  // Load study materials from IndexedDB on startup (stays in browser, complies with offline local mandate)
  useEffect(() => {
    const loadIndexedDbMaterials = async () => {
      try {
        const stored = await get_idb<StudyMaterial[]>('scholarearn_custom_materials');
        if (stored && stored.length > 0) {
          setMaterials(stored);
        }
      } catch (err) {
        console.warn("Could not retrieve custom study materials from browser cache:", err);
      }
    };
    loadIndexedDbMaterials();
  }, []);

  // Helper to persist materials to IndexedDB
  const saveMaterialsToIndexedDb = async (updated: StudyMaterial[]) => {
    setMaterials(updated);
    try {
      await set_idb('scholarearn_custom_materials', updated);
    } catch (err) {
      console.warn("Could not persist custom study materials in browser cache:", err);
    }
  };

  // --- Diagnosis Synthesizer Loaders ---
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [loadingMessage, setLoadingMessage] = useState<string>('Mobilizing Diagnostic Assets...');

  // --- Micro Visual Feedbacks ---
  const [showMotivationalPopup, setShowMotivationalPopup] = useState<boolean>(false);
  const [motivationText, setMotivationText] = useState<string>('Extraordinary!');

  // --- Auth state change listener ---
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setCurrentUser(fbUser);
      if (fbUser) {
        // Fetch cloud settings
        try {
          const userDocRef = doc(db, 'users', fbUser.uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const cloudUser = userSnap.data() as UserProfile;
            setUser(cloudUser);
          } else {
            // Write initial layout
            const initialUser: UserProfile = {
              name: fbUser.displayName || '',
              gradeLevel: '10',
              board: 'CBSE',
              subject: 'Science',
              focus: StudyFocus.SYLLABUS,
              topic: 'Light - Reflection and Refraction',
              level: 1,
              totalQuizzes: 0,
              totalPoints: 0,
              testHistory: [],
              educationLevel: 'School'
            };
            await setDoc(userDocRef, initialUser);
            setUser(initialUser);
          }
        } catch (e) {
          console.error("Failed to load user document", e);
        }
      } else {
        // Fall back to localStorage profile if anonymous
        const cached = localStorage.getItem('scholar_earn_user');
        if (cached) {
          try {
            setUser(JSON.parse(cached));
          } catch (_) {}
        }
      }
      setAuthLoading(false);
    });
    return () => unsub();
  }, []);

  // --- Trigger Profile Offline Cache Sync ---
  const syncLocalUserProfile = (updated: UserProfile) => {
    setUser(updated);
    localStorage.setItem('scholar_earn_user', JSON.stringify(updated));
    if (currentUser) {
      setDoc(doc(db, 'users', currentUser.uid), updated).catch(err => {
        handleFirestoreError(err, OperationType.UPDATE, `users/${currentUser.uid}`);
      });
    }
  };

  // --- Countdown Clock Hook ---
  useEffect(() => {
    let interval: NodeJS.Timeout | null = null;
    if (isTimerRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (isTimerRunning && timeLeft === 0) {
      handleTimeOut();
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, timeLeft]);

  // --- TimeOut Auto Handler ---
  const handleTimeOut = () => {
    setIsTimerRunning(false);
    if (classroomSession) {
      // Advance classroom group next
      const nextIdx = (classroomSession.currentGroupIndex + 1) % classroomSession.groups.length;
      setClassroomSession({
        ...classroomSession,
        currentGroupIndex: nextIdx
      });
      setMotivationText("Clock ran out! Pass to Next Group.");
      setShowMotivationalPopup(true);
      // Re-trigger timer
      setTimeout(() => {
        setTimeLeft(classroomSession.questionTimer || 45);
        setIsTimerRunning(classroomSession.questionTimer ? classroomSession.questionTimer > 0 : false);
      }, 2500);
    } else {
      // Standard practice mode: auto submit incorrect
      setFeedback({ selected: -1, isCorrect: false });
    }
  };

  // --- Spoken Text local reader with stops ---
  const handleReadAloud = async () => {
    if (isReadingAloud) {
      if (window.speechSynthesis) window.speechSynthesis.cancel();
      setIsReadingAloud(false);
      return;
    }

    const currentQ = currentQuestions[currentQuestionIndex];
    if (!currentQ) return;

    let textToSpeak = currentQ.text;
    if (currentQ.contextMaterial) {
      textToSpeak = `${currentQ.contextMaterial}. Question: ${currentQ.text}`;
    }

    setIsReadingAloud(true);
    await speakTextLocal(textToSpeak, 
      () => {}, 
      () => { setIsReadingAloud(false); }
    );
  };

  // --- Load and synthesize questions ---
  const initiateDiagnosis = async () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    if (!user.name.trim()) {
      alert("Please configure your Student Name before starting the diagnose course.");
      return;
    }
    
    // Stop any speech
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsReadingAloud(false);

    setLoadingProgress(10);
    setLoadingMessage("Synthesizing Board Curriculum Guidelines...");
    setCurrentScreen(AppScreen.LOADING);

    // Simulate synth steps
    const timer1 = setTimeout(() => {
      setLoadingProgress(45);
      setLoadingMessage("Tuning Expert Gemini AI Explanatory Engine...");
    }, 1000);

    const timer2 = setTimeout(() => {
      setLoadingProgress(75);
      setLoadingMessage("Shuffling Options & Validating Uniqueness Map...");
    }, 2200);

    try {
      const activeMaterial = materials.find(m => m.id === selectedMaterialId);
      const questionsFetched = await generateQuizQuestions(
        user, 
        false, 
        undefined, 
        user.topic, 
        DifficultyLevel.DEFAULT, 
        0, 
        undefined, 
        activeMaterial?.content
      );

      clearTimeout(timer1);
      clearTimeout(timer2);
      setLoadingProgress(100);
      setLoadingMessage("Diagnostics Complete! Preparing Interface...");

      setTimeout(() => {
        setCurrentQuestions(questionsFetched);
        setCurrentQuestionIndex(0);
        setUserAnswers(new Array(questionsFetched.length).fill(null));
        setFeedback(null);
        
        const testTimer = 45; // default individual countdown
        setTimeLeft(testTimer);
        setIsTimerRunning(true);

        setActiveQuiz({
          profile: user,
          questions: questionsFetched,
          userAnswers: new Array(questionsFetched.length).fill(null),
          score: 0,
          questionTimer: testTimer
        });

        setCurrentScreen(AppScreen.QUIZ);
      }, 500);

    } catch (error: any) {
      clearTimeout(timer1);
      clearTimeout(timer2);
      alert(error.message || "Synthesizer failed. Check API Keys in settings.");
      setCurrentScreen(AppScreen.ENTRY);
    }
  };

  // --- Launch Classroom Battles ---
  const launchClassroomBattleSetup = () => {
    setCurrentScreen(AppScreen.CLASSROOM_SETUP);
  };

  // --- Trigger Classroom Battle ---
  const startClassroomSession = async (groupsList: Group[], timerDuration: number) => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    if (!user.topic.trim()) {
      alert("Please select or type a Topic focus first.");
      return;
    }

    // Stop speech
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setIsReadingAloud(false);

    setLoadingProgress(10);
    setLoadingMessage("Fortifying Classroom Arena...");
    setCurrentScreen(AppScreen.LOADING);

    const timer1 = setTimeout(() => {
      setLoadingProgress(50);
      setLoadingMessage("Generating Team-Specific Unique Challenge Matrices...");
    }, 1200);

    try {
      const activeMaterial = materials.find(m => m.id === selectedMaterialId);
      // Fetch questions 
      const questionsFetched = await generateQuizQuestions(
        user, 
        false, 
        'Multi-Team Arena', 
        user.topic, 
        DifficultyLevel.DEFAULT, 
        0, 
        undefined, 
        activeMaterial?.content
      );

      clearTimeout(timer1);
      setLoadingProgress(100);
      setLoadingMessage("Battle Grid Connected!");

      setTimeout(() => {
        setCurrentQuestions(questionsFetched);
        setCurrentQuestionIndex(0);
        setUserAnswers(new Array(questionsFetched.length).fill(null));
        setFeedback(null);

        setClassroomSession({
          id: 'arena_' + Date.now(),
          groups: groupsList.map(g => ({ ...g, score: 0 })),
          currentGroupIndex: 0,
          subject: user.subject,
          gradeLevel: user.gradeLevel,
          section: user.section || 'A',
          topic: user.topic,
          isStarted: true,
          questionTimer: timerDuration
        });

        setTimeLeft(timerDuration);
        setIsTimerRunning(timerDuration > 0);
        setCurrentScreen(AppScreen.QUIZ);
      }, 500);

    } catch (e: any) {
      clearTimeout(timer1);
      alert(e.message || "Failed to organize battle questions.");
      setCurrentScreen(AppScreen.CLASSROOM_SETUP);
    }
  };

  // --- Option click evaluator with dyn key shifting fixes ---
  const handleOptionClick = (optionIdx: number) => {
    if (feedback !== null) return; // Prevent multiple clicks
    setIsTimerRunning(false); // Pause clock feedback
    if (window.speechSynthesis) window.speechSynthesis.cancel(); // Stop read alouds
    setIsReadingAloud(false);

    const currentQ = currentQuestions[currentQuestionIndex];
    if (!currentQ) return;

    const correct = optionIdx === currentQ.correctIndex;
    setFeedback({
      selected: optionIdx,
      isCorrect: correct
    });

    if (soundEffectsEnabled) {
      playAudioFeedback(correct);
    }

    // Update ongoing answers
    const nextAnswers = [...userAnswers];
    nextAnswers[currentQuestionIndex] = optionIdx;
    setUserAnswers(nextAnswers);

    // Dynamic positive words mapping
    if (correct) {
      const niceWords = ['Outstanding!', 'Phenomenal!', 'Impeccable!', 'Strategic Mind!', 'Elite Master!'];
      setMotivationText(niceWords[Math.floor(Math.random() * niceWords.length)]);
      setShowMotivationalPopup(true);

      // Instantly clear any old timeout, set the automatic next answer transition to 2500ms
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
      }
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        handleNextQuizQuestion();
      }, 4000);
    }

    // Adapt states
    if (classroomSession) {
      // If correct, point scored for active team
      if (correct) {
        const activeGroup = classroomSession.groups[classroomSession.currentGroupIndex];
        const updatedGroups = classroomSession.groups.map((g, idx) => 
          idx === classroomSession.currentGroupIndex 
            ? { ...g, score: g.score + 1 } 
            : g
        );
        setClassroomSession({
          ...classroomSession,
          groups: updatedGroups
        });
      }
    } else if (activeQuiz) {
      // Standard score sync
      if (correct) {
        setActiveQuiz({
          ...activeQuiz,
          score: activeQuiz.score + 1,
          userAnswers: nextAnswers
        });
      } else {
        setActiveQuiz({
          ...activeQuiz,
          userAnswers: nextAnswers
        });
      }
    }
  };

  // --- Advance inside Quiz ---
  const handleNextQuizQuestion = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    // Reset voice recording results
    setSpokenAnswerText("");
    setSpeechError("");

    if (currentQuestionIndex + 1 < currentQuestions.length) {
      setCurrentQuestionIndex(prev => prev + 1);
      setFeedback(null);
      
      const nextTimer = classroomSession ? (classroomSession.questionTimer || 45) : 45;
      setTimeLeft(nextTimer);
      setIsTimerRunning(nextTimer > 0);

      if (classroomSession) {
        // Rotate classroom team
        const nextGroupIdx = (classroomSession.currentGroupIndex + 1) % classroomSession.groups.length;
        setClassroomSession({
          ...classroomSession,
          currentGroupIndex: nextGroupIdx
        });
      }
    } else {
      // Finish Session
      setIsTimerRunning(false);
      if (classroomSession) {
        // Log multiplayer battle
        const parsedTime = new Date().toLocaleDateString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const record: TestRecord = {
          topic: classroomSession.topic,
          score: Math.max(...classroomSession.groups.map(g => g.score)),
          total: 5,
          date: parsedTime,
          type: 'classroom',
          subject: classroomSession.subject,
          grade: classroomSession.gradeLevel
        };

        const updatedUser: UserProfile = {
          ...user,
          totalPoints: user.totalPoints + 30, // reward code
          totalQuizzes: user.totalQuizzes + 1,
          testHistory: [record, ...(user.testHistory || [])]
        };

        syncLocalUserProfile(updatedUser);
        setCurrentScreen(AppScreen.LEADERBOARD);
      } else if (activeQuiz) {
        // Log individual adaptive
        const finalScore = activeQuiz.score;
        const rewardPoints = finalScore * 10;
        const parsedTime = new Date().toLocaleDateString('en-IN', { hour: '2-digit', minute: '2-digit' });

        const record: TestRecord = {
          topic: user.topic,
          score: finalScore,
          total: 5,
          date: parsedTime,
          type: 'individual',
          subject: user.subject,
          grade: user.gradeLevel
        };

        const progressiveLevel = finalScore >= 4 ? user.level + 1 : user.level;

        const updatedUser: UserProfile = {
          ...user,
          level: progressiveLevel,
          totalPoints: user.totalPoints + rewardPoints,
          totalQuizzes: user.totalQuizzes + 1,
          testHistory: [record, ...(user.testHistory || [])]
        };

        syncLocalUserProfile(updatedUser);
        setActiveQuiz({
          ...activeQuiz,
          score: finalScore
        });
        setCurrentScreen(AppScreen.RESULTS);
      }
    }
  };

  // --- Export / Download Report Card Handlers ---
  const downloadTextReport = () => {
    if (!activeQuiz) return;
    const dateStr = new Date().toLocaleDateString();
    const percentage = Math.round((activeQuiz.score / activeQuiz.questions.length) * 100);
    
    let content = `======================================================================\n`;
    content += `               SCHOLAR EARN — DIAGNOSTIC REPORT CARD                  \n`;
    content += `======================================================================\n\n`;
    content += `STUDENT INTELLIGENCE PROFILE:\n`;
    content += `---------------------\n`;
    content += `Student Name   : ${activeQuiz.profile.name}\n`;
    content += `Grade Level    : Grade ${activeQuiz.profile.gradeLevel}\n`;
    content += `Subject Focus  : ${activeQuiz.profile.subject}\n`;
    content += `Topic Focus    : ${activeQuiz.profile.topic}\n`;
    content += `Syllabus Focus : ${activeQuiz.profile.focus}\n`;
    content += `Date Evaluated : ${dateStr}\n\n`;
    
    content += `DIAGNOSTIC SCORE ACQUISITION:\n`;
    content += `---------------------\n`;
    content += `Score Accrued  : ${activeQuiz.score} / ${activeQuiz.questions.length} (${percentage}% Accuracy)\n`;
    content += `Points Earned  : +${activeQuiz.score * 10} pts\n`;
    content += `Level Status   : Progressive Level ${activeQuiz.profile.level}\n\n`;
    
    content += `EXPERT EVALUATOR RECOMMENDATION:\n`;
    content += `--------------------------------\n`;
    const recommendation = activeQuiz.score === 5 
      ? "Flawless score! Your conceptual foundation is rock-solid. You are authorized to step up layout progressive level challenges." 
      : activeQuiz.score >= 3 
        ? "Competent coverage! Focus on explanations mapped in wrong choices to reinforce board diagnostics." 
        : "Requires review. Ingest related source textbook readings inside the Library to ground future diagnostics.";
    content += `${recommendation}\n\n`;
    
    content += `ITEMIZED QUESTION PERFORMANCE EVALUATION:\n`;
    content += `======================================================================\n\n`;
    
    activeQuiz.questions.forEach((q, idx) => {
      const userAnsIdx = activeQuiz.userAnswers[idx];
      const isCorrect = userAnsIdx === q.correctIndex;
      const userSelection = userAnsIdx !== null ? q.options[userAnsIdx] : "Unanswered/Timeout";
      const correctSelection = q.options[q.correctIndex];
      
      content += `QUESTION ${idx + 1}: ${q.text}\n`;
      if (q.contextMaterial) {
        content += `[Context Detail]: ${q.contextMaterial}\n`;
      }
      content += `----------------------------------------------------------------------\n`;
      q.options.forEach((opt, oIdx) => {
        const optionPrefix = String.fromCharCode(65 + oIdx);
        let marker = "   ";
        if (oIdx === q.correctIndex) marker = "[✓]";
        if (oIdx === userAnsIdx && !isCorrect) marker = "[✗]";
        content += `  ${marker} ${optionPrefix}. ${opt}\n`;
      });
      content += `\n`;
      content += `  Your Answer   : ${userAnsIdx !== null ? String.fromCharCode(65 + userAnsIdx) : "None"} (${userSelection})\n`;
      content += `  Correct Answer: ${String.fromCharCode(65 + q.correctIndex)} (${correctSelection})\n`;
      content += `  Evaluation    : ${isCorrect ? "CORRECT" : "INCORRECT"}\n`;
      content += `  Explanation   : ${q.explanation}\n`;
      if (q.inquiryPrompt) {
        content += `  Inquiry Drift : ${q.inquiryPrompt}\n`;
      }
      content += `======================================================================\n\n`;
    });
    
    content += `Generated dynamically via Scholar Earn Intelligent Adaptive Sandbox.\n`;
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeQuiz.profile.name.replace(/\s+/g, '_')}_ScholarEarn_ReportCard.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadHtmlReport = () => {
    if (!activeQuiz) return;
    const dateStr = new Date().toLocaleDateString();
    const percentage = Math.round((activeQuiz.score / activeQuiz.questions.length) * 100);
    const recommendation = activeQuiz.score === 5 
      ? "Flawless score! Your conceptual foundation is rock-solid. You are authorized to step up progressive level challenges." 
      : activeQuiz.score >= 3 
        ? "Competent coverage! Focus on explanations mapped in wrong choices to reinforce board diagnostics." 
        : "Requires review. Ingest related source textbook readings inside the Library to ground future diagnostics.";

    let content = "";
    content += "<!DOCTYPE html>\n";
    content += "<html lang=\"en\">\n";
    content += "<head>\n";
    content += "    <meta charset=\"UTF-8\">\n";
    content += "    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n";
    content += "    <title>Scholar Earn Diagnostic Report Card - " + activeQuiz.profile.name + "</title>\n";
    content += "    <style>\n";
    content += "        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');\n";
    content += "        \n";
    content += "        :root {\n";
    content += "            --primary: #4f46e5;\n";
    content += "            --primary-light: #e0e7ff;\n";
    content += "            --tertiary: #0d9488;\n";
    content += "            --tertiary-light: #ccfbf1;\n";
    content += "            --danger: #e11d48;\n";
    content += "            --danger-light: #ffe4e6;\n";
    content += "            --surface: #f8fafc;\n";
    content += "            --text-main: #0f172a;\n";
    content += "            --text-muted: #475569;\n";
    content += "            --border: #e2e8f0;\n";
    content += "        }\n";
    content += "\n";
    content += "        body {\n";
    content += "            font-family: 'Inter', sans-serif;\n";
    content += "            background-color: #f1f5f9;\n";
    content += "            color: var(--text-main);\n";
    content += "            margin: 0;\n";
    content += "            padding: 40px 20px;\n";
    content += "            display: flex;\n";
    content += "            justify-content: center;\n";
    content += "        }\n";
    content += "\n";
    content += "        .report-card {\n";
    content += "            background: white;\n";
    content += "            max-width: 850px;\n";
    content += "            width: 100%;\n";
    content += "            border-radius: 24px;\n";
    content += "            box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05), 0 8px 10px -6px rgba(0,0,0,0.05);\n";
    content += "            border: 1px solid var(--border);\n";
    content += "            padding: 40px;\n";
    content += "            box-sizing: border-box;\n";
    content += "            position: relative;\n";
    content += "            overflow: hidden;\n";
    content += "        }\n";
    content += "\n";
    content += "        .report-card::before {\n";
    content += "            content: '';\n";
    content += "            position: absolute;\n";
    content += "            top: 0;\n";
    content += "            left: 0;\n";
    content += "            right: 0;\n";
    content += "            height: 8px;\n";
    content += "            background: linear-gradient(90deg, var(--primary), var(--tertiary));\n";
    content += "        }\n";
    content += "\n";
    content += "        .header-section {\n";
    content += "            display: flex;\n";
    content += "            justify-content: space-between;\n";
    content += "            align-items: center;\n";
    content += "            border-bottom: 2px solid var(--border);\n";
    content += "            padding-bottom: 24px;\n";
    content += "            margin-bottom: 30px;\n";
    content += "        }\n";
    content += "\n";
    content += "        .branding h1 {\n";
    content += "            font-family: 'Space Grotesk', sans-serif;\n";
    content += "            font-weight: 700;\n";
    content += "            font-size: 28px;\n";
    content += "            color: var(--primary);\n";
    content += "            margin: 0;\n";
    content += "            letter-spacing: -0.5px;\n";
    content += "        }\n";
    content += "\n";
    content += "        .branding p {\n";
    content += "            font-size: 11px;\n";
    content += "            text-transform: uppercase;\n";
    content += "            font-weight: 700;\n";
    content += "            letter-spacing: 2px;\n";
    content += "            color: var(--text-muted);\n";
    content += "            margin: 4px 0 0 0;\n";
    content += "        }\n";
    content += "\n";
    content += "        .metadata-badge {\n";
    content += "            text-align: right;\n";
    content += "            font-size: 13px;\n";
    content += "            color: var(--text-muted);\n";
    content += "        }\n";
    content += "\n";
    content += "        .metadata-badge .code {\n";
    content += "            font-family: 'JetBrains Mono', monospace;\n";
    content += "            font-weight: 600;\n";
    content += "            color: var(--text-main);\n";
    content += "        }\n";
    content += "\n";
    content += "        .profile-grid {\n";
    content += "            display: grid;\n";
    content += "            grid-template-cols: repeat(auto-fit, minmax(200px, 1fr));\n";
    content += "            gap: 20px;\n";
    content += "            margin-bottom: 35px;\n";
    content += "            background: var(--surface);\n";
    content += "            padding: 24px;\n";
    content += "            border-radius: 16px;\n";
    content += "            border: 1px solid var(--border);\n";
    content += "        }\n";
    content += "\n";
    content += "        .profile-item {\n";
    content += "            display: flex;\n";
    content += "            flex-direction: column;\n";
    content += "        }\n";
    content += "\n";
    content += "        .profile-item .label {\n";
    content += "            font-size: 11px;\n";
    content += "            text-transform: uppercase;\n";
    content += "            font-weight: 600;\n";
    content += "            color: var(--text-muted);\n";
    content += "            margin-bottom: 4px;\n";
    content += "            letter-spacing: 0.5px;\n";
    content += "        }\n";
    content += "\n";
    content += "        .profile-item .val {\n";
    content += "            font-size: 15px;\n";
    content += "            font-weight: 700;\n";
    content += "            color: var(--text-main);\n";
    content += "        }\n";
    content += "\n";
    content += "        .metrics-container {\n";
    content += "            display: grid;\n";
    content += "            grid-template-cols: repeat(auto-fit, minmax(240px, 1fr));\n";
    content += "            gap: 20px;\n";
    content += "            margin-bottom: 35px;\n";
    content += "        }\n";
    content += "\n";
    content += "        .metric-box {\n";
    content += "            border-radius: 16px;\n";
    content += "            padding: 24px;\n";
    content += "            text-align: center;\n";
    content += "            display: flex;\n";
    content += "            flex-direction: column;\n";
    content += "            justify-content: center;\n";
    content += "            align-items: center;\n";
    content += "            border: 1px solid transparent;\n";
    content += "        }\n";
    content += "\n";
    content += "        .metric-box.score {\n";
    content += "            background-color: var(--primary-light);\n";
    content += "            color: var(--primary);\n";
    content += "            border-color: rgba(79, 70, 229, 0.2);\n";
    content += "        }\n";
    content += "\n";
    content += "        .metric-box.points {\n";
    content += "            background-color: var(--tertiary-light);\n";
    content += "            color: var(--tertiary);\n";
    content += "            border-color: rgba(13, 148, 136, 0.2);\n";
    content += "        }\n";
    content += "\n";
    content += "        .metric-box .title {\n";
    content += "            font-size: 11px;\n";
    content += "            text-transform: uppercase;\n";
    content += "            font-weight: 700;\n";
    content += "            letter-spacing: 1.5px;\n";
    content += "            margin-bottom: 8px;\n";
    content += "        }\n";
    content += "\n";
    content += "        .metric-box .value {\n";
    content += "            font-size: 42px;\n";
    content += "            font-weight: 800;\n";
    content += "            font-family: 'Space Grotesk', sans-serif;\n";
    content += "            line-height: 1;\n";
    content += "            margin: 0;\n";
    content += "        }\n";
    content += "\n";
    content += "        .metric-box .subtext {\n";
    content += "            font-size: 12px;\n";
    content += "            margin-top: 6px;\n";
    content += "            font-weight: 500;\n";
    content += "            opacity: 0.8;\n";
    content += "        }\n";
    content += "\n";
    content += "        .recommendation-box {\n";
    content += "            background: linear-gradient(135deg, #faf5ff, #f3e8ff);\n";
    content += "            border: 1px solid #e9d5ff;\n";
    content += "            border-radius: 16px;\n";
    content += "            padding: 24px;\n";
    content += "            margin-bottom: 40px;\n";
    content += "        }\n";
    content += "\n";
    content += "        .recommendation-box h3 {\n";
    content += "            font-family: 'Space Grotesk', sans-serif;\n";
    content += "            margin: 0 0 8px 0;\n";
    content += "            color: #7e22ce;\n";
    content += "            font-size: 16px;\n";
    content += "            font-weight: 700;\n";
    content += "            text-transform: uppercase;\n";
    content += "            letter-spacing: 0.5px;\n";
    content += "        }\n";
    content += "\n";
    content += "        .recommendation-box p {\n";
    content += "            margin: 0;\n";
    content += "            font-size: 14px;\n";
    content += "            line-height: 1.6;\n";
    content += "            color: #581c87;\n";
    content += "            font-weight: 500;\n";
    content += "        }\n";
    content += "\n";
    content += "        .solution-section h3 {\n";
    content += "            font-family: 'Space Grotesk', sans-serif;\n";
    content += "            color: var(--text-main);\n";
    content += "            font-size: 18px;\n";
    content += "            font-weight: 700;\n";
    content += "            margin: 0 0 20px 0;\n";
    content += "            border-left: 4px solid var(--primary);\n";
    content += "            padding-left: 12px;\n";
    content += "        }\n";
    content += "\n";
    content += "        .solution-item {\n";
    content += "            background: white;\n";
    content += "            border: 1px solid var(--border);\n";
    content += "            border-radius: 16px;\n";
    content += "            padding: 24px;\n";
    content += "            margin-bottom: 20px;\n";
    content += "            transition: all 0.2s ease;\n";
    content += "        }\n";
    content += "\n";
    content += "        .solution-item.correct {\n";
    content += "            border-left: 5px solid var(--tertiary);\n";
    content += "        }\n";
    content += "\n";
    content += "        .solution-item.incorrect {\n";
    content += "            border-left: 5px solid var(--danger);\n";
    content += "        }\n";
    content += "\n";
    content += "        .solution-header {\n";
    content += "            display: flex;\n";
    content += "            justify-content: space-between;\n";
    content += "            align-items: flex-start;\n";
    content += "            margin-bottom: 15px;\n";
    content += "            gap: 15px;\n";
    content += "        }\n";
    content += "\n";
    content += "        .question-num {\n";
    content += "            font-family: 'Space Grotesk', sans-serif;\n";
    content += "            font-weight: 700;\n";
    content += "            font-size: 13px;\n";
    content += "            text-transform: uppercase;\n";
    content += "            letter-spacing: 1px;\n";
    content += "            padding: 4px 10px;\n";
    content += "            border-radius: 8px;\n";
    content += "            white-space: nowrap;\n";
    content += "        }\n";
    content += "\n";
    content += "        .correct .question-num {\n";
    content += "            background-color: var(--tertiary-light);\n";
    content += "            color: var(--tertiary);\n";
    content += "        }\n";
    content += "\n";
    content += "        .incorrect .question-num {\n";
    content += "            background-color: var(--danger-light);\n";
    content += "            color: var(--danger);\n";
    content += "        }\n";
    content += "\n";
    content += "        .question-text {\n";
    content += "            font-size: 15px;\n";
    content += "            font-weight: 600;\n";
    content += "            line-height: 1.5;\n";
    content += "            color: var(--text-main);\n";
    content += "            margin: 0;\n";
    content += "            flex-grow: 1;\n";
    content += "        }\n";
    content += "\n";
    content += "        .context-box {\n";
    content += "            font-family: 'JetBrains Mono', monospace;\n";
    content += "            background: #f8fafc;\n";
    content += "            border: 1px solid var(--border);\n";
    content += "            padding: 12px 16px;\n";
    content += "            border-radius: 10px;\n";
    content += "            font-size: 12px;\n";
    content += "            color: var(--text-muted);\n";
    content += "            margin: 10px 0 15px 0;\n";
    content += "            line-height: 1.5;\n";
    content += "        }\n";
    content += "\n";
    content += "        .options-list {\n";
    content += "            display: grid;\n";
    content += "            grid-template-cols: 1fr;\n";
    content += "            gap: 10px;\n";
    content += "            margin-bottom: 20px;\n";
    content += "        }\n";
    content += "\n";
    content += "        .option-val {\n";
    content += "            font-size: 13px;\n";
    content += "            padding: 10px 14px;\n";
    content += "            border-radius: 10px;\n";
    content += "            border: 1px solid var(--border);\n";
    content += "            display: flex;\n";
    content += "            align-items: center;\n";
    content += "            gap: 10px;\n";
    content += "        }\n";
    content += "\n";
    content += "        .option-val.correct-choice {\n";
    content += "            background-color: #f0fdf4;\n";
    content += "            border-color: #bbf7d0;\n";
    content += "            color: #166534;\n";
    content += "            font-weight: 600;\n";
    content += "        }\n";
    content += "\n";
    content += "        .option-val.user-wrong-choice {\n";
    content += "            background-color: #fef2f2;\n";
    content += "            border-color: #fecaca;\n";
    content += "            color: #991b1b;\n";
    content += "            font-weight: 600;\n";
    content += "        }\n";
    content += "\n";
    content += "        .badge-marker {\n";
    content += "            width: 20px;\n";
    content += "            height: 20px;\n";
    content += "            border-radius: 50%;\n";
    content += "            display: inline-flex;\n";
    content += "            align-items: center;\n";
    content += "            justify-content: center;\n";
    content += "            font-size: 10px;\n";
    content += "            font-weight: 700;\n";
    content += "        }\n";
    content += "\n";
    content += "        .correct-choice .badge-marker {\n";
    content += "            background-color: #15803d;\n";
    content += "            color: white;\n";
    content += "        }\n";
    content += "\n";
    content += "        .user-wrong-choice .badge-marker {\n";
    content += "            background-color: var(--danger);\n";
    content += "            color: white;\n";
    content += "        }\n";
    content += "\n";
    content += "        .explanation-block {\n";
    content += "            background-color: var(--surface);\n";
    content += "            border-radius: 12px;\n";
    content += "            padding: 16px;\n";
    content += "            border: 1px solid var(--border);\n";
    content += "        }\n";
    content += "        \n";
    content += "        .explanation-block .label-title {\n";
    content += "            font-size: 11px;\n";
    content += "            text-transform: uppercase;\n";
    content += "            font-weight: 700;\n";
    content += "            color: var(--text-muted);\n";
    content += "            margin-bottom: 6px;\n";
    content += "            letter-spacing: 0.5px;\n";
    content += "        }\n";
    content += "\n";
    content += "        .explanation-block .explanation-text {\n";
    content += "            font-size: 13px;\n";
    content += "            line-height: 1.6;\n";
    content += "            color: var(--text-muted);\n";
    content += "            margin: 0;\n";
    content += "        }\n";
    content += "\n";
    content += "        .inquiry-drift {\n";
    content += "            margin-top: 10px;\n";
    content += "            font-size: 12px;\n";
    content += "            font-style: italic;\n";
    content += "            color: var(--primary);\n";
    content += "            font-weight: 500;\n";
    content += "        }\n";
    content += "\n";
    content += "        .footer {\n";
    content += "            margin-top: 50px;\n";
    content += "            border-top: 1px dashed var(--border);\n";
    content += "            padding-top: 20px;\n";
    content += "            text-align: center;\n";
    content += "            font-size: 11px;\n";
    content += "            color: var(--text-muted);\n";
    content += "        }\n";
    content += "\n";
    content += "        .print-btn-float {\n";
    content += "            position: fixed;\n";
    content += "            bottom: 30px;\n";
    content += "            right: 30px;\n";
    content += "            background: var(--primary);\n";
    content += "            color: white;\n";
    content += "            border: none;\n";
    content += "            padding: 14px 24px;\n";
    content += "            border-radius: 50px;\n";
    content += "            font-family: 'Space Grotesk', sans-serif;\n";
    content += "            font-weight: 700;\n";
    content += "            font-size: 14px;\n";
    content += "            box-shadow: 0 10px 15px -3px rgba(79, 70, 229, 0.4);\n";
    content += "            cursor: pointer;\n";
    content += "            transition: all 0.2s ease;\n";
    content += "            display: flex;\n";
    content += "            align-items: center;\n";
    content += "            gap: 10px;\n";
    content += "        }\n";
    content += "\n";
    content += "        .print-btn-float:hover {\n";
    content += "            transform: translateY(-2px);\n";
    content += "            box-shadow: 0 12px 20px -3px rgba(79, 70, 229, 0.5);\n";
    content += "        }\n";
    content += "        \n";
    content += "        @media (max-width: 600px) {\n";
    content += "            body {\n";
    content += "                padding: 10px;\n";
    content += "            }\n";
    content += "            .report-card {\n";
    content += "                padding: 20px;\n";
    content += "            }\n";
    content += "            .header-section {\n";
    content += "                flex-direction: column;\n";
    content += "                align-items: flex-start;\n";
    content += "                gap: 15px;\n";
    content += "            }\n";
    content += "            .metadata-badge {\n";
    content += "                text-align: left;\n";
    content += "            }\n";
    content += "        }\n";
    content += "\n";
    content += "        @media print {\n";
    content += "            body {\n";
    content += "                background: white;\n";
    content += "                padding: 0;\n";
    content += "                color: black;\n";
    content += "            }\n";
    content += "            .report-card {\n";
    content += "                box-shadow: none;\n";
    content += "                border: none;\n";
    content += "                padding: 0;\n";
    content += "                width: 100%;\n";
    content += "                max-width: 100%;\n";
    content += "            }\n";
    content += "            .print-btn-float {\n";
    content += "                display: none;\n";
    content += "            }\n";
    content += "            .solution-item {\n";
    content += "                break-inside: avoid;\n";
    content += "            }\n";
    content += "        }\n";
    content += "    </style>\n";
    content += "</head>\n";
    content += "<body>\n";
    content += "\n";
    content += "    <div class=\"report-card\">\n";
    content += "        <div class=\"header-section\">\n";
    content += "            <div class=\"branding\">\n";
    content += "                <h1>Scholar Earn</h1>\n";
    content += "                <p>Intelligent Adaptive Sandbox Report</p>\n";
    content += "            </div>\n";
    content += "            <div class=\"metadata-badge\">\n";
    content += "                Registered Diagnostic Code:<br>\n";
    content += "                <span class=\"code\">SEQ-" + Math.floor(Math.random() * 900000 + 100000) + "</span><br>\n";
    content += "                Issued on " + dateStr + "\n";
    content += "            </div>\n";
    content += "        </div>\n";
    content += "\n";
    content += "        <div class=\"profile-grid\">\n";
    content += "            <div class=\"profile-item\">\n";
    content += "                <span class=\"label\">Student Name</span>\n";
    content += "                <span class=\"val\">" + activeQuiz.profile.name + "</span>\n";
    content += "            </div>\n";
    content += "            <div class=\"profile-item\">\n";
    content += "                <span class=\"label\">Academic Target</span>\n";
    content += "                <span class=\"val\">Grade " + activeQuiz.profile.gradeLevel + "</span>\n";
    content += "            </div>\n";
    content += "            <div class=\"profile-item\">\n";
    content += "                <span class=\"label\">Syllabus Track</span>\n";
    content += "                <span class=\"val\">" + activeQuiz.profile.focus + "</span>\n";
    content += "            </div>\n";
    content += "            <div class=\"profile-item\">\n";
    content += "                <span class=\"label\">Diagnostic Category</span>\n";
    content += "                <span class=\"val\">" + activeQuiz.profile.subject + "</span>\n";
    content += "            </div>\n";
    content += "            <div class=\"profile-item\">\n";
    content += "                <span class=\"label\">Challenge Topic</span>\n";
    content += "                <span class=\"val\">" + activeQuiz.profile.topic + "</span>\n";
    content += "            </div>\n";
    content += "        </div>\n";
    content += "\n";
    content += "        <div class=\"metrics-container\">\n";
    content += "            <div class=\"metric-box score\">\n";
    content += "                <span class=\"title\">Evaluative Accuracy</span>\n";
    content += "                <p class=\"value\">" + activeQuiz.score + "/" + activeQuiz.questions.length + "</p>\n";
    content += "                <span class=\"subtext\">" + percentage + "% Complete Mastery</span>\n";
    content += "            </div>\n";
    content += "            <div class=\"metric-box points\">\n";
    content += "                <span class=\"title\">Skill Accumulation</span>\n";
    content += "                <p class=\"value\">+" + (activeQuiz.score * 10) + " pts</p>\n";
    content += "                <span class=\"subtext\">Progressive Level Level " + activeQuiz.profile.level + " Reached</span>\n";
    content += "            </div>\n";
    content += "        </div>\n";
    content += "\n";
    content += "        <div class=\"recommendation-box\">\n";
    content += "            <h3>Expert Evaluator Recommendation</h3>\n";
    content += "            <p>" + recommendation + "</p>\n";
    content += "        </div>\n";
    content += "\n";
    content += "        <div class=\"solution-section\">\n";
    content += "            <h3>Itemized Challenge Mastery Review</h3>\n";

    activeQuiz.questions.forEach((q, idx) => {
      const userAnsIdx = activeQuiz.userAnswers[idx];
      const isCorrect = userAnsIdx === q.correctIndex;
      const isUnanswered = userAnsIdx === null;
      
      content += "\n";
      content += "            <div class=\"solution-item " + (isCorrect ? "correct" : "incorrect") + "\">\n";
      content += "                <div class=\"solution-header\">\n";
      content += "                    <span class=\"question-num\">Q" + (idx + 1) + " &mdash; " + (isCorrect ? "Correct" : isUnanswered ? "Unanswered" : "Incorrect") + "</span>\n";
      content += "                    <p class=\"question-text\">" + q.text.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</p>\n";
      content += "                </div>\n";
      
      if (q.contextMaterial) {
        content += "                <div class=\"context-box\">\n";
        content += "                    <strong>Reference Context:</strong><br>\n";
        content += "                    " + q.contextMaterial.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "\n";
        content += "                </div>\n";
      }

      content += "                <div class=\"options-list\">\n";

      q.options.forEach((opt, oIdx) => {
        const optionLetter = String.fromCharCode(65 + oIdx);
        let specialClass = "";
        let markerText = "<span>" + optionLetter + ".</span> ";
        
        if (oIdx === q.correctIndex) {
          specialClass = "correct-choice";
          markerText = "<span class=\"badge-marker\">✓</span> ";
        } else if (oIdx === userAnsIdx && !isCorrect) {
          specialClass = "user-wrong-choice";
          markerText = "<span class=\"badge-marker\">✗</span> ";
        }
        
        content += "                    <div class=\"option-val " + specialClass + "\">\n";
        content += "                        " + markerText + " " + opt.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "\n";
        content += "                    </div>\n";
      });

      content += "                </div>\n";
      content += "\n";
      content += "                <div class=\"explanation-block\">\n";
      content += "                    <p class=\"label-title\">Explanatory Feed</p>\n";
      content += "                    <p class=\"explanation-text\">" + q.explanation.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</p>\n";
      if (q.inquiryPrompt) {
        content += "                    <p class=\"inquiry-drift\">💡 Explore Further: " + q.inquiryPrompt.replace(/</g, "&lt;").replace(/>/g, "&gt;") + "</p>\n";
      }
      content += "                </div>\n";
      content += "            </div>\n";
    });

    content += "        </div>\n";
    content += "\n";
    content += "        <div class=\"footer\">\n";
    content += "            Generated via Scholar Earn Intelligent Adaptive Sandbox. Powered by Gemini AI Experts.\n";
    content += "        </div>\n";
    content += "    </div>\n";
    content += "\n";
    content += "    <button class=\"print-btn-float\" onclick=\"window.print()\">\n";
    content += "        <svg style=\"width:20px;height:20px\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\">\n";
    content += "            <polyline points=\"6 9 6 2 18 2 18 9\"></polyline>\n";
    content += "            <path d=\"M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2\"></path>\n";
    content += "            <rect x=\"6\" y=\"14\" width=\"12\" height=\"8\"></rect>\n";
    content += "        </svg>\n";
    content += "        Print / Save PDF\n";
    content += "    </button>\n";
    content += "\n";
    content += "</body>\n";
    content += "</html>";

    const blob = new Blob([content], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeQuiz.profile.name.replace(/\s+/g, '_')}_ScholarEarn_ReportCard.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // --- Custom Material Handlers ---
  const handleAddNewMaterial = (title: string, content: string) => {
    const newItem: StudyMaterial = {
      id: Math.random().toString(36).substring(7),
      title,
      content,
      timestamp: Date.now()
    };
    const updated = [...materials, newItem];
    saveMaterialsToIndexedDb(updated);
    setSelectedMaterialId(newItem.id);
    setIsMaterialManagerOpen(false);
  };

  const handleDeleteMaterial = (id: string) => {
    const updated = materials.filter(m => m.id !== id);
    saveMaterialsToIndexedDb(updated);
    if (selectedMaterialId === id) setSelectedMaterialId(null);
  };

  // --- Clock HUD Draggable Handlers ---
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    originalPos.current = { x: e.clientX - dragOffset.x, y: e.clientY - dragOffset.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging.current) return;
    setDragOffset({
      x: e.clientX - originalPos.current.x,
      y: e.clientY - originalPos.current.y
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  // --- Reset to profile launch ---
  const handleResetToMenu = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
    setCurrentScreen(AppScreen.ENTRY);
    setCurrentQuestions([]);
    setCurrentQuestionIndex(0);
    setFeedback(null);
    setClassroomSession(null);
  };

  return (
    <div className="min-h-screen text-on-background flex flex-col antialiased select-none pb-8 select-text">
      {/* Dynamic Background Overlays */}
      <div className="absolute inset-0 pointer-events-none z-[-1] overflow-hidden">
        <div className="absolute top-[10%] left-[25%] w-[350px] h-[350px] bg-primary/15 rounded-full blur-[100px]" />
        <div className="absolute bottom-[10%] right-[25%] w-[450px] h-[450px] bg-secondary/15 rounded-full blur-[120px]" />
      </div>

      {/* Floatable Draggable Timer HUD inside Quiz */}
      {currentScreen === AppScreen.QUIZ && timeLeft > 0 && isTimerRunning && (
        <div 
          style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
          className="fixed z-50 p-2 cursor-grab active:cursor-grabbing hover:scale-105 transition-transform"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div className="bg-surface border-2 border-primary rounded-2xl p-3 shadow-2xl flex items-center gap-2.5 outline-none font-headline font-extrabold text-xs uppercase italic tracking-widest text-primary neon-glow-primary">
            <Clock className="w-5 h-5 text-primary animate-pulse" />
            <span>Clock: {timeLeft}s</span>
          </div>
        </div>
      )}

      {/* Unified Global Header Controls */}
      <header className="border-b border-white/10 px-6 py-4 flex flex-wrap justify-between items-center bg-surface/50 backdrop-blur-md sticky top-0 z-40 gap-3">
        <div className="flex items-center gap-3">
          <GraduationCap className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-xl md:text-2xl font-headline font-extrabold text-on-surface tracking-tighter italic">ScholarEarn</h1>
            <p className="text-[9px] uppercase tracking-widest text-primary/80 font-headline font-bold">Academic Diagnosis Platform</p>
          </div>
        </div>

        {/* Global HUD customisations on font scale and centered visual templates */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Display Font Size Controller */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1">
            <button 
              onClick={() => setFontSizeMode('normal')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-headline font-extrabold uppercase transition-all ${fontSizeMode === 'normal' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              title="Normal font scale"
            >
              Std Font
            </button>
            <button 
              onClick={() => setFontSizeMode('large')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-headline font-extrabold uppercase transition-all ${fontSizeMode === 'large' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              title="Large font size scaling for tablets"
            >
              Large
            </button>
            <button 
              onClick={() => setFontSizeMode('tv')}
              className={`px-3 py-1.5 rounded-lg text-[9px] font-headline font-extrabold uppercase transition-all ${fontSizeMode === 'tv' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              title="Mega font scaling for larger classroom TVs"
            >
              TV / Mega
            </button>
          </div>

          {/* Centering Layout Controller */}
          <div className="flex items-center bg-white/5 border border-white/10 rounded-xl p-1">
            <button 
              onClick={() => setScreenViewMode('standard')}
              className={`p-1.5 rounded-lg transition-all ${screenViewMode === 'standard' ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant'}`}
              title="Centered Focused Box layout"
            >
              <Laptop className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setScreenViewMode('presentation')}
              className={`p-1.5 rounded-lg transition-all ${screenViewMode === 'presentation' ? 'bg-secondary text-on-secondary' : 'text-on-surface-variant'}`}
              title="Full width classroom TV Presentation mode"
            >
              <Monitor className="w-4 h-4" />
            </button>
          </div>

          {/* Firebase Authentication HUD Button */}
          {authLoading ? (
            <RefreshCw className="w-5 h-5 text-on-surface-variant animate-spin" />
          ) : currentUser ? (
            <div className="flex items-center gap-2 bg-white/5 border border-white/10 p-1.5 rounded-xl text-xs">
              <span className="text-on-surface font-body font-bold hidden md:inline">{currentUser.displayName || currentUser.email}</span>
              <button 
                onClick={async () => {
                  await logout();
                  setCurrentScreen(AppScreen.ENTRY);
                }} 
                className="text-error/80 hover:text-error p-1 rounded-lg"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button 
                onClick={handleGoogleLogin}
                className="px-3.5 py-1.5 bg-primary/10 border border-primary/20 hover:bg-primary/20 text-on-surface rounded-xl font-headline font-extrabold text-[9px] uppercase tracking-wider transition-colors"
                title="Sign in with your Google account"
              >
                Google Join
              </button>
              <button 
                onClick={handleAnonymousLogin}
                className="px-3.5 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-on-surface-variant font-headline font-extrabold text-[9px] uppercase tracking-wider rounded-xl transition-colors"
                title="Instantly sign in as a guest with 1 tap (Highly recommended inside iframe preview)"
              >
                Guest Join
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Dynamic Sandbox Auth Error Handler Banner */}
      {authError && (
        <div className="max-w-4xl mx-auto w-full px-4 md:px-6 pt-4">
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-surface-container-highest/90 border border-secondary/30 p-4 rounded-2xl shadow-xl flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 text-xs font-body"
          >
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-secondary/15 text-secondary flex-none mt-0.5 animate-pulse">
                <Info className="w-4 h-4" />
              </div>
              <div className="space-y-1 text-left">
                <p className="font-headline font-extrabold text-on-surface text-sm">Preview Iframe Sandbox Warning</p>
                <p className="text-on-surface-variant leading-relaxed">{authError}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 justify-end flex-none">
              <button 
                onClick={handleAnonymousLogin}
                className="px-3 py-2 bg-primary text-on-primary font-headline font-bold text-[9px] uppercase tracking-wider rounded-xl hover:bg-primary/90 active:scale-95 transition-all shadow-md"
              >
                Instant Guest Account
              </button>
              <button 
                onClick={() => setAuthError(null)}
                className="p-1.5 text-on-surface-variant hover:text-on-surface bg-white/5 rounded-xl border border-white/5 hover:border-white/10"
                title="Dismiss warning"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Adaptive Screen Margins & Centered layouts based on configurations */}
      <main className={`flex-1 flex flex-col justify-start transition-all duration-300 ${
        screenViewMode === 'standard' 
          ? 'max-w-4xl mx-auto w-full px-4 md:px-6 pt-6' 
          : screenViewMode === 'presentation'
            ? 'max-w-7xl mx-auto w-full px-6 pt-4'
            : 'max-w-md mx-auto w-full px-4 pt-10'
      }`}>
        <AnimatePresence mode="wait">
          
          {/* PROFILE CONFIG / LAUNCHPAD SCREEN */}
          {currentScreen === AppScreen.ENTRY && (
            <motion.div 
              key="landing"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full space-y-6"
            >
              {/* Core centring wrapper with NO top margins */}
              <div className="bg-surface-container-lowest/80 glass-card p-6 md:p-10 rounded-[2.5rem] shadow-2xl border border-white/10 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-24 h-24 bg-primary/10 rounded-bl-[4rem] flex items-center justify-center border-l border-b border-white/5">
                  <Sparkles className="w-8 h-8 text-primary animate-pulse" />
                </div>

                <div className="space-y-1.5">
                  <h2 className="text-2xl md:text-3xl font-headline font-extrabold text-on-surface tracking-tighter tv-text-shadow italic">Mastery Entrance</h2>
                  <p className="text-[10px] uppercase tracking-widest text-primary font-headline font-extrabold">Students' Learning & Diagnosis Platform</p>
                </div>

                <div className="bg-primary/5 border border-primary/20 rounded-2xl p-4 flex gap-3 text-xs text-on-surface-variant font-body">
                  <div className="p-2 bg-primary/10 text-primary rounded-xl h-fit">
                    <Sparkles className="w-4 h-4 animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-headline font-extrabold text-on-surface text-sm">Welcome to ScholarEarn!</p>
                    <p>This is a dedicated <strong>student's learning platform</strong> designed for syllabus alignment, customized practice, and diagnostic self-evaluation without any unnecessary pressure. Define your study program below to generate instant quizzes!</p>
                  </div>
                </div>

                {/* Horizontal Education Level Selector */}
                <div className="space-y-2">
                  <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5 text-primary" /> Educational Stream Level
                  </label>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                    {[
                      { id: 'School', label: 'School (K-12)', icon: BookOpen, desc: 'Grades 1-12 & Boards' },
                      { id: 'College', label: 'College Degree', icon: GraduationCap, desc: 'UG / PG & Majors' },
                      { id: 'Competitive', label: 'Competitive Exam', icon: Trophy, desc: 'JEE/NEET/UPSC/Certs' },
                      { id: 'Personal', label: 'Personal Study', icon: Sparkles, desc: 'General & Skill Topics' }
                    ].map(tab => {
                      const Icon = tab.icon;
                      const isSelected = (user.educationLevel || 'School') === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => {
                            let defaultBoard = '';
                            let defaultGrade = '';
                            let defaultSubject = '';
                            let defaultTopic = '';
                            if (tab.id === 'School') {
                              defaultBoard = 'CBSE';
                              defaultGrade = '10';
                              defaultSubject = 'Science';
                              defaultTopic = 'Light - Reflection and Refraction';
                            } else if (tab.id === 'College') {
                              defaultBoard = 'Computer Science & Engineering';
                              defaultGrade = 'Third Year';
                              defaultSubject = 'Artificial Intelligence';
                              defaultTopic = 'Neural Networks and Deep Learning';
                            } else if (tab.id === 'Competitive') {
                              defaultBoard = 'UPSC Civil Services';
                              defaultGrade = 'Prelims Phase';
                              defaultSubject = 'Indian Polity & Constitution';
                              defaultTopic = 'Fundamental Rights';
                            } else {
                              defaultBoard = 'Professional Level';
                              defaultGrade = 'Self-Paced';
                              defaultSubject = 'Creative Writing';
                              defaultTopic = 'Plot Structure and Narrative Arc';
                            }
                            syncLocalUserProfile({
                              ...user,
                              educationLevel: tab.id as any,
                              board: defaultBoard,
                              gradeLevel: defaultGrade,
                              subject: defaultSubject,
                              topic: defaultTopic
                            });
                          }}
                          className={`flex flex-col items-start justify-between p-3.5 rounded-2xl border text-left transition-all ${
                            isSelected 
                              ? 'bg-primary/20 border-primary text-on-surface shadow-lg shadow-primary/10' 
                              : 'bg-surface-container-lowest/60 border-white/5 text-on-surface-variant hover:border-white/10 hover:bg-surface-container-lowest/80'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={`w-4 h-4 ${isSelected ? 'text-primary' : 'text-on-surface-variant/70'}`} />
                            <span className="text-xs font-headline font-bold">{tab.label}</span>
                          </div>
                          <span className="text-[9px] text-on-surface-variant/60 block mt-1 line-clamp-1">{tab.desc}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Name field */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                      <User className="w-3 h-3" /> Student Name
                    </label>
                    <input 
                      type="text" 
                      value={user.name}
                      onChange={e => syncLocalUserProfile({ ...user, name: e.target.value })}
                      className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      placeholder="Enter student initials or full username"
                    />
                  </div>

                  {/* Syllabus / Board or Degree Major fields - Rendered Conditionally */}
                  {(user.educationLevel || 'School') === 'School' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                        <ShieldCheck className="w-3 h-3" /> Curriculum Syllabus Board (K-12)
                      </label>
                      <select
                        value={user.board || 'CBSE'}
                        onChange={e => syncLocalUserProfile({ ...user, board: e.target.value })}
                        className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      >
                        <option value="CBSE">CBSE Board (Academic Year 2026-2027)</option>
                        <option value="ICSE">ICSE Board Standards</option>
                        <option value="IGCSE">International IGCSE Syllabus</option>
                        <option value="State Board">Indian State Board Curriculum</option>
                      </select>
                    </div>
                  )}

                  {(user.educationLevel || 'School') === 'College' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                        <GraduationCap className="w-3 h-3" /> Degree major / Academic Stream
                      </label>
                      <input
                        type="text"
                        value={user.board || ''}
                        onChange={e => syncLocalUserProfile({ ...user, board: e.target.value })}
                        placeholder="e.g. Computer Science, Medicine, MBA, Arts"
                        className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      />
                    </div>
                  )}

                  {(user.educationLevel || 'School') === 'Competitive' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                        <Trophy className="w-3 h-3" /> Target Exam / Board
                      </label>
                      <input
                        type="text"
                        value={user.board || ''}
                        onChange={e => syncLocalUserProfile({ ...user, board: e.target.value })}
                        placeholder="e.g. UPSC CSE, IIT JEE, NEET, GATE, AWS"
                        className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      />
                    </div>
                  )}

                  {(user.educationLevel || 'School') === 'Personal' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                        <Sparkles className="w-3 h-3" /> Skill Focus Level
                      </label>
                      <select
                        value={user.board || 'Advanced Masterclass'}
                        onChange={e => syncLocalUserProfile({ ...user, board: e.target.value })}
                        className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      >
                        <option value="Beginner Theory">Beginner Theory & Foundational</option>
                        <option value="Intermediate Applied">Intermediate Applied Skills</option>
                        <option value="Advanced Masterclass">Advanced Masterclass & Pro</option>
                        <option value="Specialized Vocations">Specialized Practice / Vocation</option>
                      </select>
                    </div>
                  )}

                  {/* Year or Grade selection dropdowns - Rendered Conditionally */}
                  {(user.educationLevel || 'School') === 'School' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                        <Trophy className="w-3 h-3" /> Class Grade Target
                      </label>
                      <select
                        value={user.gradeLevel}
                        onChange={e => syncLocalUserProfile({ ...user, gradeLevel: e.target.value })}
                        className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      >
                        {Array.from({ length: 12 }, (_, i) => (
                          <option key={i+1} value={(i+1).toString()}>Grade {i+1} (National Standard)</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {(user.educationLevel || 'School') === 'College' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                        <Trophy className="w-3 h-3" /> Academic Year Stage
                      </label>
                      <select
                        value={user.gradeLevel}
                        onChange={e => syncLocalUserProfile({ ...user, gradeLevel: e.target.value })}
                        className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      >
                        <option value="First Year">First Year (UG Core)</option>
                        <option value="Second Year">Second Year (Intermediate UG)</option>
                        <option value="Third Year">Third Year (Pre-Final Core)</option>
                        <option value="Fourth Year">Fourth Year (Final Capstone)</option>
                        <option value="Postgraduate Year 1">Postgraduate Year 1 (Master's Focus)</option>
                        <option value="Postgraduate Year 2">Postgraduate Year 2 (Advanced Master's)</option>
                      </select>
                    </div>
                  )}

                  {(user.educationLevel || 'School') === 'Competitive' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                        <Shield className="w-3 h-3" /> Exam Tier Stage
                      </label>
                      <select
                        value={user.gradeLevel}
                        onChange={e => syncLocalUserProfile({ ...user, gradeLevel: e.target.value })}
                        className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      >
                        <option value="Prelims / Foundation">Prelims / Phase 1 Foundations</option>
                        <option value="Mains / Advanced">Mains / Phase 2 Written Exams</option>
                        <option value="All-In-One Mock Tier">All-In-One Full Blueprint Syllabus</option>
                        <option value="Professional Credentials">Professional Credentials Assessment</option>
                      </select>
                    </div>
                  )}

                  {(user.educationLevel || 'School') === 'Personal' && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                        <ShieldCheck className="w-3 h-3" /> Study Rhythm
                      </label>
                      <select
                        value={user.gradeLevel}
                        onChange={e => syncLocalUserProfile({ ...user, gradeLevel: e.target.value })}
                        className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      >
                        <option value="Self-Paced Study">Self-Paced / Casual Learning</option>
                        <option value="Professional Upskilling">Professional Fast-Track</option>
                        <option value="Weekend Bootcamps">Weekend Focus Study</option>
                        <option value="Daily Academic Habit">Daily Habit Reinforcement</option>
                      </select>
                    </div>
                  )}

                  {/* Academic focus dropdown */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                      <Lightbulb className="w-3 h-3" /> Academic Learning Focus
                    </label>
                    <select
                      value={user.focus}
                      onChange={e => syncLocalUserProfile({ ...user, focus: e.target.value as StudyFocus })}
                      className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                    >
                      <option value={StudyFocus.SYLLABUS}>Core Chapter Syllabus Coverage</option>
                      <option value={StudyFocus.PATTERN}>Official Board Sample Blueprint Papers</option>
                      <option value={StudyFocus.TOPICS}>Ground Custom Sub-Topics</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  {/* Target subject */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                      <HelpCircle className="w-3 h-3" /> Target Subject
                    </label>
                    <input 
                      type="text" 
                      value={user.subject}
                      onChange={e => syncLocalUserProfile({ ...user, subject: e.target.value })}
                      className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      placeholder="Science, Mathematics, Tamil, etc."
                    />
                  </div>

                  {/* Dynamic subtopic */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" /> Diagnostics Topic Focus
                    </label>
                    <input 
                      type="text" 
                      value={user.topic}
                      onChange={e => syncLocalUserProfile({ ...user, topic: e.target.value })}
                      className="w-full px-4 py-3 text-sm rounded-xl bg-surface border border-white/10 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary font-body font-bold"
                      placeholder="Type the focus topic"
                    />
                  </div>
                </div>

                {/* Grounding Materials Module triggers */}
                <div className="flex gap-3 justify-between items-center p-4 bg-white/5 rounded-2xl border border-white/5 text-xs">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-secondary" />
                    <div>
                      <p className="font-headline font-bold text-on-surface">Selective Grounding Context</p>
                      <p className="text-[10px] text-on-surface-variant mt-0.5">
                        {selectedMaterialId 
                          ? `Context set: ${materials.find(m => m.id === selectedMaterialId)?.title}` 
                          : "Curriculum mode active without override texts."}
                      </p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsMaterialManagerOpen(true)}
                    className="px-4 py-2 rounded-xl text-[10px] uppercase font-headline font-extrabold tracking-wider bg-secondary/10 text-secondary hover:bg-secondary/20 transition-all border border-secondary/20"
                  >
                    Manage Library
                  </button>
                </div>
              </div>

              {/* Launcher Hub Buttons */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Button 
                  onClick={initiateDiagnosis}
                  className="h-16 rounded-2xl text-[11px] font-headline font-extrabold uppercase tracking-widest hover:scale-[1.01] transition-transform shadow-2xl shadow-primary/30 flex items-center justify-center gap-2 neon-glow-primary col-span-2"
                >
                  <Rocket className="w-4 h-4" /> Start Adaptive Diagnostic
                </Button>
                <Button 
                  onClick={launchClassroomBattleSetup}
                  variant="secondary"
                  className="h-16 rounded-2xl text-[11px] font-headline font-extrabold uppercase tracking-widest flex items-center justify-center gap-2 overlay-dark col-span-1"
                >
                  <Users className="w-4 h-4" /> Classroom Battle
                </Button>
              </div>

              {/* Records and achievements quick panels */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <button 
                  onClick={() => setCurrentScreen(AppScreen.PROGRESS)}
                  className="bg-surface-container-lowest/40 border border-white/5 p-4 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 transition-all"
                >
                  <Trophy className="w-5 h-5 text-tertiary mb-1" />
                  <span className="text-[9px] uppercase font-headline font-extrabold text-on-surface-variant">Level {user.level}</span>
                  <span className="text-[8px] font-black uppercase text-tertiary tracking-wider mt-0.5">Diagnosed Rank</span>
                </button>
                <div className="bg-surface-container-lowest/40 border border-white/5 p-4 rounded-xl flex flex-col items-center justify-center">
                  <Award className="w-5 h-5 text-primary mb-1" />
                  <span className="text-[9px] uppercase font-headline font-extrabold text-on-surface-variant">{user.totalQuizzes}</span>
                  <span className="text-[8px] font-black uppercase text-primary tracking-wider mt-0.5">Diagnose Runs</span>
                </div>
                <div className="bg-surface-container-lowest/40 border border-white/5 p-4 rounded-xl flex flex-col items-center justify-center">
                  <Sparkles className="w-5 h-5 text-secondary mb-1" />
                  <span className="text-[9px] uppercase font-headline font-extrabold text-on-surface-variant">{user.totalPoints} pts</span>
                  <span className="text-[8px] font-black uppercase text-secondary tracking-wider mt-0.5">Points Tallied</span>
                </div>
                <button 
                  onClick={() => setCurrentScreen(AppScreen.PROGRESS)}
                  className="bg-surface-container-lowest/40 border border-white/5 p-4 rounded-xl flex flex-col items-center justify-center cursor-pointer hover:border-primary/40 transition-all"
                >
                  <FileText className="w-5 h-5 text-white mb-1" />
                  <span className="text-[9px] uppercase font-headline font-extrabold text-on-surface-variant">View logs</span>
                  <span className="text-[8px] font-black uppercase text-white tracking-wider mt-0.5">Diagnostic Records</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* CLASSROOM CONFIGURE WINDOWS */}
          {currentScreen === AppScreen.CLASSROOM_SETUP && (
            <motion.div key="classroom_config" className="w-full">
              <ClassroomSetupView 
                onStart={startClassroomSession}
                onCancel={handleResetToMenu}
              />
            </motion.div>
          )}

          {/* PROGRESS LOGGING HISTORIES */}
          {currentScreen === AppScreen.PROGRESS && (
            <motion.div key="user_progress" className="w-full">
              <ProgressScreen 
                user={user}
                onBack={handleResetToMenu}
              />
            </motion.div>
          )}

          {/* MULTI_CHANNEL LOADING SYNTHESISER */}
          {currentScreen === AppScreen.LOADING && (
            <motion.div 
              key="loading_diag"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full py-16 flex flex-col items-center justify-center text-center space-y-8"
            >
              <div className="relative">
                <div className="w-24 h-24 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <GraduationCap className="w-10 h-10 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-bounce" />
              </div>
              
              <div className="space-y-3 max-w-md mx-auto">
                <h3 className="text-xl font-headline font-extrabold text-on-surface tracking-tighter italic">{loadingMessage}</h3>
                <div className="w-full h-2.5 bg-surface-container-lowest rounded-full overflow-hidden">
                  <div 
                    style={{ width: `${loadingProgress}%` }}
                    className="h-full bg-primary transition-all duration-300 rounded-full neon-glow-primary"
                  />
                </div>
                <p className="text-[9px] font-headline font-extrabold uppercase tracking-widest text-on-surface-variant">Step: {loadingProgress}% Completed</p>
              </div>
            </motion.div>
          )}

          {/* ACTIVE ADAPTIVE QUIZ WORKSPACE */}
          {currentScreen === AppScreen.QUIZ && currentQuestions.length > 0 && (
            <motion.div 
              key="active_diagnose"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full flex flex-col gap-6"
            >
              {/* Core responsive font HUD based headers */}
              <div className="flex justify-between items-center gap-3 border-b border-white/5 pb-4">
                <div>
                  <h3 className="text-sm font-headline font-extrabold text-primary uppercase tracking-widest italic flex items-center gap-1.5">
                    <Rocket className="w-4 h-4 text-primary" /> Active Diagnose
                  </h3>
                  <p className="text-[10px] text-on-surface-variant font-body font-bold uppercase mt-1">Topic focus: {user.topic}</p>
                </div>

                <div className="flex items-center gap-2">
                  {classroomSession && (
                    <div className="bg-secondary/10 border border-secondary/20 p-2.5 rounded-xl text-center flex items-center gap-2">
                      <span className="text-[10px] font-headline font-bold text-secondary uppercase italic">Team Turn:</span>
                      <span className="text-xs font-headline font-extrabold text-on-surface">{classroomSession.groups[classroomSession.currentGroupIndex].name}</span>
                    </div>
                  )}
                  <span className="text-xs font-headline font-extrabold text-on-surface bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                    Question {currentQuestionIndex + 1}/5
                  </span>
                </div>
              </div>

              {/* Dynamic Columns for Case study materials or diagram instructions */}
              <div className={`transition-all duration-300 w-full ${
                currentQuestions[currentQuestionIndex].contextMaterial 
                  ? 'lg:flex lg:gap-6 items-start' 
                  : 'flex flex-col items-center justify-start'
              }`}>
                {/* Visual context readouts (Left panel if present) */}
                {currentQuestions[currentQuestionIndex].contextMaterial && (
                  <div className={`transition-all duration-300 mb-5 lg:mb-0 w-full ${
                    fontSizeMode === 'normal' 
                      ? 'lg:w-[35%]' 
                      : fontSizeMode === 'large' 
                        ? 'lg:w-[42%]' 
                        : 'lg:w-[48%]'
                  }`}>
                    <div className="p-5 rounded-2xl bg-surface border border-white/10 h-fit space-y-3">
                      <div className="flex items-center gap-2 opacity-80 text-secondary">
                        <Eye className="w-4 h-4 text-secondary" />
                        <span className="text-[10px] font-headline font-extrabold uppercase tracking-widest italic">Reference Study Material</span>
                      </div>
                      <p className={`text-on-surface font-body font-bold leading-relaxed italic opacity-90 transition-all duration-300 ${
                        fontSizeMode === 'normal' 
                          ? 'text-xs md:text-sm max-h-[30vh] overflow-y-auto no-scrollbar' 
                          : fontSizeMode === 'large' 
                            ? 'text-sm md:text-base max-h-[40vh] overflow-y-auto no-scrollbar' 
                            : 'text-base md:text-lg max-h-[50vh] overflow-y-auto no-scrollbar'
                      }`}>
                        {currentQuestions[currentQuestionIndex].contextMaterial}
                      </p>
                    </div>
                  </div>
                )}

                {/* Question option mappings (Right Panel) */}
                <div className="space-y-4 flex flex-col w-full flex-1">
                  
                  {/* Real Question Textbox */}
                  <div className="bg-surface-container-lowest/80 glass-card p-5 md:p-7 rounded-2xl border border-white/10 relative overflow-hidden flex justify-between items-start gap-3">
                    <div className={`absolute left-0 top-0 h-full w-2 ${currentQuestions[currentQuestionIndex].type === QuestionType.WORD_PROBLEM ? 'bg-tertiary' : 'bg-primary'}`} />
                    <h2 className={`font-body font-black text-on-surface flex-1 leading-snug tv-text-shadow transition-all duration-300 ${
                      fontSizeMode === 'normal' 
                        ? 'text-sm md:text-base lg:text-lg' 
                        : fontSizeMode === 'large' 
                          ? 'text-base md:text-lg lg:text-xl' 
                          : 'text-lg md:text-xl lg:text-[1.6rem] leading-snug font-black'
                    }`}>
                      {currentQuestions[currentQuestionIndex].text}
                    </h2>

                    {/* Audio action controller bar */}
                    <div className="flex gap-2 flex-none items-center self-start">
                      {/* Speech Speak Aloud Toggles */}
                      <button 
                        onClick={handleReadAloud}
                        type="button"
                        className={`p-2.5 rounded-xl border flex-none ${isReadingAloud ? 'bg-primary text-on-primary border-primary animate-pulse' : 'bg-surface text-primary border-primary/20 hover:bg-primary/10'} transition-all`}
                        title={isReadingAloud ? "Stop speech synthesizer" : "Speak question aloud"}
                      >
                        {isReadingAloud ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                      </button>

                      {/* Interactive Correct/Incorrect Sound Effects Toggle */}
                      <button 
                        onClick={() => setSoundEffectsEnabled(!soundEffectsEnabled)}
                        type="button"
                        className={`p-2.5 rounded-xl border flex-none bg-surface transition-all relative ${soundEffectsEnabled ? 'border-primary/20 hover:bg-primary/10 text-primary' : 'border-white/5 opacity-50 text-on-surface-variant'}`}
                        title={soundEffectsEnabled ? "Mute interactive sound effects" : "Unmute interactive sound effects"}
                      >
                        <div className="relative">
                          {soundEffectsEnabled ? <Volume2 className="w-4 h-4 text-primary" /> : <VolumeX className="w-4 h-4 text-on-surface-variant/40" />}
                          <span className="absolute -top-1.5 -right-2 text-[7px] font-extrabold uppercase text-primary font-mono tracking-tight bg-surface px-0.5 rounded">
                            {soundEffectsEnabled ? "FX" : "—"}
                          </span>
                        </div>
                      </button>

                      {/* Web Speech API Record Answer Button */}
                      <button 
                        onClick={toggleRecordingAnswer}
                        type="button"
                        disabled={!!feedback}
                        className={`p-2.5 rounded-xl border flex-none relative transition-all ${
                          isRecordingAnswer 
                            ? 'bg-error text-white border-error animate-pulse shadow-error/30 shadow-lg' 
                            : 'bg-surface text-secondary border-secondary/20 hover:bg-secondary/10'
                        } ${!!feedback ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
                        title={isRecordingAnswer ? "Stop speech transcription" : "Speak to record and submit your answer"}
                      >
                        {isRecordingAnswer ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        {isRecordingAnswer && (
                          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white"></span>
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Web Speech Feedback Notification Area */}
                  <div className="space-y-2">
                    {isRecordingAnswer && (
                      <motion.div 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-[11px] font-body bg-error/15 border border-error/20 p-3 rounded-2xl flex items-center justify-between gap-3 text-error"
                      >
                        <div className="flex items-center gap-2 text-left">
                          <span className="flex h-2.5 w-2.5 relative flex-none animate-bounce">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-error opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-error"></span>
                          </span>
                          <p className="font-headline font-bold uppercase tracking-wider animate-pulse">Microphone active: Say option label (e.g., "Option A") or exact option text now...</p>
                        </div>
                        <div className="flex gap-0.5 items-center flex-none">
                          <span className="w-0.5 h-3 bg-error animate-bounce" style={{ animationDelay: '0.1s' }} />
                          <span className="w-0.5 h-4.5 bg-error animate-bounce" style={{ animationDelay: '0.2s' }} />
                          <span className="w-0.5 h-2.5 bg-error animate-bounce" style={{ animationDelay: '0.3s' }} />
                          <span className="w-0.5 h-4 bg-error animate-bounce" style={{ animationDelay: '0.4s' }} />
                        </div>
                      </motion.div>
                    )}

                    {spokenAnswerText && (
                      <motion.div 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs font-body bg-secondary/15 border border-secondary/20 p-3 rounded-2xl text-on-surface flex items-center gap-2.5"
                      >
                        <Mic className="w-4 h-4 text-secondary flex-none animate-pulse" />
                        <p className="font-bold text-left">
                          Transcribed Answer: <span className="text-secondary italic font-extrabold font-headline">"{spokenAnswerText}"</span>
                        </p>
                      </motion.div>
                    )}

                    {speechError && (
                      <motion.div 
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="text-xs font-body bg-error/15 border border-error/20 p-3 rounded-2xl text-error flex items-center gap-2.5"
                      >
                        <Info className="w-4 h-4 text-error flex-none" />
                        <p className="font-bold text-left">{speechError}</p>
                      </motion.div>
                    )}
                  </div>

                  {/* Options Matrix Selection List */}
                  <div className="grid grid-cols-1 gap-2.5">
                    {currentQuestions[currentQuestionIndex].options.map((opt, i) => {
                      let btnStyle = "bg-surface-container-lowest/60 border-white/5 text-on-surface hover:border-primary/50 hover:bg-primary/5";
                      if (feedback) {
                        if (i === currentQuestions[currentQuestionIndex].correctIndex) {
                          btnStyle = "bg-secondary/20 border-secondary text-on-surface ring-2 ring-secondary/20 neon-glow-secondary";
                        } else if (i === feedback.selected && !feedback.isCorrect) {
                          btnStyle = "bg-error/20 border-error text-on-surface ring-2 ring-error/20 neon-glow-error";
                        } else {
                          btnStyle = "opacity-30 grayscale pointer-events-none";
                        }
                      }

                      return (
                        <button
                          key={i}
                          disabled={!!feedback}
                          onClick={() => handleOptionClick(i)}
                          type="button"
                          className={`w-full text-left rounded-2xl border-2 transition-all flex items-center group shadow-md ${
                            fontSizeMode === 'normal' 
                              ? 'p-3 gap-3 min-h-[50px] text-xs md:text-sm' 
                              : fontSizeMode === 'large' 
                                ? 'p-4 gap-4 min-h-[60px] text-sm md:text-base' 
                                : 'p-5 gap-5 min-h-[75px] text-base md:text-[1.35rem]'
                          } ${btnStyle} active:scale-[0.98]`}
                        >
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center font-headline font-black transition-all ${
                            feedback && i === currentQuestions[currentQuestionIndex].correctIndex 
                              ? 'bg-secondary text-on-secondary shadow-md' 
                              : 'bg-surface-container text-outline group-hover:bg-primary/20 group-hover:text-primary'
                          }`}>
                            {String.fromCharCode(65 + i)}
                          </span>
                          <span className="font-body font-bold text-on-surface">{opt}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Feedback description dialog */}
                  {feedback && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-5 bg-surface rounded-2xl border border-white/10 space-y-3 shadow-2xl mt-1.5"
                    >
                      <div className="flex justify-between items-center border-b border-white/5 pb-2">
                        <p className="text-[10px] font-headline font-extrabold uppercase text-secondary tracking-widest italic">DIAGNOSTIC EXPLANATORY CORRELATION</p>
                      </div>
                      <p className={`font-body font-bold text-on-surface-variant leading-relaxed italic transition-all duration-300 ${
                        fontSizeMode === 'normal' ? 'text-xs md:text-sm' : fontSizeMode === 'large' ? 'text-sm md:text-base' : 'text-base md:text-[1.3rem]'
                      }`}>
                        {currentQuestions[currentQuestionIndex].explanation}
                      </p>

                      {currentQuestions[currentQuestionIndex].inquiryPrompt && (
                        <div className="mt-2.5 p-3.5 bg-primary/10 rounded-xl border border-primary/20 space-y-1">
                          <p className="text-[9px] font-headline font-extrabold uppercase text-primary tracking-wider flex items-center gap-1.5 italic">
                            <Sparkles className="w-3.5 h-3.5 text-primary" /> Future Diagnostic Exploration
                          </p>
                          <p className="text-xs font-body font-bold text-on-surface italic">
                            {currentQuestions[currentQuestionIndex].inquiryPrompt}
                          </p>
                        </div>
                      )}

                      <Button onClick={handleNextQuizQuestion} className="h-14 rounded-2xl text-[10px] font-headline font-extrabold uppercase tracking-widest shadow-2xl shadow-primary/30 neon-glow-primary">
                        Next Challenge
                      </Button>
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* RESULTS CARD FOR SINGLE PARTICIPANTS */}
          {currentScreen === AppScreen.RESULTS && activeQuiz && (
            <motion.div 
              key="quiz_outcome"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full text-center space-y-6 py-6"
            >
              <div className="space-y-2">
                <div className="flex justify-center">
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                  >
                    <Rocket className="w-24 h-24 text-primary neon-glow-primary" />
                  </motion.div>
                </div>
                <h2 className="text-3xl md:text-5xl font-headline font-extrabold text-on-surface tracking-tighter tv-text-shadow italic">Diagnostic Concluded!</h2>
                <p className="text-[10px] uppercase font-headline font-bold text-primary tracking-[0.2em] italic">Grade {user.gradeLevel} Master Course Progress</p>
              </div>

              <div className="bg-surface-container-lowest/80 glass-card p-6 md:p-10 rounded-[3rem] shadow-2xl border border-white/10 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-primary/10 border border-primary/25 rounded-2xl p-4 md:p-6 text-center">
                    <p className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-primary italic">Correct Evaluations</p>
                    <p className="text-3xl md:text-5xl font-headline font-extrabold text-on-surface mt-1">{activeQuiz.score}<span className="text-xs md:text-lg text-primary/50">/5</span></p>
                  </div>
                  <div className="bg-tertiary/10 border border-tertiary/25 rounded-2xl p-4 md:p-6 text-center">
                    <p className="text-[10px] font-headline font-extrabold uppercase tracking-widest text-tertiary italic">Diagnose Accrual</p>
                    <p className="text-3xl md:text-5xl font-headline font-extrabold text-on-surface mt-1">+{activeQuiz.score * 10} pts</p>
                  </div>
                </div>

                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-1.5 text-xs text-left">
                  <p className="font-headline font-extrabold text-on-surface uppercase tracking-wider">Expert Evaluator Recommendation</p>
                  <p className="font-body font-bold text-on-surface-variant leading-relaxed">
                    {activeQuiz.score === 5 
                      ? "Flawless score! Your conceptual foundation is rock-solid. You are authorized to step up progressive level challenges." 
                      : activeQuiz.score >= 3 
                        ? "Competent coverage! Focus on explanations mapped in wrong choices to reinforce board diagnostics." 
                        : "Requires review. Ingest related source textbook readings inside the Library to ground future diagnostics."}
                  </p>
                </div>

                {/* PDF & TXT Dynamic Exporters */}
                <div className="p-5 bg-gradient-to-br from-primary/5 to-tertiary/5 rounded-3xl border border-primary/20 space-y-3.5 text-left">
                  <div className="flex items-center gap-2.5">
                    <Award className="w-5 h-5 text-primary" />
                    <div>
                      <h4 className="font-headline font-extrabold text-on-surface text-xs uppercase tracking-wide">Scholar Earn Student Registry</h4>
                      <p className="text-[10px] text-on-surface-variant font-medium">Verify or download your finalized progress metrics below.</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1.5">
                    <button
                      onClick={downloadHtmlReport}
                      type="button"
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-primary hover:bg-primary/95 text-on-primary rounded-xl font-headline font-extrabold text-[10px] uppercase tracking-wider transition-all active:scale-95 shadow-md shadow-primary/20 cursor-pointer"
                    >
                      <Download className="w-4 h-4" />
                      Print / Save Board PDF
                    </button>
                    <button
                      onClick={downloadTextReport}
                      type="button"
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-white/5 border border-white/10 hover:bg-white/10 text-on-surface rounded-xl font-headline font-extrabold text-[10px] uppercase tracking-wider transition-all active:scale-95 cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-tertiary" />
                      Download Text Report
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <Button onClick={initiateDiagnosis} className="h-14 rounded-2xl font-headline font-extrabold uppercase tracking-widest text-xs shadow-2xl shadow-primary/40 col-span-2">
                  Retake Diagnosis
                </Button>
                <Button onClick={handleResetToMenu} variant="outline" className="h-14 rounded-2xl font-headline font-extrabold uppercase tracking-widest text-[10px]">
                  Close Panel
                </Button>
              </div>
            </motion.div>
          )}

          {/* LEADERBOARDS PODIUM FOR CLASSROOM BATTLES */}
          {currentScreen === AppScreen.LEADERBOARD && classroomSession && (
            <motion.div 
              key="multi_ladder"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full text-center space-y-6 py-6"
            >
              <div className="space-y-1.5">
                <Trophy className="w-16 h-16 text-tertiary mx-auto neon-glow-tertiary animate-bounce" />
                <h2 className="text-2xl md:text-4xl font-headline font-extrabold text-on-surface tracking-tighter italic tv-text-shadow">Battle Grid Overlord</h2>
                <p className="text-[10px] font-headline font-extrabold tracking-widest uppercase text-secondary">Classroom multiplayer arena standings</p>
              </div>

              <div className="bg-surface-container-lowest/80 glass-card p-6 md:p-10 rounded-[2.5rem] shadow-2xl border border-white/10 space-y-6">
                <div className="space-y-3">
                  {classroomSession.groups
                    .slice()
                    .sort((a,b) => b.score - a.score)
                    .map((group, i) => (
                      <div 
                        key={group.id} 
                        className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${
                          i === 0 
                            ? 'bg-tertiary/15 border-tertiary/50 text-on-surface ring-2 ring-tertiary/20' 
                            : i === 1 
                              ? 'bg-secondary/15 border-secondary/30 text-on-surface' 
                              : 'bg-white/5 border-white/5'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-headline font-black ${
                            i === 0 ? 'bg-tertiary text-on-tertiary' : i === 1 ? 'bg-secondary text-on-secondary' : 'bg-surface-container text-outline'
                          }`}>
                            {i + 1}
                          </span>
                          <span className="text-sm font-headline font-extrabold uppercase italic tracking-wide">{group.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-headline font-extrabold">{group.score}/5</p>
                          <p className="text-[8px] uppercase tracking-wide text-on-surface-variant font-bold">Tallied Solutions</p>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="flex gap-3">
                <Button 
                  onClick={() => startClassroomSession(classroomSession.groups, classroomSession.questionTimer || 45)}
                  className="h-14 rounded-2xl font-headline font-extrabold text-xs uppercase tracking-widest hover:scale-[1.01] transition-transform shadow-2xl shadow-primary/30 col-span-2"
                >
                  Relaunch Arena
                </Button>
                <Button onClick={handleResetToMenu} variant="outline" className="h-14 rounded-2xl font-headline font-extrabold text-[10px] uppercase tracking-widest">
                  Main Entrance
                </Button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Floatable study resource hub dialog popups */}
      <AnimatePresence>
        {isMaterialManagerOpen && (
          <MaterialManager 
            isOpen={isMaterialManagerOpen}
            onClose={() => setIsMaterialManagerOpen(false)}
            materials={materials}
            onAdd={handleAddNewMaterial}
            onDelete={handleDeleteMaterial}
            onSelect={setSelectedMaterialId}
            selectedId={selectedMaterialId}
          />
        )}
      </AnimatePresence>

      {/* Nice success sound effect notification popup overlay */}
      <MotivationalPopup 
        show={showMotivationalPopup}
        label={motivationText}
        onClose={() => setShowMotivationalPopup(false)}
      />
    </div>
  );
}
