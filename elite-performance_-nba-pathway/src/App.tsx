/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LayoutDashboard, 
  Calendar as CalendarIcon, 
  Library as LibraryIcon, 
  User as UserIcon, 
  Flame, 
  Dumbbell, 
  Play, 
  Plus, 
  Search, 
  Target, 
  Zap, 
  Brain, 
  Star, 
  ChevronRight,
  TrendingUp,
  TrendingDown,
  Film,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  Settings,
  LogOut,
  Trophy,
  Activity,
  MessageSquare,
  Clock,
  BarChart3,
  Calendar,
  User,
  ArrowRight,
  ShoppingBag,
  Bell,
  X,
  Filter
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ReferenceLine,
  AreaChart,
  Area
} from 'recharts';
import { format, startOfWeek, addDays, isSameDay, parseISO, addMinutes, subDays } from 'date-fns';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query, 
  orderBy, 
  addDoc, 
  updateDoc, 
  deleteDoc,
  Timestamp,
  getDoc,
  limit,
  writeBatch
} from 'firebase/firestore';
import Markdown from 'react-markdown';

import { db, auth } from './firebase';
import { cn } from './lib/utils';

// --- Error Handling ---

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6 text-center space-y-4">
          <AlertCircle className="text-error" size={64} />
          <h2 className="font-headline text-2xl uppercase font-bold">Something went wrong</h2>
          <p className="font-body text-on-surface-variant max-w-md">
            {this.state.error?.message?.startsWith('{') 
              ? "A database error occurred. Please check your connection or permissions." 
              : "An unexpected error occurred."}
          </p>
          <button 
            onClick={() => window.location.reload()}
            className="bg-primary text-on-primary-fixed px-6 py-3 rounded-xl font-label font-bold uppercase"
          >
            Reload App
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// --- Types ---

type Screen = 'dashboard' | 'schedule' | 'library' | 'iq' | 'career' | 'profile' | 'skill-log' | 'shop' | 'skill-tests';

interface SkillTest {
  id: string;
  discipline: 'shooting' | 'dribbling' | 'finishing' | 'athleticism' | 'iq';
  title: string;
  description: string;
  drills: {
    name: string;
    target: number; // The "Elite" benchmark
    unit: string;
    description: string;
  }[];
}

interface NutritionEntry {
  id: string;
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fats: number;
  mealName: string;
}

interface UserProfile {
  uid: string;
  displayName: string;
  photoURL: string;
  role: 'athlete' | 'coach' | 'admin';
  stats: {
    dribbling: number;
    shooting: number;
    finishing: number;
    iq: number;
    athleticism: number;
  };
  careerPhase: 'LOCAL' | 'AAU' | 'EYBL' | 'NCAA' | 'PRO' | 'NBA';
  streak: number;
  points: number;
  height?: number;
  weight?: number;
  age?: number;
  gender?: 'male' | 'female';
  achievements: string[]; // IDs of unlocked achievements
  completedScenarios: string[]; // IDs of ALL completed IQ scenarios
  lastIQReset: string; // ISO date string
  lastSkillTestDate?: string; // ISO date string
  nutritionLog?: NutritionEntry[];
  notifications?: AppNotification[];
  avatarItems: string[];
  equippedItems: { [key: string]: string };
}

interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: 'reminder' | 'alert' | 'update' | 'achievement';
  timestamp: string;
  read: boolean;
}

interface SkillTestResult {
  id: string;
  testId: string;
  timestamp: string;
  results: {
    drillName: string;
    score: number;
    unit: string;
  }[];
}

interface Workout {
  id: string;
  title: string;
  description: string;
  drills: string[]; // Drill IDs
  category: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  duration: number;
  userId: string | null; // null for premade
  exercises?: { name: string, sets: number, reps: number, duration?: number, weight?: number }[];
  type?: 'standard' | 'timer' | 'interval';
  intervalConfig?: {
    work: number;
    rest: number;
    rounds: number;
  };
}

interface Achievement {
  id: string;
  title: string;
  description: string;
  points: number;
  icon: string;
  requirement: {
    type: 'points' | 'streak' | 'sessions' | 'iq';
    value: number;
  };
}

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'Apparel' | 'Equipment' | 'Boost';
  subcategory?: 'Shoes' | 'Jersey' | 'Shorts' | 'Headband' | 'Sleeve' | 'Skin' | 'Hair' | 'Socks' | 'Wristband';
  image?: string;
}

interface IQScenario {
  id: string;
  title: string;
  description: string;
  videoUrl?: string;
  options: {
    text: string;
    isCorrect: boolean;
    feedback: string;
  }[];
  points: number;
}

interface ScheduleSession {
  id: string;
  type: 'Basketball' | 'Ball handling' | 'Shooting' | 'Finishing' | 'Strength' | 'Explosiveness' | 'Cardio' | 'IQ Study' | 'Team Practice' | 'Rest' | 'Game' | 'Meeting' | 'Recovery' | 'Film Session' | 'School' | 'Event' | 'Personal';
  startTime: Date;
  duration: number;
  intensity: number;
  completed: boolean;
  notes: string;
  xpAwarded?: boolean;
  workoutId?: string;
  exercises?: { name: string, sets: number, reps: number, weight?: number }[];
  intervalConfig?: { work: number, rest: number, rounds: number };
}

interface SkillLog {
  id: string;
  sessionId: string;
  skillType: 'dribbling' | 'shooting' | 'finishing' | 'iq' | 'defense';
  criteria: {
    c1: number;
    c2: number;
    c3: number;
    c4: number;
  };
  timestamp: Date;
}

interface Drill {
  id: string;
  title: string;
  category: string;
  intensity: 'Low' | 'Medium' | 'High';
  description: string;
  videoUrl?: string;
  tags: string[];
  image?: string;
}

// --- Constants ---

const SKILL_CRITERIA = {
  dribbling: ['Control', 'Speed', 'Protection', 'Fluidity'],
  shooting: ['Form', 'Consistency', 'Range', 'Rhythm'],
  finishing: ['Balance', 'Control', 'Angle', 'Timing'],
  iq: ['Timing', 'Read', 'Choice', 'Awareness'],
  defense: ['Positioning', 'Footwork', 'Reaction', 'Intensity']
};

const CAREER_PATHWAY = [
  { id: 'LOCAL', label: 'LOCAL', sub: 'Foundation Phase' },
  { id: 'AAU', label: 'AAU', sub: 'Exposure Phase' },
  { id: 'EYBL', label: 'EYBL', sub: 'Elite Circuit' },
  { id: 'NCAA', label: 'NCAA', sub: 'Collegiate Mastery' },
  { id: 'PRO', label: 'PRO', sub: 'International / G-League' },
  { id: 'NBA', label: 'NBA', sub: 'The Association' },
];

const PROGRAMS = [
  {
    id: 'prog-vert',
    title: 'Vert Maximizer',
    description: 'Explosive power and vertical leap focus.',
    days: [
      { day: 1, title: 'Power Base', exercises: [{ name: 'Squat Jumps', sets: 4, reps: 10 }, { name: 'Box Jumps', sets: 3, reps: 8 }, { name: 'Calf Raises', sets: 4, reps: 15 }], duration: 45 },
      { day: 2, title: 'Elasticity', exercises: [{ name: 'Pogo Jumps', sets: 4, reps: 20 }, { name: 'Depth Jumps', sets: 3, reps: 5 }, { name: 'Broad Jumps', sets: 3, reps: 8 }], duration: 45 },
      { day: 3, title: 'Max Reach', exercises: [{ name: 'Approach Jumps', sets: 5, reps: 3 }, { name: 'Rim Grazers', sets: 4, reps: 5 }, { name: 'Core Stability', sets: 3, reps: 15 }], duration: 60 },
    ]
  },
  {
    id: 'prog-handles',
    title: 'Obsidian Handles',
    description: 'Tighten your handle and master the live dribble.',
    days: [
      { day: 1, title: 'Pound Control', exercises: [{ name: 'Low Pounds', sets: 3, reps: 50 }, { name: 'Shoulder Pounds', sets: 3, reps: 30 }, { name: 'Pocket Dribbles', sets: 3, reps: 20 }], duration: 40 },
      { day: 2, title: 'Shiftiness', exercises: [{ name: 'Crossover Speed', sets: 4, reps: 40 }, { name: 'In-and-Outs', sets: 4, reps: 30 }, { name: 'Hesitation Moves', sets: 3, reps: 15 }], duration: 45 },
      { day: 3, title: 'Combo Mastery', exercises: [{ name: 'Cross-Between-Behind', sets: 5, reps: 10 }, { name: 'Live Dribble Reads', sets: 4, reps: 5 }, { name: 'Full Court Handles', sets: 3, reps: 2 }], duration: 50 },
    ]
  },
  {
    id: 'prog-marksman',
    title: 'Elite Marksman',
    description: 'Perfect your form and extend your range.',
    days: [
      { day: 1, title: 'Form & Fluidity', exercises: [{ name: 'One-Handed Form', sets: 5, reps: 10 }, { name: 'Elbow Jumpers', sets: 5, reps: 20 }, { name: 'Free Throws', sets: 3, reps: 10 }], duration: 50 },
      { day: 2, title: 'Range Extension', exercises: [{ name: 'Mid-Range Pullups', sets: 4, reps: 15 }, { name: 'Corner 3s', sets: 4, reps: 10 }, { name: 'Wing 3s', sets: 4, reps: 10 }], duration: 60 },
      { day: 3, title: 'Game Speed', exercises: [{ name: 'Catch & Shoot', sets: 5, reps: 10 }, { name: 'Off-Screen Shots', sets: 4, reps: 8 }, { name: 'Deep 3s', sets: 3, reps: 5 }], duration: 60 },
    ]
  }
];
const SKILL_TESTS: SkillTest[] = [
  {
    id: 'test-shooting-1',
    discipline: 'shooting',
    title: 'Elite Marksman Test',
    description: 'Test your accuracy from different ranges on the court.',
    drills: [
      { name: 'Free Throws', target: 10, unit: 'makes', description: 'Take 10 free throws.' },
      { name: 'Mid-Range Jumpers', target: 10, unit: 'makes', description: 'Take 10 jumpers from the elbow.' },
      { name: '3-Pointers', target: 10, unit: 'makes', description: 'Take 10 shots from behind the arc.' }
    ]
  },
  {
    id: 'test-dribbling-1',
    discipline: 'dribbling',
    title: 'Handle Mastery Test',
    description: 'Evaluate your ball control and speed under pressure.',
    drills: [
      { name: 'Figure-8 (30s)', target: 25, unit: 'reps', description: 'Continuous figure-8 dribble around legs.' },
      { name: 'Crossover Speed (30s)', target: 40, unit: 'reps', description: 'Low, wide crossovers at max speed.' },
      { name: 'Behind-the-Back (30s)', target: 30, unit: 'reps', description: 'Continuous behind-the-back dribbles.' }
    ]
  },
  {
    id: 'test-finishing-1',
    discipline: 'finishing',
    title: 'Rim Protector Challenge',
    description: 'Test your ability to finish at the rim with touch and control.',
    drills: [
      { name: 'Mikan Drill (60s)', target: 30, unit: 'makes', description: 'Continuous alternating layups.' },
      { name: 'Reverse Layups', target: 10, unit: 'makes', description: 'Take 10 reverse layups (5 each side).' },
      { name: 'Floaters', target: 10, unit: 'makes', description: 'Take 10 floaters from the paint.' }
    ]
  },
  {
    id: 'test-athleticism-1',
    discipline: 'athleticism',
    title: 'Combine Physicals',
    description: 'Measure your raw physical tools and explosiveness.',
    drills: [
      { name: 'Vertical Jump', target: 35, unit: 'inches', description: 'Measure your max vertical reach.' },
      { name: 'Push-ups (Max)', target: 50, unit: 'reps', description: 'Max push-ups in one set with good form.' },
      { name: '20-Yard Dash', target: 2.8, unit: 'seconds', description: 'Sprint 20 yards as fast as possible.' }
    ]
  },
  {
    id: 'test-iq-1',
    discipline: 'iq',
    title: 'Court Awareness Test',
    description: 'Evaluate your decision making and reaction time.',
    drills: [
      { name: 'Reaction Time', target: 0.2, unit: 'seconds', description: 'Average reaction time to visual cues.' },
      { name: 'Pattern Recognition', target: 10, unit: 'correct', description: 'Identify 10 offensive sets correctly.' },
      { name: 'Clock Management', target: 5, unit: 'scenarios', description: 'Solve 5 end-of-game scenarios.' }
    ]
  }
];

const RECOMMENDED_VOLUME = {
  'Basketball': 5,
  'Ball handling': 4,
  'Shooting': 4,
  'Finishing': 3,
  'Strength': 2,
  'Explosiveness': 2,
  'Cardio': 2,
  'IQ Study': 3,
};

// --- AI Service ---

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

async function getScheduleAnalysis(sessions: ScheduleSession[]) {
  // Group sessions by day for better context
  const sessionsByDay: Record<string, string[]> = {};
  sessions.forEach(s => {
    const day = format(s.startTime, 'EEEE');
    if (!sessionsByDay[day]) sessionsByDay[day] = [];
    sessionsByDay[day].push(`${s.type} (${s.duration}m, Intensity: ${s.intensity})`);
  });

  const sessionSummary = Object.entries(sessionsByDay)
    .map(([day, sess]) => `${day}: ${sess.join(', ')}`)
    .join('\n');
  
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze this full weekly basketball training schedule for a teenage point guard aiming for the NBA:
    
    ${sessionSummary}
    
    Provide:
    1. A Weekly Schedule Quality Score (0-100).
    2. 3-5 actionable suggestions for optimization focusing on the balance across the entire week.
    3. A warning if there's overtraining, insufficient rest, or lack of variety in the weekly plan.
    4. A summary of the week's focus.
    
    Return in JSON format.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          score: { type: Type.NUMBER },
          suggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          warning: { type: Type.STRING },
          summary: { type: Type.STRING }
        },
        required: ["score", "suggestions", "summary"]
      }
    }
  });
  
  return JSON.parse(response.text);
}

// --- Components ---

const NavItem = ({ 
  icon: Icon, 
  label, 
  active, 
  onClick 
}: { 
  icon: any, 
  label: string, 
  active: boolean, 
  onClick: () => void 
}) => (
  <button 
    onClick={onClick}
    className={cn(
      "flex flex-col items-center justify-center transition-all duration-300",
      active ? "text-secondary scale-110" : "text-on-surface-variant opacity-60 hover:text-white"
    )}
  >
    <Icon size={24} strokeWidth={active ? 2.5 : 2} fill={active ? "currentColor" : "none"} fillOpacity={active ? 0.2 : 0} />
    <span className="font-label text-[10px] font-bold uppercase tracking-tight mt-1">{label}</span>
  </button>
);

const Header = ({ user, profile, onLogout, onToggleNotifications }: { 
  user: FirebaseUser | null, 
  profile: UserProfile | null, 
  onLogout: () => void,
  onToggleNotifications: () => void
}) => (
  <header className="fixed top-0 w-full z-50 flex justify-between items-center px-6 h-16 bg-background border-b border-outline-variant/15 backdrop-blur-md">
    <div className="flex items-center gap-4">
      {user && (
        <div className="w-10 h-10 rounded-full overflow-hidden border border-primary/30">
          <img 
            className="w-full h-full object-cover" 
            src={user.photoURL || "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=1974&auto=format&fit=crop"} 
            alt="Athlete Profile"
            referrerPolicy="no-referrer"
          />
        </div>
      )}
      <h1 className="font-headline uppercase tracking-tighter font-bold text-primary text-xl tracking-widest">ELITE PERFORMANCE</h1>
    </div>
    <div className="flex items-center gap-6">
      {profile && (
        <div className="hidden sm:flex items-center gap-2 bg-surface-container-highest px-3 py-1 rounded-full border border-outline-variant/20">
          <Zap size={14} className="text-secondary" />
          <span className="font-headline font-black text-xs">{profile.points} XP</span>
        </div>
      )}
      <button 
        onClick={onToggleNotifications}
        className="relative p-2 hover:bg-surface-container-highest rounded-full transition-colors"
      >
        <Bell size={20} className="text-on-surface-variant" />
        <span className="absolute top-1 right-1 w-2 h-2 bg-secondary rounded-full border-2 border-background"></span>
      </button>
      {user ? (
        <button onClick={onLogout} className="text-on-surface-variant hover:text-white transition-colors">
          <LogOut size={20} />
        </button>
      ) : (
        <span className="font-label text-xs font-bold text-secondary tracking-widest bg-secondary/10 px-3 py-1 rounded-full border border-secondary/20 flex items-center gap-2">
          GUEST MODE
        </span>
      )}
    </div>
  </header>
);

const LoginScreen = ({ onLogin }: { onLogin: () => void }) => (
  <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-background relative overflow-hidden">
    <div className="absolute inset-0 opacity-10 pointer-events-none">
      <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_center,_var(--color-primary)_0%,_transparent_70%)] blur-3xl"></div>
    </div>
    
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="z-10 text-center space-y-8 max-w-md"
    >
      <div className="w-24 h-24 bg-primary rounded-3xl flex items-center justify-center mx-auto shadow-2xl shadow-primary/40 rotate-12">
        <Trophy size={48} className="text-on-primary-fixed -rotate-12" />
      </div>
      
      <div className="space-y-4">
        <h1 className="font-headline text-5xl font-black uppercase tracking-tighter leading-none">
          THE ROAD TO <br/> <span className="text-secondary">THE LEAGUE</span>
        </h1>
        <p className="font-body text-on-surface-variant text-sm">
          Your personal AI coach for elite basketball development. Track skills, manage your schedule, and dominate the competition.
        </p>
      </div>
      
      <button 
        onClick={onLogin}
        className="w-full py-4 bg-white text-black font-label font-bold rounded-xl flex items-center justify-center gap-3 hover:bg-secondary transition-all active:scale-95 shadow-xl"
      >
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/layout/google.svg" className="w-6 h-6" alt="Google" />
        CONTINUE WITH GOOGLE
      </button>
      
      <p className="font-label text-[10px] text-outline uppercase tracking-widest">
        By continuing, you agree to the terms of elite performance
      </p>
    </motion.div>
  </div>
);

const NutritionTracker = ({ profile, onAddEntry, targets }: { 
  profile: UserProfile | null, 
  onAddEntry: (entry: Partial<NutritionEntry>) => void,
  targets: { calories: number, protein: number }
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const todayEntries = profile?.nutritionLog?.filter(e => e.date === today) || [];
  
  const totals = todayEntries.reduce((acc, curr) => ({
    calories: acc.calories + curr.calories,
    protein: acc.protein + curr.protein,
    carbs: acc.carbs + curr.carbs,
    fats: acc.fats + curr.fats,
  }), { calories: 0, protein: 0, carbs: 0, fats: 0 });

  // Calculate daily history for the last 7 days
  const dailyHistory = useMemo(() => {
    if (!profile?.nutritionLog) return [];
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
      const entries = profile.nutritionLog!.filter(e => e.date === d);
      return {
        date: format(subDays(new Date(), 6 - i), 'MMM d'),
        calories: entries.reduce((sum, e) => sum + e.calories, 0),
        protein: entries.reduce((sum, e) => sum + e.protein, 0),
      };
    });
    return days;
  }, [profile?.nutritionLog]);

  const getFoodFeedback = (calories: number, protein: number) => {
    if (protein > 20 && calories < 500) return "High Protein / Lean - Elite choice!";
    if (calories > 800) return "High Calorie - Good for bulking, watch portions.";
    if (protein < 5 && calories > 300) return "High Carb/Fat - Limit for better performance.";
    return "Balanced choice.";
  };

  return (
    <div className="glass-card p-6 rounded-2xl space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="font-headline text-lg font-bold uppercase">Fueling Station</h3>
        <button 
          onClick={() => setIsAdding(true)}
          className="w-8 h-8 rounded-full bg-secondary text-on-secondary flex items-center justify-center hover:scale-110 transition-all"
        >
          <Plus size={18} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1">
          <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Calories</p>
          <p className="font-headline text-2xl font-black">{totals.calories} <span className="text-xs text-on-surface-variant">/ {targets.calories}</span></p>
          <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
            <div className="h-full bg-secondary transition-all duration-500" style={{ width: `${Math.min(100, (totals.calories / targets.calories) * 100)}%` }}></div>
          </div>
        </div>
        <div className="space-y-1">
          <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Protein</p>
          <p className="font-headline text-2xl font-black">{totals.protein}g <span className="text-xs text-on-surface-variant">/ {targets.protein}g</span></p>
          <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all duration-500" style={{ width: `${Math.min(100, (totals.protein / targets.protein) * 100)}%` }}></div>
          </div>
        </div>
      </div>

      {/* Daily Tracker Chart */}
      <div className="h-32 w-full pt-4">
        <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mb-2">7-Day Calorie Trend</p>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={dailyHistory}>
            <Bar dataKey="calories" fill="var(--color-secondary)" radius={[2, 2, 0, 0]} opacity={0.6} />
            <ReferenceLine y={targets.calories} stroke="var(--color-primary)" strokeDasharray="3 3" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3 max-h-48 overflow-y-auto no-scrollbar">
        {todayEntries.length === 0 ? (
          <p className="text-center py-4 font-body text-xs text-on-surface-variant italic">No meals logged today.</p>
        ) : (
          todayEntries.map(entry => (
            <div key={entry.id} className="bg-surface-container p-3 rounded-xl flex justify-between items-center group">
              <div>
                <p className="font-headline font-bold text-sm uppercase">{entry.mealName}</p>
                <p className="font-body text-[10px] text-on-surface-variant">{entry.calories} kcal • {entry.protein}g P</p>
                <p className="font-label text-[8px] text-secondary uppercase tracking-tighter mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {getFoodFeedback(entry.calories, entry.protein)}
                </p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-surface-container-highest flex items-center justify-center">
                <Dumbbell size={14} className="text-on-surface-variant opacity-40" />
              </div>
            </div>
          ))
        )}
      </div>

      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-surface-container-low w-full max-w-md rounded-3xl p-8 z-10 relative border border-outline-variant/20"
            >
              <h3 className="font-headline text-2xl font-black uppercase tracking-tighter mb-6">Log Meal</h3>
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                onAddEntry({
                  mealName: formData.get('mealName') as string,
                  calories: Number(formData.get('calories')),
                  protein: Number(formData.get('protein')),
                  carbs: Number(formData.get('carbs')),
                  fats: Number(formData.get('fats')),
                  date: today
                });
                setIsAdding(false);
              }} className="space-y-4">
                <div className="space-y-1">
                  <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Meal Name</label>
                  <input name="mealName" required className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface" placeholder="e.g. Post-Workout Shake" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Calories</label>
                    <input name="calories" type="number" required className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface" />
                  </div>
                  <div className="space-y-1">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Protein (g)</label>
                    <input name="protein" type="number" required className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface" />
                  </div>
                  <div className="space-y-1">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Carbs (g)</label>
                    <input name="carbs" type="number" required className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface" />
                  </div>
                  <div className="space-y-1">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Fats (g)</label>
                    <input name="fats" type="number" required className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface" />
                  </div>
                </div>
                <button type="submit" className="w-full py-4 bg-primary text-on-primary-fixed font-label font-bold rounded-xl uppercase tracking-widest mt-4 hover:bg-primary-fixed-dim transition-all">LOG MEAL</button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const OnboardingModal = ({ onSubmit }: { onSubmit: (data: { height: number, weight: number, age: number, gender: 'male' | 'female' }) => void }) => {
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="absolute inset-0 bg-black/95 backdrop-blur-md"
      />
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-surface-container-low w-full max-w-lg rounded-[2.5rem] p-10 z-10 relative border border-secondary/20 shadow-[0_0_100px_rgba(var(--color-secondary-rgb),0.1)]"
      >
        <div className="space-y-6 text-center mb-10">
          <div className="w-20 h-20 bg-secondary/10 rounded-3xl flex items-center justify-center mx-auto mb-6">
            <Activity className="text-secondary" size={40} />
          </div>
          <h2 className="font-headline text-4xl font-black uppercase tracking-tighter leading-none">ELITE FUELING<br/><span className="text-secondary">CALIBRATION</span></h2>
          <p className="font-body text-on-surface-variant text-sm max-w-xs mx-auto">We need your biometrics to calculate your custom daily calorie and protein targets for maximum performance.</p>
        </div>

        <form onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          onSubmit({
            height: Number(formData.get('height')),
            weight: Number(formData.get('weight')),
            age: Number(formData.get('age')),
            gender: formData.get('gender') as 'male' | 'female'
          });
        }} className="space-y-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Height (cm)</label>
              <input name="height" type="number" required placeholder="185" className="w-full bg-surface-container border-none rounded-2xl p-4 font-label text-lg text-on-surface focus:ring-2 focus:ring-secondary transition-all" />
            </div>
            <div className="space-y-2">
              <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Weight (kg)</label>
              <input name="weight" type="number" required placeholder="85" className="w-full bg-surface-container border-none rounded-2xl p-4 font-label text-lg text-on-surface focus:ring-2 focus:ring-secondary transition-all" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Age</label>
              <input name="age" type="number" required placeholder="19" className="w-full bg-surface-container border-none rounded-2xl p-4 font-label text-lg text-on-surface focus:ring-2 focus:ring-secondary transition-all" />
            </div>
            <div className="space-y-2">
              <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Gender</label>
              <select name="gender" required className="w-full bg-surface-container border-none rounded-2xl p-4 font-label text-lg text-on-surface focus:ring-2 focus:ring-secondary transition-all">
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
          </div>

          <button type="submit" className="w-full py-5 bg-secondary text-on-secondary font-label font-black rounded-2xl uppercase tracking-[0.2em] hover:bg-secondary-fixed-dim transition-all shadow-xl shadow-secondary/20 mt-4">
            CALCULATE TARGETS
          </button>
        </form>
      </motion.div>
    </div>
  );
};

const NotificationsList = ({ notifications, onClose, onClearAll }: { notifications: any[], onClose: () => void, onClearAll: () => void }) => (
  <motion.div 
    initial={{ opacity: 0, y: 10, scale: 0.95 }}
    animate={{ opacity: 1, y: 0, scale: 1 }}
    exit={{ opacity: 0, y: 10, scale: 0.95 }}
    className="fixed top-20 right-6 w-80 bg-surface-container-high border border-outline-variant rounded-3xl shadow-2xl z-[60] overflow-hidden"
  >
    <div className="p-4 border-b border-outline-variant flex justify-between items-center bg-surface-container-highest">
      <h3 className="font-headline font-bold uppercase text-xs tracking-widest">Notifications</h3>
      <button onClick={onClose} className="p-1 hover:bg-surface-container rounded-full">
        <X size={16} />
      </button>
    </div>
    <div className="max-h-96 overflow-y-auto">
      {notifications.length === 0 ? (
        <div className="p-8 text-center">
          <Bell size={32} className="mx-auto text-on-surface-variant/20 mb-2" />
          <p className="text-xs text-on-surface-variant font-label uppercase tracking-widest">No new alerts</p>
        </div>
      ) : (
        notifications.map((n) => (
          <div key={n.id} className="p-4 border-b border-outline-variant last:border-0 hover:bg-surface-container transition-colors">
            <div className="flex gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                n.type === 'achievement' ? 'bg-secondary/20 text-secondary' : 
                n.type === 'workout' ? 'bg-primary/20 text-primary' : 'bg-surface-container-highest text-on-surface'
              }`}>
                {n.type === 'achievement' ? <Trophy size={14} /> : <Zap size={14} />}
              </div>
              <div>
                <p className="text-xs font-bold leading-tight mb-1">{n.title}</p>
                <p className="text-[10px] text-on-surface-variant leading-relaxed mb-2">{n.message}</p>
                <p className="text-[9px] text-on-surface-variant/60 font-label uppercase tracking-widest">
                  {format(n.timestamp, 'MMM dd • HH:mm')}
                </p>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
    {notifications.length > 0 && (
      <button 
        onClick={onClearAll}
        className="w-full p-3 text-[10px] font-label font-bold uppercase tracking-widest text-primary hover:bg-primary/5 transition-colors border-t border-outline-variant"
      >
        Clear All
      </button>
    )}
  </motion.div>
);

const Dashboard = ({ profile, sessions, setCurrentScreen, onAddNutrition, targets }: { 
  profile: UserProfile | null, 
  sessions: ScheduleSession[], 
  setCurrentScreen: (s: Screen) => void,
  onAddNutrition: (entry: Partial<NutritionEntry>) => void,
  targets: { calories: number, protein: number }
}) => {
  const [timeRange, setTimeRange] = useState<'week' | 'month' | 'year'>('week');

  const radarData = useMemo(() => [
    { subject: 'DRIBBLING', A: profile?.stats.dribbling || 50, fullMark: 100 },
    { subject: 'SHOOTING', A: profile?.stats.shooting || 50, fullMark: 100 },
    { subject: 'FINISHING', A: profile?.stats.finishing || 50, fullMark: 100 },
    { subject: 'IQ', A: profile?.stats.iq || 50, fullMark: 100 },
    { subject: 'ATHLETICISM', A: profile?.stats.athleticism || 50, fullMark: 100 },
  ], [profile]);

  const progressData = useMemo(() => {
    const now = new Date();
    let days = 7;
    if (timeRange === 'month') days = 30;
    if (timeRange === 'year') days = 365;

    const data = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = subDays(now, i);
      const dateStr = format(d, 'MMM dd');
      const sessionsOnDay = sessions.filter(s => isSameDay(s.startTime, d) && s.completed).length;
      data.push({
        name: dateStr,
        workouts: sessionsOnDay,
        xp: sessionsOnDay * 100 // Simplified XP tracking
      });
    }
    return data;
  }, [sessions, timeRange]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12 pb-24"
    >
      {/* Hero Section */}
      <section className="relative grid grid-cols-1 md:grid-cols-12 gap-8 items-end">
        <div className="md:col-span-8">
          {profile?.lastSkillTestDate && (new Date().getTime() - new Date(profile.lastSkillTestDate).getTime()) > 30 * 24 * 60 * 60 * 1000 && (
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="bg-secondary/20 border border-secondary/30 p-4 rounded-xl mb-6 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Activity className="text-secondary" size={20} />
                <p className="font-body text-xs font-bold uppercase tracking-tight">Monthly Skill Assessment Due!</p>
              </div>
              <button 
                onClick={() => setCurrentScreen('skill-tests')}
                className="bg-secondary text-on-secondary px-4 py-2 rounded-lg font-label text-[10px] font-bold uppercase tracking-widest"
              >
                TEST NOW
              </button>
            </motion.div>
          )}
          <p className="font-label text-secondary text-sm tracking-[0.2em] mb-2 uppercase">CURRENT PHASE: {profile?.careerPhase || 'LOCAL'}</p>
          <h2 className="font-headline text-6xl md:text-8xl font-black uppercase leading-[0.85] tracking-tighter mb-6">
            DOMINATE <br/> THE PAINT
          </h2>
          <div className="glass-card p-6 rounded-xl flex items-center gap-6 max-w-md">
            <div className="relative w-20 h-20">
              <svg className="w-full h-full transform -rotate-90">
                <circle className="text-surface-container-highest" cx="40" cy="40" fill="transparent" r="36" stroke="currentColor" strokeWidth="4"></circle>
                <circle className="text-secondary" cx="40" cy="40" fill="transparent" r="36" stroke="currentColor" strokeDasharray="226" strokeDashoffset={226 - (226 * Math.min(1, (profile?.points || 0) / 5000))} strokeWidth="4"></circle>
              </svg>
              <div className="absolute inset-0 flex items-center justify-center font-label font-bold text-lg text-glow">{Math.floor(Math.min(100, (profile?.points || 0) / 50))}%</div>
            </div>
            <div>
              <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">XP PROGRESS</p>
              <h4 className="font-headline text-2xl font-black">{profile?.points || 0} <span className="text-sm text-secondary">/ 5000</span></h4>
            </div>
          </div>
        </div>
        <div className="md:col-span-4 space-y-4">
          <button 
            onClick={() => setCurrentScreen('schedule')}
            className="w-full bg-primary text-on-primary-fixed p-6 rounded-2xl flex justify-between items-center group hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-primary/20"
          >
            <div className="text-left">
              <span className="font-label text-xs text-on-primary-fixed/60 uppercase tracking-widest block mb-1">READY TO GRIND?</span>
              <span className="font-headline font-black text-2xl uppercase">START TRAINING</span>
            </div>
            <ChevronRight size={32} />
          </button>
          <div className="bg-surface-container p-4 rounded-lg flex justify-between items-center">
            <span className="font-label text-xs text-on-surface-variant uppercase">NEXT SESSION</span>
            <span className="font-headline font-bold text-xl">
              {sessions.filter(s => !s.completed).sort((a, b) => a.startTime.getTime() - b.startTime.getTime())[0]?.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || 'NONE'}
            </span>
          </div>
        </div>
      </section>

      {/* Progress Chart */}
      <section className="space-y-6">
        <div className="flex justify-between items-end">
          <div>
            <h3 className="font-headline text-3xl font-bold tracking-tight uppercase">Performance Progress</h3>
            <p className="font-label text-xs text-on-surface-variant uppercase tracking-widest mt-1">Tracking your consistency</p>
          </div>
          <div className="flex gap-2 bg-surface-container p-1 rounded-xl border border-outline-variant">
            {(['week', 'month', 'year'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setTimeRange(range)}
                className={cn(
                  "px-4 py-2 rounded-lg font-label text-[10px] font-bold uppercase transition-all",
                  timeRange === range ? "bg-secondary text-on-secondary" : "text-on-surface-variant hover:bg-surface-container-highest"
                )}
              >
                {range}
              </button>
            ))}
          </div>
        </div>
        <div className="glass-card p-8 rounded-3xl h-[400px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={progressData}>
              <defs>
                <linearGradient id="colorXp" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--color-secondary)" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="var(--color-secondary)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
                minTickGap={30}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 10 }}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: 'var(--color-surface-container-high)', border: '1px solid var(--color-outline-variant)', borderRadius: '12px' }}
                itemStyle={{ color: 'var(--color-secondary)', fontSize: '12px', fontWeight: 'bold' }}
              />
              <Area 
                type="monotone" 
                dataKey="xp" 
                stroke="var(--color-secondary)" 
                strokeWidth={3}
                fillOpacity={1} 
                fill="url(#colorXp)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Career Pathway */}
      <section className="space-y-6">
        <div className="flex justify-between items-end">
          <h3 className="font-headline text-3xl font-bold tracking-tight uppercase">Career Pathway</h3>
          <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Road to the Association</span>
        </div>
        <div className="relative overflow-x-auto pb-6 mask-gradient no-scrollbar">
          <div className="flex gap-4 min-w-[1000px]">
            {CAREER_PATHWAY.map((step, idx) => {
              const currentIdx = CAREER_PATHWAY.findIndex(p => p.id === profile?.careerPhase);
              const status = idx < currentIdx ? 'completed' : idx === currentIdx ? 'current' : 'future';
              
              return (
                <div 
                  key={step.id}
                  className={cn(
                    "flex-1 p-6 rounded-lg border-l-2 transition-all",
                    status === 'completed' && "bg-surface-container-low border-on-surface-variant/30 opacity-40",
                    status === 'current' && "bg-surface-container border-l-4 border-secondary relative overflow-hidden",
                    status === 'future' && "bg-surface-container-low border-on-surface-variant/10 opacity-60"
                  )}
                >
                  {status === 'current' && (
                    <div className="absolute top-0 right-0 p-2">
                      <Star size={16} className="text-secondary" fill="currentColor" />
                    </div>
                  )}
                  <p className={cn(
                    "font-label text-[10px] mb-4",
                    status === 'current' ? "text-secondary" : "text-on-surface-variant"
                  )}>STEP 0{idx + 1}</p>
                  <p className="font-headline font-bold text-xl mb-1">{step.label}</p>
                  <p className="font-body text-xs text-on-surface-variant">{step.sub}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Skill Metrics & Nutrition */}
      <section className="grid grid-cols-1 md:grid-cols-12 gap-8">
        <div className="md:col-span-8 glass-card p-8 rounded-2xl flex flex-col items-center justify-center min-h-[400px]">
          <h3 className="font-headline text-xl font-bold uppercase mb-8 self-start">Skill DNA</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
              <PolarGrid stroke="rgba(255,255,255,0.1)" />
              <PolarAngleAxis dataKey="subject" tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10, fontFamily: 'Lexend' }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
              <Radar
                name="Athlete"
                dataKey="A"
                stroke="var(--color-secondary)"
                fill="var(--color-secondary)"
                fillOpacity={0.4}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
        
        <div className="md:col-span-4 space-y-8">
          <div className="space-y-4">
            <h3 className="font-headline text-xl font-bold uppercase mb-4">Performance Insights</h3>
            <div className="space-y-3">
              {[
                { label: 'DRIBBLING', value: profile?.stats.dribbling || 0, color: 'var(--color-secondary)', icon: Zap },
                { label: 'SHOOTING', value: profile?.stats.shooting || 0, color: 'var(--color-primary)', icon: Target },
                { label: 'FINISHING', value: profile?.stats.finishing || 0, color: 'var(--color-on-surface)', icon: Dumbbell },
                { label: 'IQ', value: profile?.stats.iq || 0, color: 'var(--color-tertiary)', icon: Brain },
              ].map((skill) => (
                <div key={skill.label} className="bg-surface-container p-4 rounded-xl flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${skill.color}20` }}>
                    <skill.icon size={20} style={{ color: skill.color }} />
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex justify-between items-end">
                      <span className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{skill.label}</span>
                      <span className="font-headline font-bold">{skill.value}%</span>
                    </div>
                    <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${skill.value}%` }}
                        className="h-full" 
                        style={{ backgroundColor: skill.color }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <NutritionTracker profile={profile} onAddEntry={onAddNutrition} targets={targets} />
        </div>
      </section>
    </motion.div>
  );
};

const beep = (frequency = 440, duration = 200) => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration / 1000);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration / 1000);
  } catch (e) {
    console.error("Audio context not supported", e);
  }
};

const WorkoutSessionPlayer = ({ workout, drills, onComplete, onQuit }: { 
  workout: Partial<Workout>, 
  drills: Drill[],
  onComplete: () => void,
  onQuit: () => void
}) => {
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [isDoingWorkout, setIsDoingWorkout] = useState(true);

  const allExercises = useMemo(() => {
    const drillExs = (workout.drills || []).map(id => {
      const d = drills.find(drill => drill.id === id);
      return { name: d?.title || 'Drill', sets: 1, reps: 1, type: 'drill' };
    });
    const customExs = (workout.exercises || []).map(ex => ({ ...ex, type: 'custom' }));
    return [...drillExs, ...customExs];
  }, [workout, drills]);

  if (workout.type === 'interval' && workout.intervalConfig) {
    return (
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-surface-container-low w-full max-w-2xl rounded-3xl p-12 z-10 relative border border-secondary/20 text-center"
      >
        <IntervalTimer 
          config={workout.intervalConfig} 
          onComplete={onComplete}
        />
        <button 
          onClick={onQuit}
          className="mt-8 px-8 py-4 bg-surface-container-highest text-on-surface font-label font-bold rounded-2xl uppercase tracking-widest hover:bg-outline-variant/30 transition-all text-sm"
        >
          QUIT
        </button>
      </motion.div>
    );
  }

  if (allExercises.length === 0) {
    return (
      <div className="text-center p-12 bg-surface-container rounded-3xl">
        <p className="font-body text-on-surface-variant mb-6">No exercises defined for this workout.</p>
        <button onClick={onQuit} className="bg-primary text-on-primary-fixed px-8 py-4 rounded-xl font-label text-xs font-bold uppercase">Close</button>
      </div>
    );
  }

  const currentEx = allExercises[currentExerciseIndex];

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 20 }}
      className="bg-surface-container-low w-full max-w-2xl rounded-3xl p-12 z-10 relative border border-secondary/20 text-center"
    >
      <div className="mb-12">
        <div className="flex justify-between items-center mb-8">
          <span className="font-label text-[10px] font-bold text-secondary uppercase tracking-[0.2em]">
            Exercise {currentExerciseIndex + 1} of {allExercises.length}
          </span>
          <div className="flex gap-1">
            {allExercises.map((_, i) => (
              <div 
                key={`progress-${i}`} 
                className={cn(
                  "h-1 rounded-full transition-all",
                  i === currentExerciseIndex ? "w-8 bg-secondary" : "w-2 bg-surface-container-highest"
                )}
              />
            ))}
          </div>
        </div>
        
        <motion.div
          key={currentExerciseIndex}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          className="space-y-6"
        >
          <div className="w-24 h-24 rounded-3xl bg-secondary/10 text-secondary flex items-center justify-center mx-auto mb-8">
            {currentEx.type === 'drill' ? <Zap size={48} /> : <Dumbbell size={48} />}
          </div>
          <h3 className="font-headline text-5xl font-black uppercase tracking-tighter leading-none">
            {currentEx.name}
          </h3>
          <div className="flex justify-center gap-12 mt-8">
            <div>
              <p className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Sets</p>
              <p className="font-headline text-4xl font-bold text-secondary">{currentEx.sets}</p>
            </div>
            <div className="w-px h-12 bg-outline-variant/20 self-center" />
            <div>
              <p className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-1">Reps/Mins</p>
              <p className="font-headline text-4xl font-bold text-secondary">{currentEx.reps}</p>
            </div>
          </div>
        </motion.div>
      </div>

      <div className="flex gap-4">
        <button 
          onClick={() => {
            if (currentExerciseIndex < allExercises.length - 1) {
              setCurrentExerciseIndex(prev => prev + 1);
            } else {
              onComplete();
            }
          }}
          className="flex-1 py-6 bg-primary text-on-primary-fixed font-label font-bold rounded-2xl uppercase tracking-widest hover:bg-primary-fixed-dim transition-all shadow-2xl shadow-primary/30 text-lg"
        >
          {currentExerciseIndex === allExercises.length - 1 ? 'FINISH WORKOUT' : 'NEXT EXERCISE'}
        </button>
        <button 
          onClick={onQuit}
          className="px-8 py-6 bg-surface-container-highest text-on-surface font-label font-bold rounded-2xl uppercase tracking-widest hover:bg-outline-variant/30 transition-all text-sm"
        >
          QUIT
        </button>
      </div>
    </motion.div>
  );
};

const IntervalTimer = ({ config, onComplete }: { config: { work: number, rest: number, rounds: number }, onComplete: () => void }) => {
  const [currentRound, setCurrentRound] = useState(1);
  const [phase, setPhase] = useState<'work' | 'rest'>('work');
  const [timeLeft, setTimeLeft] = useState(config.work);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isActive && timeLeft > 0) {
      timer = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      if (phase === 'work') {
        if (currentRound < config.rounds) {
          setPhase('rest');
          setTimeLeft(config.rest);
          beep(330, 500); // Lower beep for rest
        } else {
          setIsActive(false);
          beep(880, 1000); // High long beep for finish
          onComplete();
        }
      } else {
        setPhase('work');
        setCurrentRound(prev => prev + 1);
        setTimeLeft(config.work);
        beep(440, 500); // Standard beep for work
      }
    }
    return () => clearInterval(timer);
  }, [isActive, timeLeft, phase, currentRound, config, onComplete]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col items-center justify-center space-y-8 p-8">
      <div className="text-center">
        <p className="font-label text-xs font-bold text-secondary uppercase tracking-[0.2em] mb-2">Round</p>
        <p className="font-headline text-6xl font-black text-on-surface">{currentRound} <span className="text-outline-variant/30">/ {config.rounds}</span></p>
      </div>

      <motion.div 
        key={phase}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={cn(
          "w-64 h-64 rounded-full border-8 flex flex-col items-center justify-center transition-colors duration-500 shadow-2xl",
          phase === 'work' ? "border-primary bg-primary/5 shadow-primary/20" : "border-secondary bg-secondary/5 shadow-secondary/20"
        )}
      >
        <p className={cn(
          "font-label text-sm font-bold uppercase tracking-[0.3em] mb-2",
          phase === 'work' ? "text-primary" : "text-secondary"
        )}>
          {phase === 'work' ? 'WORK' : 'REST'}
        </p>
        <p className="font-headline text-7xl font-black tabular-nums">{formatTime(timeLeft)}</p>
      </motion.div>

      <div className="flex gap-12 py-4">
        <div className="text-center">
          <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Work</p>
          <p className="font-headline text-xl font-bold text-primary">{config.work}s</p>
        </div>
        <div className="text-center">
          <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Rest</p>
          <p className="font-headline text-xl font-bold text-secondary">{config.rest}s</p>
        </div>
        <div className="text-center">
          <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Total</p>
          <p className="font-headline text-xl font-bold text-on-surface">{config.rounds} RNDS</p>
        </div>
      </div>

      <div className="flex gap-4">
        <button 
          onClick={() => {
            setIsActive(!isActive);
            if (!isActive) beep(660, 200);
          }}
          className={cn(
            "px-12 py-4 rounded-2xl font-label font-bold uppercase tracking-widest transition-all",
            isActive ? "bg-surface-container-highest text-on-surface" : "bg-primary text-on-primary-fixed shadow-lg shadow-primary/20"
          )}
        >
          {isActive ? 'PAUSE' : 'START'}
        </button>
        <button 
          onClick={() => {
            setIsActive(false);
            setCurrentRound(1);
            setPhase('work');
            setTimeLeft(config.work);
          }}
          className="px-8 py-4 bg-surface-container-highest text-on-surface font-label font-bold rounded-2xl uppercase tracking-widest"
        >
          RESET
        </button>
      </div>
    </div>
  );
};

const Schedule = ({ sessions, workouts, drills, onAddSession, onUpdateSession, onDeleteSession, showToast, schedulingItem, onClearScheduling }: { 
  sessions: ScheduleSession[], 
  workouts: Workout[],
  drills: Drill[],
  onAddSession: (s: Partial<ScheduleSession>) => void,
  onUpdateSession: (id: string, s: Partial<ScheduleSession>) => void,
  onDeleteSession: (id: string) => void,
  showToast: (m: string, t?: 'success' | 'error') => void,
  schedulingItem: { type: 'drill' | 'program', item: any } | null,
  onClearScheduling: () => void
}) => {
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isAdding, setIsAdding] = useState(!!schedulingItem);
  const [aiAnalysis, setAiAnalysis] = useState<{ score: number, suggestions: string[], warning?: string, summary?: string } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState<string>('');
  const [activeWorkoutSession, setActiveWorkoutSession] = useState<{ session: ScheduleSession, workout: Partial<Workout> } | null>(null);
  const [viewMode, setViewMode] = useState<'daily' | 'weekly'>('daily');

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [selectedDate]);

  const dailySessions = useMemo(() => {
    return sessions.filter(s => isSameDay(s.startTime, selectedDate));
  }, [sessions, selectedDate]);

  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
      const end = addDays(start, 7);
      const weeklySessions = sessions.filter(s => s.startTime >= start && s.startTime < end);
      
      const analysis = await getScheduleAnalysis(weeklySessions);
      setAiAnalysis(analysis);
    } catch (error) {
      console.error("AI Analysis failed", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStartSession = (session: ScheduleSession) => {
    if (session.workoutId) {
      const workout = workouts.find(w => w.id === session.workoutId);
      if (workout) {
        setActiveWorkoutSession({ session, workout });
        return;
      }
    }
    
    if (session.exercises || session.intervalConfig) {
      setActiveWorkoutSession({ 
        session, 
        workout: { 
          title: session.type, 
          exercises: session.exercises, 
          intervalConfig: session.intervalConfig,
          type: session.intervalConfig ? 'interval' : 'standard'
        } 
      });
      return;
    }

    showToast(`Starting ${session.type} session...`, "success");
  };

  const getSessionColor = (type: string) => {
    switch (type) {
      case 'Rest': return 'bg-surface-container text-on-surface-variant border-outline-variant/10';
      case 'School': return 'bg-blue-900/20 text-blue-400 border-blue-500/20';
      case 'Event': return 'bg-purple-900/20 text-purple-400 border-purple-500/20';
      case 'Personal': return 'bg-green-900/20 text-green-400 border-green-500/20';
      case 'Meeting': return 'bg-amber-900/20 text-amber-400 border-amber-500/20';
      default: return 'bg-surface-container text-on-surface border-transparent';
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-8"
    >
      <section className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="font-headline text-5xl font-black uppercase tracking-tighter">ELITE<br/><span className="text-secondary">SCHEDULE</span></h2>
          <p className="font-body text-on-surface-variant text-sm mt-2 max-w-md">Design your elite routine. AI will analyze your full week's load and recovery balance.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="bg-surface-container p-1 rounded-xl flex gap-1">
            <button 
              onClick={() => setViewMode('daily')}
              className={cn(
                "px-4 py-2 rounded-lg font-label text-[10px] font-bold uppercase tracking-widest transition-all",
                viewMode === 'daily' ? "bg-secondary text-on-secondary" : "hover:bg-surface-container-highest"
              )}
            >
              Daily
            </button>
            <button 
              onClick={() => setViewMode('weekly')}
              className={cn(
                "px-4 py-2 rounded-lg font-label text-[10px] font-bold uppercase tracking-widest transition-all",
                viewMode === 'weekly' ? "bg-secondary text-on-secondary" : "hover:bg-surface-container-highest"
              )}
            >
              Weekly
            </button>
          </div>
          <button 
            onClick={handleAnalyze}
            disabled={isAnalyzing}
            className="bg-surface-container hover:bg-surface-container-highest px-6 py-3 rounded-lg font-label text-xs font-bold uppercase tracking-widest flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {isAnalyzing ? <Activity className="animate-spin" size={18} /> : <Brain size={18} />}
            WEEKLY AUDIT
          </button>
          <button 
            onClick={() => setIsAdding(true)}
            className="bg-primary text-on-primary-fixed px-6 py-3 rounded-lg font-label text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:scale-105 active:scale-95 transition-all"
          >
            <Plus size={18} />
            ADD SESSION
          </button>
        </div>
      </section>

      <div className="max-w-7xl mx-auto">
        {viewMode === 'daily' ? (
        <>
          {/* Week Selector */}
          <div className="space-y-4">
            <div className="flex justify-between items-center px-2">
              <h3 className="font-headline text-xl font-bold uppercase tracking-tight">
                {format(weekDays[0], 'MMM d')} - {format(weekDays[6], 'MMM d, yyyy')}
              </h3>
              <div className="flex gap-2">
                <button onClick={() => setSelectedDate(addDays(selectedDate, -7))} className="p-2 bg-surface-container rounded-lg hover:bg-surface-container-highest transition-all">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={() => setSelectedDate(addDays(selectedDate, 7))} className="p-2 bg-surface-container rounded-lg hover:bg-surface-container-highest transition-all">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
            <section className="bg-surface-container-low p-2 rounded-2xl flex justify-between gap-1 overflow-x-auto no-scrollbar">
              {weekDays.map((day) => {
                const active = isSameDay(day, selectedDate);
                const hasSessions = sessions.some(s => isSameDay(s.startTime, day));
                return (
                  <button 
                    key={day.toISOString()}
                    onClick={() => setSelectedDate(day)}
                    className={cn(
                      "flex-1 min-w-[60px] py-4 rounded-xl flex flex-col items-center gap-1 transition-all",
                      active ? "bg-secondary text-on-secondary shadow-lg shadow-secondary/20" : "hover:bg-surface-container"
                    )}
                  >
                    <span className="font-label text-[10px] font-bold uppercase opacity-60">{format(day, 'EEE')}</span>
                    <span className="font-headline text-xl font-bold">{format(day, 'd')}</span>
                    {hasSessions && <div className={cn("w-1 h-1 rounded-full", active ? "bg-on-secondary" : "bg-secondary")}></div>}
                  </button>
                );
              })}
            </section>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            {/* Daily Sessions */}
            <div className="md:col-span-8 space-y-4">
              <h3 className="font-headline text-xl font-bold uppercase flex items-center gap-2">
                <Clock size={20} className="text-secondary" />
                {format(selectedDate, 'EEEE, MMMM do')}
              </h3>
              
              {dailySessions.length === 0 ? (
                <div className="bg-surface-container-low border-2 border-dashed border-outline-variant/20 rounded-2xl p-12 text-center space-y-4">
                  <p className="font-body text-on-surface-variant">No sessions scheduled for this day.</p>
                  <button onClick={() => setIsAdding(true)} className="text-secondary font-label text-xs font-bold uppercase tracking-widest hover:underline">
                    Schedule your first session
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {dailySessions.sort((a, b) => a.startTime.getTime() - b.startTime.getTime()).map((session) => (
                    <div 
                      key={session.id} 
                      className={cn(
                        "p-5 rounded-2xl flex items-center gap-6 group transition-all border",
                        getSessionColor(session.type),
                        session.completed && "opacity-60"
                      )}
                    >
                      <div className="text-center min-w-[60px]">
                        <p className="font-headline text-lg font-bold">{format(session.startTime, 'HH:mm')}</p>
                        <p className="font-label text-[10px] text-on-surface-variant uppercase">{session.duration}m</p>
                      </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-label text-[10px] font-bold text-secondary uppercase tracking-widest">{session.type}</span>
                          {session.intensity > 7 && <span className="bg-error-container text-on-error-container px-2 py-0.5 rounded text-[8px] font-bold uppercase">High Intensity</span>}
                        </div>
                        <h4 className="font-headline text-xl font-bold uppercase tracking-tight">{session.type === 'Rest' ? 'RECOVERY PHASE' : session.type.toUpperCase()}</h4>
                        {session.notes && <p className="font-body text-xs text-on-surface-variant mt-1 line-clamp-1">{session.notes}</p>}
                      </div>

                      <div className="flex items-center gap-3">
                        {!session.completed ? (
                          <button 
                            onClick={() => handleStartSession(session)}
                            className="px-4 py-2 bg-secondary/10 text-secondary font-label text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-secondary/20 transition-all"
                          >
                            START
                          </button>
                        ) : (
                          <span className="font-label text-[8px] font-bold text-secondary uppercase tracking-widest bg-secondary/10 px-2 py-1 rounded">+100 XP</span>
                        )}
                        <button 
                          onClick={() => onUpdateSession(session.id, { completed: !session.completed })}
                          className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                            session.completed ? "bg-secondary text-on-secondary" : "bg-surface-container-highest text-on-surface-variant hover:text-white"
                          )}
                        >
                          <CheckCircle2 size={20} />
                        </button>
                        <button 
                          onClick={() => onDeleteSession(session.id)}
                          className="w-10 h-10 rounded-full flex items-center justify-center bg-surface-container-highest text-on-surface-variant hover:text-error transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Plus size={20} className="rotate-45" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AI Audit Panel */}
            <div className="md:col-span-4 space-y-6">
              <div className="glass-card p-6 rounded-2xl space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="font-headline text-lg font-bold uppercase">Weekly Audit</h3>
                  {aiAnalysis && (
                    <div className="w-12 h-12 rounded-full border-2 border-secondary flex items-center justify-center font-headline font-bold text-secondary">
                      {aiAnalysis.score}
                    </div>
                  )}
                </div>

                {!aiAnalysis ? (
                  <div className="text-center py-8 space-y-4">
                    <Brain size={48} className="mx-auto text-on-surface-variant opacity-20" />
                    <p className="font-body text-xs text-on-surface-variant">Run a Weekly AI Audit to get professional feedback on your full week's training volume and recovery balance.</p>
                    <button 
                      onClick={handleAnalyze}
                      disabled={isAnalyzing}
                      className="text-secondary font-label text-[10px] font-bold uppercase tracking-widest hover:underline"
                    >
                      {isAnalyzing ? 'ANALYZING WEEK...' : 'RUN WEEKLY AUDIT'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {aiAnalysis.summary && (
                      <p className="font-body text-xs text-on-surface leading-relaxed italic border-l-2 border-secondary pl-4 py-1">
                        {aiAnalysis.summary}
                      </p>
                    )}

                    {aiAnalysis.warning && (
                      <div className="bg-error-container/20 border border-error-container/30 p-4 rounded-xl flex gap-3">
                        <AlertCircle className="text-error shrink-0" size={20} />
                        <p className="font-body text-xs text-error leading-relaxed">{aiAnalysis.warning}</p>
                      </div>
                    )}
                    
                    <div className="space-y-3">
                      <p className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">AI Suggestions</p>
                      {aiAnalysis.suggestions.map((s, i) => (
                        <div key={i} className="flex gap-3 items-start">
                          <div className="w-1.5 h-1.5 rounded-full bg-secondary mt-1.5 shrink-0"></div>
                          <p className="font-body text-xs text-on-surface leading-relaxed">{s}</p>
                        </div>
                      ))}
                    </div>

                    <div className="pt-4 border-t border-outline-variant/10">
                      <p className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-3">Weekly Volume</p>
                      <div className="space-y-2">
                        {Object.entries(RECOMMENDED_VOLUME).map(([type, rec]) => {
                          const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
                          const end = addDays(start, 7);
                          const count = sessions.filter(s => s.type === type && s.startTime >= start && s.startTime < end).length;
                          const percent = Math.min((count / rec) * 100, 100);
                          return (
                            <div key={type} className="space-y-1">
                              <div className="flex justify-between text-[9px] font-label font-bold uppercase">
                                <span className="text-on-surface-variant">{type}</span>
                                <span>{count}/{rec}</span>
                              </div>
                              <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
                                <div className="h-full bg-secondary transition-all" style={{ width: `${percent}%` }}></div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h3 className="font-headline text-xl font-bold uppercase tracking-tight">
              {format(weekDays[0], 'MMMM d')} - {format(weekDays[6], 'd, yyyy')}
            </h3>
            <div className="flex gap-2">
              <button onClick={() => setSelectedDate(addDays(selectedDate, -7))} className="p-2 bg-surface-container rounded-lg hover:bg-surface-container-highest transition-all">
                <ChevronLeft size={20} />
              </button>
              <button onClick={() => setSelectedDate(addDays(selectedDate, 7))} className="p-2 bg-surface-container rounded-lg hover:bg-surface-container-highest transition-all">
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
            {weekDays.map((day) => {
              const daySessions = sessions.filter(s => isSameDay(s.startTime, day)).sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
              const isToday = isSameDay(day, new Date());
              return (
                <div key={day.toISOString()} className={cn(
                  "bg-surface-container-low rounded-2xl p-4 min-h-[300px] flex flex-col gap-3 border",
                  isToday ? "border-secondary/30" : "border-outline-variant/10"
                )}>
                  <div className="flex justify-between items-center mb-2">
                    <span className="font-label text-xs font-bold uppercase opacity-60">{format(day, 'EEE')}</span>
                    <span className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center font-headline font-bold",
                      isToday ? "bg-secondary text-on-secondary" : ""
                    )}>{format(day, 'd')}</span>
                  </div>
                  <div className="space-y-2 flex-1">
                    {daySessions.map(s => (
                      <button 
                        key={s.id}
                        onClick={() => {
                          setSelectedDate(day);
                          setViewMode('daily');
                        }}
                        className={cn(
                          "w-full p-2 rounded-lg text-left text-[10px] font-label font-bold uppercase tracking-tight border transition-all hover:scale-[1.02]",
                          getSessionColor(s.type),
                          s.completed && "opacity-40"
                        )}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span>{format(s.startTime, 'HH:mm')}</span>
                          {s.completed && <CheckCircle2 size={10} />}
                        </div>
                        <div className="truncate">{s.type}</div>
                      </button>
                    ))}
                    {daySessions.length === 0 && (
                      <div className="h-full flex items-center justify-center opacity-20">
                        <Plus size={24} />
                      </div>
                    )}
                  </div>
                  <button 
                    onClick={() => {
                      setSelectedDate(day);
                      setIsAdding(true);
                    }}
                    className="w-full py-2 bg-surface-container-highest rounded-lg font-label text-[8px] font-bold uppercase tracking-widest hover:bg-secondary/10 hover:text-secondary transition-all"
                  >
                    ADD
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>

      {/* Add Session Modal */}
      <AnimatePresence>
        {isAdding && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsAdding(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-surface-container-low w-full max-w-lg rounded-3xl p-8 z-10 relative border border-outline-variant/20"
            >
              <h3 className="font-headline text-3xl font-black uppercase tracking-tighter mb-6">
                {schedulingItem ? `Schedule ${schedulingItem.type === 'drill' ? 'Drill' : 'Program'}` : 'New Session'}
              </h3>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                let type = formData.get('type') as any;
                let notes = formData.get('notes') as string;
                const time = formData.get('time') as string;
                const duration = Number(formData.get('duration'));
                const intensity = Number(formData.get('intensity'));
                
                const [hours, minutes] = time.split(':').map(Number);
                const startTime = new Date(selectedDate);
                startTime.setHours(hours, minutes, 0, 0);

                if (schedulingItem?.type === 'program') {
                  // Add all days of the program starting from selected date
                  schedulingItem.item.days.forEach((day: any, idx: number) => {
                    const dayStart = addDays(startTime, idx);
                    onAddSession({
                      type: 'Basketball',
                      startTime: dayStart,
                      duration: day.duration,
                      intensity: 8,
                      notes: `Program: ${schedulingItem.item.title} - Day ${day.day}: ${day.title}`,
                      exercises: day.exercises,
                      completed: false
                    });
                  });
                  showToast(`${schedulingItem.item.title} scheduled for the next ${schedulingItem.item.days.length} days!`, "success");
                } else if (schedulingItem?.type === 'drill') {
                  onAddSession({
                    type: 'Basketball',
                    startTime,
                    duration,
                    intensity: 7,
                    notes: `Drill: ${schedulingItem.item.title}`,
                    completed: false
                  });
                  showToast(`${schedulingItem.item.title} added to schedule!`, "success");
                } else {
                  let workoutId = undefined;
                  let exercises = undefined;
                  let intervalConfig = undefined;

                  if (selectedWorkoutId) {
                    const workout = workouts.find(w => w.id === selectedWorkoutId);
                    if (workout) {
                      type = workout.category as any;
                      notes = `Workout: ${workout.title}\n${notes}`;
                      workoutId = workout.id;
                      exercises = workout.exercises;
                      intervalConfig = workout.intervalConfig;
                    }
                  }

                  onAddSession({
                    type,
                    startTime,
                    duration,
                    intensity,
                    notes,
                    completed: false,
                    workoutId,
                    exercises,
                    intervalConfig
                  });
                }
                
                setIsAdding(false);
                setSelectedWorkoutId('');
                onClearScheduling();
              }} className="space-y-6">
                {!schedulingItem && (
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Select Custom Workout (Optional)</label>
                    <select 
                      value={selectedWorkoutId} 
                      onChange={(e) => setSelectedWorkoutId(e.target.value)}
                      className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary"
                    >
                      <option value="">None (Manual Entry)</option>
                      {workouts.map(w => (
                        <option key={w.id} value={w.id}>{w.title} ({w.category})</option>
                      ))}
                    </select>
                  </div>
                )}

                {!selectedWorkoutId && !schedulingItem && (
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Type</label>
                    <select name="type" className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary">
                      {['Basketball', 'Ball handling', 'Shooting', 'Finishing', 'Strength', 'Explosiveness', 'Cardio', 'IQ Study', 'Team Practice', 'Rest', 'Game', 'Meeting', 'Recovery', 'Film Session', 'School', 'Event', 'Personal'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Start Time</label>
                    <input name="time" type="time" defaultValue="14:00" className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary" />
                  </div>
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Duration (min)</label>
                    <input name="duration" type="number" defaultValue={schedulingItem?.type === 'drill' ? 30 : 60} className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary" />
                  </div>
                </div>

                {!schedulingItem && (
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Intensity (1-10)</label>
                    <input name="intensity" type="number" min="1" max="10" defaultValue="5" className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary" />
                  </div>
                )}

                {!schedulingItem && (
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Notes</label>
                    <textarea name="notes" placeholder="Focus points for this session..." className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary h-24 resize-none" />
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button 
                    type="button" 
                    onClick={() => {
                      setIsAdding(false);
                      onClearScheduling();
                    }} 
                    className="flex-1 py-4 bg-surface-container-highest text-on-surface font-label font-bold rounded-xl uppercase tracking-widest hover:bg-outline-variant/30 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="flex-1 py-4 bg-primary text-on-primary-fixed font-label font-bold rounded-xl uppercase tracking-widest hover:bg-primary-fixed-dim transition-all shadow-lg shadow-primary/20"
                  >
                    {schedulingItem ? 'Confirm Schedule' : 'Save Session'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {activeWorkoutSession && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black">
            <WorkoutSessionPlayer 
              workout={activeWorkoutSession.workout}
              drills={drills}
              onComplete={() => {
                onUpdateSession(activeWorkoutSession.session.id, { completed: true });
                setActiveWorkoutSession(null);
                showToast("Workout completed! +500 XP", "success");
              }}
              onQuit={() => setActiveWorkoutSession(null)}
            />
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const SkillTracker = ({ onLogSkill }: { onLogSkill: (log: Partial<SkillLog>) => void }) => {
  const [selectedSkill, setSelectedSkill] = useState<keyof typeof SKILL_CRITERIA | null>(null);
  const [ratings, setRatings] = useState<number[]>([3, 3, 3, 3]);

  const handleSubmit = () => {
    if (!selectedSkill) return;
    onLogSkill({
      skillType: selectedSkill,
      criteria: {
        c1: ratings[0],
        c2: ratings[1],
        c3: ratings[2],
        c4: ratings[3],
      },
      timestamp: new Date()
    });
    setSelectedSkill(null);
    setRatings([3, 3, 3, 3]);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12 max-w-2xl mx-auto"
    >
      <div className="text-center space-y-4">
        <h2 className="font-headline text-5xl font-black uppercase tracking-tighter">SKILL<br/><span className="text-secondary">REFLECTION</span></h2>
        <p className="font-body text-on-surface-variant text-sm">Be honest. Self-awareness is the key to elite growth.</p>
      </div>

      {!selectedSkill ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Object.keys(SKILL_CRITERIA).map((skill) => (
            <button 
              key={skill}
              onClick={() => setSelectedSkill(skill as any)}
              className="bg-surface-container p-8 rounded-2xl flex flex-col items-center gap-4 hover:bg-surface-container-highest hover:border-secondary/50 border border-transparent transition-all group"
            >
              <div className="w-16 h-16 rounded-2xl bg-secondary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                {skill === 'dribbling' && <Zap className="text-secondary" size={32} />}
                {skill === 'shooting' && <Target className="text-secondary" size={32} />}
                {skill === 'finishing' && <Dumbbell className="text-secondary" size={32} />}
                {skill === 'iq' && <Brain className="text-secondary" size={32} />}
                {skill === 'defense' && <Activity className="text-secondary" size={32} />}
              </div>
              <span className="font-label text-sm font-bold uppercase tracking-widest">{skill}</span>
            </button>
          ))}
        </div>
      ) : (
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="bg-surface-container p-8 rounded-3xl space-y-8"
        >
          <div className="flex items-center gap-4">
            <button onClick={() => setSelectedSkill(null)} className="text-on-surface-variant hover:text-white">
              <ChevronLeft size={24} />
            </button>
            <h3 className="font-headline text-2xl font-bold uppercase">{selectedSkill} ANALYSIS</h3>
          </div>

          <div className="space-y-8">
            {SKILL_CRITERIA[selectedSkill].map((criterion, idx) => (
              <div key={criterion} className="space-y-4">
                <div className="flex justify-between items-end">
                  <span className="font-label text-xs font-bold text-on-surface-variant uppercase tracking-widest">{criterion}</span>
                  <span className="font-headline text-xl font-bold text-secondary">{ratings[idx]}/5</span>
                </div>
                <div className="flex justify-between gap-2">
                  {[1, 2, 3, 4, 5].map((val) => (
                    <button 
                      key={val}
                      onClick={() => {
                        const newRatings = [...ratings];
                        newRatings[idx] = val;
                        setRatings(newRatings);
                      }}
                      className={cn(
                        "flex-1 h-12 rounded-xl font-headline font-bold transition-all",
                        ratings[idx] === val ? "bg-secondary text-on-secondary" : "bg-surface-container-highest text-on-surface-variant hover:bg-outline-variant/30"
                      )}
                    >
                      {val}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <button 
            onClick={handleSubmit}
            className="w-full py-5 bg-primary text-on-primary-fixed font-label font-black rounded-2xl uppercase tracking-[0.2em] hover:bg-primary-fixed-dim transition-all shadow-xl shadow-primary/20"
          >
            SUBMIT REFLECTION
          </button>
        </motion.div>
      )}
    </motion.div>
  );
};

const Library = ({ drills, showToast, onSchedule }: { 
  drills: Drill[], 
  showToast: (m: string, t?: 'success' | 'error') => void,
  onSchedule: (type: 'drill' | 'program', item: any) => void
}) => {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [selectedDrill, setSelectedDrill] = useState<Drill | null>(null);
  const [selectedProgram, setSelectedProgram] = useState<typeof PROGRAMS[0] | null>(null);

  const filteredDrills = useMemo(() => {
    return drills.filter(d => 
      (category === 'All' || d.category === category) &&
      (d.title.toLowerCase().includes(search.toLowerCase()) || d.tags.some(t => t.toLowerCase().includes(search.toLowerCase())))
    );
  }, [drills, search, category]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12"
    >
      <section>
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <span className="font-label text-secondary text-xs font-bold tracking-[0.2em] uppercase mb-2 block">Knowledge Vault</span>
            <h2 className="font-headline text-5xl md:text-7xl font-black uppercase leading-[0.9] tracking-tighter">
              DRILL<br/><span className="text-outline-variant/30">ARCHIVE</span>
            </h2>
          </div>
          <div className="flex flex-col gap-4 w-full md:w-auto">
            <button 
              onClick={async () => {
                showToast("AI is generating a custom program for you...", "success");
                // In a real app, this would call getAiProgram
                setTimeout(() => {
                  setSelectedProgram(PROGRAMS[Math.floor(Math.random() * PROGRAMS.length)]);
                  showToast("AI Program Generated!", "success");
                }, 2000);
              }}
              className="bg-surface-container-highest hover:bg-secondary/20 text-secondary px-6 py-4 rounded-xl font-label text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all border border-secondary/30"
            >
              <Brain size={20} />
              GENERATE AI PROGRAM
            </button>
            <div className="relative group w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant group-focus-within:text-primary transition-colors" size={20} />
              <input 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full bg-surface-container-low border-none rounded-lg py-4 pl-12 pr-4 font-label text-sm tracking-tight focus:ring-1 focus:ring-primary-dim transition-all placeholder:text-outline/50 text-on-surface" 
                placeholder="SEARCH EXERCISES..." 
                type="text"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Programs Section */}
      <section className="space-y-6">
        <div className="flex justify-between items-end">
          <h3 className="font-headline text-2xl font-bold uppercase tracking-tight">3-Day Focus Programs</h3>
          <span className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Specialized Training</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PROGRAMS.map(program => (
            <div 
              key={program.id}
              onClick={() => setSelectedProgram(program)}
              className="bg-surface-container p-6 rounded-2xl border border-outline-variant/10 hover:border-secondary/50 transition-all cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                <CalendarIcon size={24} />
              </div>
              <h4 className="font-headline text-xl font-bold uppercase mb-2">{program.title}</h4>
              <p className="font-body text-xs text-on-surface-variant mb-4">{program.description}</p>
              <div className="flex justify-between items-center">
                <span className="font-label text-[10px] font-bold text-secondary uppercase tracking-widest">3 DAYS</span>
                <ChevronRight size={16} className="text-on-surface-variant" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap gap-3 items-center">
        {['All', 'Dribbling', 'Shooting', 'Finishing', 'IQ', 'Athleticism'].map((cat) => (
          <button 
            key={cat}
            onClick={() => setCategory(cat)}
            className={cn(
              "h-8 px-4 rounded-full font-label text-[10px] font-bold uppercase transition-all",
              category === cat ? "bg-secondary text-on-secondary" : "bg-surface-container-highest text-on-surface-variant hover:text-on-surface"
            )}
          >
            {cat}
          </button>
        ))}
      </section>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {filteredDrills.map((drill, idx) => (
          <div 
            key={drill.id} 
            onClick={() => setSelectedDrill(drill)}
            className={cn("group cursor-pointer", idx === 0 ? "md:col-span-8" : "md:col-span-4")}
          >
            <div className={cn(
              "h-full min-h-[320px] rounded-xl overflow-hidden relative border border-outline-variant/10 shadow-2xl transition-all hover:border-secondary/30",
              idx === 0 ? "" : "aspect-square"
            )}>
              {drill.image ? (
                <>
                  <img 
                    alt={drill.title} 
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                    src={drill.image}
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
                </>
              ) : (
                <div className="absolute inset-0 bg-surface-container flex flex-col items-center justify-center p-8 text-center">
                  <Brain size={48} className="text-secondary mb-4" />
                  <p className="font-body text-xs text-on-surface-variant">{drill.description}</p>
                </div>
              )}
              
              <div className="absolute top-6 left-6 flex gap-2">
                <span className="bg-secondary text-on-secondary px-3 py-1 rounded font-label text-[10px] font-bold uppercase">{drill.category}</span>
                <span className="bg-black/60 backdrop-blur-md text-white px-3 py-1 rounded font-label text-[10px] font-bold uppercase">{drill.intensity}</span>
              </div>
              
              <div className="absolute bottom-8 left-8 right-8">
                <h3 className={cn(
                  "font-headline font-black uppercase tracking-tighter leading-none mb-2 text-white",
                  idx === 0 ? "text-4xl" : "text-2xl"
                )}>{drill.title}</h3>
                <div className="flex gap-2">
                  {drill.tags.map((t, i) => (
                    <span key={`${t}-${i}`} className="font-label text-[8px] text-on-surface-variant uppercase tracking-widest">#{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {selectedProgram && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedProgram(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-surface-container-low w-full max-w-3xl rounded-3xl p-8 z-10 relative border border-secondary/20 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <span className="bg-secondary/10 text-secondary px-3 py-1 rounded-full font-label text-[10px] font-bold uppercase mb-2 inline-block">Elite Program</span>
                  <h3 className="font-headline text-4xl font-black uppercase tracking-tighter">{selectedProgram.title}</h3>
                  <p className="font-body text-xs text-on-surface-variant mt-2">{selectedProgram.description}</p>
                </div>
                <button onClick={() => setSelectedProgram(null)} className="p-2 hover:bg-surface-container-highest rounded-full transition-colors">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>

              <div className="space-y-6">
                {selectedProgram.days.map((day) => (
                  <div key={day.day} className="bg-surface-container p-6 rounded-2xl border border-outline-variant/10 flex flex-col md:flex-row gap-6 items-start md:items-center">
                    <div className="w-16 h-16 rounded-2xl bg-secondary text-on-secondary flex flex-col items-center justify-center shrink-0">
                      <span className="font-label text-[10px] font-bold uppercase">Day</span>
                      <span className="font-headline text-2xl font-bold">{day.day}</span>
                    </div>
                    <div className="flex-1 space-y-3">
                      <h4 className="font-headline text-xl font-bold uppercase mb-1">{day.title}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {day.exercises.map((ex, i) => (
                          <div key={i} className="bg-surface-container-highest px-3 py-2 rounded-lg flex justify-between items-center">
                            <span className="font-label text-[10px] font-bold uppercase text-on-surface">{ex.name}</span>
                            <span className="font-headline text-xs font-bold text-secondary">{ex.sets}x{ex.reps}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Duration</p>
                      <p className="font-headline text-lg font-bold text-secondary">{day.duration}m</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-12 pt-8 border-t border-outline-variant/10 flex gap-4">
                <button 
                  onClick={() => {
                    onSchedule('program', selectedProgram);
                    setSelectedProgram(null);
                  }}
                  className="flex-1 py-4 bg-primary text-on-primary-fixed font-label font-bold rounded-xl uppercase tracking-widest hover:bg-primary-fixed-dim transition-all shadow-xl shadow-primary/20"
                >
                  ADD TO SCHEDULE
                </button>
                <button 
                  onClick={() => setSelectedProgram(null)}
                  className="flex-1 py-4 bg-surface-container-highest text-on-surface font-label font-bold rounded-xl uppercase tracking-widest hover:bg-outline-variant/30 transition-all"
                >
                  CLOSE
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {selectedDrill && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedDrill(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-surface-container-low w-full max-w-2xl rounded-3xl overflow-hidden z-10 relative border border-outline-variant/20"
            >
              <div className="h-64 relative">
                <img 
                  src={selectedDrill.image || "https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=2090&auto=format&fit=crop"} 
                  className="w-full h-full object-cover"
                  alt={selectedDrill.title}
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-surface-container-low to-transparent"></div>
                <button 
                  onClick={() => setSelectedDrill(null)}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/60 transition-all"
                >
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>
              
              <div className="p-8 space-y-6">
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-label text-secondary text-[10px] font-bold uppercase tracking-[0.2em] mb-2 block">{selectedDrill.category}</span>
                    <h3 className="font-headline text-4xl font-black uppercase tracking-tighter">{selectedDrill.title}</h3>
                  </div>
                  <div className="text-right">
                    <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest mb-1">Intensity</p>
                    <span className="bg-secondary/10 text-secondary px-3 py-1 rounded-full font-label text-xs font-bold uppercase">{selectedDrill.intensity}</span>
                  </div>
                </div>

                <p className="font-body text-on-surface leading-relaxed">{selectedDrill.description}</p>

                <div className="flex flex-wrap gap-2">
                  {selectedDrill.tags.map((t, i) => (
                    <span key={`${t}-${i}`} className="bg-surface-container-highest px-3 py-1 rounded-lg font-label text-[10px] font-bold uppercase text-on-surface-variant">#{t}</span>
                  ))}
                </div>

                <div className="pt-6 border-t border-outline-variant/10 flex flex-col sm:flex-row gap-4">
                  <button 
                    onClick={() => {
                      onSchedule('drill', selectedDrill);
                      setSelectedDrill(null);
                    }}
                    className="flex-1 py-4 bg-secondary text-on-secondary font-label font-bold rounded-xl uppercase tracking-widest hover:bg-secondary-fixed-dim transition-all shadow-lg shadow-secondary/20 flex items-center justify-center gap-2"
                  >
                    <Calendar size={18} />
                    Add to Schedule
                  </button>
                  <button 
                    onClick={() => {
                      const prog = PROGRAMS.find(p => p.title.toLowerCase().includes(selectedDrill.category.toLowerCase())) || PROGRAMS[0];
                      setSelectedProgram(prog);
                    }}
                    className="flex-1 py-4 bg-surface-container-highest text-on-surface font-label font-bold rounded-xl uppercase tracking-widest hover:bg-outline-variant/30 transition-all flex items-center justify-center gap-2"
                  >
                    <Calendar size={18} />
                    View 3-Day Program
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const IQSection = ({ scenarios, onComplete, profile }: { scenarios: IQScenario[], onComplete: (s: IQScenario, correct: boolean) => void, profile: UserProfile | null }) => {
  const [activeScenario, setActiveScenario] = useState<IQScenario | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [selectedBigAspect, setSelectedBigAspect] = useState<string | null>(null);

  const skillPool: Record<string, string[]> = {
    'Layup Shooting': ['Body Control', 'Rim Timing', 'Hand Placement', 'Footwork', 'Contact Balance', 'Angle Mastery', 'Soft Touch', 'Extension'],
    'Ball Handling': ['Pound Dribble', 'Crossover Speed', 'Ball Protection', 'Change of Pace', 'Handle Height', 'Pocket Dribble', 'Live Dribble', 'Eyes Up'],
    'Jump Shooting': ['Base Balance', 'Release Point', 'Follow Through', 'Shot Rhythm', 'Eye Target', 'Dip Control', 'Sway Control', 'Arc Height'],
    'Defensive IQ': ['Closeout Angle', 'Slide Speed', 'Help Positioning', 'Screen Navigation', 'Gap Control', 'Digging', 'Stunting', 'Communication'],
    'Passing Vision': ['Lane Anticipation', 'Pass Velocity', 'Angle Selection', 'Fake Usage', 'One-Handed Zip', 'Wrap Around', 'Overhead Read', 'No-Look Timing']
  };

  const randomizedAspects = useMemo(() => {
    if (!selectedBigAspect) return [];
    const pool = skillPool[selectedBigAspect];
    return [...pool].sort(() => Math.random() - 0.5).slice(0, 4);
  }, [selectedBigAspect]);

  const handleSelect = (idx: number) => {
    if (showFeedback) return;
    setSelectedOption(idx);
    setShowFeedback(true);
    onComplete(activeScenario!, activeScenario!.options[idx].isCorrect);
  };

  const dailyScenarios = useMemo(() => {
    const dayOfYear = Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return scenarios.filter((_, idx) => (idx + dayOfYear) % scenarios.length < 2);
  }, [scenarios]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12"
    >
      <div className="flex justify-between items-end">
        <div>
          <h2 className="font-headline text-5xl font-black uppercase tracking-tighter">TACTICAL<br/><span className="text-secondary">ANALYSIS</span></h2>
          <p className="font-body text-on-surface-variant text-sm mt-2">Master the game between the ears. Real-world scenarios, elite-level reads.</p>
        </div>
      </div>

      {/* Skill Breakdown Section */}
      <section className="space-y-6">
        <h3 className="font-label text-xs font-bold text-secondary uppercase tracking-[0.2em]">Skill Deep Dive</h3>
        {!selectedBigAspect ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.keys(skillPool).map(aspect => (
              <button 
                key={aspect}
                onClick={() => setSelectedBigAspect(aspect)}
                className="bg-surface-container p-6 rounded-2xl text-center hover:bg-surface-container-highest border border-transparent hover:border-secondary/30 transition-all group"
              >
                <Brain size={24} className="mx-auto mb-3 text-on-surface-variant group-hover:text-secondary transition-colors" />
                <span className="font-label text-[10px] font-bold uppercase tracking-widest">{aspect}</span>
              </button>
            ))}
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-surface-container p-8 rounded-3xl space-y-8 border border-secondary/20"
          >
            <div className="flex items-center gap-4">
              <button onClick={() => setSelectedBigAspect(null)} className="text-on-surface-variant hover:text-white">
                <ChevronLeft size={24} />
              </button>
              <h3 className="font-headline text-2xl font-bold uppercase">{selectedBigAspect} BREAKDOWN</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {randomizedAspects.map(sub => (
                <div key={sub} className="bg-surface-container-highest p-6 rounded-xl border border-outline-variant/10">
                  <p className="font-label text-[10px] text-secondary font-bold uppercase tracking-widest mb-2">Aspect</p>
                  <p className="font-headline text-lg font-bold uppercase">{sub}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </section>

      <div className="space-y-6">
        <h3 className="font-label text-xs font-bold text-secondary uppercase tracking-[0.2em]">Daily IQ Challenges</h3>
        {!activeScenario ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {dailyScenarios.map((s) => {
              const isCompleted = profile?.completedScenarios?.includes(s.id);
              return (
                <div 
                  key={s.id}
                  onClick={() => !isCompleted && setActiveScenario(s)}
                  className={cn(
                    "bg-surface-container p-6 rounded-2xl border border-outline-variant/10 transition-all group relative overflow-hidden",
                    isCompleted ? "opacity-50 grayscale cursor-default" : "hover:border-secondary/50 cursor-pointer"
                  )}
                >
                  {isCompleted && (
                    <div className="absolute top-0 right-0 bg-secondary text-on-secondary px-4 py-1 rounded-bl-xl font-label text-[8px] font-bold uppercase tracking-widest">
                      COMPLETED
                    </div>
                  )}
                  <div className="flex justify-between items-start mb-4">
                    <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center text-secondary">
                      <Brain size={24} />
                    </div>
                    <span className="font-label text-[10px] font-bold text-secondary bg-secondary/10 px-3 py-1 rounded-full">{s.points} XP</span>
                  </div>
                  <h3 className="font-headline text-xl font-bold uppercase mb-2 group-hover:text-secondary transition-colors">{s.title}</h3>
                  <p className="font-body text-xs text-on-surface-variant line-clamp-2">{s.description}</p>
                </div>
              );
            })}
          </div>
        ) : (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-surface-container p-8 rounded-3xl space-y-8 max-w-3xl mx-auto border border-outline-variant/20"
          >
            <button onClick={() => { setActiveScenario(null); setShowFeedback(false); setSelectedOption(null); }} className="flex items-center gap-2 text-on-surface-variant hover:text-white transition-colors">
              <ChevronLeft size={20} />
              <span className="font-label text-xs font-bold uppercase tracking-widest">Back to Scenarios</span>
            </button>

            <div className="space-y-4">
              <h3 className="font-headline text-3xl font-black uppercase tracking-tighter">{activeScenario.title}</h3>
              <p className="font-body text-on-surface leading-relaxed">{activeScenario.description}</p>
            </div>

            <div className="space-y-4">
              {activeScenario.options.map((opt, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSelect(idx)}
                  disabled={showFeedback}
                  className={cn(
                    "w-full p-6 rounded-2xl text-left transition-all border-2",
                    showFeedback 
                      ? opt.isCorrect 
                        ? "bg-secondary/20 border-secondary text-white" 
                        : selectedOption === idx 
                          ? "bg-error/20 border-error text-white" 
                          : "bg-surface-container-highest/50 border-transparent opacity-50"
                      : "bg-surface-container-highest border-transparent hover:border-secondary/50"
                  )}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-body font-medium">{opt.text}</span>
                    {showFeedback && opt.isCorrect && <CheckCircle2 size={20} className="text-secondary" />}
                    {showFeedback && !opt.isCorrect && selectedOption === idx && <AlertCircle size={20} className="text-error" />}
                  </div>
                  {showFeedback && selectedOption === idx && (
                    <motion.p 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mt-4 text-xs font-body opacity-80 border-t border-white/10 pt-4"
                    >
                      {opt.feedback}
                    </motion.p>
                  )}
                </button>
              ))}
            </div>

            {showFeedback && (
              <button 
                onClick={() => { setActiveScenario(null); setShowFeedback(false); setSelectedOption(null); }}
                className="w-full py-4 bg-primary text-on-primary-fixed font-label font-bold rounded-xl uppercase tracking-widest hover:bg-primary-fixed-dim transition-all"
              >
                CONTINUE TRAINING
              </button>
            )}
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

const CharacterPreview = ({ equipped, profile }: { equipped: UserProfile['equippedItems'], profile: UserProfile | null }) => {
  // Simple SVG-based character that layers items
  const skinColor = equipped.head === 'skin-dark' ? '#3d2b1f' : equipped.head === 'skin-medium' ? '#8d5524' : '#ffdbac';
  const hairColor = equipped.head === 'hair-black' ? '#000000' : equipped.head === 'hair-brown' ? '#4b2e1e' : '#d4af37';

  return (
    <div className="relative w-full aspect-[3/4] bg-surface-container-highest rounded-3xl overflow-hidden flex items-center justify-center border border-outline-variant/20 shadow-inner">
      <div className="absolute inset-0 bg-gradient-to-b from-secondary/5 to-transparent opacity-50"></div>
      
      <svg viewBox="0 0 200 300" className="w-full h-full drop-shadow-2xl">
        {/* Body */}
        <path d="M60 280 L140 280 L130 120 L70 120 Z" fill={skinColor} stroke="#000" strokeWidth="0.5" />
        
        {/* Legs */}
        <rect x="70" y="240" width="25" height="40" fill={skinColor} />
        <rect x="105" y="240" width="25" height="40" fill={skinColor} />

        {/* Outfit (Jersey/Shorts) */}
        {equipped.outfit ? (
          <g>
            {/* Simple representation based on ID */}
            <path d="M65 120 L135 120 L140 200 L60 200 Z" fill={equipped.outfit.includes('red') ? '#ef4444' : equipped.outfit.includes('blue') ? '#3b82f6' : '#1f2937'} />
            <path d="M65 200 L135 200 L140 250 L60 250 Z" fill={equipped.outfit.includes('red') ? '#b91c1c' : equipped.outfit.includes('blue') ? '#1d4ed8' : '#111827'} />
          </g>
        ) : (
          <g>
            <path d="M65 120 L135 120 L140 200 L60 200 Z" fill="#e5e7eb" opacity="0.5" />
            <path d="M65 200 L135 200 L140 250 L60 250 Z" fill="#d1d5db" opacity="0.5" />
          </g>
        )}

        {/* Head */}
        <circle cx="100" cy="80" r="35" fill={skinColor} />
        
        {/* Hair (if equipped) */}
        {equipped.head?.includes('hair') && (
          <path d="M65 80 Q65 40 100 40 Q135 40 135 80 L130 80 Q130 50 100 50 Q70 50 70 80 Z" fill={hairColor} />
        )}

        {/* Shoes */}
        {equipped.shoes ? (
          <g>
            <rect x="65" y="275" width="35" height="10" rx="5" fill={equipped.shoes.includes('neon') ? '#22c55e' : '#f97316'} />
            <rect x="100" y="275" width="35" height="10" rx="5" fill={equipped.shoes.includes('neon') ? '#22c55e' : '#f97316'} />
          </g>
        ) : (
          <g>
            <rect x="65" y="275" width="35" height="10" rx="5" fill="#9ca3af" />
            <rect x="100" y="275" width="35" height="10" rx="5" fill="#9ca3af" />
          </g>
        )}

        {/* Accessory (Headband) */}
        {equipped.accessory?.includes('headband') && (
          <rect x="68" y="65" width="64" height="8" fill="#fff" stroke="#000" strokeWidth="0.5" />
        )}
      </svg>

      <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end">
        <div className="bg-black/40 backdrop-blur-md p-3 rounded-xl border border-white/10">
          <p className="font-label text-[8px] font-bold text-white/60 uppercase tracking-widest mb-1">Current Build</p>
          <p className="font-headline text-sm font-bold text-white uppercase">{profile?.careerPhase} ELITE</p>
        </div>
        <div className="flex gap-2">
          <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-on-secondary shadow-lg">
            <User size={16} />
          </div>
        </div>
      </div>
    </div>
  );
};

const Shop = ({ items, profile, onBuy, onEquip }: { items: ShopItem[], profile: UserProfile | null, onBuy: (item: ShopItem) => void, onEquip: (item: ShopItem) => void }) => {
  const [activeTab, setActiveTab] = useState<'Apparel' | 'Equipment' | 'Boost'>('Apparel');
  const filteredItems = items.filter(i => i.category === activeTab);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="font-headline text-5xl font-black uppercase tracking-tighter">THE<br/><span className="text-secondary">LOCKER ROOM</span></h2>
          <p className="font-body text-on-surface-variant text-sm mt-2">Spend your hard-earned XP on elite gear and performance boosts.</p>
        </div>
        <div className="bg-surface-container p-4 rounded-2xl flex items-center gap-4 border border-secondary/20 shadow-lg shadow-secondary/5">
          <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center text-secondary">
            <Star size={20} fill="currentColor" />
          </div>
          <div>
            <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Available XP</p>
            <p className="font-headline text-2xl font-bold text-secondary">{profile?.points || 0}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Character Preview */}
        <div className="lg:col-span-4 space-y-6">
          <h3 className="font-label text-xs font-bold text-secondary uppercase tracking-[0.2em]">Your Character</h3>
          <CharacterPreview equipped={profile?.equippedItems || {}} profile={profile} />
          <div className="bg-surface-container p-6 rounded-2xl border border-outline-variant/10">
            <p className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest mb-4">Equipped Gear</p>
            <div className="space-y-3">
              {Object.entries(profile?.equippedItems || {}).map(([sub, itemId]) => {
                const item = items.find(i => i.id === itemId);
                return (
                  <div key={sub} className="flex justify-between items-center text-xs">
                    <span className="text-on-surface-variant uppercase font-bold">{sub}:</span>
                    <span className="text-secondary font-headline font-bold uppercase">{item?.name || 'Standard'}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Shop Items */}
        <div className="lg:col-span-8 space-y-8">
          <div className="flex gap-4 border-b border-outline-variant/10 pb-4">
            {['Apparel', 'Equipment', 'Boost'].map((tab) => (
              <button 
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={cn(
                  "font-label text-xs font-bold uppercase tracking-widest pb-4 relative transition-all",
                  activeTab === tab ? "text-secondary" : "text-on-surface-variant hover:text-white"
                )}
              >
                {tab}
                {activeTab === tab && <motion.div layoutId="shopTab" className="absolute bottom-0 left-0 right-0 h-1 bg-secondary rounded-full" />}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredItems.map((item) => {
              const isOwned = profile?.avatarItems?.includes(item.id);
              const isEquipped = Object.values(profile?.equippedItems || {}).includes(item.id);

              return (
                <div key={item.id} className="bg-surface-container rounded-3xl overflow-hidden border border-outline-variant/10 flex flex-col group">
                  <div className="aspect-video bg-surface-container-highest relative flex items-center justify-center overflow-hidden">
                    <img 
                      src={item.image || "https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=2090&auto=format&fit=crop"} 
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      alt={item.name}
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors"></div>
                    <div className="absolute top-4 right-4 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full font-label text-[10px] font-bold text-white uppercase tracking-widest">
                      {item.subcategory || item.category}
                    </div>
                  </div>
                  <div className="p-6 space-y-4 flex-1 flex flex-col">
                    <div className="flex-1">
                      <h3 className="font-headline text-xl font-bold uppercase mb-1">{item.name}</h3>
                      <p className="font-body text-xs text-on-surface-variant leading-relaxed">{item.description}</p>
                    </div>
                    
                    {isOwned ? (
                      <button 
                        onClick={() => !isEquipped && onEquip(item)}
                        disabled={isEquipped}
                        className={cn(
                          "w-full py-4 rounded-xl font-label font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                          isEquipped ? "bg-secondary/20 text-secondary cursor-default" : "bg-surface-container-highest text-on-surface hover:bg-outline-variant/30"
                        )}
                      >
                        {isEquipped ? 'EQUIPPED' : 'EQUIP ITEM'}
                      </button>
                    ) : (
                      <button 
                        onClick={() => onBuy(item)}
                        disabled={(profile?.points || 0) < item.price}
                        className={cn(
                          "w-full py-4 rounded-xl font-label font-bold uppercase tracking-widest transition-all flex items-center justify-center gap-2",
                          (profile?.points || 0) >= item.price 
                            ? "bg-white text-black hover:bg-secondary shadow-xl" 
                            : "bg-surface-container-highest text-on-surface-variant cursor-not-allowed"
                        )}
                      >
                        <Star size={16} fill="currentColor" />
                        {item.price} XP
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

const Workouts = ({ workouts, drills, onAddWorkout, showToast }: { 
  workouts: Workout[], 
  drills: Drill[], 
  onAddWorkout: (w: Partial<Workout>) => void,
  showToast: (m: string, t?: 'success' | 'error') => void
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [workoutType, setWorkoutType] = useState<'standard' | 'interval'>('standard');
  const [selectedDrills, setSelectedDrills] = useState<string[]>([]);
  const [customExercises, setCustomExercises] = useState<{ name: string, sets: number, reps: number }[]>([]);
  const [newCustomEx, setNewCustomEx] = useState({ name: '', sets: 3, reps: 10 });
  const [activeWorkout, setActiveWorkout] = useState<Workout | null>(null);
  const [isDoingWorkout, setIsDoingWorkout] = useState(false);
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);

  const allExercises = useMemo(() => {
    if (!activeWorkout) return [];
    const drillExs = activeWorkout.drills.map(id => {
      const d = drills.find(drill => drill.id === id);
      return { name: d?.title || 'Drill', sets: 1, reps: 1, type: 'drill' };
    });
    const customExs = (activeWorkout.exercises || []).map(ex => ({ ...ex, type: 'custom' }));
    return [...drillExs, ...customExs];
  }, [activeWorkout, drills]);

  const toggleDrill = (id: string) => {
    setSelectedDrills(prev => prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]);
  };

  const addCustomExercise = () => {
    if (!newCustomEx.name) return;
    setCustomExercises([...customExercises, { ...newCustomEx }]);
    setNewCustomEx({ name: '', sets: 3, reps: 10 });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-12"
    >
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="font-headline text-5xl font-black uppercase tracking-tighter">WORKOUT<br/><span className="text-secondary">BUILDER</span></h2>
          <p className="font-body text-on-surface-variant text-sm mt-2">Create custom routines or choose from elite premade sessions.</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="bg-primary text-on-primary-fixed px-8 py-4 rounded-xl font-label text-xs font-bold uppercase tracking-widest flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-xl shadow-primary/20"
        >
          <Plus size={20} />
          CREATE CUSTOM
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workouts.map((w) => (
          <div key={w.id} className="bg-surface-container p-6 rounded-3xl border border-outline-variant/10 hover:border-secondary/30 transition-all group flex flex-col">
            <div className="flex justify-between items-start mb-6">
              <div className="flex gap-2">
                <span className="bg-secondary/10 text-secondary px-3 py-1 rounded-full font-label text-[10px] font-bold uppercase">{w.category}</span>
                <span className="bg-surface-container-highest text-on-surface-variant px-3 py-1 rounded-full font-label text-[10px] font-bold uppercase">{w.difficulty}</span>
              </div>
              <div className="text-on-surface-variant">
                <Clock size={18} />
              </div>
            </div>
            <h3 className="font-headline text-2xl font-bold uppercase mb-2 group-hover:text-secondary transition-colors">{w.title}</h3>
            <p className="font-body text-xs text-on-surface-variant mb-6 flex-1">{w.description}</p>
            <div className="flex items-center justify-between mt-auto">
              <span className="font-label text-xs font-bold text-on-surface-variant uppercase">{w.duration} MINS</span>
              <button 
                onClick={() => setActiveWorkout(w)}
                className="text-secondary font-label text-xs font-bold uppercase tracking-widest hover:underline flex items-center gap-1"
              >
                START <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {activeWorkout && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isDoingWorkout) setActiveWorkout(null);
              }}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />
            
            {!isDoingWorkout ? (
              <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="bg-surface-container-low w-full max-w-3xl rounded-3xl p-8 z-10 relative border border-secondary/20 max-h-[90vh] overflow-y-auto no-scrollbar"
              >
                <div className="flex justify-between items-start mb-8">
                  <div>
                    <span className="bg-secondary/10 text-secondary px-3 py-1 rounded-full font-label text-[10px] font-bold uppercase mb-2 inline-block">{activeWorkout.category}</span>
                    <h3 className="font-headline text-4xl font-black uppercase tracking-tighter">{activeWorkout.title}</h3>
                  </div>
                  <button onClick={() => setActiveWorkout(null)} className="p-2 hover:bg-surface-container-highest rounded-full transition-colors">
                    <Plus size={24} className="rotate-45" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-label text-xs font-bold text-secondary uppercase tracking-[0.2em] mb-4">Drills</h4>
                      <div className="space-y-3">
                        {activeWorkout.drills.map((drillId, idx) => {
                          const drill = drills.find(d => d.id === drillId);
                          return (
                            <div key={`${drillId}-${idx}`} className="bg-surface-container p-4 rounded-xl border border-outline-variant/10 flex items-center gap-4">
                              <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center text-secondary">
                                <Zap size={20} />
                              </div>
                              <div>
                                <p className="font-headline font-bold text-sm uppercase">{drill?.title || 'Unknown Drill'}</p>
                                <p className="font-label text-[10px] text-on-surface-variant uppercase">{drill?.intensity} Intensity</p>
                              </div>
                            </div>
                          );
                        })}
                        {activeWorkout.drills.length === 0 && <p className="text-xs text-on-surface-variant italic">No drills selected.</p>}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <h4 className="font-label text-xs font-bold text-secondary uppercase tracking-[0.2em] mb-4">
                        {activeWorkout.type === 'interval' ? 'Interval Config' : 'Exercises'}
                      </h4>
                      <div className="space-y-3">
                        {activeWorkout.type === 'interval' ? (
                          <div className="bg-surface-container p-6 rounded-xl border border-outline-variant/10 space-y-4">
                            <div className="flex justify-between items-center">
                              <span className="font-label text-xs text-on-surface-variant uppercase tracking-widest">Work</span>
                              <span className="font-headline text-xl font-bold text-primary">{activeWorkout.intervalConfig?.work}s</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="font-label text-xs text-on-surface-variant uppercase tracking-widest">Rest</span>
                              <span className="font-headline text-xl font-bold text-secondary">{activeWorkout.intervalConfig?.rest}s</span>
                            </div>
                            <div className="flex justify-between items-center">
                              <span className="font-label text-xs text-on-surface-variant uppercase tracking-widest">Rounds</span>
                              <span className="font-headline text-xl font-bold text-on-surface">{activeWorkout.intervalConfig?.rounds}</span>
                            </div>
                          </div>
                        ) : (
                          activeWorkout.exercises?.map((ex, idx) => (
                            <div key={`ex-${idx}`} className="bg-surface-container p-4 rounded-xl border border-outline-variant/10 flex justify-between items-center">
                              <div>
                                <p className="font-headline font-bold text-sm uppercase">{ex.name}</p>
                                <p className="font-label text-[10px] text-on-surface-variant uppercase">Strength & Conditioning</p>
                              </div>
                              <div className="text-right">
                                <p className="font-headline font-bold text-secondary">{ex.sets}x{ex.reps}</p>
                              </div>
                            </div>
                          ))
                        )}
                        {activeWorkout.type !== 'interval' && (!activeWorkout.exercises || activeWorkout.exercises.length === 0) && <p className="text-xs text-on-surface-variant italic">No custom exercises.</p>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-12 pt-8 border-t border-outline-variant/10 flex gap-4">
                  <button 
                    onClick={() => {
                      setIsDoingWorkout(true);
                    }}
                    className="flex-1 py-4 bg-primary text-on-primary-fixed font-label font-bold rounded-xl uppercase tracking-widest hover:bg-primary-fixed-dim transition-all shadow-xl shadow-primary/20"
                  >
                    BEGIN SESSION
                  </button>
                  <button 
                    onClick={() => setActiveWorkout(null)}
                    className="flex-1 py-4 bg-surface-container-highest text-on-surface font-label font-bold rounded-xl uppercase tracking-widest hover:bg-outline-variant/30 transition-all"
                  >
                    CLOSE
                  </button>
                </div>
              </motion.div>
            ) : (
              <WorkoutSessionPlayer 
                workout={activeWorkout}
                drills={drills}
                onComplete={() => {
                  showToast(`Workout Complete: ${activeWorkout.title}!`, "success");
                  setIsDoingWorkout(false);
                  setActiveWorkout(null);
                }}
                onQuit={() => {
                  setIsDoingWorkout(false);
                  setActiveWorkout(null);
                }}
              />
            )}
          </div>
        )}

        {isCreating && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCreating(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-surface-container-low w-full max-w-2xl rounded-3xl p-8 z-10 relative border border-outline-variant/20 max-h-[90vh] overflow-y-auto no-scrollbar"
            >
              <h3 className="font-headline text-3xl font-black uppercase tracking-tighter mb-6">Custom Workout</h3>
              
              <form onSubmit={(e) => {
                e.preventDefault();
                const formData = new FormData(e.currentTarget);
                const type = formData.get('type') as 'standard' | 'interval';
                onAddWorkout({
                  title: formData.get('title') as string,
                  description: formData.get('description') as string,
                  category: formData.get('category') as string,
                  difficulty: formData.get('difficulty') as any,
                  duration: Number(formData.get('duration')),
                  type,
                  drills: selectedDrills,
                  exercises: type === 'standard' ? customExercises : [],
                  intervalConfig: type === 'interval' ? {
                    work: Number(formData.get('work')),
                    rest: Number(formData.get('rest')),
                    rounds: Number(formData.get('rounds'))
                  } : undefined
                });
                setIsCreating(false);
                setSelectedDrills([]);
                setCustomExercises([]);
              }} className="space-y-6">
                <div className="space-y-2">
                  <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Workout Title</label>
                  <input name="title" required className="w-full bg-surface-container border-none rounded-xl p-4 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary" placeholder="e.g. Midnight Handles" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Type</label>
                    <select name="type" className="w-full bg-surface-container border-none rounded-xl p-4 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary" onChange={(e) => setWorkoutType(e.target.value as any)}>
                      <option value="standard">Standard</option>
                      <option value="interval">Interval Training</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Category</label>
                    <select name="category" className="w-full bg-surface-container border-none rounded-xl p-4 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary">
                      {['Shooting', 'Dribbling', 'Finishing', 'Athleticism', 'Warmup'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Duration (min)</label>
                    <input name="duration" type="number" defaultValue={30} className="w-full bg-surface-container border-none rounded-xl p-4 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary" />
                  </div>
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Difficulty</label>
                    <select name="difficulty" className="w-full bg-surface-container border-none rounded-xl p-4 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary">
                      {['Beginner', 'Intermediate', 'Advanced'].map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                {workoutType === 'interval' ? (
                  <div className="grid grid-cols-3 gap-4 p-4 bg-secondary/5 rounded-2xl border border-secondary/20">
                    <div className="space-y-2">
                      <label className="font-label text-[10px] font-bold text-secondary uppercase tracking-widest">Work (s)</label>
                      <input name="work" type="number" defaultValue={45} className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary" />
                    </div>
                    <div className="space-y-2">
                      <label className="font-label text-[10px] font-bold text-secondary uppercase tracking-widest">Rest (s)</label>
                      <input name="rest" type="number" defaultValue={15} className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary" />
                    </div>
                    <div className="space-y-2">
                      <label className="font-label text-[10px] font-bold text-secondary uppercase tracking-widest">Rounds</label>
                      <input name="rounds" type="number" defaultValue={8} className="w-full bg-surface-container border-none rounded-xl p-3 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-4">
                      <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Select Library Drills</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto no-scrollbar p-2 bg-surface-container rounded-xl">
                        {drills.map(d => (
                          <button 
                            key={d.id}
                            type="button"
                            onClick={() => toggleDrill(d.id)}
                            className={cn(
                              "p-3 rounded-lg text-left text-xs font-label font-bold uppercase transition-all border",
                              selectedDrills.includes(d.id) ? "bg-secondary/20 border-secondary text-secondary" : "bg-surface-container-highest border-transparent text-on-surface-variant"
                            )}
                          >
                            {d.title}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Custom Exercises</label>
                      <div className="space-y-2">
                        {customExercises.map((ex, idx) => (
                          <div key={`custom-ex-${idx}`} className="flex justify-between items-center bg-surface-container p-3 rounded-xl border border-outline-variant/10">
                            <span className="font-body text-xs">{ex.name}</span>
                            <span className="font-label text-xs font-bold text-secondary">{ex.sets}x{ex.reps}</span>
                          </div>
                        ))}
                      </div>
                      <div className="bg-surface-container p-4 rounded-2xl border border-outline-variant/10 space-y-4">
                        <input 
                          value={newCustomEx.name}
                          onChange={(e) => setNewCustomEx({...newCustomEx, name: e.target.value})}
                          className="w-full bg-surface-container-highest border-none rounded-xl p-3 font-label text-xs"
                          placeholder="Exercise Name"
                        />
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase opacity-50">Sets</label>
                            <input type="number" value={newCustomEx.sets} onChange={(e) => setNewCustomEx({...newCustomEx, sets: parseInt(e.target.value)})} className="w-full bg-surface-container-highest border-none rounded-xl p-3 font-label text-xs" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[9px] font-bold uppercase opacity-50">Reps</label>
                            <input type="number" value={newCustomEx.reps} onChange={(e) => setNewCustomEx({...newCustomEx, reps: parseInt(e.target.value)})} className="w-full bg-surface-container-highest border-none rounded-xl p-3 font-label text-xs" />
                          </div>
                        </div>
                        <button 
                          type="button"
                          onClick={addCustomExercise}
                          className="w-full py-3 bg-secondary/10 text-secondary font-label font-bold rounded-xl uppercase text-[10px] tracking-widest hover:bg-secondary/20 transition-all"
                        >
                          Add Custom Exercise
                        </button>
                      </div>
                    </div>
                  </>
                )}

                <div className="space-y-2">
                  <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Description</label>
                  <textarea name="description" className="w-full bg-surface-container border-none rounded-xl p-4 font-label text-sm text-on-surface focus:ring-1 focus:ring-secondary h-24 resize-none" placeholder="What's the goal of this workout?" />
                </div>

                <div className="flex gap-3 pt-4">
                  <button type="button" onClick={() => setIsCreating(false)} className="flex-1 py-4 bg-surface-container-highest text-on-surface font-label font-bold rounded-xl uppercase tracking-widest hover:bg-outline-variant/30 transition-all">Cancel</button>
                  <button type="submit" className="flex-1 py-4 bg-primary text-on-primary-fixed font-label font-bold rounded-xl uppercase tracking-widest hover:bg-primary-fixed-dim transition-all shadow-lg shadow-primary/20">Create Workout</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const Profile = ({ profile, achievements, onUpdateProfile, onOpenShop }: { 
  profile: UserProfile | null, 
  achievements: Achievement[], 
  onUpdateProfile: (p: Partial<UserProfile>) => void, 
  onOpenShop: () => void 
}) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [editData, setEditData] = useState({
    displayName: profile?.displayName || '',
    age: profile?.age || 0,
    height: profile?.height || 0,
    weight: profile?.weight || 0,
    gender: profile?.gender || 'male'
  });

  useEffect(() => {
    if (profile) {
      setEditData({
        displayName: profile.displayName || '',
        age: profile.age || 0,
        height: profile.height || 0,
        weight: profile.weight || 0,
        gender: profile.gender || 'male'
      });
    }
  }, [profile]);

  const handleSave = () => {
    onUpdateProfile(editData);
    setIsSettingsOpen(false);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="max-w-4xl mx-auto space-y-12 pb-24"
    >
      <section className="flex flex-col items-center text-center space-y-6">
        <div className="relative group">
          <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-secondary shadow-2xl shadow-secondary/20">
            <img 
              className="w-full h-full object-cover" 
              src={profile?.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${profile?.uid}`} 
              alt="Profile"
              referrerPolicy="no-referrer"
            />
          </div>
          <button 
            onClick={() => setIsSettingsOpen(true)}
            className="absolute bottom-0 right-0 bg-primary text-on-primary-fixed p-2 rounded-full shadow-lg hover:scale-110 transition-all"
          >
            <Settings size={20} />
          </button>
        </div>
        
        <div>
          <h2 className="font-headline text-4xl font-black uppercase tracking-tighter">{profile?.displayName}</h2>
          <p className="font-label text-xs text-secondary font-bold uppercase tracking-[0.2em] mt-1">{profile?.careerPhase} PROSPECT</p>
          <div className="flex gap-4 mt-2 justify-center text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">
            <span>{profile?.age || '--'} YRS</span>
            <span>•</span>
            <span>{profile?.height || '--'} CM</span>
            <span>•</span>
            <span>{profile?.weight || '--'} KG</span>
          </div>
        </div>

        <div className="flex gap-8">
          <div className="text-center">
            <p className="font-headline text-3xl font-bold">{profile?.streak || 0}</p>
            <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Day Streak</p>
          </div>
          <div className="text-center">
            <p className="font-headline text-3xl font-bold">{profile?.points || 0}</p>
            <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">XP Points</p>
          </div>
          <div className="text-center">
            <p className="font-headline text-3xl font-bold">#{Math.floor(Math.random() * 100) + 1}</p>
            <p className="font-label text-[10px] text-on-surface-variant uppercase tracking-widest">Global Rank</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-surface-container p-8 rounded-3xl space-y-6">
          <h3 className="font-headline text-xl font-bold uppercase flex items-center gap-2">
            <Trophy size={20} className="text-secondary" />
            Achievements
          </h3>
          <div className="space-y-4">
            {achievements.map((a) => {
              const isUnlocked = profile?.achievements?.includes(a.id);
              let progress = 0;
              if (profile) {
                if (a.requirement.type === 'points') progress = Math.min((profile.points / a.requirement.value) * 100, 100);
                if (a.requirement.type === 'streak') progress = Math.min((profile.streak / a.requirement.value) * 100, 100);
                if (a.requirement.type === 'iq') progress = Math.min((profile.stats.iq / a.requirement.value) * 100, 100);
              }
              
              return (
                <div key={a.id} className={cn("space-y-2", !isUnlocked && "opacity-60")}>
                  <div className="flex justify-between items-end">
                    <div>
                      <p className="font-label text-sm font-bold uppercase flex items-center gap-2">
                        {a.title}
                        {isUnlocked && <CheckCircle2 size={14} className="text-secondary" />}
                      </p>
                      <p className="font-body text-[10px] text-on-surface-variant">{a.description}</p>
                    </div>
                    <span className="font-headline font-bold text-xs">{Math.floor(progress)}%</span>
                  </div>
                  <div className="h-1.5 bg-surface-container-highest rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      className="h-full bg-primary" 
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-surface-container p-8 rounded-3xl space-y-6">
          <h3 className="font-headline text-xl font-bold uppercase flex items-center gap-2">
            <ShoppingBag size={20} className="text-secondary" />
            Training Gear
          </h3>
          <p className="text-sm text-on-surface-variant">Manage your equipment and boosts to maximize your training efficiency. Your personalized character has been retired to focus on pure performance tracking.</p>
          <button 
            onClick={onOpenShop}
            className="w-full py-4 bg-secondary text-on-secondary font-label text-xs font-bold rounded-xl uppercase tracking-widest hover:bg-secondary-fixed-dim transition-all shadow-lg shadow-secondary/20"
          >
            Open Pro Shop
          </button>
        </div>
      </section>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSettingsOpen(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md bg-surface-container-high p-8 rounded-3xl border border-outline-variant shadow-2xl space-y-8"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-headline text-2xl font-black uppercase tracking-tight">Profile Settings</h3>
                <button onClick={() => setIsSettingsOpen(false)} className="p-2 hover:bg-surface-container rounded-full">
                  <Plus size={24} className="rotate-45" />
                </button>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Display Name</label>
                  <input 
                    value={editData.displayName}
                    onChange={(e) => setEditData({...editData, displayName: e.target.value})}
                    className="w-full bg-surface-container border-none rounded-2xl p-4 font-label text-lg text-on-surface focus:ring-2 focus:ring-secondary transition-all" 
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Age</label>
                    <input 
                      type="number"
                      value={editData.age}
                      onChange={(e) => setEditData({...editData, age: parseInt(e.target.value)})}
                      className="w-full bg-surface-container border-none rounded-2xl p-4 font-label text-lg text-on-surface focus:ring-2 focus:ring-secondary transition-all" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Gender</label>
                    <select 
                      value={editData.gender}
                      onChange={(e) => setEditData({...editData, gender: e.target.value as any})}
                      className="w-full bg-surface-container border-none rounded-2xl p-4 font-label text-lg text-on-surface focus:ring-2 focus:ring-secondary transition-all"
                    >
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Height (cm)</label>
                    <input 
                      type="number"
                      value={editData.height}
                      onChange={(e) => setEditData({...editData, height: parseInt(e.target.value)})}
                      className="w-full bg-surface-container border-none rounded-2xl p-4 font-label text-lg text-on-surface focus:ring-2 focus:ring-secondary transition-all" 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-label text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Weight (kg)</label>
                    <input 
                      type="number"
                      value={editData.weight}
                      onChange={(e) => setEditData({...editData, weight: parseInt(e.target.value)})}
                      className="w-full bg-surface-container border-none rounded-2xl p-4 font-label text-lg text-on-surface focus:ring-2 focus:ring-secondary transition-all" 
                    />
                  </div>
                </div>
              </div>

              <button 
                onClick={handleSave}
                className="w-full py-5 bg-primary text-on-primary-fixed font-label font-black rounded-2xl uppercase tracking-[0.2em] hover:bg-primary/90 transition-all shadow-xl shadow-primary/20"
              >
                SAVE CHANGES
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// --- Main App ---

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

// --- Skill Tests Component ---

const SkillTests: React.FC<{ 
  tests: SkillTest[]; 
  onComplete: (test: SkillTest, results: number[]) => void;
  history: any[];
}> = ({ tests, onComplete, history }) => {
  const [selectedTest, setSelectedTest] = useState<SkillTest | null>(null);
  const [results, setResults] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<'tests' | 'history'>('tests');

  const handleStart = (test: SkillTest) => {
    setSelectedTest(test);
    setResults(new Array(test.drills.length).fill(0));
  };

  const calculateScore = (test: SkillTest, userResults: number[]) => {
    let totalScore = 0;
    test.drills.forEach((drill, index) => {
      const userVal = userResults[index];
      // For time-based (seconds), lower is better (e.g. 20-yard dash)
      let drillScore = 0;
      if (drill.unit === 'seconds') {
        drillScore = Math.min(100, (drill.target / userVal) * 100);
      } else {
        drillScore = Math.min(100, (userVal / drill.target) * 100);
      }
      totalScore += drillScore;
    });
    return Math.round(totalScore / test.drills.length);
  };

  if (selectedTest) {
    const score = calculateScore(selectedTest, results);
    
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <button onClick={() => setSelectedTest(null)} className="p-2 hover:bg-surface-container rounded-full">
            <ChevronLeft size={24} />
          </button>
          <h2 className="font-headline text-2xl font-bold uppercase">{selectedTest.title}</h2>
        </div>

        <div className="bg-surface-container p-6 rounded-3xl border border-outline-variant">
          <p className="text-on-surface-variant mb-6">{selectedTest.description}</p>
          
          <div className="space-y-6">
            {selectedTest.drills.map((drill, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="font-label font-bold uppercase text-sm">{drill.name}</label>
                  <span className="text-xs text-on-surface-variant">Target: {drill.target} {drill.unit}</span>
                </div>
                <div className="flex items-center gap-4">
                  <input 
                    type="number" 
                    value={results[idx]} 
                    onChange={(e) => {
                      const newResults = [...results];
                      newResults[idx] = parseFloat(e.target.value) || 0;
                      setResults(newResults);
                    }}
                    className="flex-1 bg-surface-container-high border border-outline rounded-xl px-4 py-3 focus:outline-none focus:border-primary"
                    placeholder={`Enter ${drill.unit}...`}
                  />
                  <span className="font-label font-bold uppercase text-xs w-16">{drill.unit}</span>
                </div>
                <p className="text-xs text-on-surface-variant italic">{drill.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 pt-6 border-t border-outline-variant">
            <div className="flex justify-between items-center mb-6">
              <div>
                <p className="text-xs font-label font-bold uppercase text-on-surface-variant">Estimated Skill Level</p>
                <p className="text-3xl font-headline font-black text-primary">{score}/100</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-label font-bold uppercase text-on-surface-variant">Discipline</p>
                <p className="font-headline font-bold uppercase text-secondary">{selectedTest.discipline}</p>
              </div>
            </div>

            <button 
              onClick={() => onComplete(selectedTest, results)}
              className="w-full bg-primary text-on-primary-fixed py-4 rounded-2xl font-label font-bold uppercase tracking-widest hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
            >
              Submit Results & Update Stats
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="font-headline text-2xl font-bold uppercase tracking-tight">Skill Assessments</h2>
        <div className="flex bg-surface-container-high p-1 rounded-xl border border-outline-variant">
          <button 
            onClick={() => setActiveTab('tests')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'tests' ? 'bg-primary text-on-primary-fixed' : 'text-on-surface-variant hover:bg-surface-container'}`}
          >
            Tests
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-primary text-on-primary-fixed' : 'text-on-surface-variant hover:bg-surface-container'}`}
          >
            History
          </button>
        </div>
      </div>

      {activeTab === 'tests' ? (
        <>
          <p className="text-on-surface-variant">Complete these tests to calibrate your in-game attributes. Be honest with your results for the best training plan.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tests.map((test) => (
              <motion.div 
                key={test.id}
                whileHover={{ y: -4 }}
                className="bg-surface-container p-6 rounded-3xl border border-outline-variant flex flex-col justify-between"
              >
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-secondary/10 text-secondary rounded-2xl">
                      {test.discipline === 'shooting' && <Target size={24} />}
                      {test.discipline === 'dribbling' && <Zap size={24} />}
                      {test.discipline === 'finishing' && <Activity size={24} />}
                      {test.discipline === 'athleticism' && <Dumbbell size={24} />}
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant bg-surface-container-high px-2 py-1 rounded-lg border border-outline-variant">
                      {test.drills.length} Drills
                    </span>
                  </div>
                  <h3 className="font-headline text-xl font-bold uppercase mb-2">{test.title}</h3>
                  <p className="text-sm text-on-surface-variant line-clamp-2 mb-6">{test.description}</p>
                </div>
                
                <button 
                  onClick={() => handleStart(test)}
                  className="w-full py-3 bg-surface-container-high border border-outline rounded-xl font-label font-bold uppercase text-xs hover:bg-primary hover:text-on-primary-fixed hover:border-primary transition-all"
                >
                  Start Assessment
                </button>
              </motion.div>
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          {history.length === 0 ? (
            <div className="text-center py-20 bg-surface-container rounded-3xl border border-outline-variant border-dashed">
              <Activity size={48} className="mx-auto text-on-surface-variant/20 mb-4" />
              <p className="text-on-surface-variant font-label uppercase tracking-widest text-sm">No assessment history yet</p>
            </div>
          ) : (
            history.map((result) => (
              <div key={result.id} className="bg-surface-container p-4 rounded-2xl border border-outline-variant flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-primary/10 text-primary rounded-xl">
                    <Trophy size={20} />
                  </div>
                  <div>
                    <h4 className="font-headline font-bold uppercase text-sm tracking-tight">
                      {tests.find(t => t.id === result.testId)?.title || result.discipline.toUpperCase()}
                    </h4>
                    <p className="text-[10px] text-on-surface-variant font-label uppercase tracking-widest">
                      {format(result.timestamp, 'MMM dd, yyyy • HH:mm')}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-headline font-black text-secondary leading-none">{result.score}</p>
                  <p className="text-[10px] font-label font-bold uppercase text-on-surface-variant">SCORE</p>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

function AppContent() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [sessions, setSessions] = useState<ScheduleSession[]>([]);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [iqScenarios, setIqScenarios] = useState<IQScenario[]>([]);
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [currentScreen, setCurrentScreen] = useState<Screen>('dashboard');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [toast, setToast] = useState<{ message: string, type: 'success' | 'error' } | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [schedulingItem, setSchedulingItem] = useState<{ type: 'drill' | 'program', item: any } | null>(null);

  useEffect(() => {
    if (profile && (!profile.height || !profile.weight || !profile.age || !profile.gender)) {
      setShowOnboarding(true);
    } else {
      setShowOnboarding(false);
    }
  }, [profile]);

  const clearAllNotifications = async () => {
    if (!user) return;
    try {
      // Optimistic update
      const currentNotifications = [...notifications];
      setNotifications([]);
      
      const batch = writeBatch(db);
      currentNotifications.forEach(n => {
        batch.delete(doc(db, 'users', user.uid, 'notifications', n.id));
      });
      await batch.commit();
      showToast("All notifications cleared", "success");
    } catch (error) {
      console.error("Failed to clear notifications", error);
      showToast("Failed to clear some notifications", "error");
    }
  };

  const handleLibrarySchedule = (type: 'drill' | 'program', item: any) => {
    setSchedulingItem({ type, item });
    setCurrentScreen('schedule');
  };

  const calculateTargets = (p: UserProfile) => {
    if (!p.height || !p.weight || !p.age || !p.gender) return { calories: 2500, protein: 150 };
    
    // Mifflin-St Jeor Equation
    const s = p.gender === 'male' ? 5 : -161;
    const bmr = (10 * p.weight) + (6.25 * p.height) - (5 * p.age) + s;
    
    // Activity factor for an athlete (Moderate activity)
    const tdee = Math.round(bmr * 1.55);
    
    // Protein: 2g per kg of body weight
    const protein = Math.round(p.weight * 2.0);
    
    return { calories: tdee, protein };
  };

  const targets = useMemo(() => profile ? calculateTargets(profile) : { calories: 2500, protein: 150 }, [profile]);

  const handleOnboardingSubmit = async (data: { height: number, weight: number, age: number, gender: 'male' | 'female' }) => {
    if (!user) return;
    try {
      await updateDoc(doc(db, 'users', user.uid), data);
      showToast("Profile updated! Your nutrition targets have been calculated.", "success");
      setShowOnboarding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setIsAuthReady(true);
      if (u) {
        // Add a welcome notification
        const welcomeId = 'welcome-' + Date.now();
        setDoc(doc(db, 'users', u.uid, 'notifications', welcomeId), {
          id: welcomeId,
          title: 'Welcome Back, Athlete!',
          message: 'Ready to dominate the paint today? Check your schedule for new sessions.',
          type: 'system',
          timestamp: Timestamp.now()
        });

        // Ensure user profile exists
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const newProfile: UserProfile = {
            uid: u.uid,
            displayName: u.displayName || 'Athlete',
            photoURL: u.photoURL || '',
            role: 'athlete',
            stats: { dribbling: 60, shooting: 60, finishing: 60, iq: 60, athleticism: 60 },
            careerPhase: 'LOCAL',
            streak: 0,
            points: 0,
            achievements: [],
            avatarItems: [],
            completedScenarios: [],
            lastIQReset: new Date().toISOString().split('T')[0],
            equippedItems: {},
            lastSkillTestDate: new Date().toISOString(),
            nutritionLog: []
          };
          await setDoc(userRef, newProfile);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Data Listeners
  useEffect(() => {
    if (!user) return;

    const testConnection = async () => {
      try {
        await getDoc(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    };
    testConnection();

    const profileSub = onSnapshot(doc(db, 'users', user.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as UserProfile;
        // Check for IQ reset
        const today = new Date().toISOString().split('T')[0];
        if (data.lastIQReset !== today) {
          updateDoc(doc.ref, {
            completedScenarios: [],
            lastIQReset: today
          });
        }
        setProfile(data);
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, `users/${user.uid}`));

    const sessionsSub = onSnapshot(query(collection(db, 'users', user.uid, 'schedule'), orderBy('startTime', 'asc')), (snap) => {
      const data = snap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        startTime: (d.data().startTime as Timestamp).toDate()
      })) as ScheduleSession[];
      setSessions(data);
    }, (e) => handleFirestoreError(e, OperationType.GET, `users/${user.uid}/schedule`));

    const drillsSub = onSnapshot(collection(db, 'drills'), (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Drill[];
      if (data.length === 0) {
        // Seed initial drills if empty
        const initialDrills: Partial<Drill>[] = [
          { title: 'Obsidian Handles', category: 'Dribbling', intensity: 'High', description: 'High-resistance ball handling focused on low-center gravity.', tags: ['Heavy Dribble', 'Speed'], image: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?q=80&w=2090&auto=format&fit=crop' },
          { title: 'Contact Finishing', category: 'Finishing', intensity: 'Medium', description: 'Mastering body control and touch while absorbing contact.', tags: ['Rim', 'Power'], image: 'https://images.unsplash.com/photo-1504450758481-7338eba7524a?q=80&w=2069&auto=format&fit=crop' },
          { title: 'Vert Maximizer', category: 'Athleticism', intensity: 'High', description: 'Plyometric progression for vertical leap.', tags: ['Jump', 'Explosive'], image: 'https://images.unsplash.com/photo-1519861531473-9200262188bf?q=80&w=2071&auto=format&fit=crop' },
          { title: 'Drop Coverage Reads', category: 'IQ', intensity: 'Low', description: 'Analyzing defensive positioning in P&R.', tags: ['Film', 'Tactical'] }
        ];
        initialDrills.forEach(d => addDoc(collection(db, 'drills'), d).catch(e => handleFirestoreError(e, OperationType.WRITE, 'drills')));
      }
      setDrills(data);
    }, (e) => handleFirestoreError(e, OperationType.GET, 'drills'));

    const workoutsSub = onSnapshot(collection(db, 'workouts'), (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Workout[];
      if (data.length === 0) {
        const initialWorkouts: Partial<Workout>[] = [
          { title: 'Elite Guard Warmup', description: 'Essential warmup for point guards.', category: 'Warmup', difficulty: 'Beginner', duration: 15, userId: null, drills: [] },
          { title: 'NBA Range Session', description: 'High volume shooting from deep.', category: 'Shooting', difficulty: 'Advanced', duration: 45, userId: null, drills: [] }
        ];
        initialWorkouts.forEach(w => addDoc(collection(db, 'workouts'), w));
      }
      setWorkouts(data);
    });

    const shopSub = onSnapshot(collection(db, 'shop'), (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id })) as ShopItem[];
      if (data.length === 0) {
        const initialItems: Partial<ShopItem>[] = [
          { name: 'Obsidian Lows', description: 'Elite traction for quick crossovers.', price: 1200, category: 'Apparel', subcategory: 'Shoes', image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?q=80&w=2070&auto=format&fit=crop' },
          { name: 'Aero Flight 5', description: 'Maximum bounce for verticality.', price: 1500, category: 'Apparel', subcategory: 'Shoes', image: 'https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?q=80&w=1964&auto=format&fit=crop' },
          { name: 'Hyper Dunk Elite', description: 'Stability for post moves.', price: 1800, category: 'Apparel', subcategory: 'Shoes', image: 'https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?q=80&w=1974&auto=format&fit=crop' },
          { name: 'Kobe 6 Protro', description: 'The ultimate performance shoe.', price: 2500, category: 'Apparel', subcategory: 'Shoes', image: 'https://images.unsplash.com/photo-1605348532760-6753d2c43329?q=80&w=1920&auto=format&fit=crop' },
          { name: 'Blackout Jersey', description: 'Breathable mesh for intense runs.', price: 500, category: 'Apparel', subcategory: 'Jersey', image: 'https://images.unsplash.com/photo-1515444744559-7be63e1600de?q=80&w=2070&auto=format&fit=crop' },
          { name: 'Neon City Jersey', description: 'Stand out on the court.', price: 750, category: 'Apparel', subcategory: 'Jersey', image: 'https://images.unsplash.com/photo-1580087444075-4ce33562443d?q=80&w=1974&auto=format&fit=crop' },
          { name: 'Pro Compression', description: 'Support for explosive movements.', price: 400, category: 'Apparel', subcategory: 'Shorts', image: 'https://images.unsplash.com/photo-1591195853828-11db59a44f6b?q=80&w=2070&auto=format&fit=crop' },
          { name: 'Elite Mesh Shorts', description: 'Classic comfort for practice.', price: 350, category: 'Apparel', subcategory: 'Shorts', image: 'https://images.unsplash.com/photo-1539185441755-769473a23570?q=80&w=2071&auto=format&fit=crop' },
          { name: 'Sweat Shield', description: 'Keep your vision clear.', price: 150, category: 'Apparel', subcategory: 'Headband', image: 'https://images.unsplash.com/photo-1523381210434-271e8be1f52b?q=80&w=2070&auto=format&fit=crop' },
          { name: 'Shooting Sleeve', description: 'Keep your arm warm and ready.', price: 200, category: 'Apparel', subcategory: 'Sleeve', image: 'https://images.unsplash.com/photo-1517438476312-10d79c077509?q=80&w=2071&auto=format&fit=crop' },
          { name: 'Fair Skin', description: 'Change your appearance.', price: 0, category: 'Apparel', subcategory: 'Skin' },
          { name: 'Tanned Skin', description: 'Change your appearance.', price: 0, category: 'Apparel', subcategory: 'Skin' },
          { name: 'Deep Skin', description: 'Change your appearance.', price: 0, category: 'Apparel', subcategory: 'Skin' },
          { name: 'Buzz Cut', description: 'Clean and simple.', price: 0, category: 'Apparel', subcategory: 'Hair' },
          { name: 'Dreadlocks', description: 'Iconic court style.', price: 500, category: 'Apparel', subcategory: 'Hair' },
          { name: 'Fro-Hawk', description: 'Bold and aggressive.', price: 600, category: 'Apparel', subcategory: 'Hair' },
          { name: 'XP Multiplier', description: 'Double XP for 24 hours.', price: 1000, category: 'Boost' },
          { name: 'Energy Drink', description: 'Instant recovery for next session.', price: 300, category: 'Boost' },
          { name: 'Weighted Vest', description: 'Increase intensity of all drills.', price: 2000, category: 'Equipment' },
          { name: 'Dribble Goggles', description: 'Improve your court vision.', price: 800, category: 'Equipment' },
        ];
        initialItems.forEach(item => addDoc(collection(db, 'shop'), item));
      }
      setShopItems(data);
    });

    const iqSub = onSnapshot(collection(db, 'iqScenarios'), (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id })) as IQScenario[];
      if (data.length === 0) {
        const initialScenarios: Partial<IQScenario>[] = [
          { 
            title: 'Pick & Roll Read', 
            description: 'The defender goes under the screen. What is your move?', 
            points: 100,
            options: [
              { text: 'Pull up for three', isCorrect: true, feedback: 'Correct! If they go under, punish them with the shot.' },
              { text: 'Drive to the rim', isCorrect: false, feedback: 'Incorrect. Driving into a sagging defender is low percentage.' }
            ]
          },
          {
            title: 'Transition Defense',
            description: 'You are back on defense 2-on-1. The ball handler is driving. What do you do?',
            points: 150,
            options: [
              { text: 'Stop the ball', isCorrect: true, feedback: 'Correct! Always stop the ball first in transition.' },
              { text: 'Stay with the trailer', isCorrect: false, feedback: 'Incorrect. Leaving the ball handler open leads to an easy layup.' }
            ]
          }
        ];
        initialScenarios.forEach(s => addDoc(collection(db, 'iqScenarios'), s));
      }
      setIqScenarios(data);
    });

    const achievementsSub = onSnapshot(collection(db, 'achievements'), (snap) => {
      const data = snap.docs.map(d => ({ ...d.data(), id: d.id })) as Achievement[];
      if (data.length === 0) {
        const initialAchievements: Partial<Achievement>[] = [
          { id: 'early-bird', title: 'Early Bird', description: 'Complete 5 sessions before 8 AM', points: 500, icon: 'Flame', requirement: { type: 'sessions', value: 5 } },
          { id: 'point-god', title: 'Point God', description: 'Reach 5000 XP points', points: 1000, icon: 'Trophy', requirement: { type: 'points', value: 5000 } },
          { id: 'iq-master', title: 'IQ Master', description: 'Reach 90 IQ stat', points: 1500, icon: 'Brain', requirement: { type: 'iq', value: 90 } },
          { id: 'streak-king', title: 'Streak King', description: 'Maintain a 10-day streak', points: 800, icon: 'Zap', requirement: { type: 'streak', value: 10 } }
        ];
        initialAchievements.forEach(a => setDoc(doc(db, 'achievements', a.id!), a));
      }
      setAchievements(data);
    });

    const testResultsSub = onSnapshot(query(collection(db, 'users', user.uid, 'testResults'), orderBy('timestamp', 'desc')), (snap) => {
      const data = snap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        timestamp: (d.data().timestamp as Timestamp).toDate()
      }));
      setTestResults(data);
    });

    const notificationsSub = onSnapshot(query(collection(db, 'users', user.uid, 'notifications'), orderBy('timestamp', 'desc'), limit(10)), (snap) => {
      const data = snap.docs.map(d => ({
        ...d.data(),
        id: d.id,
        timestamp: (d.data().timestamp as Timestamp).toDate()
      }));
      setNotifications(data);
    });

    return () => {
      profileSub();
      sessionsSub();
      drillsSub();
      workoutsSub();
      shopSub();
      iqSub();
      achievementsSub();
      testResultsSub();
      notificationsSub();
    };
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleLogout = () => signOut(auth);

  const addSession = async (session: Partial<ScheduleSession>) => {
    if (!user) return;
    try {
      const sessionId = Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'users', user.uid, 'schedule', sessionId), {
        ...session,
        id: sessionId,
        startTime: Timestamp.fromDate(session.startTime!)
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/schedule`);
    }
  };

  const updateSession = async (id: string, data: Partial<ScheduleSession>) => {
    if (!user || !profile) return;
    try {
      const updateData = { ...data };
      if (data.startTime) updateData.startTime = Timestamp.fromDate(data.startTime) as any;
      
      // Award XP on completion
      const session = sessions.find(s => s.id === id);
      if (data.completed && session && !session.xpAwarded) {
        const xp = 100; // Base XP for session
        await updateDoc(doc(db, 'users', user.uid), {
          points: profile.points + xp
        });
        updateData.xpAwarded = true;
        showToast(`Session Completed! +${xp} XP`, "success");
      }

      await updateDoc(doc(db, 'users', user.uid, 'schedule', id), updateData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}/schedule/${id}`);
    }
  };

  const deleteSession = async (id: string) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'schedule', id));
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/schedule/${id}`);
    }
  };

  const addWorkout = async (workout: Partial<Workout>) => {
    if (!user) return;
    try {
      const workoutId = Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'workouts', workoutId), {
        ...workout,
        id: workoutId,
        userId: user.uid
      });
      showToast("Workout saved successfully!", "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'workouts');
      showToast("Failed to save workout.", "error");
    }
  };

  const buyItem = async (item: ShopItem) => {
    if (!user || !profile) return;
    if (profile.points < item.price) {
      showToast("Not enough XP!", "error");
      return;
    }
    
    try {
      const isWearable = item.category === 'Apparel';
      const updateData: any = {
        points: profile.points - item.price,
        avatarItems: [...(profile.avatarItems || []), item.id]
      };

      if (isWearable && item.subcategory) {
        const sub = item.subcategory.toLowerCase();
        updateData[`equippedItems.${sub}`] = item.id;
      }

      await updateDoc(doc(db, 'users', user.uid), updateData);
      showToast(`${item.name} purchased and equipped!`, "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
      showToast("Purchase failed.", "error");
    }
  };

  const equipItem = async (item: ShopItem) => {
    if (!user || !profile || !item.subcategory) return;
    try {
      const sub = item.subcategory.toLowerCase();
      await updateDoc(doc(db, 'users', user.uid), {
        [`equippedItems.${sub}`]: item.id
      });
      showToast(`${item.name} equipped!`, "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const onAddNutrition = async (entry: Omit<NutritionEntry, 'id'>) => {
    if (!user || !profile) return;
    try {
      const newEntry: NutritionEntry = {
        ...entry,
        id: Math.random().toString(36).substr(2, 9)
      };
      await updateDoc(doc(db, 'users', user.uid), {
        nutritionLog: [...(profile.nutritionLog || []), newEntry]
      });
      showToast("Meal logged successfully!", "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const completeSkillTest = async (test: SkillTest, results: number[]) => {
    if (!user || !profile) return;
    try {
      // Calculate score (simplified for stat update)
      let totalScore = 0;
      test.drills.forEach((drill, index) => {
        const userVal = results[index];
        let drillScore = 0;
        if (drill.unit === 'seconds') {
          drillScore = Math.min(100, (drill.target / userVal) * 100);
        } else {
          drillScore = Math.min(100, (userVal / drill.target) * 100);
        }
        totalScore += drillScore;
      });
      const finalScore = Math.round(totalScore / test.drills.length);

      // Update stats
      const newStats = { ...profile.stats };
      const discipline = test.discipline as keyof typeof newStats;
      if (newStats[discipline] !== undefined) {
        // Blend current stat with test score (e.g. 70% current, 30% test)
        newStats[discipline] = Math.round(newStats[discipline] * 0.7 + finalScore * 0.3);
      }

      await updateDoc(doc(db, 'users', user.uid), {
        stats: newStats,
        points: profile.points + 250, // XP for completing test
        lastSkillTestDate: new Date().toISOString()
      });

      // Save detailed test results
      const testResultId = Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'users', user.uid, 'testResults', testResultId), {
        id: testResultId,
        testId: test.id,
        discipline: test.discipline,
        score: finalScore,
        results: results,
        timestamp: Timestamp.now()
      });

      showToast(`Assessment Complete! +250 XP. ${test.discipline.toUpperCase()} updated.`, "success");
      setCurrentScreen('dashboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const completeIQScenario = async (scenario: IQScenario, correct: boolean) => {
    if (!user || !profile) return;
    
    if (profile.completedScenarios?.includes(scenario.id)) {
      showToast("Already attempted today!", "error");
      return;
    }

    try {
      const updateData: any = {
        completedScenarios: [...(profile.completedScenarios || []), scenario.id]
      };

      if (correct) {
        updateData.points = profile.points + scenario.points;
        updateData['stats.iq'] = Math.min(100, profile.stats.iq + 2);
        showToast(`Correct! +${scenario.points} XP`, "success");
      } else {
        showToast("Incorrect read. Attempt used.", "error");
      }

      await updateDoc(doc(db, 'users', user.uid), updateData);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    }
  };

  const logSkill = async (log: Partial<SkillLog>) => {
    if (!user) return;
    try {
      const logId = Math.random().toString(36).substr(2, 9);
      await setDoc(doc(db, 'users', user.uid, 'skillLogs', logId), {
        ...log,
        id: logId,
        timestamp: Timestamp.fromDate(log.timestamp!)
      });
      
      // Update user stats slightly based on reflection
      if (profile) {
        const skill = log.skillType as keyof typeof profile.stats;
        const avgRating = (log.criteria!.c1 + log.criteria!.c2 + log.criteria!.c3 + log.criteria!.c4) / 4;
        const currentStat = profile.stats[skill] || 50;
        const newStat = Math.min(100, Math.max(0, currentStat + (avgRating - 3) * 0.5));
        
        await updateDoc(doc(db, 'users', user.uid), {
          [`stats.${skill}`]: newStat,
          points: profile.points + 50,
          streak: profile.streak + 1
        });
      }
      setCurrentScreen('dashboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `users/${user.uid}/skillLogs`);
    }
  };

  if (!isAuthReady) return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Activity className="text-secondary animate-spin" size={48} />
    </div>
  );

  if (!user) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="min-h-screen pb-24 bg-background text-on-surface font-body">
      <Header 
        user={user} 
        profile={profile} 
        onLogout={handleLogout} 
        onToggleNotifications={() => setShowNotifications(!showNotifications)}
      />

      <AnimatePresence>
        {showNotifications && (
          <NotificationsList 
            notifications={notifications} 
            onClose={() => setShowNotifications(false)} 
            onClearAll={clearAllNotifications}
          />
        )}
      </AnimatePresence>

      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className={cn(
              "fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-full font-label text-xs font-bold uppercase tracking-widest shadow-2xl flex items-center gap-3 border",
              toast.type === 'success' ? "bg-secondary text-on-secondary border-secondary/20" : "bg-error text-on-error border-error/20"
            )}
          >
            {toast.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
      
      <main className="pt-24 px-6 max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {currentScreen === 'dashboard' && (
            <Dashboard 
              key="dashboard" 
              profile={profile} 
              sessions={sessions} 
              setCurrentScreen={setCurrentScreen} 
              onAddNutrition={onAddNutrition}
              targets={targets}
            />
          )}
          {currentScreen === 'schedule' && (
            <Schedule 
              key="schedule" 
              sessions={sessions} 
              workouts={workouts}
              drills={drills}
              onAddSession={addSession} 
              onUpdateSession={updateSession}
              onDeleteSession={deleteSession}
              showToast={showToast}
              schedulingItem={schedulingItem}
              onClearScheduling={() => setSchedulingItem(null)}
            />
          )}
          {currentScreen === 'library' && (
            <Library 
              key="library" 
              drills={drills} 
              showToast={showToast} 
              onSchedule={handleLibrarySchedule}
            />
          )}
          {currentScreen === 'iq' && <IQSection key="iq" scenarios={iqScenarios} onComplete={completeIQScenario} profile={profile!} />}
          {currentScreen === 'career' && (
            <Workouts 
              key="career" 
              workouts={workouts.filter(w => w.userId === null || !w.userId || w.userId === user?.uid)} 
              drills={drills} 
              onAddWorkout={addWorkout} 
              showToast={showToast} 
            />
          )}
          {currentScreen === 'shop' && <Shop key="shop" items={shopItems} profile={profile!} onBuy={buyItem} onEquip={equipItem} />}
          {currentScreen === 'skill-tests' && <SkillTests tests={SKILL_TESTS} onComplete={completeSkillTest} history={testResults} />}
          {currentScreen === 'skill-log' && <SkillTracker key="skill-log" onLogSkill={logSkill} />}
          {currentScreen === 'profile' && (
            <Profile 
              key="profile" 
              profile={profile} 
              achievements={achievements}
              onUpdateProfile={(p) => updateDoc(doc(db, 'users', user.uid), p)} 
              onOpenShop={() => setCurrentScreen('shop')}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Onboarding Modal */}
      <AnimatePresence>
        {showOnboarding && <OnboardingModal onSubmit={handleOnboardingSubmit} />}
      </AnimatePresence>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 w-full h-20 flex justify-around items-center px-4 pb-4 bg-[#131313]/90 backdrop-blur-xl border-t border-[#484847]/10 z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.4)]">
        <NavItem 
          icon={LayoutDashboard} 
          label="DASHBOARD" 
          active={currentScreen === 'dashboard'} 
          onClick={() => setCurrentScreen('dashboard')} 
        />
        <NavItem 
          icon={CalendarIcon} 
          label="SCHEDULE" 
          active={currentScreen === 'schedule'} 
          onClick={() => setCurrentScreen('schedule')} 
        />
        <NavItem 
          icon={LibraryIcon} 
          label="LIBRARY" 
          active={currentScreen === 'library'} 
          onClick={() => setCurrentScreen('library')} 
        />
        <NavItem 
          icon={Brain} 
          label="IQ" 
          active={currentScreen === 'iq'} 
          onClick={() => setCurrentScreen('iq')} 
        />
        <NavItem 
          icon={Target} 
          label="TESTS" 
          active={currentScreen === 'skill-tests'} 
          onClick={() => setCurrentScreen('skill-tests')} 
        />
        <NavItem 
          icon={Dumbbell} 
          label="WORKOUTS" 
          active={currentScreen === 'career'} 
          onClick={() => setCurrentScreen('career')} 
        />
        <NavItem 
          icon={Activity} 
          label="TRACK" 
          active={currentScreen === 'skill-log'} 
          onClick={() => setCurrentScreen('skill-log')} 
        />
        <NavItem 
          icon={UserIcon} 
          label="PROFILE" 
          active={currentScreen === 'profile'} 
          onClick={() => setCurrentScreen('profile')} 
        />
      </nav>

      {/* Desktop FAB */}
      <button 
        onClick={() => setCurrentScreen('skill-log')}
        className="hidden md:flex fixed bottom-8 right-8 w-16 h-16 rounded-full bg-primary text-on-primary-fixed items-center justify-center shadow-2xl hover:scale-110 active:scale-90 transition-all z-50 group"
      >
        <Plus size={32} strokeWidth={3} />
        <span className="absolute right-20 bg-surface-container-highest text-white px-4 py-2 rounded-lg text-[10px] font-label font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
          Log Session
        </span>
      </button>
    </div>
  );
}
