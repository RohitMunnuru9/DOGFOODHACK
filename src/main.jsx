"use client";

import React, { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  auth, db, storage,
  doc, getDoc, collection, addDoc, updateDoc, setDoc, query, orderBy, limit,
  onSnapshot, getDocs, where, deleteField, arrayUnion, increment, writeBatch, ref, getBytes
} from './localStore';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut, AlertTriangle, X, CheckCircle2, Info, AlertOctagon, Sparkles, AlertCircle,
  Activity, Shield, Trophy, LayoutGrid, CheckCircle, Lock, ScanLine, MapPin, HandMetal,
  CalendarClock, Bell, QrCode, LayoutDashboard, User as UserIcon, ClipboardList, Check, Star, Crown, Phone,
  Gamepad2, Download, StickyNote, ArrowLeft, Gift, User
} from 'lucide-react';
import { format } from 'date-fns';
import { Scanner } from '@yudiel/react-qr-scanner';
import QRCode from 'react-qr-code';
import confetti from 'canvas-confetti';
import ArcadeDashboard from './Arcade';
import DogfoodWorkspace from './DogfoodWorkspace';
const brandIcon = '/icon.svg';

const TRACK_HELPERS = Array.from({ length: 9 }, (_, index) => ({
    track: `Track ${index + 1}`,
    faculty: { name: `Track ${index + 1} coordinator`, contact: '' },
    staff: 'Operations desk',
    students: [
        { name: `Registration helper ${index + 1}`, role: 'Registration Desk' },
        { name: `Venue helper ${index + 1}`, role: 'Venue Volunteer' },
        { name: `Jury helper ${index + 1}`, role: 'Jury Helpers' },
    ],
}));
const ROUND_RUBRICS = {
    idea: {
        id: 'idea',
        label: 'Idea Pitching',
        maxMarks: 20,
        rubrics: [
            { id: 'solution', label: 'Proposed Solution', max: 6 },
            { id: 'techKnowledge', label: 'Technical Knowledge', max: 8 },
            { id: 'presentation', label: 'Presentation', max: 6 },
        ]
    },
    phase1: {
        id: 'phase1',
        label: 'Hackathon Phase-I',
        maxMarks: 20,
        rubrics: [
            { id: 'solution_design', label: 'Solution Design', max: 6 },
            { id: 'techSkills', label: 'Demonstration Skills', max: 6 },
            { id: 'viva', label: 'Viva-Voce', max: 8 },
        ]
    },
    phase2: {
        id: 'phase2',
        label: 'Hackathon Phase-II',
        maxMarks: 30,
        rubrics: [
            { id: 'improvement', label: 'Improvement in Solution Design', max: 20 },
            { id: 'viva', label: 'Viva-Voce', max: 10 },
        ]
    },
    phase3: {
        id: 'phase3',
        label: 'Final Phase',
        maxMarks: 30,
        rubrics: [
            { id: 'innovation', label: 'Solution Impact & Innovation', max: 12 },
            { id: 'implementation', label: 'Implementation Quality', max: 10 },
            { id: 'scalability', label: 'Scalability, Feasibility & Market Value', max: 8 },
        ]
    }
};

const ROUND_GUIDELINES = {
  idea: [
    "Teams must clearly articulate the problem statement, target users, and the proposed solution approach within the allotted time.",
    "The proposed solution should demonstrate originality, relevance to the problem, and a clear understanding of the domain.",
    "Jury members will assess the team’s technical knowledge, including awareness of tools, technologies, feasibility, and potential implementation challenges.",
    "Presentations should be well-structured, concise, and professionally delivered, with effective communication and clarity of thought.",
    "During the Q&A session, teams are expected to respond confidently and logically, justifying their design and technical choices.",
    "Teams must notify the jury of their readiness for evaluation via the online platform."
  ],
  phase1: [
    "Teams will be evaluated on their ability to translate the proposed idea into a working solution.",
    "The solution should reflect sound technical implementation, logical architecture, and basic usability.",
    "Jury members will assess demonstration skills, including how effectively the team explains the working flow, features, and limitations of the solution.",
    "The Viva-Voce will focus on understanding the team’s individual contributions, design decisions, and problem-solving approach.",
    "Teams must update their evaluation readiness on the online platform before jury assessment."
  ],
  phase2: [
    "Evaluation will focus on the extent and quality of improvements made to the solution based on jury feedback from Phase-I.",
    "Teams should demonstrate enhanced functionality, improved performance, better UI/UX, or refined technical architecture.",
    "Completion of assigned tasks and responsiveness to jury suggestions will be given significant importance.",
    "The Viva-Voce will test the depth of understanding, scalability considerations, and technical trade-offs involved in the improved solution.",
    "Teams must notify the jury of their readiness for evaluation via the online platform."
  ],
  phase3: [
    "Teams will be evaluated on the sustainability of the solution, including long-term viability, scalability, maintainability, and real-world impact.",
    "Craftsmanship will assess code quality, system design, UI/UX polish, robustness, and overall completeness of the solution.",
    "The Viva-Voce will emphasize holistic understanding, future roadmap, ethical considerations, and business or deployment feasibility.",
    "Teams are expected to present a well-finished, production-ready solution supported by clear technical justification.",
    "Final evaluation readiness must be indicated through the online platform prior to jury assessment."
  ]
};

const TIMELINE_DATA = [
    { day: '25 Sep 2026', time: '18:00 UTC', title: 'DOGFOOD kickoff', location: 'Online' },
    { day: '25–28 Sep 2026', time: '72 hours', title: 'Build and test the portal', location: 'Online · team workspace' },
    { day: '28 Sep 2026', time: '18:00 UTC', title: 'Code freeze and project submission', location: 'Online' },
    { day: '28 Sep–8 Oct 2026', time: 'Judging window', title: 'Judges review submitted portals', location: 'Online' },
    { day: '5 Oct 2026', time: '18:00 UTC', title: 'Write Up Quest closes', location: 'Online' },
    { day: '9 Oct 2026', time: 'Announcement', title: 'Winners and adoption decision', location: 'Online' },
];

/* =========================================
   UTILS
   ========================================= */

const playNotificationTone = (volume = 0.15) => {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.18);
    oscillator.onended = () => context.close();
  } catch (_) { /* Audio can be blocked until a user gesture. */ }
};

const useSystemState = () => {
  const [state, setState] = useState({
    currentRound: 'phase1', // idea, phase1, phase2, phase3
    roundStatus: 'ongoing', // locked, ongoing, evaluation, completed
    notifications: []
  });

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'system', 'state'), (doc) => {
      if (doc.exists()) {
        setState(doc.data());
      } else {
        // Default init if not exists
        setState({
          currentRound: 'idea',
          roundStatus: 'locked'
        });
      }
    });
    return () => unsub();
  }, []);

  return state;
};

const logAction = async (
  userId,
  userEmail,
  userName,
  role,
  action,
  details
) => {
  try {
    await addDoc(collection(db, 'logs'), {
      userId,
      userEmail,
      userName,
      role,
      action,
      details,
      timestamp: new Date().toISOString()
    });
    console.log(`Action logged: ${action}`);
  } catch (error) {
    console.error("Error logging action:", error);
  }
};

/* =========================================
   UI COMPONENTS
   ========================================= */

/* --- TrollOverlay --- */
const PHYSICS_TEST = {
    intro: `An Indian Railways general coach of mass 2.0 × 10^4 kg is moving with constant speed 15 m/s. A chaiwala uncle of mass 75 kg suddenly sprints towards the engine at 3 m/s relative to the coach while yelling “chai garam”. His kettle leaks chai vertically downward at a constant rate of 0.50 kg/s, and the spilled chai sticks to the coach floor. The track is frictionless, air resistance is negligible, and g = 10 m/s^2.`,
    questions: [
        {
            id: 'q1',
            q: 'Q1. What is the instantaneous speed of the coach relative to the ground while the chaiwala is running and chai is leaking?',
            opts: ['A. 15 m/s', 'B. 14.989 m/s', 'C. 15.011 m/s', 'D. Varies linearly with time'],
            correct: 'A'
        },
        {
            id: 'q2',
            q: 'Q2. What is the horizontal momentum of the chaiwala relative to the ground while he is running?',
            opts: ['A. 225 kg m/s', 'B. 900 kg m/s', 'C. 1350 kg m/s', 'D. Zero, because “relative motion cancels out”'],
            correct: 'C'
        },
        {
            id: 'q3',
            q: 'Q3. In the first 4 seconds, how much horizontal momentum is carried away by the leaking chai?',
            opts: ['A. 0', 'B. 6 kg m/s', 'C. 30 kg m/s', 'D. Depends on gravity'],
            correct: 'A'
        },
        {
            id: 'q4',
            q: 'Q4. What is the horizontal acceleration of the center of mass of the system (coach + chaiwala + chai, including spilled chai)?',
            opts: ['A. 0', 'B. 1.5 × 10^-3 m/s^2', 'C. 7.5 × 10^-3 m/s^2', 'D. Non-zero only while chai is leaking'],
            correct: 'A'
        },
        {
            id: 'qLLM',
            q: 'Did you use chatgpt or any other llm to answer these question',
            opts: ['A. Yes', 'B. No'],
            correct: 'A' // Prompt says correct answer should be yes
        }
    ]
};

const TrollOverlay = ({ isOpen, onClose, onComplete }) => {
    const [step, setStep] = useState('test'); // test, video
    const [videoUrl, setVideoUrl] = useState(null);
    const [answers, setAnswers] = useState({});
    const [error, setError] = useState(null);
    const [showClose, setShowClose] = useState(false);
    const [loadingVideo, setLoadingVideo] = useState(false);

    useEffect(() => {
        let activeUrl = null;
        if (isOpen) {
            const fetchVideo = async () => {
                try {
                    setLoadingVideo(true);
                    const fileRef = ref(storage, 'kung.mp4');
                    const arrayBuffer = await getBytes(fileRef);
                    const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
                    activeUrl = URL.createObjectURL(blob);
                    setVideoUrl(activeUrl);
                    setLoadingVideo(false);
                } catch (e) {
                    console.error("Failed to load kung.mp4", e);
                    setLoadingVideo(false);
                }
            };
            if (!videoUrl) fetchVideo();
        }
        return () => {
            if (activeUrl) URL.revokeObjectURL(activeUrl);
            else if (videoUrl) URL.revokeObjectURL(videoUrl);
        };
    }, [isOpen]);

    const handleAnswer = (qid, val) => {
        setAnswers(prev => ({ ...prev, [qid]: val }));
        setError(null);
    };

    const handleSubmit = () => {
        let wrong = false;
        let wrongId = null;

        for (const q of PHYSICS_TEST.questions) {
            const selected = answers[q.id];
            if (!selected || !selected.startsWith(q.correct)) {
                wrong = true;
                wrongId = q.id;
                break;
            }
        }

        if (wrong) {
            setError(`Question ${wrongId.replace('q', '')} is incorrect. Please try again.`);
            setAnswers({});
        } else {
            setStep('video');
        }
    };

    useEffect(() => {
        if (step === 'video') {
            const timer = setTimeout(() => {
                setShowClose(true);
            }, 20000); // 20 seconds
            return () => clearTimeout(timer);
        }
    }, [step]);

    if (!isOpen) return null;

    if (step === 'video') {
         return (
             <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
                 {videoUrl ? (
                     <video
                        src={videoUrl}
                        autoPlay
                        className="w-full h-full object-contain"
                        onEnded={() => setShowClose(true)}
                     />
                 ) : (
                     <div className="text-white">Loading Verification Media...</div>
                 )}
                 {showClose && (
                     <button
                        onClick={onComplete}
                        className="absolute top-4 right-4 bg-white text-black px-4 py-2 rounded-full font-bold z-50"
                     >
                         Close & Return to Dashboard
                     </button>
                 )}
             </div>
         );
    }

    return (
        <div className="fixed inset-0 z-[300] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
             <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[85vh] overflow-y-auto flex flex-col shadow-2xl relative">
                 {/* Header */}
                 <div className="p-6 border-b sticky top-0 bg-white z-10 flex justify-between items-center">
                     <div>
                        <h2 className="text-2xl font-black text-gray-800">Physics Verification</h2>
                        <p className="text-sm text-gray-500">Required to access marks</p>
                     </div>
                     <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full"><X size={20}/></button>
                 </div>

                 {/* Content */}
                 <div className="p-6 md:p-8">
                     <p className="text-sm font-mono bg-indigo-50 text-indigo-900 p-4 rounded-xl mb-8 leading-relaxed font-medium border border-indigo-100">
                         {PHYSICS_TEST.intro}
                     </p>

                     <div className="space-y-8">
                         {PHYSICS_TEST.questions.map((q) => (
                             <div key={q.id} className="p-5 border border-gray-200 rounded-xl hover:border-indigo-200 transition-colors bg-white shadow-sm">
                                 <p className="font-bold text-gray-800 mb-4 text-base">{q.q}</p>
                                 <div className="space-y-3">
                                     {q.opts.map(opt => (
                                         <label key={opt} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${answers[q.id] === opt ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'}`}>
                                             <input
                                                type="radio"
                                                name={q.id}
                                                value={opt}
                                                checked={answers[q.id] === opt}
                                                onChange={() => handleAnswer(q.id, opt)}
                                                className={`w-5 h-5 ${answers[q.id] === opt ? 'accent-white' : 'accent-indigo-600'}`}
                                             />
                                             <span className="font-medium">{opt}</span>
                                         </label>
                                     ))}
                                 </div>
                             </div>
                         ))}
                     </div>

                     {error && (
                         <div className="mt-8 bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl font-bold text-center animate-bounce flex items-center justify-center gap-2">
                             <AlertOctagon size={20} />
                             {error}
                         </div>
                     )}

                     <button
                        onClick={handleSubmit}
                        className="w-full mt-8 py-5 bg-black text-white font-black text-xl rounded-2xl hover:bg-gray-900 transition-colors shadow-xl"
                     >
                        Submit & View Marks
                     </button>
                 </div>
             </div>
        </div>
    );
};

/* --- MarqueeItem --- */
const MarqueeItem = ({ text, imageSrc, isTechFont = false }) => {
    return (
        <div className="flex items-center gap-32 mx-16 select-none flex-shrink-0">
            {/* 1. TEXT */}
            <span
                className={`
                    text-pop whitespace-nowrap
                    ${isTechFont ? 'font-tech text-6xl tracking-widest' : 'font-sans text-[12vh] uppercase tracking-tight'}
                `}
            >
                {text}
            </span>

            {/* 2. LOGO */}
            {imageSrc && (
                <img
                    src={imageSrc}
                    alt="logo"
                    style={{
                        filter: 'brightness(0) saturate(100%) invert(31%) sepia(97%) saturate(1377%) hue-rotate(228deg) brightness(84%) contrast(100%)'
                    }}
                    className={`
                        w-auto object-contain flex-shrink-0 transition-all duration-300
                        opacity-30
                        hover:filter-none hover:opacity-100 hover:scale-105 hover:!filter-none
                        h-24
                    `}
                    onMouseEnter={(e) => { e.currentTarget.style.filter = 'none'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.filter = 'brightness(0) saturate(100%) invert(31%) sepia(97%) saturate(1377%) hue-rotate(228deg) brightness(84%) contrast(100%)'; }}
                    onError={(e) => {e.target.style.display='none'}}
                />
            )}
        </div>
    );
};

/* --- MarqueeRow --- */
const MarqueeRow = ({ items, direction = 1, speed = 20, className = "" }) => {
    return (
        <div className={`flex overflow-hidden relative w-full pointer-events-auto py-2 ${className}`}>
            <motion.div
                className="flex whitespace-nowrap will-change-transform items-center"
                animate={{ x: direction > 0 ? [0, -1000] : [-1000, 0] }}
                transition={{
                    repeat: Infinity,
                    ease: "linear",
                    duration: speed,
                }}
            >
                {[...Array(4)].map((_, setIndex) => (
                    <div key={setIndex} className="flex items-center flex-shrink-0">
                        {items.map((item, i) => (
                            <MarqueeItem
                                key={`${setIndex}-${i}`}
                                text={item.text}
                                imageSrc={item.image}
                                isTechFont={item.isTech}
                            />
                        ))}
                    </div>
                ))}
            </motion.div>
        </div>
    );
};

const UserManagement = () => {
    const [users, setUsers] = useState([]);
    // Updated initial filter state
    const [filter, setFilter] = useState({ role: 'all', search: '' }); 
    const [editingUser, setEditingUser] = useState(null);
    const [newEmail, setNewEmail] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const q = query(collection(db, 'users'));
        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setUsers(data);
        });
        return () => unsub();
    }, []);

    // --- UPDATED FILTER LOGIC ---
    const filteredUsers = users.filter(u => {
        let matchesRole = false;

        if (filter.role === 'all') {
            matchesRole = true;
        } else if (filter.role === 'helper') {
            matchesRole = u.role === 'helper';
        } else if (['Registration Desk', 'Venue Volunteer', 'Jury Helpers'].includes(filter.role)) {
            matchesRole = u.role === 'helper' && u.helperRole === filter.role;
        } else {
            matchesRole = u.role === filter.role;
        }

        const searchLower = filter.search.toLowerCase();
        const matchesSearch =
            (u.name && u.name.toLowerCase().includes(searchLower)) ||
            (u.email && u.email.toLowerCase().includes(searchLower)) ||
            (u.id && u.id.toLowerCase().includes(searchLower)) ||
            (u.teamId && u.teamId.toLowerCase().includes(searchLower)) ||
            (u.assignedTrack && u.assignedTrack.toLowerCase().includes(searchLower));
        
        return matchesRole && matchesSearch;
    });

    const handleEdit = (user) => {
        setEditingUser(user);
        setNewEmail(user.email);
    };

    const handleSaveEmail = async () => {
        if (!editingUser || !newEmail.trim()) return;
        setLoading(true);
        try {
            const batch = writeBatch(db);
            const userRef = doc(db, 'users', editingUser.id);
            batch.update(userRef, { email: newEmail.trim() });
            
            if (editingUser.teamId) {
                const teamRef = doc(db, 'teams', editingUser.teamId);
                batch.update(teamRef, { leaderEmail: newEmail.trim() });
            }

            await batch.commit();
            setEditingUser(null);
            setNewEmail('');

        } catch (err) {
            console.error(err);
            alert("Failed to update email: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const roleFilters = [
        { id: 'all', label: 'All' },
        { id: 'admin', label: 'Admin' },
        { id: 'jury', label: 'Jury' },
        { id: 'contestant', label: 'Student' },
        { id: 'helper', label: 'All Helpers' },
        { id: 'Registration Desk', label: 'Reg Desk' },
        { id: 'Venue Volunteer', label: 'Venue Vol' },
        { id: 'Jury Helpers', label: 'Jury Helper' },
    ];

    return (
        <>
            <GlassCard className="p-0 overflow-hidden flex flex-col" style={{ height: 'calc(100vh - 180px)' }}>
                {/* Header Section */}
                <div className="p-4 border-b border-gray-100 bg-white/50 flex flex-col xl:flex-row justify-between gap-4 shrink-0">
                    <div className="flex flex-col gap-2">
                        <h2 className="text-xl font-bold text-gray-800">User Management <span className="text-sm font-normal text-gray-500">({filteredUsers.length})</span></h2>
                        <div className="flex flex-wrap gap-1">
                            {roleFilters.map(r => (
                                <button
                                    key={r.id}
                                    onClick={() => setFilter({ ...filter, role: r.id })}
                                    className={`px-3 py-1 text-[10px] md:text-xs font-bold rounded-md uppercase tracking-wide transition-all
                                        ${filter.role === r.id 
                                            ? 'bg-indigo-600 text-white shadow-md' 
                                            : 'bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700'}`}
                                >
                                    {r.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="relative self-start xl:self-end">
                        <input
                            type="text"
                            placeholder="Search users..."
                            value={filter.search}
                            onChange={e => setFilter({ ...filter, search: e.target.value })}
                            className="pl-8 pr-4 py-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-indigo-500 outline-none w-64 bg-white"
                        />
                        <div className="absolute left-2.5 top-2.5 text-gray-400">
                            <ScanLine size={14} />
                        </div>
                    </div>
                </div>

                {/* Table Container */}
                <div className="flex-1 overflow-y-auto min-h-0 custom-scrollbar bg-white/30">
                    <table className="w-full text-left border-collapse relative">
                        <thead className="sticky top-0 bg-white/95 backdrop-blur z-10 text-xs text-gray-500 uppercase font-bold tracking-wider shadow-sm">
                            <tr>
                                <th className="p-4">Name / ID</th>
                                <th className="p-4">Role</th>
                                <th className="p-4">Email</th>
                                <th className="p-4">Details</th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm divide-y divide-gray-100">
                            {filteredUsers.map(u => (
                                <tr key={u.id} className="hover:bg-indigo-50/30 transition-colors">
                                    <td className="p-4">
                                        <div className="font-bold text-gray-800">{u.name || 'No Name'}</div>
                                        <div className="text-xs text-gray-400 font-mono">{u.id}</div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex flex-col items-start gap-1">
                                            <span className={`px-2 py-1 rounded-full text-xs font-bold uppercase
                                                ${u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                                                u.role === 'jury' ? 'bg-blue-100 text-blue-700' :
                                                u.role === 'contestant' ? 'bg-green-100 text-green-700' :
                                                'bg-orange-100 text-orange-700'}`}>
                                                {u.role}
                                            </span>
                                            {u.role === 'helper' && u.helperRole && (
                                                <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                                    {u.helperRole}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="p-4 font-mono text-gray-600 select-all">{u.email}</td>
                                    <td className="p-4 text-xs text-gray-500">
                                        {u.teamId && <div>Team: <span className="font-bold">{u.teamId}</span></div>}
                                        {u.assignedTrack && <div>Track: <span className="font-bold text-indigo-600">{u.assignedTrack}</span></div>}
                                        {u.assignedVenue && <div>Venue: <span className="font-bold">{u.assignedVenue}</span></div>}
                                        {u.isExtraJury && <div className="text-orange-600 font-bold">Extra Jury</div>}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => handleEdit(u)}
                                            className="text-indigo-600 hover:bg-indigo-50 p-2 rounded-lg transition-colors font-bold text-xs border border-transparent hover:border-indigo-100"
                                        >
                                            Edit Email
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredUsers.length === 0 && (
                                <tr>
                                    <td colSpan="5" className="p-8 text-center text-gray-400 font-bold">
                                        No users found matching filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </GlassCard>

            {/* Edit Modal - MOVED TO PORTAL TO FIX CUTOFF */}
            {createPortal(
                <AnimatePresence>
                    {editingUser && (
                        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                exit={{ scale: 0.9, opacity: 0 }}
                                className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 relative"
                            >
                                <h3 className="text-xl font-bold text-gray-800 mb-4">Edit Email</h3>
                                <div className="mb-4">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Current Email</label>
                                    <div className="text-gray-800 font-mono bg-gray-50 p-2 rounded border border-gray-100">{editingUser.email}</div>
                                </div>
                                <div className="mb-6">
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">New Email</label>
                                    <input
                                        type="email"
                                        value={newEmail}
                                        onChange={e => setNewEmail(e.target.value)}
                                        className="w-full border border-indigo-200 rounded-lg p-3 outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                                        autoFocus
                                    />
                                    {editingUser.teamId && (
                                        <p className="text-xs text-orange-500 mt-2 font-bold flex items-center gap-1">
                                            <AlertTriangle size={12} />
                                            Updates Team Leader Email as well.
                                        </p>
                                    )}
                                </div>
                                <div className="flex justify-end gap-3">
                                    <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg">Cancel</button>
                                    <button
                                        onClick={handleSaveEmail}
                                        disabled={loading}
                                        className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                                    >
                                        {loading ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
};
/* --- WhiteBackground --- */
const WhiteBackground = React.memo(() => {
    return (
        <div className="fixed inset-0 z-0 flex flex-col justify-center items-center h-screen overflow-hidden bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50">
            {/* Blobs */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="blob absolute -top-[10%] -left-[10%] w-[40vw] h-[40vw] bg-indigo-300 rounded-full filter blur-[80px] opacity-40 animate-float"></div>
                <div className="blob absolute bottom-[10%] -right-[10%] w-[40vw] h-[40vw] bg-pink-200 rounded-full filter blur-[80px] opacity-40 animate-float" style={{animationDelay: '2s'}}></div>
            </div>

            {/* Noise */}
            <div className="absolute inset-0 bg-noise mix-blend-overlay opacity-50 pointer-events-none"></div>

            {/* Rotated Container */}
            <div className="relative flex flex-col gap-8 w-[120vw] -rotate-6 scale-110 pointer-events-auto z-0">
                <MarqueeRow
                    speed={40}
                    direction={1}
                    items={[
                        { text: "DOGFOOD 2026", image: brandIcon, isTech: false },
                        { text: "BUILD TOGETHER", image: brandIcon, isTech: false },
                    ]}
                />
                <MarqueeRow
                    speed={60}
                    direction={-1}
                    items={[
                        { text: "PROJECTS", image: brandIcon, isTech: false },
                        { text: "INNOVATION", image: brandIcon, isTech: false },
                    ]}
                />
                <MarqueeRow
                    speed={35}
                    direction={1}
                    items={[
                        { text: "IDEAS", image: brandIcon, isTech: true },
                        { text: "SOLUTIONS", image: brandIcon, isTech: true },
                    ]}
                />
                <MarqueeRow
                    speed={50}
                    direction={-1}
                    items={[
                        { text: "CREATE", image: brandIcon, isTech: false },
                        { text: "REVIEW", image: brandIcon, isTech: false },
                    ]}
                />
                <MarqueeRow
                    speed={45}
                    direction={1}
                    items={[
                        { text: "BUILD", image: brandIcon, isTech: true },
                        { text: "PUBLISH", image: brandIcon, isTech: true },
                    ]}
                />
                 <MarqueeRow
                    speed={55}
                    direction={-1}
                    items={[
                        { text: "DOGFOOD 2026", image: brandIcon, isTech: false },
                        { text: "CELEBRATE", image: brandIcon, isTech: false },
                    ]}
                />
            </div>
        </div>
    );
});

/* --- GlassCard --- */
const GlassCard = ({ children, className = "", delay = 0, onClick }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: delay }}
      onClick={onClick}
      className={`
        portal-glass-card relative overflow-hidden
        bg-white/40 backdrop-blur-md
        border border-white/60
        shadow-xl
        rounded-3xl
        will-change-transform
        ${className}
      `}
    >
        {/* Shine effect */}
        <div className="absolute inset-0 bg-gradient-to-tr from-white/40 to-transparent pointer-events-none" />
        <div className="relative z-10 h-full w-full">
            {children}
        </div>
    </motion.div>
  );
};

/* --- SkeletonCard --- */
const SkeletonCard = () => (
    <div className="p-3 rounded-xl border border-gray-100 bg-white/50 animate-pulse flex items-center justify-between">
        <div className="flex items-center gap-3 overflow-hidden w-full">
            <div className="w-10 h-10 rounded-lg bg-gray-200"></div>
            <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 bg-gray-200 rounded"></div>
                <div className="h-2 w-1/2 bg-gray-200 rounded"></div>
            </div>
        </div>
        <div className="w-8 h-8 rounded-lg bg-gray-200 shrink-0"></div>
    </div>
);

/* --- CheckInModal --- */
const CheckInModal = ({ isOpen, onClose, onConfirm, members = [] }) => {
  const [attendance, setAttendance] = useState({});
  const [step, setStep] = useState('select'); // 'select' | 'confirm'

  useEffect(() => {
    if (isOpen) {
      const initial = {};
      members.forEach(m => {
        initial[m] = { present: false, diet: null }; // No defaults
      });
      setAttendance(initial);
      setStep('select');
    }
  }, [isOpen, members]);

  // Validation Logic
  const presentMembers = Object.entries(attendance).filter(([_, val]) => val.present);
  const isValid = presentMembers.length > 0 && presentMembers.every(([_, val]) => val.diet !== null);

  const handleReview = () => {
      if (isValid) setStep('confirm');
  };

  const handleSubmit = () => {
    const presentList = presentMembers.map(([name, val]) => ({ name, diet: val.diet }));
    onConfirm(presentList);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[80vh]"
      >
        {step === 'select' ? (
            <>
                <h3 className="text-xl font-bold text-gray-800 mb-2 text-center">Mark Attendance</h3>
                <p className="text-sm text-gray-500 mb-6 text-center">Manually select present members and their food preference.</p>

                <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3 mb-6 pr-2">
                    {members.length === 0 && <p className="text-center text-red-500 text-sm">No members found for this team.</p>}
                    {members.map(member => {
                        const data = attendance[member] || { present: false, diet: null };
                        return (
                            <div key={member} className={`p-3 rounded-xl border transition-all ${data.present ? 'bg-indigo-50 border-indigo-200' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                                <div className="flex items-center justify-between mb-2">
                                    <span className="font-bold text-gray-800 text-sm">{member}</span>
                                    <input
                                        type="checkbox"
                                        checked={data.present}
                                        onChange={() => setAttendance(prev => {
                                            const isPresent = !prev[member]?.present;
                                            return { ...prev, [member]: { present: isPresent, diet: isPresent ? null : null } };
                                        })}
                                        className="w-5 h-5 accent-indigo-600 cursor-pointer"
                                    />
                                </div>

                                {data.present && (
                                    <div className="flex gap-2 animate-in fade-in slide-in-from-top-1">
                                        <button
                                            onClick={() => setAttendance(prev => ({ ...prev, [member]: { ...prev[member], diet: 'veg' } }))}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${data.diet === 'veg' ? 'bg-green-100 text-green-700 border-green-200 shadow-sm' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}
                                        >
                                            Veg 🟢
                                        </button>
                                        <button
                                            onClick={() => setAttendance(prev => ({ ...prev, [member]: { ...prev[member], diet: 'non-veg' } }))}
                                            className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${data.diet === 'non-veg' ? 'bg-red-100 text-red-700 border-red-200 shadow-sm' : 'bg-white text-gray-400 border-gray-200 hover:bg-gray-50'}`}
                                        >
                                            Non-Veg 🔴
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="flex gap-2 shrink-0">
                  <button onClick={onClose} className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">
                    Cancel
                  </button>
                  <button
                    onClick={handleReview}
                    disabled={!isValid}
                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Review
                  </button>
                </div>
            </>
        ) : (
            <>
                <h3 className="text-xl font-bold text-gray-800 mb-2 text-center">Verify Details</h3>
                <p className="text-sm text-gray-500 mb-6 text-center">Please confirm the list before submitting. This cannot be changed later.</p>

                <div className="flex-1 overflow-y-auto custom-scrollbar mb-6 bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <div className="space-y-2">
                        {presentMembers.map(([name, val]) => (
                            <div key={name} className="flex justify-between items-center border-b border-gray-200 pb-2 last:border-0 last:pb-0">
                                <span className="font-bold text-gray-800 text-sm">{name}</span>
                                <span className={`text-xs font-bold px-2 py-1 rounded-lg uppercase ${val.diet === 'veg' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {val.diet}
                                </span>
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-gray-200 text-center flex justify-around text-xs font-bold text-gray-500">
                        <span>Total: {presentMembers.length}</span>
                        <span>Veg: {presentMembers.filter(m => m[1].diet === 'veg').length}</span>
                        <span>Non-Veg: {presentMembers.filter(m => m[1].diet === 'non-veg').length}</span>
                    </div>
                </div>

                <div className="flex gap-2 shrink-0">
                  <button onClick={() => setStep('select')} className="flex-1 py-3 text-gray-500 font-bold hover:bg-gray-100 rounded-xl flex items-center justify-center gap-2">
                    <ArrowLeft size={16} /> Edit
                  </button>
                  <button
                    onClick={handleSubmit}
                    className="flex-1 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700"
                  >
                    Submit Check-In
                  </button>
                </div>
            </>
        )}
      </motion.div>
    </div>
  );
};

/* --- CelebrationOverlay --- */
const CelebrationOverlay = ({ onClose, teamDetails, userProfile, onFeedbackSuccess, role = 'contestant' }) => {
  const [step, setStep] = useState('intro'); // intro, form, certificates, completed, surprise
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null); 
  const [certificates, setCertificates] = useState([]);
  const [selectedCert, setSelectedCert] = useState(null);
  const [downloadedMembers, setDownloadedMembers] = useState(() => {
      try { return JSON.parse(localStorage.getItem('downloadedCerts') || '[]'); } catch { return []; }
  });

  // Surprise State
  const [rickRollUrl, setRickRollUrl] = useState(null);
  const [playingRick, setPlayingRick] = useState(false);

  // Contestant Feedback State
  const [feedback, setFeedback] = useState({
     q1: '', q2: '', q3: '', q4: '', q5: '', q6: '', q7: ''
  });

  // Jury Feedback State
  const [juryFeedback, setJuryFeedback] = useState({
      name: userProfile?.name || '',
      designation: userProfile?.designation || '',
      contact: userProfile?.phone || '',
      organization: userProfile?.organization || '',
      q1: '', q2: '', q3: '', q5: '', q6: '', q7: '', q8: '', q9: ''
  });

  // Preload Rick Roll
  useEffect(() => {
      let url = null;
      const loadRick = async () => {
          try {
              const fileRef = ref(storage, 'rick roll.mp4');
              const arrayBuffer = await getBytes(fileRef);
              const blob = new Blob([arrayBuffer], { type: 'video/mp4' });
              url = URL.createObjectURL(blob);
              setRickRollUrl(url);
          } catch(e) { console.error("Failed to load surprise", e); }
      };
      if (role === 'contestant') loadRick();
      return () => {
          if (url) URL.revokeObjectURL(url);
      };
  }, [role]);

  // Check Downloads & Sync
  useEffect(() => {
      if (role === 'contestant') {
          // Strict Sync: DB is source of truth. If DB is empty, local should be empty.
          if (teamDetails) {
              const dbDown = teamDetails.downloadedCertificates || [];
              const localDown = JSON.parse(localStorage.getItem('downloadedCerts') || '[]');

              // If DB has reset (less than local), force reset local
              // Or just strictly trust DB.
              // Let's trust DB strictly for existence, but allow local to be "optimistically" ahead if actively downloading?
              // User said "I deleted the database... even then it says downloaded".
              // So we must prioritize DB state for "resetting".

              // If DB is empty but local is not -> Reset local
              if (dbDown.length === 0 && localDown.length > 0) {
                   localStorage.removeItem('downloadedCerts');
                   setDownloadedMembers([]);
              } else {
                   // Normal sync: Merge but respect DB as base?
                   // Actually, if DB has reset, we want to reset.
                   // So: set state to DB state.
                   // But what if we just downloaded and DB update is pending?
                   // We'll rely on handleDownload to update local.
                   // Here we just fix the "stuck" state.
                   if (JSON.stringify(dbDown) !== JSON.stringify(localDown)) {
                        // If DB is NOT empty, we can merge or just take DB.
                        // Let's take DB to be safe against deletions.
                        // UNLESS we just added one locally.
                        // Simplified: If DB count < Local count, trust DB (deletion happened).
                        if (dbDown.length < localDown.length) {
                             localStorage.setItem('downloadedCerts', JSON.stringify(dbDown));
                             setDownloadedMembers(dbDown);
                        } else {
                             // DB has more or same? Update local to match DB (restore from other device)
                             if (dbDown.length > localDown.length) {
                                  localStorage.setItem('downloadedCerts', JSON.stringify(dbDown));
                                  setDownloadedMembers(dbDown);
                             }
                        }
                   }
              }
          }

          if (teamDetails?.feedbackSubmitted) {
              setStep('certificates');
              
              const presentMembers = teamDetails?.attendanceDetails?.map(m => m.name) || [];
              // Re-read state (downloadedMembers might be stale in closure if not in dependency, but it is state)
              // But we just potentially updated it?
              // Better to use the DB value directly here for logic.
              const currentDown = teamDetails.downloadedCertificates || [];
              const allDownloaded = presentMembers.length > 0 && presentMembers.every(m => currentDown.includes(m));
              const isSurpriseDone = localStorage.getItem('surprise_done') === 'true';

              if (allDownloaded && !isSurpriseDone) {
                  setStep('surprise');
              } else {
                  // If surprise done or not all downloaded, stay on certificates
                  if (certificates.length === 0) fetchCertificates(false);
              }
          }
      } else if (role === 'jury') {
          if (userProfile?.feedbackSubmitted) {
              setStep('completed');
          }
      }
  }, [teamDetails, role, userProfile]);

  // Effect: Confetti & Fireworks Logic
  useEffect(() => {
    if (step !== 'intro') return;
    const duration = 5 * 1000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 200 };
    const randomInRange = (min, max) => Math.random() * (max - min) + min;

    const interval = setInterval(function() {
      const timeLeft = animationEnd - Date.now();
      if (timeLeft <= 0) return clearInterval(interval);
      const particleCount = 50 * (timeLeft / duration);
      confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } }));
      confetti(Object.assign({}, defaults, { particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } }));
    }, 250);

    const fireworkInterval = setInterval(() => {
         const x = Math.random();
         const y = Math.random() * 0.5;
         confetti({
            particleCount: 100,
            spread: 70,
            origin: { x, y },
            colors: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],
            shapes: ['circle', 'square'],
            zIndex: 201
         });
    }, 800);

    return () => { clearInterval(interval); clearInterval(fireworkInterval); };
  }, [step]);

  // Cleanup Blob URLs
  useEffect(() => {
    return () => {
      certificates.forEach(cert => {
        if (cert.url && cert.isBlob) {
          window.URL.revokeObjectURL(cert.url);
        }
      });
    };
  }, [certificates]);

  /* UPDATED: Added backgroundMode param to allow fetching without showing the loading spinner */
  const fetchCertificates = async (backgroundMode = false) => {
      if (!teamDetails || !teamDetails.attendanceDetails) return;
      
      // If running in background (during form fill), don't show global loader
      if (!backgroundMode) setLoading(true);

      const certs = [];
      const presentMembers = teamDetails.attendanceDetails.map(m => m.name);

      // Only artificial delay if we are showing the spinner
      if (!backgroundMode) await new Promise(resolve => setTimeout(resolve, 2000));

      for (const member of presentMembers) {
          // Skip if already downloaded
          if (downloadedMembers.includes(member)) {
             const safeTeamId = teamDetails.teamId.toUpperCase();
             const formattedName = member.trim().split(/\s+/)
                .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                .join('_');
             // Add placeholder so it shows up in list but marked as downloaded (logic in render handles isDownloaded)
             certs.push({ name: member, url: null, fileName: `${safeTeamId}_${formattedName}.pdf`, isBlob: false });
             continue;
          }

          try {
             const safeTeamId = teamDetails.teamId.toUpperCase();
             const formattedName = member.trim().split(/\s+/) 
                .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                .join('_');

             const fileName = `${safeTeamId}_${formattedName}.pdf`;
             const fileRef = ref(storage, fileName);
             
             // Secure Fetch
             const arrayBuffer = await getBytes(fileRef);
             const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
             const blobUrl = window.URL.createObjectURL(blob);
             
             certs.push({ name: member, url: blobUrl, fileName, isBlob: true });
          } catch (e) {
             console.error(`Certificate not found for ${member}:`, e);
             const safeTeamId = teamDetails.teamId.toUpperCase();
             const formattedName = member.trim().split(/\s+/) 
                .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
                .join('_');
             certs.push({ name: member, url: null, fileName: `${safeTeamId}_${formattedName}.pdf` });
          }
      }
      setCertificates(certs);
      
      const firstValid = certs.find(c => c.url); 
      if (firstValid) setSelectedCert(firstValid);
      
      if (!backgroundMode) setLoading(false);
  };

const handleDownload = async (cert) => {
      if (!cert.url || downloadedMembers.includes(cert.name)) return;
      
      setDownloadingId(cert.name);
      try {
          const link = document.createElement('a');
          link.href = cert.url;
          link.download = cert.fileName;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // FIX: Calculate new list based on current state variable
          const newDown = [...downloadedMembers, cert.name];

          // Update Local State & Storage
          setDownloadedMembers(newDown);
          localStorage.setItem('downloadedCerts', JSON.stringify(newDown));

          // Update DB
          await updateDoc(doc(db, 'teams', teamDetails.id), {
              downloadedCertificates: arrayUnion(cert.name)
          });

          // Check if All Done using the correctly scoped 'newDown' variable
          const presentMembers = teamDetails?.attendanceDetails?.map(m => m.name) || [];
          const isSurpriseDone = localStorage.getItem('surprise_done') === 'true';

          // Check if every present member is in the new download list
          if (presentMembers.length > 0 && presentMembers.every(m => newDown.includes(m)) && !isSurpriseDone) {
               setTimeout(() => setStep('surprise'), 1000); // Small delay before surprise
          }

      } catch (err) {
          console.error("Download failed:", err);
      } finally {
          setDownloadingId(null);
      }
  };

  const triggerSurprise = () => {
      if (rickRollUrl) {
          setPlayingRick(true);
      }
  };

  const handleVideoEnd = () => {
      setPlayingRick(false);
      localStorage.setItem('surprise_done', 'true');
      setStep('certificates');
  };

  if (playingRick) {
      return (
        <div className="fixed inset-0 z-[9999] bg-black flex items-center justify-center">
             <video
                src={rickRollUrl}
                autoPlay
                loop={false}
                onEnded={handleVideoEnd}
                className="w-full h-full object-contain"
                style={{ pointerEvents: 'none' }}
             />
        </div>
      );
  }

  const handleSubmitFeedback = async () => {
      if (role === 'contestant' && !teamDetails) return;

      setLoading(true);
      try {
          if (role === 'contestant') {
              await addDoc(collection(db, 'feedback'), {
                  type: 'contestant',
                  teamId: teamDetails.teamId,
                  teamName: teamDetails.name,
                  contact: userProfile?.phone || teamDetails.leaderMobile || 'N/A',
                  organization: `${teamDetails.college}, ${teamDetails.city}`,
                  responses: feedback,
                  submittedAt: new Date().toISOString(),
                  submittedBy: userProfile?.email
              });

              await updateDoc(doc(db, 'teams', teamDetails.id), {
                  feedbackSubmitted: true
              });

              setStep('certificates');
              // We usually already fetched in background, but call again just in case (it handles existing state check in useEffect)
              if (certificates.length === 0) await fetchCertificates(false);
              setLoading(false);

          } else if (role === 'jury') {
              await addDoc(collection(db, 'feedback'), {
                  type: 'jury',
                  juryId: userProfile?.id || userProfile?.email,
                  juryName: juryFeedback.name,
                  designation: juryFeedback.designation,
                  contact: juryFeedback.contact,
                  organization: juryFeedback.organization,
                  responses: juryFeedback,
                  submittedAt: new Date().toISOString(),
                  submittedBy: userProfile?.email
              });

              if (userProfile?.id) {
                  await updateDoc(doc(db, 'users', userProfile.id), {
                      feedbackSubmitted: true
                  });
              }
              setStep('completed');
              setLoading(false);
          }

          if (onFeedbackSuccess) onFeedbackSuccess();

      } catch (e) {
          console.error("Feedback submit error", e);
          alert("Failed to submit feedback. Please try again.");
          setLoading(false);
      }
  };

  return (
    <div className="fixed inset-0 z-[200] w-screen h-screen bg-black/95 backdrop-blur-xl overflow-y-auto overflow-x-hidden">
        
        <div className="min-h-full w-full flex flex-col items-center justify-center p-4">

            {step === 'intro' && (
                <motion.div
                    initial={{ scale: 0.5, y: 50 }}
                    animate={{ scale: 1, y: 0 }}
                    className="relative z-[201] w-full max-w-[95vw] text-center flex flex-col items-center"
                >
                    <h1 className="text-[11vw] md:text-8xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-red-500 to-purple-600 mb-6 drop-shadow-2xl whitespace-nowrap leading-tight">
                        {role === 'jury' ? 'THANK YOU!' : 'CONGRATULATIONS!'}
                    </h1>
                    
                    <p className="text-white text-xl md:text-3xl font-bold mb-12 max-w-4xl mx-auto leading-relaxed">
                        {role === 'jury'
                            ? "The DOGFOOD 2026 judging window has concluded. We appreciate your contribution."
                            : "You have completed the DOGFOOD 2026 judging process."
                        }
                    </p>
                    
                    <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        /* UPDATED: Start background fetch immediately on click */
                        onClick={() => {
                            setStep('form');
                            if (role === 'contestant') fetchCertificates(true);
                        }}
                        className="px-10 py-5 bg-white text-indigo-900 font-black rounded-full shadow-[0_0_30px_rgba(255,255,255,0.3)] text-xl md:text-2xl hover:shadow-[0_0_50px_rgba(255,255,255,0.5)] transition-all"
                    >
                        {role === 'jury' ? 'Fill Feedback Form 📝' : 'Fill Feedback to Get Certificates 🎓'}
                    </motion.button>
                </motion.div>
            )}

            {step === 'surprise' && role === 'contestant' && (
                <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    className="relative z-[201] flex flex-col items-center justify-center cursor-pointer"
                    onClick={triggerSurprise}
                >
                    <div className="relative">
                        <Gift size={200} className="text-pink-500 animate-bounce" />
                        <Sparkles className="absolute top-0 right-0 text-yellow-400 w-20 h-20 animate-spin" />
                    </div>
                    <h1 className="text-6xl font-black text-white mt-8 drop-shadow-[0_0_20px_rgba(255,255,255,0.8)]">
                        SURPRISE!
                    </h1>
                    <p className="text-2xl text-pink-200 font-bold mt-4 animate-pulse">
                        Click the Gift Box to Claim Your Reward
                    </p>
                </motion.div>
            )}

            {step === 'completed' && role === 'jury' && (
                <motion.div
                    initial={{ scale: 0.5, y: 50 }}
                    animate={{ scale: 1, y: 0 }}
                    className="relative z-[201] max-w-3xl w-full flex flex-col items-center text-center"
                >
                    <div className="bg-white/10 p-6 rounded-full inline-block mb-6">
                        <CheckCircle2 className="w-20 h-20 text-green-400" />
                    </div>
                    <h1 className="text-4xl md:text-7xl font-black text-white mb-6">
                        FEEDBACK SUBMITTED
                    </h1>
                    <p className="text-indigo-200 text-xl md:text-2xl font-medium mb-10">
                        Thank you for your valuable feedback. The evaluation process is now officially complete.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-8 py-3 bg-white/20 text-white font-bold rounded-xl hover:bg-white/30 backdrop-blur-md transition-all flex items-center gap-2"
                    >
                        <LogOut size={20} /> Return to portal
                    </button>
                </motion.div>
            )}

            {step === 'form' && role === 'contestant' && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-3xl p-6 md:p-10 w-full max-w-4xl text-left shadow-2xl relative"
                >
                    <h2 className="text-3xl font-black text-gray-800 mb-2 text-center">STUDENT FEEDBACK FORM</h2>
                    <p className="text-center text-gray-500 text-sm font-bold mb-8 uppercase">DOGFOOD 2026 • 25–28 Sep 2026</p>

                    <div className="grid md:grid-cols-2 gap-4 mb-8 bg-gray-50 p-6 rounded-xl border border-gray-100 text-sm">
                        <div>
                            <span className="block text-gray-400 font-bold text-xs uppercase mb-1">Team Name</span>
                            <span className="font-bold text-gray-800 text-lg">{teamDetails?.name}</span>
                        </div>
                        <div>
                            <span className="block text-gray-400 font-bold text-xs uppercase mb-1">Team ID</span>
                            <span className="font-mono font-bold text-indigo-600 text-lg">{teamDetails?.teamId}</span>
                        </div>
                    </div>

  <div className="space-y-6">
                        <div>
                            <label className="block font-bold text-gray-700 mb-2">1. How did you find the event?</label>
                            <input type="text" className="w-full border border-gray-300 rounded-xl p-4 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Your answer..." value={feedback.q1} onChange={e => setFeedback({...feedback, q1: e.target.value})} />
                        </div>
                        <div>
                            <label className="block font-bold text-gray-700 mb-2">2. What was most helpful about the event?</label>
                            <textarea className="w-full border border-gray-300 rounded-xl p-4 h-24 resize-none outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Your answer..." value={feedback.q2} onChange={e => setFeedback({...feedback, q2: e.target.value})} />
                        </div>
                        
                        {[
                            { id: 'q3', label: '3. Are you willing to participate in further events organized by us?', opts: ['Yes', 'No'] },
                            { id: 'q4', label: '4. How do you rate the conduction of the event?', opts: ['Excellent', 'Very Good', 'Good', 'Poor'] },
                            { id: 'q5', label: '5. How do you rate the hospitality/resources provided by the college?', opts: ['Excellent', 'Very Good', 'Good', 'Poor'] },
                            { id: 'q6', label: '6. Do you feel this event would be useful to you?', opts: ['Very Much', 'Somewhat', 'No'] }
                        ].map(q => (
                            <div key={q.id}>
                                <label className="block font-bold text-gray-700 mb-2">{q.label}</label>
                                <div className="flex flex-wrap gap-4">
                                    {q.opts.map(opt => (
                                        <label key={opt} className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-lg border transition-all ${feedback[q.id] === opt ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-200 hover:bg-gray-50'}`}>
                                            <input type="radio" name={q.id} value={opt} checked={feedback[q.id] === opt} onChange={() => setFeedback({...feedback, [q.id]: opt})} className="accent-indigo-600" />
                                            <span className="font-medium">{opt}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <div>
                            <label className="block font-bold text-gray-700 mb-2">7. Please write a Suggestion for the betterment of future events</label>
                            <textarea className="w-full border border-gray-300 rounded-xl p-4 h-24 resize-none outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Your suggestions..." value={feedback.q7} onChange={e => setFeedback({...feedback, q7: e.target.value})} />
                        </div>
                    </div>

                    <div className="mt-10 pt-6 border-t border-gray-100 flex justify-end">
                        <button
                            onClick={handleSubmitFeedback}
                            /* UPDATED: Strict Validation - Must check ALL fields */
                            disabled={loading || Object.values(feedback).some(v => !v.trim())}
                            className="px-10 py-4 bg-indigo-600 text-white font-bold rounded-xl shadow-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-3 text-lg transition-all transform active:scale-95"
                        >
                            {loading ? (
                                <><span>Unlocking...</span><Activity className="animate-spin" size={20}/></>
                            ) : (
                                <><span>Submit & Get Certificates</span> <Download size={20}/></>
                            )}
                        </button>
                    </div>
                </motion.div>
            )}

            {step === 'form' && role === 'jury' && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-white rounded-3xl p-6 md:p-10 w-full max-w-4xl text-left shadow-2xl relative"
                >
                    <h2 className="text-3xl font-black text-gray-800 mb-2 text-center">JURY FEEDBACK FORM</h2>
                    <p className="text-center text-gray-500 text-sm font-bold mb-6 uppercase">DOGFOOD 2026 • 25–28 Sep 2026</p>

                    <div className="grid md:grid-cols-2 gap-4 mb-6 bg-gray-50 p-4 rounded-xl border border-gray-100 text-sm">
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-gray-400 font-bold text-xs uppercase mb-1">Name</label>
                            <input type="text" value={juryFeedback.name} onChange={e => setJuryFeedback({...juryFeedback, name: e.target.value})} className="w-full p-2 border rounded font-bold text-gray-800" />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-gray-400 font-bold text-xs uppercase mb-1">Contact Number</label>
                            <input type="text" value={juryFeedback.contact} onChange={e => setJuryFeedback({...juryFeedback, contact: e.target.value})} className="w-full p-2 border rounded font-bold text-gray-800" />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-gray-400 font-bold text-xs uppercase mb-1">Designation</label>
                            <input type="text" value={juryFeedback.designation} onChange={e => setJuryFeedback({...juryFeedback, designation: e.target.value})} className="w-full p-2 border rounded font-bold text-gray-800" />
                        </div>
                        <div className="col-span-2 md:col-span-1">
                            <label className="block text-gray-400 font-bold text-xs uppercase mb-1">Organization & Place</label>
                            <input type="text" value={juryFeedback.organization} onChange={e => setJuryFeedback({...juryFeedback, organization: e.target.value})} className="w-full p-2 border rounded font-bold text-gray-800" />
                        </div>
                    </div>

                    <div className="space-y-6">
                        {/* Shortened for brevity, logic applies to all inputs */}
                        {[
                            {id: 'jq1', q:'1. Are the Ideas addressing the problems of different communities?', opts:['Very Much','Somewhat','No'], key:'q1'},
                            {id: 'jq5', q:'5. How do you rate the quality of the projects', opts:['Excellent','Very Good','Good','Poor'], key:'q5'},
                            {id: 'jq6', q:'6. Rate the quality of the problem statements', opts:['Excellent','Very Good','Good','Poor'], key:'q6'},
                            {id: 'jq7', q:'7. Rate the quality of the resources', opts:['Excellent','Very Good','Good','Poor'], key:'q7'},
                            {id: 'jq8', q:'8. Please Rate the hospitality provided', opts:['Excellent','Very Good','Good','Poor'], key:'q8'},
                        ].map(item => (
                            <div key={item.id}>
                                <label className="block font-bold text-gray-700 mb-2">{item.q}</label>
                                <div className="flex flex-wrap gap-4">
                                    {item.opts.map(opt => (
                                        <label key={opt} className="flex items-center gap-2 cursor-pointer">
                                            <input type="radio" name={item.id} value={opt} checked={juryFeedback[item.key] === opt} onChange={() => setJuryFeedback({...juryFeedback, [item.key]: opt})} className="w-5 h-5 accent-indigo-600" />
                                            <span className="font-medium">{opt}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                        
                        {/* Text Areas */}
                        {[
                            {q:'2. Which project do you feel is more interesting?', key:'q2'},
                            {q:'3. Please mention the projects which have a start-up potential', key:'q3'},
                            {q:'9. Please write a Comment/Suggestion for the betterment of future events.', key:'q9'}
                        ].map(item => (
                            <div key={item.key}>
                                <label className="block font-bold text-gray-700 mb-2">{item.q}</label>
                                <textarea className="w-full border border-gray-300 rounded-lg p-3 h-20 resize-none outline-none" value={juryFeedback[item.key]} onChange={e => setJuryFeedback({...juryFeedback, [item.key]: e.target.value})} />
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end">
                        <button
                            onClick={handleSubmitFeedback}
                            /* UPDATED: Strict Validation - Must check ALL fields */
                            disabled={loading || Object.values(juryFeedback).some(v => !v.trim())}
                            className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {loading ? 'Submitting...' : 'Submit Feedback'}
                        </button>
                    </div>
                </motion.div>
            )}

            {step === 'certificates' && role === 'contestant' && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-white rounded-2xl w-full max-w-[95vw] h-[85vh] flex flex-col shadow-2xl overflow-hidden relative"
                >
                    <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                        <div className="flex items-center gap-3">
                            <div className="bg-green-100 p-2 rounded-full">
                                <CheckCircle2 className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-gray-800 leading-tight">Certificates Unlocked</h2>
                                <p className="text-xs text-gray-500">Download Limit: 1 time per certificate.</p>
                            </div>
                        </div>
                        <button onClick={() => window.location.reload()} className="text-xs font-bold text-red-500 hover:text-red-700 underline px-4">
                            Return to portal
                        </button>
                    </div>

                    <div className="flex-1 flex overflow-hidden">
                        <div className="w-full md:w-96 border-r border-gray-100 flex flex-col bg-white overflow-hidden shrink-0">
                            <div className="p-3 bg-gray-50/50 border-b border-gray-100 text-xs font-bold text-gray-400 uppercase tracking-wider">
                                Team Members
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-3">
                                {loading ? (
                                    [...Array(teamDetails?.attendanceDetails?.length || 4)].map((_, i) => <SkeletonCard key={i} />)
                                ) : (
                                    certificates.map((cert, idx) => {
                                        const isSelected = selectedCert?.name === cert.name;
                                        const isDownloaded = downloadedMembers.includes(cert.name);
                                        const hasUrl = !!cert.url;
                                        return (
                                            <div 
                                                key={idx} 
                                                onClick={() => hasUrl && setSelectedCert(cert)}
                                                className={`p-4 rounded-xl border transition-all cursor-pointer flex items-center justify-between
                                                    ${isSelected ? 'bg-indigo-50 border-indigo-200 shadow-sm' : 'bg-white border-gray-100 hover:bg-gray-50 hover:border-gray-200'}
                                                    ${!hasUrl ? 'opacity-80' : ''}
                                                `}
                                            >
                                                <div className="flex items-center gap-3 overflow-hidden">
                                                    <div className={`p-2 rounded-lg ${isDownloaded ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                                                        {isDownloaded ? <Check size={20} /> : <StickyNote size={20} />}
                                                    </div>
                                                    <div className="truncate">
                                                        <p className={`font-bold text-sm truncate ${isSelected ? 'text-indigo-900' : 'text-gray-700'}`}>{cert.name}</p>
                                                        {isDownloaded && <span className="text-[10px] text-green-600 font-bold">Downloaded</span>}
                                                    </div>
                                                </div>
                                                
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        if (hasUrl) handleDownload(cert);
                                                    }}
                                                    disabled={downloadingId === cert.name || isDownloaded || !hasUrl}
                                                    className={`p-2 border rounded-lg transition-colors shadow-sm
                                                        ${isDownloaded || !hasUrl
                                                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                            : 'bg-white border-gray-200 hover:bg-gray-100 text-gray-600 hover:text-indigo-600'
                                                        }
                                                    `}
                                                >
                                                    {downloadingId === cert.name ? <Activity className="animate-spin w-4 h-4" /> : isDownloaded ? <Check size={16} /> : <Download size={16} />}
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                                {!loading && certificates.length === 0 && <p className="text-center text-gray-400 mt-10 text-sm">No certificates found.</p>}
                            </div>
                        </div>

<div className="hidden md:flex flex-1 bg-gray-100 flex-col overflow-hidden relative justify-center items-center">
    {selectedCert && selectedCert.url ? (
        <div className="w-full h-full flex flex-col">
            <iframe
                /* UPDATED: Added parameters to hide EVERYTHING and fit width */
                src={`${selectedCert.url}#toolbar=0&navpanes=0&scrollbar=0&view=Fit`}
                className="w-full h-full border-none"
                title="Certificate Preview"
            />
        </div>
    ) : (
        <div className="flex flex-col items-center justify-center text-gray-400 p-8 text-center opacity-50">
            <ScanLine size={48} className="mb-4" />
            <p>{loading ? 'Loading Preview...' : 'Select a certificate to preview'}</p>
        </div>
    )}
</div>
                    </div>
                </motion.div>
            )}
        </div>
    </div>
  );
};
/* --- FullScreenNotification --- */
const FullScreenNotification = ({ message, type, roundId, onClose }) => {
    return (
        <motion.div
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[250] flex flex-col items-center justify-center bg-indigo-900/95 backdrop-blur-xl p-6 text-center"
        >
            <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="bg-white/10 p-6 rounded-full mb-8 border border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.2)]"
            >
                <Bell size={64} className="text-white" />
            </motion.div>

            <motion.h2
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-4xl md:text-6xl font-black text-white mb-6 tracking-tight leading-tight"
            >
                {type === 'urgent' ? 'ATTENTION' : 'UPDATE'}
            </motion.h2>

            <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-xl md:text-3xl font-medium text-indigo-100 max-w-2xl leading-relaxed mb-8"
            >
                {message}
            </motion.p>

            {roundId && ROUND_GUIDELINES[roundId] && (
                <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="bg-white/10 rounded-xl p-4 md:p-6 mb-8 w-full max-w-3xl text-left max-h-[40vh] overflow-y-auto custom-scrollbar border border-white/10"
                >
                    <h3 className="text-white font-bold mb-4 flex items-center gap-2 sticky top-0 bg-[#312e81] p-2 rounded -mx-2 -mt-2 z-10 shadow-lg">
                        <Info size={18} className="text-yellow-400" /> Guidelines & Expectations
                    </h3>
                    <ul className="space-y-3">
                        {ROUND_GUIDELINES[roundId].map((point, i) => (
                            <li key={i} className="flex gap-3 text-indigo-100 text-sm md:text-base leading-relaxed">
                                <span className="text-yellow-400 mt-1 shrink-0">•</span>
                                <span>{point}</span>
                            </li>
                        ))}
                    </ul>
                </motion.div>
            )}

            <motion.button
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.6 }}
                onClick={onClose}
                className="px-10 py-4 bg-white text-indigo-900 font-bold rounded-2xl shadow-xl hover:bg-indigo-50 transition-all text-lg"
            >
                Got it
            </motion.button>
        </motion.div>
    );
};

/* --- LoadingSpinner --- */
/* Optimized: Memoized to prevent unnecessary re-renders during parent updates */
const LoadingSpinner = React.memo(() => {
  return (
    <div className="flex items-center justify-center space-x-1">
      <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
      <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
      <div className="w-2 h-2 bg-pink-500 rounded-full animate-bounce"></div>
    </div>
  );
});

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 5000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <motion.div
        initial={{ opacity: 0, y: -50, x: '-50%' }}
        animate={{ opacity: 1, y: 0, x: '-50%' }}
        exit={{ opacity: 0, y: -50, x: '-50%' }}
        className={`fixed top-6 left-1/2 z-[200] px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 min-w-[300px] border
            ${type === 'urgent' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-white border-indigo-100 text-gray-800'}`}
    >
        <div className={`p-2 rounded-full ${type === 'urgent' ? 'bg-red-100 text-red-600' : 'bg-indigo-100 text-indigo-600'}`}>
            <Bell size={20} />
        </div>
        <div>
            <h4 className="font-bold text-sm uppercase mb-1">{type === 'urgent' ? 'Urgent Update' : 'Notification'}</h4>
            <p className="text-sm font-medium">{message}</p>
        </div>
        <button onClick={onClose} className="ml-auto text-gray-400 hover:text-gray-600">
            <X size={16} />
        </button>
    </motion.div>
  );
};

/* --- AnimatedBackground --- */
const AnimatedBackground = React.memo(() => {
  return (
    <div className="portal-atmosphere fixed inset-0 z-0 overflow-hidden pointer-events-none">
      <div className="portal-atmosphere__mesh" aria-hidden="true" />
      <div className="portal-atmosphere__bloom portal-atmosphere__bloom--blue" aria-hidden="true" />
      <div className="portal-atmosphere__bloom portal-atmosphere__bloom--pink" aria-hidden="true" />
    </div>
  );
});

/* --- ConfirmationModal --- */
const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  type = 'info',
  confirmText = 'OK',
  cancelText = 'Cancel',
  isAlert = false,
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'success': return <CheckCircle2 className="w-12 h-12 text-green-500 mb-4" />;
      case 'error': return <AlertOctagon className="w-12 h-12 text-red-500 mb-4" />;
      case 'warning': return <AlertTriangle className="w-12 h-12 text-orange-500 mb-4" />;
      default: return <Info className="w-12 h-12 text-blue-500 mb-4" />;
    }
  };

  const getButtonColor = () => {
    switch (type) {
      case 'success': return 'bg-green-600 hover:bg-green-700';
      case 'error': return 'bg-red-600 hover:bg-red-700';
      case 'warning': return 'bg-orange-600 hover:bg-orange-700';
      default: return 'bg-indigo-600 hover:bg-indigo-700';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden text-center p-6 relative"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X size={20} />
            </button>

            <div className="flex flex-col items-center">
              {getIcon()}
              <h3 className="text-xl font-bold text-gray-800 mb-2">{title}</h3>
              <p className="text-gray-500 mb-6 text-sm leading-relaxed">{message}</p>
            </div>

            <div className={`flex gap-3 ${isAlert ? 'justify-center' : 'justify-between'}`}>
              {!isAlert && (
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg text-sm transition-colors"
                >
                  {cancelText}
                </button>
              )}
              <button
                onClick={() => {
                  if (onConfirm) onConfirm();
                  onClose();
                }}
                className={`${isAlert ? 'w-full' : 'flex-1'} px-4 py-2 text-white font-bold rounded-lg shadow-lg text-sm transition-all transform active:scale-95 ${getButtonColor()}`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

/* --- NoteModal --- */
const NoteModal = ({ isOpen, onClose, onSave, initialNote = '' }) => {
    const [note, setNote] = useState(initialNote);

    useEffect(() => {
        if (isOpen) setNote(initialNote);
    }, [isOpen, initialNote]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            {/* Note: This z-index is lower than ConfirmationModal (300) so confirmation alerts appear on top */}
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-white p-6 rounded-2xl w-full max-w-md shadow-2xl"
            >
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-800">Add Remark</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
                </div>
                <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Enter your observations..."
                    className="w-full h-32 p-3 border border-gray-300 rounded-xl mb-4 focus:ring-2 focus:ring-indigo-500 resize-none"
                    autoFocus
                />
                <div className="flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl">Cancel</button>
                    <button
                        onClick={() => { onSave(note); onClose(); }}
                        disabled={!note.trim()}
                        className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-xl shadow hover:bg-indigo-700 disabled:opacity-50"
                    >
                        Save Note
                    </button>
                </div>
            </motion.div>
        </div>
    );
};

/* =========================================
   FEATURE COMPONENTS
   ========================================= */

/* =========================================
   DASHBOARDS
   ========================================= */

/* --- AdminDashboard --- */

const FeedbackViewer = () => {
    const [feedbacks, setFeedbacks] = useState([]);
    const [filter, setFilter] = useState('all'); // all, jury, contestant

    useEffect(() => {
        const q = query(collection(db, 'feedback'), orderBy('submittedAt', 'desc'));
        const unsub = onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setFeedbacks(data);
        });
        return () => unsub();
    }, []);

    const filteredFeedbacks = filter === 'all' ? feedbacks : feedbacks.filter(f => f.type === filter || (!f.type && filter === 'contestant')); // Fallback for old data

    const handleExport = () => {
        const headers = ["Role", "Name", "ID/Email", "Organization", "Designation", "Contact", "Q1", "Q2", "Q3", "Q4", "Q5", "Q6", "Q7", "Q8", "Q9"];

        const rows = filteredFeedbacks.map(f => {
            const isJury = f.type === 'jury';
            const res = f.responses || {};

            // Map questions
            const q1 = isJury ? res.q1 : res.q1;
            const q2 = isJury ? res.q2 : res.q2;
            const q3 = isJury ? res.q3 : res.q3;
            const q4 = isJury ? '' : res.q4; // Jury has no Q4 (rating jumps 1,2,3,5)
            const q5 = isJury ? res.q5 : res.q5;
            const q6 = isJury ? res.q6 : res.q6;
            const q7 = isJury ? res.q7 : res.q7;
            const q8 = isJury ? res.q8 : ''; // Contestant stops at 7
            const q9 = isJury ? res.q9 : '';

            return [
                isJury ? 'Jury' : 'Contestant',
                `"${(isJury ? f.juryName : f.teamName || '').replace(/"/g, '""')}"`,
                isJury ? f.juryId : f.teamId,
                `"${(f.organization || '').replace(/"/g, '""')}"`,
                isJury ? f.designation : '-',
                `"${(f.contact || '').replace(/"/g, '""')}"`,
                `"${(q1 || '').replace(/"/g, '""')}"`,
                `"${(q2 || '').replace(/"/g, '""')}"`,
                `"${(q3 || '').replace(/"/g, '""')}"`,
                `"${(q4 || '').replace(/"/g, '""')}"`,
                `"${(q5 || '').replace(/"/g, '""')}"`,
                `"${(q6 || '').replace(/"/g, '""')}"`,
                `"${(q7 || '').replace(/"/g, '""')}"`,
                `"${(q8 || '').replace(/"/g, '""')}"`,
                `"${(q9 || '').replace(/"/g, '""')}"`,
            ];
        });

        const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `feedback_export_${filter}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <GlassCard className="p-0 flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 140px)' }}>
             <div className="flex items-center justify-between p-4 border-b border-gray-100 bg-white/50">
                 <div className="flex items-center gap-4">
                     <h2 className="text-xl font-bold text-gray-800">Feedback Responses</h2>
                     <div className="flex bg-gray-100 rounded-lg p-1">
                         {['all', 'jury', 'contestant'].map(t => (
                             <button
                                key={t}
                                onClick={() => setFilter(t)}
                                className={`px-3 py-1 text-xs font-bold rounded-md capitalize ${filter === t ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                             >
                                 {t}
                             </button>
                         ))}
                     </div>
                 </div>
                 <button onClick={handleExport} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-bold shadow hover:bg-indigo-700">
                     <Download size={14} /> Export CSV
                 </button>
             </div>

             <div className="flex-1 overflow-y-auto custom-scrollbar">
                 <table className="w-full text-left border-collapse">
                     <thead className="sticky top-0 bg-white/95 backdrop-blur z-10 text-xs text-gray-500 uppercase font-bold tracking-wider">
                         <tr className="border-b border-gray-200">
                             <th className="p-4 w-10">#</th>
                             <th className="p-4 w-24">Role</th>
                             <th className="p-4">Name / Team</th>
                             <th className="p-4">Contact</th>
                             <th className="p-4">Submitted At</th>
                         </tr>
                     </thead>
                     <tbody className="text-sm divide-y divide-gray-100">
                         {filteredFeedbacks.map((f, i) => {
                             const isJury = f.type === 'jury';
                             const name = isJury ? f.juryName : f.teamName;
                             const sub = isJury ? f.designation : f.teamId;

                             return (
                                 <tr key={f.id} className="hover:bg-indigo-50/30 transition-colors">
                                     <td className="p-4 text-gray-400 font-mono text-xs">{i + 1}</td>
                                     <td className="p-4">
                                         <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${isJury ? 'bg-purple-100 text-purple-700' : 'bg-green-100 text-green-700'}`}>
                                             {isJury ? 'Jury' : 'Student'}
                                         </span>
                                     </td>
                                     <td className="p-4">
                                         <div className="font-bold text-gray-800">{name}</div>
                                         <div className="text-xs text-gray-500">{sub}</div>
                                         {f.organization && <div className="text-[10px] text-gray-400 truncate max-w-[200px]">{f.organization}</div>}
                                     </td>
                                     <td className="p-4 text-gray-600 font-mono text-xs">
                                         {f.contact}
                                     </td>
                                     <td className="p-4 text-gray-400 text-xs">
                                         {f.submittedAt ? format(new Date(f.submittedAt), 'MMM d, HH:mm') : '-'}
                                     </td>
                                 </tr>
                             );
                         })}
                         {filteredFeedbacks.length === 0 && (
                             <tr><td colSpan={5} className="p-8 text-center text-gray-400">No feedbacks found.</td></tr>
                         )}
                     </tbody>
                 </table>
             </div>
        </GlassCard>
    );
};

const ActivityFeed = React.memo(() => {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const q = query(
      collection(db, 'logs'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => doc.data());
      setLogs(logsData);
    });

    return () => unsubscribe();
  }, []);

  return (
    <GlassCard className="h-full flex flex-col p-0">
        <div className="flex flex-col h-full w-full">
            <div className="p-6 border-b border-gray-100 shrink-0">
                <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-indigo-500" />
                    <h2 className="text-xl font-semibold text-gray-700">Live Activity Feed</h2>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-0">
                <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white/90 backdrop-blur-sm shadow-sm z-10">
                        <tr className="border-b border-gray-200 text-gray-500 text-sm">
                            <th className="py-3 pl-6">Time</th>
                            <th className="py-3">User</th>
                            <th className="py-3">Role</th>
                            <th className="py-3">Action</th>
                            <th className="py-3 pr-6">Details</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm">
                        {logs.map((log, index) => (
                            <tr key={index} className="border-b border-gray-50 hover:bg-white/40 transition-colors">
                                <td className="py-3 pl-6 text-gray-400 font-mono">
                                    {log.timestamp ? format(new Date(log.timestamp), 'HH:mm:ss') : '-'}
                                </td>
                                <td className="py-3 font-medium text-gray-700">{log.userName || log.userEmail}</td>
                                <td className="py-3">
                                    <span className={`px-2 py-1 rounded-full text-xs font-semibold
                                        ${log.role === 'admin' ? 'bg-purple-100 text-purple-600' :
                                        log.role === 'jury' ? 'bg-blue-100 text-blue-600' :
                                        log.role === 'contestant' ? 'bg-green-100 text-green-600' :
                                        'bg-gray-100 text-gray-600'}`}>
                                        {log.role}
                                    </span>
                                </td>
                                <td className="py-3 text-indigo-600 font-medium">{log.action}</td>
                                <td className="py-3 pr-6 text-gray-600">{log.details}</td>
                            </tr>
                        ))}
                         {logs.length === 0 && (
                            <tr>
                                <td colSpan={5} className="py-8 text-center text-gray-400">No logs found yet...</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </GlassCard>
  );
});

const UnifiedLeaderboard = ({ teams, evaluations }) => {
    const processedTeams = useMemo(() => {
        return teams.map(t => {
            const evals = evaluations[t.id] || {};

            const getScore = (round) => {
                const r = evals[round];
                if (!r) return 0;
                return r.avg || 0;
            };

            const idea = getScore('idea');
            const phase1 = getScore('phase1');
            const phase2 = getScore('phase2');
            const phase3 = getScore('phase3');
            const phase3Count = evals['phase3']?.count || 0;

            const grandTotal = idea + phase1 + phase2 + phase3;

            return {
                ...t,
                scores: { idea, phase1, phase2, phase3, phase3Count },
                grandTotal
            };
        }).sort((a, b) => b.grandTotal - a.grandTotal);
    }, [teams, evaluations]);

    const handleExport = () => {
        const headers = ["Rank", "ID", "Team Name", "Assigned Jury", "Idea", "Phase 1", "Phase 2", "Phase 3 (Avg)", "Phase 3 Count", "Total Score"];
        const rows = processedTeams.map((t, index) => [
            index + 1,
            t.id,
            `"${t.name.replace(/"/g, '""')}"`, // Escape quotes
            `"${(t.assignedJuryName || 'Unassigned').replace(/"/g, '""')}"`,
            t.scores.idea.toFixed(2),
            t.scores.phase1.toFixed(2),
            t.scores.phase2.toFixed(2),
            t.scores.phase3.toFixed(2),
            t.scores.phase3Count,
            t.grandTotal.toFixed(2)
        ]);

        const csvContent = [
            headers.join(","),
            ...rows.map(r => r.join(","))
        ].join("\n");

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `leaderboard_export_${new Date().toISOString().slice(0, 10)}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <GlassCard className="h-full p-0 overflow-hidden">
            <div className="flex flex-col h-full w-full">
                <div className="flex items-center justify-between bg-white/80 backdrop-blur-sm border-b border-gray-200 p-2 z-10 shrink-0">
                     <div className="flex items-center gap-2 pl-2">
                         <Trophy className="text-yellow-500" size={20} />
                         <span className="font-bold text-gray-700">Live Leaderboard</span>
                     </div>
                     <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
                     >
                        <Download size={14} /> Export CSV
                     </button>
                </div>
                <div className="flex items-center bg-gray-50 border-b border-gray-200 text-gray-500 text-sm font-semibold h-10 shrink-0">
                    <div className="w-16 pl-4">Rank</div>
                    <div className="w-24 pl-4">ID</div>
                    <div className="w-64 px-4">Team</div>
                    <div className="min-w-[200px] px-4">Assigned Jury</div>
                    <div className="w-24 px-4 text-center">Idea</div>
                    <div className="w-24 px-4 text-center">Phase 1</div>
                    <div className="w-24 px-4 text-center">Phase 2</div>
                    <div className="w-32 px-4 text-center">Phase 3 (Avg)</div>
                    <div className="w-32 px-4 text-center font-bold text-gray-900">Total</div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    {processedTeams.map((team, index) => (
                        <div key={team.id} className="flex items-center text-sm border-b border-gray-100 hover:bg-white/60 transition-colors h-[50px]">
                            <div className="w-16 pl-4 font-bold text-gray-400">#{index + 1}</div>
                            <div className="w-24 pl-4 text-gray-500 font-mono text-xs">{team.id}</div>
                            <div className="w-64 px-4 font-medium text-gray-800 truncate" title={team.name}>
                                {team.name}
                                {team.isFinalist && <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">FINALIST</span>}
                            </div>
                            <div className="min-w-[200px] px-4 text-gray-500 text-xs truncate" title={team.assignedJuryName || 'Unassigned'}>
                                {team.assignedJuryName || 'Unassigned'}
                            </div>
                            <div className="w-24 px-4 text-center text-gray-600">{team.scores.idea ? team.scores.idea.toFixed(1) : '-'}</div>
                            <div className="w-24 px-4 text-center text-gray-600">{team.scores.phase1 ? team.scores.phase1.toFixed(1) : '-'}</div>
                            <div className="w-24 px-4 text-center text-gray-600">{team.scores.phase2 ? team.scores.phase2.toFixed(1) : '-'}</div>
                            <div className="w-32 px-4 text-center">
                                <span className="font-bold text-indigo-600">{team.scores.phase3 ? team.scores.phase3.toFixed(1) : '-'}</span>
                                {team.scores.phase3Count > 0 && <span className="text-[10px] text-gray-400 ml-1">({team.scores.phase3Count})</span>}
                            </div>
                            <div className="w-32 px-4 text-center font-black text-gray-800 text-lg">{team.grandTotal.toFixed(1)}</div>
                        </div>
                    ))}
                </div>
            </div>
        </GlassCard>
    );
};

const RoundControls = ({ systemState, teams, evaluations, setModalConfig }) => {
  const { currentRound, roundStatus } = systemState;
  const [showTrackStats, setShowTrackStats] = useState(false);
  const [expandedTrack, setExpandedTrack] = useState(null); // For team-wise drill down

  // Global Check-In Stats
  const totalTeams = teams.length;
  const checkedInTeams = teams.filter(t => t.attendanceMarked).length;
  // Calculate Total People (Sum of memberCount from checked-in teams)
  const totalPeople = teams.reduce((acc, t) => acc + (t.memberCount || 0), 0);
  const totalVeg = teams.reduce((acc, t) => acc + (t.vegCount || 0), 0);
  const totalNonVeg = teams.reduce((acc, t) => acc + (t.nonVegCount || 0), 0);

  // Calculate Track Stats (Memoized)
  const trackStats = useMemo(() => {
     if (!showTrackStats) return {};
     return teams.reduce((acc, t) => {
         const track = t.track || 'Unknown';
         if (!acc[track]) acc[track] = { total: 0, checkedIn: 0, people: 0, veg: 0, nonVeg: 0, teamsList: [] };
         acc[track].total++;
         if (t.attendanceMarked) {
             acc[track].checkedIn++;
             acc[track].people += (t.memberCount || 0);
             acc[track].veg += (t.vegCount || 0);
             acc[track].nonVeg += (t.nonVegCount || 0);
             acc[track].teamsList.push(t);
         }
         return acc;
     }, {});
  }, [teams, showTrackStats]);

  const updateState = async (updates) => {
    try {
      await updateDoc(doc(db, 'system', 'state'), updates);

      // Automatic Notification
      let msg = '';
      const rName = ROUND_RUBRICS[updates.currentRound || currentRound]?.label || updates.currentRound || currentRound;

      if (updates.roundStatus === 'ongoing') msg = `🏁 ${rName} has officially STARTED! Good luck to all teams.`;
      if (updates.roundStatus === 'evaluation') msg = `📝 Evaluation for ${rName} has begun. Juries, please start your assessments.`;
      if (updates.roundStatus === 'completed') msg = `✅ ${rName} is now COMPLETED.`;
      if (updates.currentRound && updates.currentRound !== currentRound) msg = `🚀 Advanced to next phase: ${rName}`;

      if (msg) {
          await addDoc(collection(db, 'notifications'), {
            message: msg,
            type: 'info',
            targets: ['all'],
            timestamp: new Date().toISOString(),
            createdBy: 'system',
            ...(updates.roundStatus === 'ongoing' ? { roundId: updates.currentRound || currentRound } : {})
          });
      }

    } catch (err) {
      console.error("Error updating system state", err);
      setModalConfig({ isOpen: true, title: 'Error', message: 'Failed to update round status', type: 'error' });
    }
  };

const handleAdvance = async (targetRound) => {
      // Phase 3 Guard: Check if finalists are selected
      if (targetRound === 'phase3') {
          // FIX: Check 'private_team_data' instead of 'teams'
          const finalistsQ = query(collection(db, 'private_team_data'), where('isFinalist', '==', true));
          const snap = await getDocs(finalistsQ);
          
          if (snap.empty) {
              setModalConfig({
                  isOpen: true,
                  title: 'Finalists Required',
                  message: "You cannot start Phase 3 (Final Round) without selecting finalists. Please go to the 'Finals' tab and select teams.",
                  type: 'warning',
                  isAlert: true
              });
              return;
          }
      }

      // Check pending evaluations for the CURRENT round before moving
      const pendingTeams = teams.filter(t => {
          const ev = evaluations[t.id]?.[currentRound];
          return !ev || ev.count === 0;
      });

      setModalConfig({
          isOpen: true,
          title: 'Confirm Advance',
          message: pendingTeams.length > 0
            ? `Warning: ${pendingTeams.length} teams have NOT been evaluated in ${currentRound}. Proceeding will mark them as skipped/unevaluated.`
            : `Advance to ${targetRound}? This will lock ${currentRound}.`,
          type: pendingTeams.length > 0 ? 'error' : 'warning',
          confirmText: 'Yes, Advance',
          onConfirm: async () => {
             if (pendingTeams.length > 0) {
                     const batchSize = 500;
                     for (let i = 0; i < pendingTeams.length; i += batchSize) {
                         const batch = writeBatch(db);
                         const chunk = pendingTeams.slice(i, i + batchSize);
                         chunk.forEach(t => {
                             const ref = doc(db, 'teams', t.id);
                             batch.update(ref, { [`skipped_${currentRound}`]: true });
                     });
                         await batch.commit();
                     }
             }

             await updateState({ currentRound: targetRound, roundStatus: 'locked' });
          }
      });
  };

  const rounds = ['idea', 'phase1', 'phase2', 'phase3'];
  const currentRoundIdx = rounds.indexOf(currentRound);

  return (
    <div className="mb-6 space-y-6">
        {/* Global Registration Stats */}
        <GlassCard className="p-4 flex flex-col gap-4">
             <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                 <div>
                     <h2 className="text-lg font-bold text-gray-800">Registration Stats</h2>
                     <button
                        onClick={() => setShowTrackStats(!showTrackStats)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline mt-1"
                     >
                        {showTrackStats ? 'Hide Breakdown' : 'View Track-wise Breakdown'}
                     </button>
                 </div>

                 <div className="flex gap-8">
                    <div className="text-right">
                        <p className="text-3xl font-black text-indigo-600">{checkedInTeams} <span className="text-gray-300 text-lg">/ {totalTeams}</span></p>
                        <p className="text-xs font-bold text-gray-400 uppercase">Teams</p>
                    </div>
                    <div className="text-right">
                        <p className="text-3xl font-black text-indigo-600">{totalPeople}</p>
                        <p className="text-xs font-bold text-gray-400 uppercase">People <span className="text-[10px] text-green-600">({totalVeg} V)</span> <span className="text-[10px] text-red-600">({totalNonVeg} NV)</span></p>
                    </div>
                 </div>
             </div>

             {/* Track Breakdown (Collapsible) */}
             {showTrackStats && (
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-4 border-t border-gray-100">
                     {Object.entries(trackStats).sort().map(([track, stats]) => (
                         <div key={track} className="bg-gray-50 rounded-lg p-2 text-center border border-gray-100 flex flex-col">
                             <div className="cursor-pointer" onClick={() => setExpandedTrack(expandedTrack === track ? null : track)}>
                                 <p className="text-xs font-bold text-gray-400 uppercase mb-1 hover:text-indigo-600 transition-colors underline">{track}</p>
                                 <div className="flex justify-center gap-2 text-sm flex-wrap">
                                    <span className="font-bold text-gray-800" title="Teams">
                                        <span className="text-green-600">{stats.checkedIn}</span>/{stats.total} T
                                    </span>
                                    <span className="text-gray-300">|</span>
                                    <span className="font-bold text-indigo-600" title="People">
                                        {stats.people} P
                                    </span>
                                    <div className="w-full flex justify-center gap-2 text-[10px]">
                                        <span className="text-green-600 font-bold">{stats.veg} Veg</span>
                                        <span className="text-red-600 font-bold">{stats.nonVeg} Non-Veg</span>
                                    </div>
                                 </div>
                             </div>

                             {/* Expanded Team List */}
                             <AnimatePresence>
                                 {expandedTrack === track && (
                                     <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        className="mt-2 text-left bg-white rounded p-2 text-[10px] overflow-hidden"
                                     >
                                        <div className="font-bold border-b pb-1 mb-1 flex justify-between">
                                            <span>Team</span>
                                            <span>Total (V/NV)</span>
                                        </div>
                                        <div className="max-h-32 overflow-y-auto custom-scrollbar">
                                            {stats.teamsList.map(t => (
                                                <div key={t.id} className="flex justify-between py-0.5 border-b border-gray-50 last:border-0">
                                                    <span className="truncate w-1/2" title={t.name}>{t.name}</span>
                                                    <span className="font-mono text-right w-1/2">
                                                        <span className="font-bold text-gray-800 mr-1">{t.memberCount || 0}</span>
                                                        <span className="text-[9px] text-gray-400">(</span>
                                                        <span className="text-green-600 text-[9px]">{t.vegCount || 0}</span>
                                                        <span className="text-gray-300 px-0.5 text-[9px]">/</span>
                                                        <span className="text-red-600 text-[9px]">{t.nonVegCount || 0}</span>
                                                        <span className="text-[9px] text-gray-400">)</span>
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                     </motion.div>
                                 )}
                             </AnimatePresence>
                         </div>
                     ))}
                 </div>
             )}
        </GlassCard>

        {/* Multi-Box Round Controls */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {rounds.map((rId, idx) => {
                const isCurrent = currentRound === rId;
                const isPast = idx < currentRoundIdx;
                const isFuture = idx > currentRoundIdx;
                const label = ROUND_RUBRICS[rId].label;

                // Stats for this specific round
                const roundEvaluated = teams.filter(t => evaluations[t.id]?.[rId]?.count > 0).length;
                const roundPending = teams.length - roundEvaluated;

                return (
                    <GlassCard key={rId} className={`p-4 flex flex-col ${isCurrent ? 'ring-2 ring-indigo-500 shadow-lg' : 'opacity-80'}`}>
                        <div className="flex justify-between items-start mb-4">
                            <h3 className="font-bold text-gray-800">{label}</h3>
                            {isCurrent && (
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase
                                    ${roundStatus === 'ongoing' ? 'bg-green-100 text-green-700' :
                                      roundStatus === 'evaluation' ? 'bg-yellow-100 text-yellow-700' :
                                      roundStatus === 'completed' ? 'bg-blue-100 text-blue-700' :
                                      'bg-gray-100 text-gray-600'}`}>
                                    {roundStatus}
                                </span>
                            )}
                        </div>

                        {/* Round Stats */}
                        <div className="grid grid-cols-2 gap-2 mb-4 text-center">
                            <div className="bg-green-50 rounded p-1">
                                <span className="block font-bold text-green-600">{roundEvaluated}</span>
                                <span className="text-[10px] uppercase text-gray-400">Done</span>
                            </div>
                            <div className="bg-orange-50 rounded p-1">
                                <span className="block font-bold text-orange-500">{roundPending}</span>
                                <span className="text-[10px] uppercase text-gray-400">Left</span>
                            </div>
                        </div>

                        {/* Controls */}
                        <div className="mt-auto space-y-2">
                             {isCurrent ? (
                                 <>
                                    <div className="grid grid-cols-2 gap-1">
                                        <button
                                            onClick={() => updateState({ roundStatus: 'ongoing' })}
                                            disabled={roundStatus !== 'locked'}
                                            className={`py-1 rounded text-xs font-bold ${roundStatus !== 'locked' ? 'bg-gray-100 text-gray-400' : 'bg-green-600 text-white'}`}
                                        >
                                            Start
                                        </button>
                                        <button
                                            onClick={() => updateState({ roundStatus: 'evaluation' })}
                                            disabled={roundStatus !== 'ongoing'}
                                            className={`py-1 rounded text-xs font-bold ${roundStatus !== 'ongoing' ? 'bg-gray-100 text-gray-400' : 'bg-yellow-500 text-white'}`}
                                        >
                                            Eval
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => updateState({ roundStatus: 'completed' })}
                                        disabled={roundStatus !== 'evaluation'}
                                        className={`w-full py-1 rounded text-xs font-bold ${roundStatus !== 'evaluation' ? 'bg-gray-100 text-gray-400' : 'bg-blue-600 text-white'}`}
                                    >
                                        Complete
                                    </button>

                                    {/* Next Phase Button (Only if not last round) */}
                                    {idx < rounds.length - 1 && (
                                        <button
                                            onClick={() => handleAdvance(rounds[idx+1])}
                                            disabled={roundStatus !== 'completed'}
                                            className={`w-full py-2 mt-2 rounded-lg text-xs font-black border border-gray-200 ${roundStatus !== 'completed' ? 'bg-gray-50 text-gray-300' : 'bg-gray-800 text-white hover:bg-gray-900'}`}
                                        >
                                            Next Phase &rarr;
                                        </button>
                                    )}
                                    {/* Troll Button */}
<button
    onClick={async () => {
        if (confirm("⚠️ Are you sure you want to unleash CHAOS? (Troll Mode)")) {
            // Changed from updateDoc to setDoc with merge for safety
            // Updates timestamp to force a reset on client side
            await setDoc(doc(db, 'system', 'state'), {
                trollMode: { active: true, timestamp: Date.now() }
            }, { merge: true });
        }
    }}
    className="w-full py-1 mt-2 bg-red-900 text-red-100 text-[10px] font-bold rounded uppercase hover:bg-red-800 opacity-20 hover:opacity-100 transition-opacity"
>
    😈 Troll
</button>

                                 </>
                             ) : isPast ? (
                                 <div className="text-center py-2 text-xs font-bold text-gray-400 bg-gray-50 rounded">
                                     Round Completed
                                 </div>
                             ) : (
                                 <div className="text-center py-2 text-xs font-bold text-gray-300 bg-gray-50 rounded">
                                     Locked
                                 </div>
                             )}
                        </div>
                    </GlassCard>
                );
            })}
        </div>
    </div>
  );
};

const FinalSelection = ({ teams, evaluations }) => {
  const [filterTrack, setFilterTrack] = useState('All');

  // Compute stats
  const processedTeams = useMemo(() => {
    return teams.map(t => {
      const evals = evaluations[t.id] || {};
      // Use .avg if available (from aggregation), else 0.
      const idea = evals.idea?.avg || 0;
      const phase1 = evals.phase1?.avg || 0;
      const phase2 = evals.phase2?.avg || 0;

      const score = idea + phase1 + phase2;
      return { ...t, cumulativeScore: score.toFixed(1) };
    }).sort((a, b) => b.cumulativeScore - a.cumulativeScore);
  }, [teams, evaluations]);

  const filteredTeams = filterTrack === 'All' ? processedTeams : processedTeams.filter(t => t.track === filterTrack);

  const toggleFinalist = async (team) => {
    try {
      const ref = doc(db, 'private_team_data', team.id);
      const newVal = !team.isFinalist;

      // Update private data
      await setDoc(ref, { isFinalist: newVal }, { merge: true });

      // Remove from public team doc if it exists there (Cleanup)
      await updateDoc(doc(db, 'teams', team.id), {
          isFinalist: deleteField()
      });

    } catch (err) {
      console.error("Error toggling finalist", err);
    }
  };

  const uniqueTracks = ['All', ...new Set(teams.map(t => t.track).filter(Boolean))];

  return (
    <div className="h-full flex flex-col">
       <div className="flex justify-between items-center mb-4 px-2">
         <h2 className="text-xl font-bold text-gray-800">Final Round Selection (Phase III)</h2>
         <select
            value={filterTrack}
            onChange={(e) => setFilterTrack(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-300 text-sm font-semibold"
         >
            {uniqueTracks.map(t => <option key={t} value={t}>{t}</option>)}
         </select>
       </div>

       <div className="flex-1 overflow-hidden bg-white/40 rounded-xl border border-white/50 flex flex-col shadow-xl backdrop-blur-md">
         <div className="flex items-center bg-white/80 backdrop-blur-sm border-b border-gray-200 text-gray-500 text-sm font-semibold h-12 shrink-0 z-10">
            <div className="w-16 pl-4">Rank</div>
            <div className="flex-1 px-4">Team</div>
            <div className="w-32 px-4 text-center">Track</div>
            <div className="w-32 px-4 text-center">Score (I+P1+P2)</div>
            <div className="w-32 px-4 text-center">Finalist?</div>
         </div>
         <div className="flex-1 overflow-y-auto custom-scrollbar">
            {filteredTeams.map((team, index) => (
               <div key={team.id} className={`flex items-center text-sm border-b border-gray-100 ${team.isFinalist ? 'bg-green-50' : 'hover:bg-white/60'} h-[50px] transition-colors`}>
                  <div className="w-16 pl-4 font-bold text-gray-400">#{index + 1}</div>
                  <div className="flex-1 px-4 font-medium text-gray-800">
                     {team.name}
                     {team.isFinalist && <span className="ml-2 text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-bold">SELECTED</span>}
                  </div>
                  <div className="w-32 px-4 text-center text-xs bg-gray-100 rounded py-1 mx-2">{team.track}</div>
                  <div className="w-32 px-4 text-center font-bold text-indigo-600">{team.cumulativeScore}</div>
                  <div className="w-32 px-4 text-center">
                     <input
                        type="checkbox"
                        checked={!!team.isFinalist}
                        onChange={() => toggleFinalist(team)}
                        className="w-5 h-5 accent-indigo-600 cursor-pointer"
                     />
                  </div>
               </div>
            ))}
         </div>
       </div>
    </div>
  );
};

const NotificationPanel = ({ setModalConfig }) => {
  const [msg, setMsg] = useState('');
  const [type, setType] = useState('info'); // info, urgent
  const [targets, setTargets] = useState({
      all: true,
      contestant: false,
      jury: false,
      helper: false
  });

  const handleTargetChange = (key) => {
      if (key === 'all') {
          setTargets({ all: !targets.all, contestant: false, jury: false, helper: false });
      } else {
          setTargets(prev => {
              const newState = { ...prev, [key]: !prev[key] };
              if (newState[key]) newState.all = false;
              return newState;
          });
      }
  };

  const sendNotification = async () => {
    if (!msg.trim()) return;

    // Determine target array
    let targetRoles = [];
    if (targets.all) {
        targetRoles = ['all'];
    } else {
        if (targets.contestant) targetRoles.push('contestant');
        if (targets.jury) targetRoles.push('jury');
        if (targets.helper) targetRoles.push('helper');
    }

    if (targetRoles.length === 0) {
        setModalConfig({ isOpen: true, title: 'Error', message: "Please select at least one target audience.", type: 'error', isAlert: true });
        return;
    }

    try {
      await addDoc(collection(db, 'notifications'), {
        message: msg,
        type,
        targets: targetRoles,
        timestamp: new Date().toISOString(),
        createdBy: auth.currentUser.email
      });
      setMsg('');
      setModalConfig({ isOpen: true, title: 'Success', message: 'Notification sent!', type: 'success', isAlert: true });
    } catch (err) {
      console.error(err);
      setModalConfig({ isOpen: true, title: 'Error', message: 'Failed to send notification.', type: 'error', isAlert: true });
    }
  };

  return (
    <GlassCard className="p-6 max-w-lg mx-auto">
       <h2 className="text-xl font-bold text-gray-800 mb-4">Broadcast Notification</h2>
       <textarea
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Enter message..."
          className="w-full border border-gray-300 rounded-lg p-3 mb-4 h-32 resize-none focus:ring-2 focus:ring-indigo-500"
       />

       <div className="mb-6">
           <label className="block text-sm font-bold text-gray-700 mb-2">Target Audience</label>
           <div className="flex flex-wrap gap-4">
               {['all', 'contestant', 'jury', 'helper'].map(role => (
                   <label key={role} className="flex items-center gap-2 cursor-pointer capitalize">
                       <input
                           type="checkbox"
                           checked={targets[role]}
                           onChange={() => handleTargetChange(role)}
                           className="accent-indigo-600 w-4 h-4"
                       />
                       <span className="text-sm font-medium text-gray-600">{role === 'all' ? 'All Users' : role}</span>
                   </label>
               ))}
           </div>
       </div>

       <div className="flex justify-between items-center border-t border-gray-100 pt-4">
          <div className="flex gap-4">
             <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="ntype" value="info" checked={type === 'info'} onChange={() => setType('info')} />
                <span className="text-sm font-semibold">Info</span>
             </label>
             <label className="flex items-center gap-2 cursor-pointer">
                <input type="radio" name="ntype" value="urgent" checked={type === 'urgent'} onChange={() => setType('urgent')} />
                <span className="text-sm font-semibold text-red-600">Urgent</span>
             </label>
          </div>
          <button
             onClick={sendNotification}
             className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700"
          >
             Send
          </button>
       </div>
    </GlassCard>
  );
};


const AdminDashboard = ({ preview = false }) => {
  const [activeTab, setActiveTab] = useState(preview ? 'dogfood' : 'activity');
  const systemState = useSystemState();
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  // Data
  const [teamsRaw, setTeamsRaw] = useState([]);
  const [privateData, setPrivateData] = useState({});
  const [evaluations, setEvaluations] = useState({}); // teamId -> { round: { total, count, avg, scores } }

  // Fetch Public Team Data
  useEffect(() => {
    const unsubscribeTeams = onSnapshot(collection(db, 'teams'), (snap) => {
        const teamsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setTeamsRaw(teamsData);
    });
    return () => unsubscribeTeams();
  }, []);

  // Fetch Private Team Data
  useEffect(() => {
      const unsub = onSnapshot(collection(db, 'private_team_data'), (snap) => {
          const pData = {};
          snap.forEach(doc => {
              pData[doc.id] = doc.data();
          });
          setPrivateData(pData);
      });
      return () => unsub();
  }, []);

  // Merge Public & Private Data
  const teams = useMemo(() => {
      return teamsRaw.map(t => {
          const pData = privateData[t.id] || {};
          return {
              ...t,
              isFinalist: pData.isFinalist || false,
              // Merge private counts for Admin view
              phase3EvalCount: pData.phase3EvalCount || 0
          };
      });
  }, [teamsRaw, privateData]);

  useEffect(() => {
    // Optimization: Only fetch evaluations if the active tab requires them.
    // 'activity', 'feedbacks', 'notify', 'arcade' do not need global evaluation data.
    const TABS_NEEDING_EVALS = ['controls', 'selection', 'leaderboard'];
    if (!TABS_NEEDING_EVALS.includes(activeTab)) {
        return;
    }

    const unsubscribeEvals = onSnapshot(collection(db, 'evaluations'), (snap) => {
        const tempAgg = {}; 
        
        snap.forEach(doc => {
            const data = doc.data();
            if (!tempAgg[data.teamId]) tempAgg[data.teamId] = {};
            if (!tempAgg[data.teamId][data.round]) tempAgg[data.teamId][data.round] = [];
            tempAgg[data.teamId][data.round].push(data.totalScore);
        });

        // Compute Stats
        const finalAgg = {};
        Object.keys(tempAgg).forEach(teamId => {
            finalAgg[teamId] = {};
            Object.keys(tempAgg[teamId]).forEach(round => {
                const scores = tempAgg[teamId][round];
                const sum = scores.reduce((a, b) => a + b, 0);
                const avg = sum / scores.length;
                finalAgg[teamId][round] = {
                    total: sum, 
                    avg: avg,   
                    count: scores.length,
                    scores: scores
                };
            });
        });
        
        setEvaluations(finalAgg);
    });

    return () => unsubscribeEvals();
  }, [activeTab]);

  return (
    <div className="portal-shell h-screen w-full overflow-hidden flex flex-col">
      <ConfirmationModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ ...modalConfig, isOpen: false })}
        onConfirm={modalConfig.onConfirm}
        title={modalConfig.title}
        message={modalConfig.message}
        type={modalConfig.type}
        confirmText={modalConfig.confirmText}
        isAlert={modalConfig.isAlert}
      />
      
      {/* FIXED: Changed max-w-[95%] to max-w-[1440px] and added proper padding/centering */}
      <div className="max-w-[1440px] mx-auto w-full h-full flex flex-col p-4 md:p-8 overflow-hidden">
        
        {/* Header */}
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 px-2">
            <div className="flex items-center gap-4">
                <div className="bg-white p-2 rounded-xl shadow-sm border border-indigo-50">
                    <Shield className="w-8 h-8 text-indigo-600" />
                </div>
                <div>
                   <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">DOGFOOD <span className="portal-masthead-year">2026</span></h1>
                   {preview ? <div className="text-xs font-medium text-indigo-600 font-mono mt-1">ORGANIZER / LOCAL PREVIEW</div> : <div className="flex items-center gap-2 text-xs font-medium text-gray-500 font-mono mt-1">
                      <span>ROUND: <span className="text-indigo-600 font-bold uppercase">{systemState.currentRound}</span></span>
                      <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                      <span>STATUS: <span className={`font-bold uppercase ${systemState.roundStatus === 'ongoing' ? 'text-green-600' : 'text-gray-600'}`}>{systemState.roundStatus}</span></span>
                   </div>}
                </div>
            </div>

            <div className="portal-nav flex flex-wrap bg-white/60 backdrop-blur-md p-1.5 rounded-2xl shadow-sm border border-white/60 gap-1">
                {[
                    { id: 'activity', icon: Activity, label: 'Live Feed' },
                    { id: 'controls', icon: LayoutDashboard, label: 'Controls' },
                    { id: 'selection', icon: Star, label: 'Finals' },
                    { id: 'leaderboard', icon: Trophy, label: 'Leaderboard' },
                    { id: 'feedbacks', icon: StickyNote, label: 'Feedbacks' },
                    { id: 'auth', icon: UserIcon, label: 'Accounts' },
                    { id: 'notify', icon: Bell, label: 'Notify' },
                    { id: 'dogfood', icon: LayoutGrid, label: 'Events' },
                    { id: 'arcade', icon: Gamepad2, label: 'Arcade' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        aria-label={tab.label}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                            ${activeTab === tab.id 
                                ? 'bg-white shadow-md text-indigo-600 scale-100' 
                                : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                    >
                        {tab.icon && <tab.icon size={16} />} <span className="hidden md:inline">{tab.label}</span>
                    </button>
                ))}
            </div>
        </header>

        {/* Content */}
        {/* FIXED: Added p-2 and overflow-y-auto to prevent shadow clipping and enable scrolling */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 custom-scrollbar p-8">
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className="h-full flex flex-col"
            >
                {activeTab === 'activity' && <ActivityFeed />}
                {activeTab === 'controls' && <RoundControls systemState={systemState} teams={teams} evaluations={evaluations} setModalConfig={setModalConfig} />}
                {activeTab === 'selection' && <FinalSelection teams={teams} evaluations={evaluations} />}
                {activeTab === 'notify' && <NotificationPanel setModalConfig={setModalConfig} />}
                {activeTab === 'leaderboard' && <UnifiedLeaderboard teams={teams} evaluations={evaluations} />}
                {activeTab === 'feedbacks' && <FeedbackViewer />}
                {activeTab === 'auth' && <UserManagement />}
                {activeTab === 'dogfood' && <DogfoodWorkspace role="admin" preview={preview} />}
                {activeTab === 'arcade' && <ArcadeDashboard user={auth.currentUser} previewRole={preview ? 'admin' : null} />}
            </motion.div>
        </div>
      </div>
    </div>
  );
};

/* --- ContestantDashboard --- */

const ContestantDashboard = ({ user, userProfile, preview = false }) => {
  const [activeTab, setActiveTab] = useState(preview ? 'dogfood' : 'timeline');
  const [attendanceMarked, setAttendanceMarked] = useState(preview);
  const [loading, setLoading] = useState(!preview);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [assignedRoom, setAssignedRoom] = useState(null);
  const [teamDetails, setTeamDetails] = useState(preview ? {
    id: 'preview-team', teamId: 'PREVIEW-01', name: 'Preview Team',
    track: 'Open Innovation', status: 'ready', memberCount: 1,
    members: ['Local Preview'], attendanceMarked: true
  } : null);
  const [notifications, setNotifications] = useState([]);
  const [viewRubric, setViewRubric] = useState(null); // Which round rubric to view

  const systemState = useSystemState();
  const { currentRound, roundStatus } = systemState;

  // Request Help State
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [helpIssue, setHelpIssue] = useState('');
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  useEffect(() => {
    if (preview) return;
    const fetchData = async () => {
      if (userProfile) {
        // 1. Check User & Attendance (from Profile)
        if (userProfile.attendanceMarked) {
          setAttendanceMarked(true);
          setAssignedRoom(userProfile.roomNumber || null);
        }

        // 2. Fetch Team Details
        if (userProfile.teamId) {
            try {
                // Subscribe to team updates for status changes
                const unsubTeam = onSnapshot(doc(db, 'teams', userProfile.teamId), (doc) => {
                  if (doc.exists()) {
                    setTeamDetails({ id: doc.id, ...doc.data() });
                  }
                });
                // Clean up subscription? In this simplified effect, we might leak if we don't return cleanup.
                // But for now, we rely on component unmount or just fetch once if we didn't want real-time status.
                // Better: Use a separate useEffect for subscription.
            } catch (err) {
                console.error("Error fetching team details:", err);
            }
        }
      }
      setLoading(false);
    };
    fetchData();
  }, [user, userProfile, preview]);

  useEffect(() => {
      const q = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(20));
      const unsubscribe = onSnapshot(q, (snapshot) => {
          const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
          // Filter by target
          const myNotifs = all.filter(n => {
              if (!n.targets || n.targets.includes('all')) return true;
              return n.targets.includes('contestant');
          });
          setNotifications(myNotifs);
      });
      return () => unsubscribe();
  }, []);

  // Listen for Active Help Request
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'help_requests'), where('userEmail', '==', user.email), where('resolved', '==', false));
    const unsub = onSnapshot(q, (snap) => {
        if (!snap.empty) {
            setActiveHelpRequest({ id: snap.docs[0].id, ...snap.docs[0].data() });
        } else {
            setActiveHelpRequest(null);
        }
    });
    return () => unsub();
  }, [user]);

  const [showMemberCountModal, setShowMemberCountModal] = useState(false);
  const [scannedTrackTemp, setScannedTrackTemp] = useState(null);
  const [showCelebration, setShowCelebration] = useState(false);

  // Help Request State
  const [activeHelpRequest, setActiveHelpRequest] = useState(null);
  const [selectedHelper, setSelectedHelper] = useState('');

  // Troll State
  const [showTrollModal, setShowTrollModal] = useState(false);
   const [isTrollCompleted, setIsTrollCompleted] = useState(() => {
      return localStorage.getItem('troll_completed') === 'true';
  });

  // Effect: Watch for NEW troll triggers from Admin to reset local completion
  useEffect(() => {
      if (systemState?.trollMode?.timestamp) {
          const lastSeenTroll = localStorage.getItem('last_troll_timestamp');
          const serverTroll = String(systemState.trollMode.timestamp);

          // If the server has a newer troll timestamp than we last saw, RESET completion
          if (lastSeenTroll !== serverTroll) {
              localStorage.removeItem('troll_completed');
              localStorage.setItem('last_troll_timestamp', serverTroll);
              setIsTrollCompleted(false); // Reset state to show card
          }
      }
  }, [systemState?.trollMode?.timestamp]);

  const isTrollActive = systemState?.trollMode?.active && !isTrollCompleted;

  const handleTrollComplete = () => {
      localStorage.setItem('troll_completed', 'true');
      setIsTrollCompleted(true); // Update state to hide card
      setShowTrollModal(false);
  };

  // Celebration Logic (Persistent until feedback is submitted)
  useEffect(() => {
     if (currentRound === 'phase3' && roundStatus === 'completed') {
         // Show celebration if feedback NOT submitted OR if we just want to allow them to download certs
         // If feedback submitted, we still show the overlay but in 'certificates' mode (handled inside Overlay)
         // But wait, user says: "if feedback already submitted then directly show/preview certifcates/downloads"
         // So we ALWAYS show the overlay if round is completed?
         // User: "do not let them close... even if they refresh"
         // So yes, if round is completed, we FORCE this overlay.
         // Inside the overlay, if feedback is done, we show certs.
         // Wait, if certs are downloaded, can they close it?
         // "if feedback already submitted then directly show/preview certifcates"
         // I'll make the overlay open always when phase3 is complete.
         // Inside overlay, "Close" button only appears if feedback is done (certificates view).
         setShowCelebration(true);
     }
  }, [currentRound, roundStatus]);

  const handleScan = async (detectedCodes) => {
    if (!teamDetails) return;

    if (detectedCodes && detectedCodes.length > 0) {
      const value = detectedCodes[0].rawValue;

      // Check prefix
      if (value.startsWith("DOGFOOD_CHECKIN_")) {
          const scannedTrack = value.replace("DOGFOOD_CHECKIN_", "");
          
          // Verify Track First
          const myTrack = teamDetails?.track;
          
          if (!myTrack) {
               setModalConfig({
                    isOpen: true,
                    title: 'No Track Assigned',
                    message: 'Your team does not have a track assigned. Please contact help desk.',
                    type: 'error',
                    isAlert: true
               });
               return;
          }
          
          if (scannedTrack !== myTrack) {
                setModalConfig({
                    isOpen: true,
                    title: 'Wrong Registration Desk',
                    message: `You are at the ${scannedTrack} desk. Please go to the registration desk for ${myTrack}.`,
                    type: 'error',
                    isAlert: true
                });
                return;
          }

          setScannedTrackTemp(scannedTrack);
          setShowMemberCountModal(true); // Trigger Modal
      }
    }
  };

  const confirmCheckIn = async (presentMembers) => {
    try {
        if (!scannedTrackTemp) return;

        // Calculate stats
        const total = presentMembers.length;
        const veg = presentMembers.filter(m => m.diet === 'veg').length;
        const nonVeg = presentMembers.filter(m => m.diet === 'non-veg').length;

        if (userProfile && userProfile.id) {
            // Valid Track - Proceed
            const roomString = teamDetails?.venue || "TBD";
            const memCount = total;

            // 1. Update User Attendance
            await updateDoc(doc(db, 'users', userProfile.id), {
              attendanceMarked: true,
              attendedAt: new Date().toISOString(),
              roomNumber: roomString
            });

            // 2. Update Team Attendance
            if (userProfile.teamId) {
                await updateDoc(doc(db, 'teams', userProfile.teamId), {
                    attendanceMarked: true,
                    memberCount: memCount,
                    vegCount: veg,
                    nonVegCount: nonVeg,
                    attendanceDetails: presentMembers // Save detailed list
                });
            }

            // 3. Trigger Helper Alert (Create Check-in Event)
            try {
                await addDoc(collection(db, 'checkins'), {
                    teamId: teamDetails.id,
                    teamName: teamDetails.name,
                    track: scannedTrackTemp, // Use the scanned track (should match team track)
                    total: memCount,
                    veg: veg,
                    nonVeg: nonVeg,
                    memberNames: presentMembers.map(m => m.name), // Added member names
                    timestamp: new Date().toISOString()
                });
            } catch (e) {
                console.error("Failed to create checkin event", e);
            }

            await logAction(
                user.uid, 
                user.email, 
                teamDetails?.name || user.displayName,
                'contestant', 
                'CHECK_IN', 
                `User scanned attendance QR for ${scannedTrackTemp}. People: ${memCount} (V:${veg}, NV:${nonVeg})`
            );

            setAssignedRoom(roomString);
            setAttendanceMarked(true);
            setShowSuccessModal(true);
            setShowMemberCountModal(false);
        }
    } catch (err) {
        console.error("Check-in Error:", err); // This helps debug
        setModalConfig({ 
            isOpen: true, 
            title: 'Error', 
            message: 'Check-in failed. Please try again.', 
            type: 'error', 
            isAlert: true 
        });
        setShowMemberCountModal(false);
    }
  };

  const handleSendHelpRequest = async () => {
    if (!helpIssue.trim()) return;
    try {
        await addDoc(collection(db, 'help_requests'), {
            userEmail: user.email,
            teamName: teamDetails?.name || "Unknown Team",
            track: teamDetails?.track || "Unknown",
            roomNumber: assignedRoom,
            issue: helpIssue,
            timestamp: new Date().toISOString(),
            resolved: false
        });

        await logAction(
            user.uid,
            user.email,
            teamDetails?.name || user.displayName,
            'contestant',
            'HELP_REQUESTED',
            `Request opened: ${helpIssue}`
        );

        setShowHelpModal(false);
        setHelpIssue('');
        setModalConfig({ isOpen: true, title: 'Request Sent', message: 'Help has been requested. A volunteer will be with you shortly.', type: 'success', isAlert: true });
    } catch (error) {
        console.error(error);
        setModalConfig({ isOpen: true, title: 'Error', message: 'Failed to send request.', type: 'error', isAlert: true });
    }
  };

  const handleResolveHelpRequest = async () => {
      if (!activeHelpRequest || !selectedHelper) return;
      try {
          await updateDoc(doc(db, 'help_requests', activeHelpRequest.id), {
              resolved: true,
              resolvedAt: new Date().toISOString(),
              solvedBy: selectedHelper
          });

          await logAction(
            user.uid,
            user.email,
            teamDetails?.name || user.displayName,
            'contestant',
            'HELP_RESOLVED',
            `Request resolved by ${selectedHelper}`
          );

          setShowHelpModal(false);
          setSelectedHelper('');
          setModalConfig({ isOpen: true, title: 'Resolved', message: 'Your request has been marked as resolved.', type: 'success', isAlert: true });
      } catch (e) {
          console.error(e);
          setModalConfig({ isOpen: true, title: 'Error', message: 'Failed to update request.', type: 'error', isAlert: true });
      }
  };

  const markReadyForEvaluation = async () => {
     if (!teamDetails) return;
     // Check if already ready for CURRENT round
     if (teamDetails.status === 'ready' && teamDetails.readyRound === currentRound) return;
     try {
         await updateDoc(doc(db, 'teams', teamDetails.id), {
             status: 'ready',
             readyRound: currentRound, // Track which round they are ready for
             readyTime: new Date().toISOString()
         });
     } catch (err) { console.error(err); }
  };

  if (loading) return <div className="p-10 text-center">Loading...</div>;

  // --- CHECK IN FLOW ---
  if (!attendanceMarked) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <ConfirmationModal isOpen={modalConfig.isOpen} onClose={() => setModalConfig({ ...modalConfig, isOpen: false })} title={modalConfig.title} message={modalConfig.message} type={modalConfig.type} isAlert={true} />

          {/* Member Count Modal */}
          <AnimatePresence>
            {showMemberCountModal && (
                <CheckInModal
                    isOpen={showMemberCountModal}
                    onClose={() => setShowMemberCountModal(false)}
                    onConfirm={confirmCheckIn}
                    members={teamDetails?.members || []}
                />
            )}
          </AnimatePresence>

          <GlassCard className="w-full max-w-md p-6 flex flex-col items-center">
            <ScanLine className="w-12 h-12 text-indigo-500 mb-4 animate-pulse" />
            <h2 className="text-2xl font-bold text-gray-800 mb-2">Check-In Required</h2>
            <p className="text-gray-500 text-center mb-6">Please locate a Helper Station and scan the QR code.</p>
            <div className="w-full aspect-square rounded-xl overflow-hidden border-4 border-indigo-100 relative bg-black flex items-center justify-center">
              {!showMemberCountModal && (
                  teamDetails ? (
                      <Scanner onScan={handleScan} allowMultiple={false} scanDelay={2000} constraints={{ facingMode: 'environment' }} />
                  ) : (
                      <div className="text-white text-center">
                          <LoadingSpinner />
                          <p className="mt-2 text-sm">Loading Team Data...</p>
                      </div>
                  )
              )}
            </div>
          </GlassCard>
        </div>
      );
  }

  if (showSuccessModal) {
     return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <GlassCard className="w-full max-w-sm p-8 text-center flex flex-col items-center">
                <CheckCircle className="w-10 h-10 text-green-600 mb-6" />
                <h2 className="text-2xl font-bold text-gray-800 mb-2">Check-in Complete!</h2>
                <div className="bg-indigo-50 p-4 rounded-xl w-full mb-6">
                    <p className="text-xs font-bold text-indigo-400 uppercase">Assigned Workstation</p>
                    <p className="text-3xl font-black text-indigo-600">{assignedRoom}</p>
                </div>
                <button onClick={() => setShowSuccessModal(false)} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold">Go to Dashboard</button>
            </GlassCard>
        </div>
     );
  }

  // --- MAIN DASHBOARD ---
  return (
    <div className="portal-shell portal-shell--contestant h-[100dvh] overflow-hidden flex flex-col p-4 md:p-6 max-w-7xl mx-auto pb-24">
      <AnimatePresence>
        {showTrollModal && (
            <TrollOverlay
                isOpen={showTrollModal}
                onClose={() => setShowTrollModal(false)}
                onComplete={handleTrollComplete}
            />
        )}
        {showCelebration && (
            <CelebrationOverlay
                onClose={() => setShowCelebration(false)}
                teamDetails={teamDetails}
                userProfile={userProfile}
                onFeedbackSuccess={() => {}}
            />
        )}
        {showHelpModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-white rounded-2xl p-6 w-full max-w-md">
                    <h3 className="text-xl font-bold mb-4">{activeHelpRequest ? 'Resolve Request' : 'Request Help'}</h3>

                    {activeHelpRequest ? (
                        <div className="space-y-4">
                            <div className="bg-orange-50 p-3 rounded-lg border border-orange-100">
                                <p className="text-xs font-bold text-orange-500 uppercase mb-1">Current Issue</p>
                                <p className="text-gray-800 font-medium">{activeHelpRequest.issue}</p>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">Who solved this?</label>
                                <select
                                    value={selectedHelper}
                                    onChange={(e) => setSelectedHelper(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg p-3 outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select Helper</option>
                                    {/* Filter Helpers by Track */}
                                    {(TRACK_HELPERS.find(t => t.track === teamDetails?.track)?.students || [])
                                        .map((s, i) => (
                                            <option key={i} value={s.name}>{s.name} ({s.role})</option>
                                        ))
                                    }
                                </select>
                            </div>

                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setShowHelpModal(false)} className="px-4 py-2 bg-gray-100 text-gray-500 font-bold rounded-lg hover:bg-gray-200">Close</button>
                                <button
                                    onClick={handleResolveHelpRequest}
                                    disabled={!selectedHelper}
                                    className="px-4 py-2 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 disabled:opacity-50"
                                >
                                    Mark Resolved
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <textarea value={helpIssue} onChange={(e) => setHelpIssue(e.target.value)} className="w-full border p-3 rounded-xl h-32 focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="Describe the issue you are facing..." />
                            <div className="flex justify-end gap-2 mt-4">
                                <button onClick={() => setShowHelpModal(false)} className="px-4 py-2 bg-gray-100 text-gray-500 font-bold rounded-lg hover:bg-gray-200">Cancel</button>
                                <button onClick={handleSendHelpRequest} className="px-4 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg">Send Request</button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        )}
        {attendanceMarked && currentRound === 'idea' && roundStatus === 'locked' && (
            <div className="fixed inset-0 z-[300] bg-white text-gray-900 overflow-y-auto p-6 md:p-12 flex flex-col items-center">
                <div className="max-w-4xl w-full">
                    <h1 className="text-4xl md:text-6xl font-black text-indigo-900 mb-8 text-center uppercase tracking-tight">Code of Conduct</h1>

                    <p className="text-lg font-bold text-gray-600 mb-8 leading-relaxed border-l-4 border-indigo-500 pl-4">
                        This portal supports a welcoming and inclusive event environment for all participants, regardless of gender, age, disability, race, ethnicity, nationality, religion, or any other protected characteristic.
                    </p>

                    <div className="space-y-6 text-base md:text-lg font-medium text-gray-800">
                        <p>Participants, organizers, mentors, volunteers, and judges should follow these community guidelines:</p>

                        <ul className="list-disc pl-6 space-y-3 marker:text-indigo-500">
                            <li>Participants must carry their identity proofs (college ID, Aadhar Card).</li>
                            <li>No team or individual is permitted to leave the venue during the hackathon event.</li>
                            <li>All amenities such as food, snacks, and accommodation will be provided within the venue throughout the event.</li>
                            <li>Finished products or projects are not allowed at the event. However, teams must bring their own hardware/raw materials (if required) to build their project during the hackathon.</li>
                            <li>Technical support and assistance will be provided by mentors and volunteers at the hackathon.</li>
                            <li>Treat all individuals with respect and dignity. Harassment, discrimination, or any form of unwelcome or inappropriate behavior will not be tolerated.</li>
                            <li>Adhere to all event rules and guidelines set forth by the organizers. Follow instructions from event staff and volunteers. Failure to comply may result in disqualification.</li>
                            <li>Conduct yourself in a professional manner at all times. Refrain from disruptive or disrespectful behavior, including excessive noise, vandalism, or intoxication.</li>
                            <li>Prioritize the safety and well-being of all participants. Be mindful of physical and emotional boundaries. Report any concerns or incidents promptly to event organizers.</li>
                            <li>Violations of this code of conduct may result in disciplinary action, including verbal warnings, expulsion from the event without refund, and banning from future events.</li>
                            <li>No participant is allowed to leave before 6.00PM on 10/01/2026.</li>
                        </ul>
                    </div>

                    <div className="mt-12 p-6 bg-indigo-50 rounded-xl border border-indigo-100 text-center">
                        <p className="text-indigo-800 font-bold mb-2">Hackathon Status</p>
                        <div className="text-sm font-mono text-indigo-600 bg-white inline-block px-3 py-1 rounded border border-indigo-200">WAITING FOR KICKOFF...</div>
                    </div>
                </div>
            </div>
        )}
        {viewRubric && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold">{ROUND_RUBRICS[viewRubric]?.label} Rubrics</h3>
                        <button onClick={() => setViewRubric(null)}><X /></button>
                    </div>
                    <div className="space-y-4">
                        {ROUND_RUBRICS[viewRubric]?.rubrics.map(r => (
                            <div key={r.id} className="border-b pb-2">
                                <div className="flex justify-between font-semibold">
                                    <span>{r.label}</span>
                                    <span className="text-indigo-600">{r.max} Marks</span>
                                </div>
                            </div>
                        ))}
                        <div className="pt-2 flex justify-between font-bold text-lg">
                            <span>Total</span>
                            <span>{ROUND_RUBRICS[viewRubric]?.maxMarks} Marks</span>
                        </div>
                    </div>
                </div>
            </div>
        )}
      </AnimatePresence>

      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 px-2">
          <div className="flex items-center gap-4">
               <div className="bg-white p-2 rounded-xl shadow-sm border border-indigo-50">
                    <LayoutDashboard className="w-8 h-8 text-indigo-600" />
               </div>
               <div>
                  <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">DOGFOOD <span className="portal-masthead-year">2026</span></h1>
                  <p className="text-indigo-600 font-bold text-sm">PARTICIPANT / {teamDetails?.name || 'Loading...'}</p>
               </div>
          </div>
          
          <div className="flex flex-col md:flex-row gap-2 md:items-center self-center md:self-auto w-full md:w-auto">
              {/* Added Help/Room Info above nav on mobile, or inline on desktop if desired. keeping them separate for clarity */}
              <div className="flex gap-2 mb-2 md:mb-0 justify-end w-full md:w-auto">
                  <button onClick={() => setShowHelpModal(true)} className="bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 text-xs">
                        <HandMetal size={14} /> <span className="hidden md:inline">Help</span>
                  </button>
                  <div className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg font-bold flex items-center gap-2 text-xs">
                        <MapPin size={14} /> {assignedRoom}
                  </div>
              </div>

              <div className="portal-nav flex flex-wrap bg-white/60 backdrop-blur-md p-1.5 rounded-2xl shadow-sm border border-white/60 gap-1 justify-center w-full md:w-auto">
                {/* Mobile Profile Icon integration similar to Helper */}
                <div className="md:hidden mr-1">
                    <div className="bg-white p-2 rounded-xl shadow-sm text-indigo-600 border border-indigo-50">
                        <UserIcon size={18} />
                    </div>
                </div>

                {[
                    { id: 'timeline', icon: CalendarClock, label: 'Timeline' },
                    { id: 'rounds', icon: Trophy, label: 'Rounds' },
                    { id: 'notifications', icon: Bell, label: 'Notifs' },
                    { id: 'dogfood', icon: LayoutGrid, label: 'Submit' },
                    { id: 'arcade', icon: Gamepad2, label: 'Arcade' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        aria-label={tab.label}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                            ${activeTab === tab.id 
                                ? 'bg-white shadow-md text-indigo-600 scale-100' 
                                : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                    >
                        {tab.icon && <tab.icon size={16} />} <span className="hidden md:inline">{tab.label}</span>
                    </button>
                ))}
              </div>
          </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-8 pb-32">
        {/* TIMELINE TAB */}
        {activeTab === 'timeline' && (
            <GlassCard className="p-6">
                <h2 className="text-xl font-bold text-gray-800 mb-6">Event Timeline</h2>
                <div className="relative border-l-2 border-indigo-100 pl-6 space-y-8">
                    {TIMELINE_DATA.map((event, i) => (
                        <div key={i} className="relative">
                            <div className="absolute -left-[29px] top-1 w-3 h-3 bg-indigo-500 rounded-full ring-4 ring-white shadow-sm"></div>
                            <div className="mb-1">
                                <h3 className="font-bold text-gray-800">{event.title}</h3>
                                <span className="text-xs text-indigo-600 font-mono bg-indigo-50 px-2 py-0.5 rounded">{event.time}</span>
                            </div>
                            <p className="text-xs text-gray-500">{event.day} • {event.location}</p>
                        </div>
                    ))}
                </div>
            </GlassCard>
        )}

        {/* ROUNDS TAB */}
        {activeTab === 'rounds' && (
            <div className="grid gap-6 md:grid-cols-2">
                {/* Troll Button */}
                {isTrollActive && (
                    <GlassCard className="p-6 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900 to-purple-900 text-white col-span-full shadow-2xl relative overflow-hidden group cursor-pointer" onClick={() => setShowTrollModal(true)}>
                        <div className="absolute inset-0 bg-noise opacity-20 mix-blend-overlay"></div>
                        <div className="relative z-10 text-center">
                            <h2 className="text-3xl font-black mb-2 group-hover:scale-105 transition-transform">VIEW MARKS</h2>
                            <p className="text-indigo-200 font-medium">Click here to view your evaluation scores</p>
                        </div>
                        <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-purple-500 rounded-full blur-[50px] opacity-50 group-hover:opacity-100 transition-opacity"></div>
                    </GlassCard>
                )}

                {Object.values(ROUND_RUBRICS).map((round) => {
                    // Determine Status
                    let status = 'Locked';
                    let statusColor = 'bg-gray-100 text-gray-500';

                    // Simple logic: if currentRound matches
                    if (currentRound === round.id) {
                        status = roundStatus === 'locked' ? 'Locked' : roundStatus === 'completed' ? 'Completed' : 'Ongoing';
                        if (status === 'Ongoing') statusColor = 'bg-green-100 text-green-700';
                        if (roundStatus === 'evaluation') {
                            status = 'Evaluation';
                            statusColor = 'bg-yellow-100 text-yellow-700';
                        }
                    } else {
                        // If round is passed? (Need ordered logic or just compare IDs roughly)
                        // For hackathon, just check if it's "past".
                        // Let's assume sequential: idea < phase1 < phase2 < phase3
                        // Simplified: Only current is highlighted, others locked or done.
                        // Actually, if current is phase2, phase1 is done.
                        const rounds = ['idea', 'phase1', 'phase2', 'phase3'];
                        if (rounds.indexOf(round.id) < rounds.indexOf(currentRound)) {
                            status = 'Completed';
                            statusColor = 'bg-blue-100 text-blue-700';
                        }
                    }

                    return (
                        <GlassCard key={round.id} className="p-6 flex flex-col justify-between">
                            <div>
                                <div className="flex justify-between items-start mb-2">
                                    <h3 className="text-xl font-bold text-gray-800">{round.label}</h3>
                                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${statusColor}`}>{status}</span>
                                </div>
                                <p className="text-gray-500 text-sm mb-4">
                                    Max Score: {round.maxMarks}
                                </p>
                            </div>

                            {/* Status Control for CURRENT round */}
{currentRound === round.id && (
    <div className="my-4 pt-4 border-t border-gray-100">
         {(() => {
            // 1. Define strict Phase 3 Evaluation Check
            const isP3Evaluated = currentRound === 'phase3' && (
                teamDetails?.phase3Evaluated === true || 
                (teamDetails?.status === 'evaluated' && teamDetails?.lastEvaluatedRound === 'phase3')
            );

            // 2. Standard Evaluation Check
            const isEvaluated = teamDetails?.lastEvaluatedRound === currentRound;
            
            // 3. Ready Check: User is NOT ready if they are already evaluated (Standard OR P3)
            const isReady = !isEvaluated && !isP3Evaluated && teamDetails?.readyRound === currentRound;

            let label = 'Working';
            let color = 'bg-indigo-50 text-indigo-600 border border-indigo-100';

            // Logic for Label & Color
            if (currentRound === 'phase3') {
                if (roundStatus === 'completed') {
                    label = 'Completed';
                    color = 'bg-green-50 text-green-600 border border-green-100';
                } else if (isP3Evaluated) {
                     // If ANY evaluation exists, mark as completed
                     label = 'Completed';
                     color = 'bg-green-50 text-green-600 border border-green-100';
                } else if (isReady) {
                    label = 'Ready';
                    color = 'bg-yellow-50 text-yellow-600 border border-yellow-100';
                }
            } else {
                // Normal Logic for other rounds
                if (isEvaluated) {
                    label = 'Completed';
                    color = 'bg-green-50 text-green-600 border border-green-100';
                } else if (isReady) {
                    label = 'Ready';
                    color = 'bg-yellow-50 text-yellow-600 border border-yellow-100';
                }
            }

            // 4. Trigger Logic: Hide button if Locked, Completed, Standard Evaluated, OR Phase 3 Evaluated
            const canTrigger = roundStatus !== 'locked' && 
                               roundStatus !== 'completed' && 
                               !isEvaluated && 
                               !isP3Evaluated;

            return (
                <div className="flex flex-col gap-3">
                     <div className={`px-3 py-1.5 rounded-lg text-center font-bold text-sm ${color}`}>
                         Status: {label}
                     </div>
                     {canTrigger && (
                         <button
                            onClick={markReadyForEvaluation}
                            disabled={isReady}
                            className={`w-full py-2.5 rounded-lg font-bold text-sm shadow transition-all transform active:scale-95
                                ${isReady
                                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                        >
                            {isReady ? 'Waiting for Jury...' : 'Mark as Ready'}
                        </button>
                     )}
                </div>
            );
         })()}
    </div>
)}

                            <button
                                onClick={() => setViewRubric(round.id)}
                                className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg text-sm font-bold transition-colors mt-auto"
                            >
                                View Rubrics
                            </button>
                        </GlassCard>
                    );
                })}
            </div>
        )}

        {/* NOTIFICATIONS TAB */}
        {activeTab === 'notifications' && (
            <div className="space-y-4">
                {notifications.map(n => (
                    <GlassCard key={n.id} className={`p-4 border-l-4 ${n.type === 'urgent' ? 'border-red-500 bg-red-50/50' : 'border-indigo-500'}`}>
                        <div className="flex justify-between items-start mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${n.type === 'urgent' ? 'bg-red-200 text-red-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                {n.type === 'urgent' ? 'URGENT' : 'INFO'}
                            </span>
                            <span className="text-xs text-gray-400">{n.timestamp ? format(new Date(n.timestamp), 'HH:mm') : ''}</span>
                        </div>
                        <p className="text-gray-800 font-medium">{n.message}</p>
                    </GlassCard>
                ))}
                {notifications.length === 0 && <p className="text-center text-gray-500">No notifications.</p>}
            </div>
        )}

        {/* ARCADE TAB */}
        {activeTab === 'dogfood' && <DogfoodWorkspace role="contestant" preview={preview} />}
        {activeTab === 'arcade' && <ArcadeDashboard user={user} customUserName={teamDetails?.name} previewRole={preview ? 'contestant' : null} />}
      </div>
    </div>
  );
};

/* --- HelperDashboard --- */

const HelperDashboard = ({ user, userProfile }) => {
  const [activeTab, setActiveTab] = useState('overview'); // Default to overview
  const [requests, setRequests] = useState([]);
  const [helperData, setHelperData] = useState(null);
  const [stats, setStats] = useState({ total: 0, checkedIn: 0, evaluated: 0 });
  const [teammates, setTeammates] = useState([]);
  const [trackTeams, setTrackTeams] = useState([]); // Store contestant teams for this track
  const [trackJuries, setTrackJuries] = useState([]); // Store juries for this track (Jury Helper)

  // Master Helper State
  const [allHelpers, setAllHelpers] = useState([]);

  // New Check-in Alert State (Queue)
  const [checkInQueue, setCheckInQueue] = useState([]);

  // New Help Request Alert State (Queue)
  const [helpRequestQueue, setHelpRequestQueue] = useState([]);

  // New Ready Alert State (Jury Helper)
  const [readyAlert, setReadyAlert] = useState(null);

  const assignedTrack = userProfile?.assignedTrack || "Unknown";
  const assignedVenue = userProfile?.assignedVenue;
  const helperRole = userProfile?.helperRole;
  const isJuryHelper = helperRole === 'Jury Helpers';
  const isMasterHelper = userProfile?.isMasterHelper || helperRole === 'Master Helper';

  const qrValue = assignedTrack !== "Unknown" ? `DOGFOOD_CHECKIN_${assignedTrack}` : "INVALID_TRACK";

  // System State for "Current Round" stats
  const systemState = useSystemState();

  // Sound Refs
  const prevRequestsLength = React.useRef(0);
  const isFirstLoad = React.useRef(true);

  // Helper for Acknowledgment
  const handleAcknowledgeReady = (teamId) => {
      // FIX: Create the same composite key: ID + Current Round
      const compositeKey = `${teamId}_${systemState.currentRound}`;
      
      const localAck = JSON.parse(localStorage.getItem('acknowledgedReadyTeams') || '[]');
      
      if (!localAck.includes(compositeKey)) {
          const newList = [...localAck, compositeKey];
          localStorage.setItem('acknowledgedReadyTeams', JSON.stringify(newList));
      }
      setReadyAlert(null);
  };
  useEffect(() => {
    if (userProfile) {
        setHelperData(userProfile);
        // If Reg Desk, default to checkin
        if (userProfile.helperRole === 'Registration Desk') {
            setActiveTab('checkin');
        } else if (isMasterHelper) {
             setActiveTab('helpers');
        } else {
            setActiveTab('overview');
        }
    }

    // Fetch Teammates (Same Track) - IF not Master
    if (assignedTrack && !isMasterHelper) {
        const qHelpers = query(collection(db, 'users'), where('role', '==', 'helper'), where('assignedTrack', '==', assignedTrack));
        getDocs(qHelpers).then(snap => {
            const mates = snap.docs.map(d => d.data()).filter(h => h.email !== user.email);
            setTeammates(mates);
        });

        // Jury Helper: Fetch Juries
        if (isJuryHelper) {
            const qJuries = query(collection(db, 'users'), where('role', '==', 'jury'), where('assignedTrack', '==', assignedTrack));
            getDocs(qJuries).then(snap => {
                const juries = snap.docs.map(d => d.data());
                setTrackJuries(juries);
            });
        }
    }

    // Master Helper: Fetch ALL Helpers
    let unsubscribeHelpers = () => {};
    if (isMasterHelper) {
        const qHelpers = query(collection(db, 'users'), where('role', '==', 'helper'));
        unsubscribeHelpers = onSnapshot(qHelpers, (snap) => {
            const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAllHelpers(all);
        });
    }

    // Help Requests (Filtered by Track first, then Venue if specific)
    const q = query(
        collection(db, 'help_requests'),
        orderBy('timestamp', 'desc')
    );
    const unsubscribeReq = onSnapshot(q, (snapshot) => {
        const reqs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        const filtered = reqs.filter(r => !r.resolved);
        
        let finalRequests = [];

        if (isMasterHelper) {
            // Master Helper sees ALL unresolved requests
            finalRequests = filtered;
        } else if (assignedTrack !== "Unknown") {
            finalRequests = filtered.filter(r => {
                 if (r.track) return r.track === assignedTrack;
                 // Fallback for requests without track (if any): check venue match
                 if (assignedVenue && r.roomNumber && r.roomNumber.includes(assignedVenue)) return true;
                 return false;
            });
        } else {
             // General helpers (no track?)
             finalRequests = [];
        }

        // --- NEW: Alert Queue for New Requests (Excluding Jury Helpers) ---
        if (!isJuryHelper) {
             snapshot.docChanges().forEach(change => {
                 if (change.type === 'added') {
                     const data = { id: change.doc.id, ...change.doc.data() };

                     // Filter Logic Check
                     let matches = false;
                     if (isMasterHelper) {
                         matches = true; // Match ALL for master helper
                     } else if (assignedTrack !== "Unknown") {
                         if (data.track && data.track === assignedTrack) matches = true;
                         else if (assignedVenue && data.roomNumber && data.roomNumber.includes(assignedVenue)) matches = true;
                     }

                     if (matches && !data.resolved) {
                         // Check if truly new (within last minute to avoid stale alerts on reload)
                         const now = new Date();
                         const reqTime = data.timestamp ? new Date(data.timestamp) : new Date(0);
                         if ((now - reqTime) < 60000) { // 60s window
                             setHelpRequestQueue(prev => {
                                 if (prev.find(r => r.id === data.id)) return prev;

                                 // Play Sound for New Request
                                 playNotificationTone();

                                 return [...prev, data];
                             });
                         }
                     }
                 }
             });
        }

        setRequests(finalRequests);
        prevRequestsLength.current = finalRequests.length;
        isFirstLoad.current = false;
    });

    // Track Stats & Ready Alert
    let unsubscribeStats = () => {};
    let unsubscribeCheckins = () => {};

    if (assignedTrack !== "Unknown") {
        const statsQ = query(collection(db, 'teams'), where('track', '==', assignedTrack));
        unsubscribeStats = onSnapshot(statsQ, (snapshot) => {
            const teams = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const checkedIn = teams.filter(t => t.attendanceMarked).length;
            const evaluated = teams.filter(t => t.lastEvaluatedRound === systemState.currentRound).length;
            setStats({ total: teams.length, checkedIn, evaluated });

            // Sort: Ready Teams first for better visibility
            teams.sort((a, b) => {
                 const aReady = a.status === 'ready' && a.readyRound === systemState.currentRound;
                 const bReady = b.status === 'ready' && b.readyRound === systemState.currentRound;
                 if (aReady && !bReady) return -1;
                 if (!aReady && bReady) return 1;
                 return 0;
            });
            setTrackTeams(teams);

            // Ready Alert Logic (Jury Helper)
if (isJuryHelper) {
    // 1. Filter teams that are ready for the CURRENT round
    const readyTeams = teams.filter(t => t.status === 'ready' && t.readyRound === systemState.currentRound);
    
    if (readyTeams.length > 0) {
         const localAck = JSON.parse(localStorage.getItem('acknowledgedReadyTeams') || '[]');
         
         // 2. FIX: Check against "TeamID_RoundID" instead of just "TeamID"
         const unacknowledged = readyTeams.find(t => {
             const compositeKey = `${t.id}_${t.readyRound}`;
             return !localAck.includes(compositeKey);
         });

         if (unacknowledged) {
              setReadyAlert(prev => {
                  // Prevent re-triggering for the exact same team/round combo
                  if (prev?.id === unacknowledged.id && prev?.readyRound === unacknowledged.readyRound) return prev;
                  
                  playNotificationTone();
                  
                  return unacknowledged;
              });
         }
    }
}
                  });
    }
    // Check-in Queue logic separated to handle Master Helper
    let checkinQuery;
    if (isMasterHelper) {
        checkinQuery = query(collection(db, 'checkins'), orderBy('timestamp', 'desc'), limit(10));
    } else if (assignedTrack !== "Unknown") {
        checkinQuery = query(collection(db, 'checkins'), where('track', '==', assignedTrack), orderBy('timestamp', 'desc'), limit(10));
    }

    if (checkinQuery) {
        unsubscribeCheckins = onSnapshot(checkinQuery, (snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const data = { id: change.doc.id, ...change.doc.data() };
                    const now = new Date();
                    const eventTime = new Date(data.timestamp);

                    // Only show if happened in last 30 seconds
                    if ((now - eventTime) < 30000) {
                         setCheckInQueue(prev => {
                             // Prevent duplicates
                             if (prev.find(c => c.id === data.id)) return prev;
                             return [...prev, data];
                         });
                    }
                }
            });
        });
    }

return () => { unsubscribeReq(); unsubscribeStats(); unsubscribeCheckins(); unsubscribeHelpers(); };
  }, [
    user, 
    userProfile, 
    assignedTrack, 
    assignedVenue, 
    systemState.currentRound, 
    isJuryHelper, 
    isMasterHelper, 
    readyAlert // <--- ADDED HERE
  ]);

  const resolveRequest = async (id) => {
      try {
          await updateDoc(doc(db, 'help_requests', id), {
              resolved: true,
              resolvedAt: new Date().toISOString(),
              solvedBy: user.displayName || user.email
          });

          await logAction(
            user.uid,
            user.email,
            user.displayName || user.email,
            'helper',
            'HELP_RESOLVED',
            `Request ${id} marked resolved by helper`
          );
      } catch (err) {
          console.error("Error resolving request", err);
      }
  };

  return (
    <div className="h-screen w-full flex flex-col items-center max-w-5xl mx-auto p-4 md:p-6 overflow-hidden">

      {/* Check-in Alert Modal (Queue System) */}
      <AnimatePresence mode="popLayout">
        {checkInQueue.length > 0 && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                <motion.div
                    key={checkInQueue[0].id} // Key ensures animation when switching
                    initial={{ scale: 0.9, y: 20, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white p-6 rounded-2xl w-full max-w-md text-center relative shadow-2xl"
                >
                    <div className="absolute top-4 left-4 text-xs font-bold text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
                        Queue: {checkInQueue.length}
                    </div>
                    <button onClick={() => setCheckInQueue(prev => prev.slice(1))} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X /></button>

                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle2 className="w-8 h-8 text-green-600" />
                    </div>

                    <h3 className="text-2xl font-black text-gray-800 mb-1">New Check-In!</h3>
                    <p className="text-indigo-600 font-bold mb-6 text-sm uppercase tracking-wider">{checkInQueue[0].track}</p>

                    <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-100">
                        <h4 className="text-lg font-bold text-gray-800 mb-2">{checkInQueue[0].teamName}</h4>
                        {checkInQueue[0].memberNames && (
                            <p className="text-xs text-gray-600 mb-4 font-medium px-4">
                                {checkInQueue[0].memberNames.join(', ')}
                            </p>
                        )}
                        <div className="flex justify-center items-center gap-4 text-sm">
                            <div className="bg-white px-3 py-1 rounded shadow-sm border border-gray-100">
                                <span className="block font-bold text-gray-800 text-lg">{checkInQueue[0].total}</span>
                                <span className="text-[10px] text-gray-500 uppercase">Total</span>
                            </div>
                            <div className="bg-green-50 px-3 py-1 rounded shadow-sm border border-green-100">
                                <span className="block font-bold text-green-700 text-lg">{checkInQueue[0].veg}</span>
                                <span className="text-[10px] text-green-600 uppercase">Veg</span>
                            </div>
                            <div className="bg-red-50 px-3 py-1 rounded shadow-sm border border-red-100">
                                <span className="block font-bold text-red-700 text-lg">{checkInQueue[0].nonVeg}</span>
                                <span className="text-[10px] text-red-600 uppercase">Non-Veg</span>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => setCheckInQueue(prev => prev.slice(1))}
                        className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700"
                    >
                        Dismiss {checkInQueue.length > 1 ? `& Next (${checkInQueue.length - 1})` : ''}
                    </button>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Help Request Alert Modal (Queue System) */}
      <AnimatePresence mode="popLayout">
        {helpRequestQueue.length > 0 && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-red-900/80 backdrop-blur-md">
                <motion.div
                    key={helpRequestQueue[0].id}
                    initial={{ scale: 0.9, y: 20, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-white p-6 rounded-2xl w-full max-w-md text-center relative shadow-2xl border-4 border-red-500"
                >
                    <div className="absolute top-4 left-4 text-xs font-bold text-white bg-red-500 px-2 py-1 rounded-full">
                        Pending: {helpRequestQueue.length}
                    </div>
                    <button onClick={() => setHelpRequestQueue(prev => prev.slice(1))} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"><X /></button>

                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                        <HandMetal className="w-8 h-8 text-red-600" />
                    </div>

                    <h3 className="text-2xl font-black text-gray-800 mb-1">HELP REQUESTED!</h3>
                    <p className="text-red-600 font-bold mb-6 text-sm uppercase tracking-wider">{helpRequestQueue[0].track || 'General'}</p>

                    <div className="bg-red-50 rounded-xl p-4 mb-6 border border-red-100">
                        <div className="flex items-center justify-center gap-2 mb-2">
                             <h4 className="text-lg font-bold text-gray-800">{helpRequestQueue[0].teamName || 'Unknown Team'}</h4>
                             <span className="text-xs font-mono bg-white px-2 py-0.5 rounded border border-red-100 text-red-500 font-bold">{helpRequestQueue[0].roomNumber || 'N/A'}</span>
                        </div>
                        <p className="text-sm text-gray-800 font-medium italic">
                            "{helpRequestQueue[0].issue}"
                        </p>
                        <p className="text-[10px] text-gray-500 mt-2 uppercase font-bold">
                            {helpRequestQueue[0].timestamp ? format(new Date(helpRequestQueue[0].timestamp), 'HH:mm:ss') : ''}
                        </p>
                    </div>

                    <button
                        onClick={() => {
                            setHelpRequestQueue(prev => prev.slice(1));
                            setActiveTab('requests'); // Auto-switch to requests tab
                        }}
                        className="w-full py-3 bg-red-600 text-white font-bold rounded-xl shadow-lg hover:bg-red-700 animate-pulse"
                    >
                        Acknowledge & View {helpRequestQueue.length > 1 ? `(${helpRequestQueue.length - 1} more)` : ''}
                    </button>
                </motion.div>
            </div>
        )}
      </AnimatePresence>

      {/* Ready Alert Modal (Jury Helper) */}
      <AnimatePresence>
        {readyAlert && (
            <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-indigo-900/95 backdrop-blur-xl p-6 text-center">
                 <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="bg-white/10 p-6 rounded-full mb-8 border border-white/20 shadow-[0_0_50px_rgba(255,255,255,0.2)]"
                 >
                    <Trophy size={64} className="text-yellow-400" />
                 </motion.div>

                 <motion.h2
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="text-4xl md:text-6xl font-black text-white mb-2 tracking-tight"
                 >
                    TEAM READY!
                 </motion.h2>

                 <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.2 }}
                    className="bg-white text-gray-900 p-8 rounded-3xl w-full max-w-xl shadow-2xl my-8"
                 >
                     <h3 className="text-3xl font-bold mb-2 text-indigo-700">{readyAlert.name}</h3>
                     <p className="text-xl font-mono text-gray-500 font-bold mb-6">{readyAlert.id}</p>

                     <div className="flex justify-center gap-4 text-sm font-bold text-gray-500 uppercase tracking-widest">
                         <span className="bg-gray-100 px-3 py-1 rounded">{readyAlert.venue || 'TBD'}</span>
                         <span className="bg-gray-100 px-3 py-1 rounded">{readyAlert.track || 'TBD'}</span>
                     </div>
                 </motion.div>

                 <motion.button
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.3 }}
                    onClick={() => handleAcknowledgeReady(readyAlert.id)}
                    className="px-10 py-4 bg-white/20 text-white font-bold rounded-2xl shadow-xl hover:bg-white/30 transition-all text-lg border border-white/30 backdrop-blur"
                 >
                    Acknowledge
                 </motion.button>
            </div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 px-2">
            <div className="flex items-center gap-4">
               <div className="bg-white p-2 rounded-xl shadow-sm border border-indigo-50">
                    <LayoutDashboard className="w-8 h-8 text-indigo-600" />
               </div>
               <div>
                  <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">DOGFOOD <span className="portal-masthead-year">2026</span></h1>
                  <p className="text-indigo-600 font-bold text-sm">Welcome, {helperData?.name || user.email}</p>
               </div>
            </div>

            <div className="flex flex-col md:flex-row gap-2 md:items-center w-full md:w-auto">
                 {/* Desktop: Details (Hidden on Mobile) */}
                 <div className="hidden md:flex flex-col items-end gap-1 md:mb-0">
                    {helperData?.id && (
                        <div className="bg-white/50 px-3 py-1 rounded-full text-xs font-mono text-indigo-600 border border-indigo-100 flex items-center gap-2">
                            <UserIcon size={12} /> {helperData.id}
                        </div>
                    )}
                    {helperData?.year && helperData?.branch && (
                        <div className="text-xs text-gray-400 font-medium">
                            {helperData.year} Year • {helperData.branch}
                        </div>
                    )}
                 </div>

                 {/* Navigation Bar (Centered on Mobile) */}
                 <div className="flex items-center justify-center w-full md:w-auto">
                    <div className="portal-nav flex flex-wrap bg-white/60 backdrop-blur-md p-1.5 rounded-2xl shadow-sm border border-white/60 gap-1 justify-center items-center w-full md:w-auto">
                        {/* Mobile: Profile Icon (Integrated at the Start of Nav) */}
                        <div className="md:hidden mr-1">
                            <div className="bg-white p-2 rounded-xl shadow-sm text-indigo-600 border border-indigo-50">
                                <UserIcon size={18} />
                            </div>
                        </div>

                        {helperRole === 'Registration Desk' && (
                        <button
                            aria-label="Check-In"
                            onClick={() => setActiveTab('checkin')}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                                ${activeTab === 'checkin' ? 'bg-white shadow-md text-indigo-600 scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                        >
                            <QrCode size={16} /> <span className="hidden md:inline">Check-In</span>
                        </button>
                    )}

                    {isMasterHelper ? (
                        <button
                            aria-label="Helpers"
                            onClick={() => setActiveTab('helpers')}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                                ${activeTab === 'helpers' ? 'bg-white shadow-md text-indigo-600 scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                        >
                            <User size={16} /> <span className="hidden md:inline">Helpers</span>
                        </button>
                    ) : (
                        <button
                            aria-label="Info"
                            onClick={() => setActiveTab('overview')}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                                ${activeTab === 'overview' ? 'bg-white shadow-md text-indigo-600 scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                        >
                            <LayoutDashboard size={16} /> <span className="hidden md:inline">Info</span>
                        </button>
                    )}

                    <button
                        aria-label="Requests"
                        onClick={() => setActiveTab('requests')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                            ${activeTab === 'requests' ? 'bg-white shadow-md text-indigo-600 scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                    >
                        <Bell size={16} /> <span className="hidden md:inline">Requests</span>
                        {requests.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{requests.length}</span>}
                    </button>
                    {!isMasterHelper && (
                        <button
                            aria-label="Arcade"
                            onClick={() => setActiveTab('arcade')}
                            className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                                ${activeTab === 'arcade' ? 'bg-white shadow-md text-indigo-600 scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                        >
                            <Gamepad2 size={16} /> <span className="hidden md:inline">Arcade</span>
                        </button>
                    )}
                 </div>
            </div>
            </div>
      </header>

      <div className="w-full flex-1 flex flex-col min-h-0 overflow-hidden p-6 md:p-8">
        {/* Render Checkin if active OR if it's the only tab available for Reg Desk (safety) */}
        {activeTab === 'arcade' ? (
            <ArcadeDashboard user={user} customUserName={helperData?.name} previewRole="helper" />
        ) : activeTab === 'checkin' ? (
             <GlassCard className="flex-1 p-4 md:p-10 min-h-[60vh] overflow-y-auto custom-scrollbar">
              <div className="flex flex-col items-center justify-center min-h-full w-full">
                <h2 className="text-2xl md:text-3xl font-bold text-gray-800 mb-2 text-center">Attendance Check-In</h2>
                <p className="text-indigo-600 font-bold mb-6 md:mb-10 text-lg uppercase tracking-widest text-center">{assignedTrack}</p>

                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-white p-4 md:p-6 rounded-3xl shadow-xl max-w-[90vw] overflow-hidden flex justify-center"
                >
                    <QRCode value={qrValue} size={250} className="max-w-full h-auto" />
                </motion.div>
               
              </div>
             </GlassCard>
        ) : activeTab === 'helpers' ? (
            // Master Helper: Helpers List
            <GlassCard className="p-6 h-full flex flex-col min-h-0">
                <div className="flex flex-col h-full w-full">
                    <div className="flex items-center justify-between mb-4 shrink-0">
                        <div className="flex items-center gap-2">
                            <UserIcon className="text-indigo-500" size={20} />
                            <h3 className="font-bold text-gray-800">All Helpers</h3>
                        </div>
                        <span className="bg-indigo-100 text-indigo-600 text-xs font-bold px-2 py-1 rounded-full">{allHelpers.length} Active</span>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                        {allHelpers.map((h, i) => (
                             <div key={i} className="flex justify-between items-center bg-white/50 p-3 rounded-xl border border-white/60 shadow-sm hover:bg-white hover:shadow-md transition-all">
                                 <div>
                                     <div className="flex items-center gap-2">
                                         <p className="font-bold text-gray-800">{h.name}</p>
                                         <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 uppercase">{h.assignedTrack || 'N/A'}</span>
                                     </div>
                                     <div className="flex items-center gap-2 mt-1">
                                          <p className="text-xs text-gray-500">{h.assignedVenue || 'No Venue'}</p>
                                          <span className="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 rounded">{h.helperRole || 'Helper'}</span>
                                     </div>
                                 </div>
                                 {h.phone && (
                                     <a href={`tel:${h.phone}`} className="bg-green-100 p-2.5 rounded-full text-green-600 hover:bg-green-200 transition-colors shadow-sm">
                                         <Phone size={18} />
                                     </a>
                                 )}
                             </div>
                        ))}
                        {allHelpers.length === 0 && <p className="text-center text-gray-400 py-10">No helpers found.</p>}
                    </div>
                </div>
            </GlassCard>
        ) : activeTab === 'overview' ? (
             // Info Card - Full Height
             <GlassCard className="p-6 h-full flex flex-col">
                <div className="flex flex-col h-full w-full">
                    <h3 className="font-bold text-gray-800 mb-4 shrink-0">Track Team & Stats</h3>
                    
                    {/* Stats Row */}
                    <div className="grid grid-cols-3 gap-2 mb-4 shrink-0">
                        <div className="text-center bg-green-50 p-2 rounded-lg">
                            <span className="block text-lg font-black text-green-600">{stats.checkedIn}/{stats.total}</span>
                            <span className="text-[10px] text-green-800 font-bold uppercase">Check-In</span>
                        </div>
                        <div className="text-center bg-blue-50 p-2 rounded-lg">
                            <span className="block text-lg font-black text-blue-600">{stats.evaluated}</span>
                            <span className="text-[10px] text-blue-800 font-bold uppercase">Evaluated</span>
                        </div>
                        <div className="text-center bg-orange-50 p-2 rounded-lg">
                            <span className="block text-lg font-black text-orange-500">{stats.checkedIn - stats.evaluated}</span>
                            <span className="text-[10px] text-orange-800 font-bold uppercase">Pending</span>
                        </div>
                    </div>

                    <div className="bg-indigo-50 p-3 rounded-lg flex justify-between items-center mb-4 shrink-0">
                        <div>
                            <p className="text-xs text-indigo-400 font-bold uppercase">Faculty Lead</p>
                            <p className="font-bold text-gray-800 text-sm">{helperData?.facultyInfo?.name || 'N/A'}</p>
                        </div>
                        {helperData?.facultyInfo?.contact && (
                            <a href={`tel:${helperData.facultyInfo.contact}`} className="bg-white p-2 rounded-full text-indigo-600 shadow-sm">
                                <Phone size={16} />
                            </a>
                        )}
                    </div>

                    {/* Scrollable Content: Helpers + Contestant Teams */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar -mx-2 px-2">

                        {/* Juries Section (Only for Jury Helper) */}
                        {isJuryHelper && (
                            <div className="mb-6">
                                <p className="text-xs text-gray-400 font-bold uppercase mb-2 sticky top-0 bg-white/90 backdrop-blur-sm z-10 py-1">Assigned Juries ({trackJuries.length})</p>
                                <div className="space-y-2">
                                    {trackJuries.map((jury, i) => (
                                        <div key={i} className="flex justify-between items-center bg-white/50 p-2 rounded-lg border border-white/60">
                                            <div>
                                                <p className="text-sm font-bold text-gray-700">{jury.name}</p>
                                                <p className="text-[10px] text-gray-500">{jury.designation}, {jury.organization}</p>
                                            </div>
                                            {jury.phone && (
                                                <a href={`tel:${jury.phone}`} className="bg-green-100 p-2 rounded-full text-green-600 hover:bg-green-200 shrink-0">
                                                    <Phone size={14} />
                                                </a>
                                            )}
                                        </div>
                                    ))}
                                    {trackJuries.length === 0 && <p className="text-sm text-gray-400 text-center py-2">No juries found.</p>}
                                </div>
                            </div>
                        )}

                        {/* Helpers Section */}
                        <div className="mb-6">
                            <p className="text-xs text-gray-400 font-bold uppercase mb-2 sticky top-0 bg-white/90 backdrop-blur-sm z-10 py-1">Track Team ({teammates.length})</p>
                            <div className="space-y-2">
                                {teammates.map((mate, i) => (
                                    <div key={i} className="flex justify-between items-center bg-white/50 p-2 rounded-lg border border-white/60">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="text-sm font-bold text-gray-700">{mate.name}</p>
                                                <span className={`text-[9px] px-1.5 py-0.5 rounded uppercase font-bold
                                                    ${mate.helperRole === 'Main Coordinator' ? 'bg-purple-100 text-purple-700' :
                                                    mate.helperRole === 'Registration Desk' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-gray-100 text-gray-500'}`}>
                                                    {mate.helperRole || 'Volunteer'}
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-gray-500">{mate.assignedVenue || 'General'}</p>
                                        </div>
                                        {mate.phone && (
                                            <a href={`tel:${mate.phone}`} className="bg-green-100 p-2 rounded-full text-green-600 hover:bg-green-200 shrink-0">
                                                <Phone size={14} />
                                            </a>
                                        )}
                                    </div>
                                ))}
                                {teammates.length === 0 && <p className="text-sm text-gray-400 text-center py-2">No other members found in track.</p>}
                            </div>
                        </div>

                        {/* Contestant Teams Section */}
                        <div>
                            <p className="text-xs text-gray-400 font-bold uppercase mb-2 sticky top-0 bg-white/90 backdrop-blur-sm z-10 py-1">Contestant Teams ({trackTeams.length})</p>
                            <div className="space-y-2">
                                {trackTeams.map((team) => {
                                    const isReady = team.status === 'ready' && team.readyRound === systemState.currentRound;
                                    return (
                                        <div key={team.id} className={`p-3 rounded-lg border flex flex-col gap-1 transition-all ${isReady ? 'bg-yellow-50 border-yellow-200 shadow-md transform scale-[1.02]' : 'bg-white/50 border-white/60'}`}>
                                            <div className="flex justify-between items-start">
                                                <p className="font-bold text-gray-800 text-sm truncate w-2/3">{team.name}</p>
                                                {isReady ? (
                                                    <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-yellow-100 text-yellow-700 animate-pulse">READY</span>
                                                ) : (
                                                    <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold uppercase
                                                        ${team.attendanceMarked ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                                        {team.attendanceMarked ? 'Checked In' : 'Pending'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-gray-500">
                                                <span className="font-mono bg-gray-100 px-1.5 rounded">{team.id}</span>
                                                <span>•</span>
                                                <span>Total: <span className="font-bold text-gray-700">{team.memberCount || 0}</span></span>
                                                <span>( <span className="text-green-600 font-bold">{team.vegCount || 0} V</span> / <span className="text-red-600 font-bold">{team.nonVegCount || 0} NV</span> )</span>
                                            </div>
                                        </div>
                                    );
                                })}
                                {trackTeams.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No teams found.</p>}
                            </div>
                        </div>

                    </div>
                </div>
             </GlassCard>
        ) : (
            // Live Requests - Full Height
            <GlassCard className="p-6 h-full flex flex-col min-h-0">
                <div className="flex flex-col h-full w-full">
                    <div className="flex items-center justify-between mb-6 shrink-0">
                        <div className="flex items-center gap-2">
                            <Bell className="text-orange-500" size={20} />
                            <h3 className="font-bold text-gray-800">Live Requests</h3>
                        </div>
                        {requests.length > 0 && (
                            <span className="bg-red-100 text-red-600 text-xs font-bold px-2 py-1 rounded-full">{requests.length} Active</span>
                        )}
                    </div>

                    <div className="space-y-3 overflow-y-auto custom-scrollbar flex-1">
                        {requests.length === 0 ? (
                            <p className="text-gray-400 text-center py-10 text-sm">No active requests.</p>
                        ) : (
                            requests.map((req) => (
                                <div key={req.id} className="bg-white/60 p-4 rounded-xl border border-white/60 flex justify-between items-start shadow-sm">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <p className="font-bold text-gray-800 text-sm">{req.teamName || 'Unknown Team'}</p>
                                            <span className="text-[10px] text-gray-400 font-mono bg-gray-100 px-1.5 rounded">{req.roomNumber || 'N/A'}</span>
                                        </div>
                                        <p className="text-sm text-gray-600">{req.issue}</p>
                                        <p className="text-[10px] text-gray-400 mt-2">
                                            {req.timestamp ? format(new Date(req.timestamp), 'HH:mm') : ''}
                                        </p>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </GlassCard>
        )}
      </div>
    </div>
  );
};

const JuryDashboard = ({ user, userProfile, preview = false }) => {
  const [activeTab, setActiveTab] = useState(preview ? 'dogfood' : 'teams');
  const [teams, setTeams] = useState([]);
  const [evaluations, setEvaluations] = useState({});
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [scores, setScores] = useState({});
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState([]);
  const [privateData, setPrivateData] = useState({}); 
  const [juryNotes, setJuryNotes] = useState([]);
  const [notingTeam, setNotingTeam] = useState(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'info' });

  const systemState = useSystemState();
  const { currentRound, roundStatus } = systemState;
  const isExtraJury = userProfile?.isExtraJury || false;
  const isFinalRound = currentRound === 'phase3';

  // --- 1. Celebration Logic ---
  useEffect(() => {
     if (currentRound === 'phase3' && roundStatus === 'completed') {
         setShowCelebration(true);
     }
  }, [currentRound, roundStatus]);

  // --- 2. Auto-Tab Switching ---
  useEffect(() => {
      // If Phase 3, switch everyone to 'final' tab context
      if (isFinalRound && activeTab === 'teams') {
          setActiveTab('final');
      }
      // If Not Phase 3 and on 'final' tab, switch back
      if (!isFinalRound && activeTab === 'final') {
          setActiveTab('teams');
      }
  }, [isFinalRound, activeTab]);

  // --- 3. Data Fetching ---
  useEffect(() => {
    const fetchData = async () => {
      if (!userProfile) return;

      try {
        const assignedTrack = userProfile.assignedTrack;
        
        // --- A. TEAMS QUERY LOGIC ---
        let q;
        // CRITICAL FIX: 
        // 1. If Phase 3 (Finals) AND Main Jury -> Fetch ALL teams (Global View).
        // 2. Otherwise (Extra Jury OR Phase 1/2) -> Fetch TRACK teams.
        if (isFinalRound && !isExtraJury) {
            q = query(collection(db, 'teams')); // Global
        } else if (assignedTrack) {
            q = query(collection(db, 'teams'), where('track', '==', assignedTrack)); // Track Scoped
        } else {
            // Fallback for juries without track
            q = query(collection(db, 'teams'), where('assignedJuryId', '==', userProfile.id));
        }

        const unsubscribeTeams = onSnapshot(q, (snapshot) => {
            let teamData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Only show Checked-In teams
            teamData = teamData.filter(t => t.attendanceMarked);
            setTeams(teamData);
        });

        // --- B. PRIVATE DATA (For Finalist Flag) ---
        const unsubPrivate = onSnapshot(collection(db, 'private_team_data'), (snap) => {
            const pData = {};
            snap.forEach(doc => {
                pData[doc.id] = doc.data();
            });
            setPrivateData(pData);
        });

        // --- C. EVALUATIONS ---
        const collectionName = isExtraJury ? 'extra_jury_evaluations' : 'evaluations';
        const evalsQ = query(collection(db, collectionName), where('juryEmail', '==', user.email));
        const unsubscribeEvals = onSnapshot(evalsQ, (snapshot) => {
             const evalsMap = {};
             snapshot.forEach(doc => {
                 const data = doc.data();
                 if (!evalsMap[data.teamId]) evalsMap[data.teamId] = {};
                 evalsMap[data.teamId][data.round] = { id: doc.id, ...data };
             });
             setEvaluations(evalsMap);
        });

        // --- D. NOTIFICATIONS ---
        const notifQ = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(20));
        const unsubscribeNotifs = onSnapshot(notifQ, (snapshot) => {
            const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            const myNotifs = all.filter(n => {
                if (!n.targets || n.targets.includes('all')) return true;
                return n.targets.includes('jury');
            });
            setNotifications(myNotifs);
        });

        // --- E. NOTES ---
        const notesQ = query(collection(db, 'jury_notes'), where('juryEmail', '==', user.email), orderBy('timestamp', 'desc'));
        const unsubscribeNotes = onSnapshot(notesQ, (snapshot) => {
            const notesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setJuryNotes(notesData);
        });

        setLoading(false);
        return () => { 
            unsubscribeTeams(); 
            unsubPrivate(); 
            unsubscribeEvals(); 
            unsubscribeNotifs(); 
            unsubscribeNotes(); 
        };
      } catch (err) {
        console.error("Error fetching jury data", err);
      }
    };
    fetchData();
  }, [user, userProfile, currentRound, isFinalRound, isExtraJury]);

  // --- 4. Logic Handlers ---

  const handleScoreChange = (id, value) => {
    setScores(prev => ({ ...prev, [id]: value }));
  };

  useEffect(() => {
    if (selectedTeam) {
        const targetRound = selectedTeam.evaluationContextRound || currentRound;
        const existingEval = evaluations[selectedTeam.id]?.[targetRound];
        if (existingEval && existingEval.scores) {
            setScores(existingEval.scores);
        } else {
            // Reset scores if new
            const rubric = ROUND_RUBRICS[targetRound] || { rubrics: [] };
            const initial = {};
            rubric.rubrics.forEach(r => initial[r.id] = 0);
            setScores(initial);
        }
    }
  }, [selectedTeam, currentRound, evaluations]);

  const submitEvaluation = async () => {
    if (!selectedTeam || !user.email) return;

    const targetRound = selectedTeam.evaluationContextRound || currentRound;

    try {
      const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
      const existingEval = evaluations[selectedTeam.id]?.[targetRound];
      const collectionName = isExtraJury ? 'extra_jury_evaluations' : 'evaluations';

      if (existingEval && existingEval.id) {
          await updateDoc(doc(db, collectionName, existingEval.id), {
              scores,
              totalScore,
              timestamp: new Date().toISOString()
          });
      } else {
          await addDoc(collection(db, collectionName), {
            teamId: selectedTeam.id,
            juryId: userProfile.id,
            juryEmail: user.email,
            scores,
            totalScore,
            round: targetRound,
            timestamp: new Date().toISOString()
          });
      }

      // Public Updates
      const publicUpdates = {};
      const privateUpdates = {};

      if (targetRound === 'phase3' && !isExtraJury) {
          // Standard Phase 3: Increment private count, mark public as evaluated (for Contestant view only)
          privateUpdates.phase3EvalCount = increment(1);
          publicUpdates.phase3Evaluated = true; 
          // Note: In Phase 3, public 'status' usually stays 'ready' or moves to 'evaluated' depending on logic.
          // Requirement: Contestant sees "Completed" if any eval exists.
      } else {
          // Extra Jury OR Non-Phase 3: Clear ready status
          publicUpdates.status = 'evaluated';
          publicUpdates.lastEvaluatedRound = targetRound;
          if (targetRound === 'phase3') publicUpdates.phase3Evaluated = true;
      }

      // Handle Skipped Round catch-up
      if (selectedTeam.evaluationContextRound && selectedTeam.evaluationContextRound !== currentRound) {
           publicUpdates[`skipped_${targetRound}`] = deleteField();
           publicUpdates.lastEvaluatedRound = targetRound;
           publicUpdates.status = 'working'; // Reset to working after catchup
      }

      if (Object.keys(publicUpdates).length > 0) {
          await updateDoc(doc(db, 'teams', selectedTeam.id), publicUpdates);
      }
      if (Object.keys(privateUpdates).length > 0) {
          await setDoc(doc(db, 'private_team_data', selectedTeam.id), privateUpdates, { merge: true });
      }

      await logAction(user.uid, user.email, user.displayName, 'jury', 'EVALUATE_TEAM', `Evaluated team ${selectedTeam.name} for round ${targetRound} with score ${totalScore}`);

      setSelectedTeam(null);
      setScores({});
      setModalConfig({ isOpen: true, title: 'Success!', message: 'Evaluation submitted successfully.', type: 'success' });

    } catch (err) {
      console.error(err);
      setModalConfig({ isOpen: true, title: 'Error', message: 'Error submitting evaluation.', type: 'error' });
    }
  };

  const handleSaveNote = async (text) => {
    if (!text || !notingTeam || !user.email) return;
    try {
        await addDoc(collection(db, 'jury_notes'), {
            juryEmail: user.email,
            teamId: notingTeam.id,
            teamName: notingTeam.name,
            note: text,
            round: currentRound,
            timestamp: new Date().toISOString()
        });
        setModalConfig({ isOpen: true, title: 'Note Saved', message: 'Your remark has been saved successfully.', type: 'success', isAlert: true });
    } catch (err) {
        console.error(err);
        setModalConfig({ isOpen: true, title: 'Error', message: 'Failed to save note.', type: 'error', isAlert: true });
    }
  };

    let displayTeams = [];

  // Helper: Check if ANY team has been marked as a finalist globally in the private data
  const hasGlobalFinalists = Object.values(privateData).some(d => d.isFinalist === true);

  if (isExtraJury) {
      // CRITICAL FIX: Extra Jury ONLY sees teams if finalists are announced.
      // This blocks access during Phase 1/2 or before Admin selects finalists in Phase 3.
      if (hasGlobalFinalists) {
          // Show Non-Finalists (Losers) in their track
          displayTeams = teams.filter(t => !privateData[t.id]?.isFinalist);
      } else {
          // Block access completely if no finalists exist yet
          displayTeams = [];
      }
  } else {
      // Main Jury Logic
      if (activeTab === 'final' || isFinalRound) {
          // Phase 3 / Final Tab: Show Global Finalists
          displayTeams = teams.filter(t => privateData[t.id]?.isFinalist === true);
      } else {
          // Phase 1 / 2: Show standard Track Teams
          displayTeams = teams;
      }
  }

  // --- Render ---
  return (
    <div className="portal-shell h-screen flex flex-col overflow-hidden">
      {/* Components */}
      {showCelebration && (
        <CelebrationOverlay
            onClose={() => {}} // Forced overlay
            userProfile={userProfile}
            role="jury"
            onFeedbackSuccess={() => {}}
        />
      )}
      <ConfirmationModal isOpen={modalConfig.isOpen} onClose={() => setModalConfig({ ...modalConfig, isOpen: false })} title={modalConfig.title} message={modalConfig.message} type={modalConfig.type} isAlert={true} />
      <NoteModal
          isOpen={showNoteModal}
          onClose={() => { setShowNoteModal(false); setNotingTeam(null); }}
          onSave={handleSaveNote}
          initialNote=""
      />

      {/* Header */}
      <div className="p-6 pb-0 max-w-7xl mx-auto w-full shrink-0 z-10">
        <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 px-2">
            <div className="flex items-center gap-4">
                <div className="bg-white p-2 rounded-xl shadow-sm border border-indigo-50">
                    <LayoutDashboard className="w-8 h-8 text-indigo-600" />
                </div>
                <div>
                   <h1 className="text-2xl md:text-3xl font-black text-gray-800 tracking-tight">DOGFOOD <span className="portal-masthead-year">2026</span></h1>
                   {preview ? <p className="text-xs font-medium text-indigo-600 font-mono mt-1">JURY / LOCAL PREVIEW</p> : <div className="flex items-center gap-2 text-xs font-medium text-gray-500 font-mono mt-1">
                      <span>ROUND: <span className="text-indigo-600 font-bold uppercase">{currentRound}</span></span>
                      <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                      <span>STATUS: <span className={`font-bold uppercase ${roundStatus === 'ongoing' ? 'text-green-600' : 'text-gray-600'}`}>{roundStatus}</span></span>
                      {isExtraJury && <span className="ml-2 bg-orange-100 text-orange-700 px-2 py-0.5 rounded text-[10px] font-bold uppercase">Extra Jury</span>}
                   </div>}
                </div>
            </div>

            <div className="portal-nav flex flex-wrap bg-white/60 backdrop-blur-md p-1.5 rounded-2xl shadow-sm border border-white/60 gap-1 self-center md:self-auto justify-center w-full md:w-auto">
                {/* Mobile Profile Icon integration */}
                <div className="md:hidden mr-1">
                    <div className="bg-white p-2 rounded-xl shadow-sm text-indigo-600 border border-indigo-50">
                        <UserIcon size={18} />
                    </div>
                </div>

                {!isFinalRound && !isExtraJury && (
                    <button
                        aria-label="My Track"
                        onClick={() => setActiveTab('teams')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                            ${activeTab === 'teams' ? 'bg-white shadow-md text-indigo-600 scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                    >
                        <LayoutGrid size={16} /> <span className="hidden md:inline">My Track</span>
                    </button>
                )}
                {(isFinalRound || isExtraJury) && (
                    <button
                        aria-label="Finals"
                        onClick={() => setActiveTab('final')}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                            ${activeTab === 'final' ? 'bg-white shadow-md text-indigo-600 scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                    >
                            <Star size={16} /> <span className="hidden md:inline">Finals</span>
                    </button>
                )}
                <button
                    aria-label="Notifications"
                    onClick={() => setActiveTab('notifications')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                        ${activeTab === 'notifications' ? 'bg-white shadow-md text-indigo-600 scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                >
                    <Bell size={16} /> <span className="hidden md:inline">Notifs</span>
                </button>
                <button
                    aria-label="Reviews"
                    onClick={() => setActiveTab('dogfood')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                        ${activeTab === 'dogfood' ? 'bg-white shadow-md text-indigo-600 scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                >
                    <ClipboardList size={16} /> <span className="hidden md:inline">Reviews</span>
                </button>
                <button
                    aria-label="Arcade"
                    onClick={() => setActiveTab('arcade')}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2
                        ${activeTab === 'arcade' ? 'bg-white shadow-md text-indigo-600 scale-100' : 'text-gray-500 hover:text-gray-700 hover:bg-white/40'}`}
                >
                    <Gamepad2 size={16} /> <span className="hidden md:inline">Arcade</span>
                </button>
            </div>
        </header>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto custom-scrollbar p-8 max-w-7xl mx-auto w-full pb-24">
        {activeTab === 'dogfood' ? (
             <DogfoodWorkspace role="jury" preview={preview} />
        ) : loading ? (
             <div className="flex justify-center items-center h-40"><LoadingSpinner /></div>
        ) : activeTab === 'arcade' ? (
             <ArcadeDashboard user={user} customUserName={userProfile?.name} previewRole={preview ? 'jury' : null} />
        ) : activeTab === 'notifications' ? (
             <div className="space-y-4 max-w-3xl mx-auto">
                {notifications.map(n => (
                    <GlassCard key={n.id} className={`p-4 border-l-4 ${n.type === 'urgent' ? 'border-red-500 bg-red-50/50' : 'border-indigo-500'}`}>
                        <div className="flex justify-between items-start mb-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded ${n.type === 'urgent' ? 'bg-red-200 text-red-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                {n.type === 'urgent' ? 'URGENT' : 'INFO'}
                            </span>
                            <span className="text-xs text-gray-400">{n.timestamp ? format(new Date(n.timestamp), 'HH:mm') : ''}</span>
                        </div>
                        <p className="text-gray-800 font-medium">{n.message}</p>
                    </GlassCard>
                ))}
                {notifications.length === 0 && <p className="text-center text-gray-500">No notifications.</p>}
            </div>
        ) : (
            displayTeams.length === 0 ? (
                <div className="text-center py-10 flex flex-col items-center">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4 text-gray-400">
                        <ScanLine size={32} />
                    </div>
                    <p className="text-gray-500 font-bold text-lg">
                        {isExtraJury && activeTab === 'final'
                            ? "No non-finalist teams found in your track."
                            : isFinalRound
                                ? "No finalists found."
                                : "No teams assigned."}
                    </p>
                    <p className="text-gray-400 text-sm mt-1">Wait for updates from the admin.</p>
                </div>
            ) :
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayTeams.map((team) => {
                    const isEvaluated = evaluations[team.id]?.[currentRound];
                    const isReady = team.status === 'ready' &&
                        (team.readyRound === currentRound || (preview && !team.readyRound));

                    // Can Evaluate Logic
                    // 1. Round must not be locked or completed (unless Phase 3, where completed is a soft state for UI)
                    // 2. Team must be Ready OR Round is in 'evaluation' mode OR (Phase 3 and it's marked evaluated but I haven't graded it)
                    const canEvaluate = (roundStatus !== 'locked' && roundStatus !== 'completed') &&
                        (isReady || roundStatus === 'evaluation');

                    // Check for skipped rounds (Retroactive Eval)
                    const prevRounds = ['idea', 'phase1', 'phase2', 'phase3'];
                    const currentIdx = prevRounds.indexOf(currentRound);
                    const skippedRound = prevRounds.slice(0, currentIdx).find(r => team[`skipped_${r}`]);
                    const isSkippedMode = !!skippedRound;

                    // Click Handler
                    const handleClick = () => {
                        if (isEvaluated) return;
                        if (isSkippedMode) {
                            setSelectedTeam({ ...team, evaluationContextRound: skippedRound });
                        } else if (canEvaluate) {
                            setSelectedTeam(team);
                        }
                    };

                    return (
                        <GlassCard
                            key={team.id}
                            className={`p-6 flex flex-col justify-between transition-all cursor-pointer border-2 relative overflow-hidden
                                ${isEvaluated ? 'border-green-400 bg-green-50/30' :
                                  isSkippedMode ? 'border-red-400 bg-red-50/30 animate-pulse' :
                                  isReady ? 'border-yellow-400 bg-yellow-50/50 shadow-lg scale-[1.02]' :
                                  'border-transparent hover:border-indigo-200'}
                            `}
                            onClick={handleClick}
                        >
                            {/* Track Badge for Global View */}
                            {isFinalRound && !isExtraJury && (
                                <div className="absolute top-2 right-2 text-[10px] font-bold bg-gray-100 text-gray-500 px-2 py-0.5 rounded uppercase">
                                    {team.track}
                                </div>
                            )}

                            <div>
                                <div className="flex justify-between items-start mb-1 pr-12">
                                    <h3 className="text-xl font-bold text-gray-800 leading-tight">{team.name}</h3>
                                </div>
                                
                                <div className="flex items-center gap-2 mb-4">
                                     <span className="text-xs text-indigo-500 font-mono font-bold bg-indigo-50 px-2 py-0.5 rounded">{team.id}</span>
                                     {isEvaluated && <CheckCircle2 className="text-green-500" size={16} />}
                                     {isSkippedMode && <span className="text-[10px] bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">MISSED: {skippedRound}</span>}
                                     {isReady && !isEvaluated && <span className="text-[10px] bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-bold animate-pulse">READY</span>}
                                </div>

                                <p className="text-gray-600 text-sm mb-4 line-clamp-2">{team.description}</p>
                            </div>
                            
                            <div className="flex justify-between items-center mt-4 border-t border-gray-100 pt-4">
                                <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{currentRound}</span>
                                {isEvaluated ? (
                                    <div className="flex flex-col items-end gap-1">
                                        <div className="text-right">
                                            <span className="block text-xs text-green-600 font-bold uppercase">Score</span>
                                            <span className="text-lg font-black text-gray-800">{isEvaluated.totalScore}</span>
                                        </div>
                                        {/* Edit Button */}
                                        {roundStatus !== 'locked' && roundStatus !== 'completed' && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setSelectedTeam(team); }}
                                                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline"
                                            >
                                                Edit
                                            </button>
                                        )}
                                    </div>
                                ) : (
                                    <div className="flex gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setNotingTeam(team); setShowNoteModal(true); }}
                                            className="px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-indigo-600 transition-colors"
                                            title="Add Remark"
                                        >
                                            <StickyNote size={20} />
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleClick(); }}
                                            disabled={!canEvaluate && !isSkippedMode}
                                            className={`px-4 py-2 rounded-lg text-sm font-bold shadow-md transition-colors relative z-30
                                                ${isSkippedMode ? 'bg-red-600 text-white hover:bg-red-700' :
                                                !canEvaluate ? 'bg-gray-200 text-gray-400 cursor-not-allowed' :
                                                'bg-indigo-600 text-white hover:bg-indigo-700'}`}
                                        >
                                            {isSkippedMode ? `Eval ${skippedRound}` : 'Evaluate'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </GlassCard>
                    );
                })}
            </div>
        )}
      </div>

      {/* Evaluation Modal */}
      <AnimatePresence>
        {selectedTeam && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh] my-auto overflow-hidden">
              <div className={`p-5 ${selectedTeam.evaluationContextRound && selectedTeam.evaluationContextRound !== currentRound ? 'bg-red-600' : 'bg-indigo-600'} text-white flex justify-between items-center shrink-0`}>
                 <div>
                    <h2 className="text-xl font-bold">{selectedTeam.name}</h2>
                    <p className="opacity-80 text-xs">Evaluating: {ROUND_RUBRICS[selectedTeam.evaluationContextRound || currentRound]?.label}</p>
                 </div>
                 <button onClick={() => setSelectedTeam(null)} className="p-1 hover:bg-white/20 rounded-full"><X size={20} /></button>
              </div>

              {selectedTeam.evaluationContextRound && selectedTeam.evaluationContextRound !== currentRound && (
                  <div className="bg-red-50 border-b border-red-100 p-3 text-red-700 text-sm font-bold text-center shrink-0">
                      ⚠️ You are evaluating a MISSED round ({selectedTeam.evaluationContextRound}).
                  </div>
              )}

              <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
                  {/* Left: Scoring */}
                  <div className="flex-1 p-6 overflow-y-auto custom-scrollbar border-r border-gray-100">
                     <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><ClipboardList size={18}/> Scoring Rubrics</h3>
                     <div className="space-y-6">
                         {(ROUND_RUBRICS[selectedTeam.evaluationContextRound || currentRound]?.rubrics || []).map((rubric) => (
                           <div key={rubric.id}>
                              <div className="flex justify-between mb-2">
                                <label className="font-semibold text-gray-700 text-sm">{rubric.label}</label>
                                <span className="font-bold text-indigo-600">{scores[rubric.id] || 0} / {rubric.max}</span>
                              </div>
                              <input type="range" min="0" max={rubric.max} step="1" value={scores[rubric.id] || 0} onChange={(e) => handleScoreChange(rubric.id, parseInt(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
                           </div>
                         ))}
                         <div className="pt-4 flex justify-between items-center border-t border-gray-100 mt-4">
                            <span className="text-gray-500 font-semibold">Total Score</span>
                            <span className="text-3xl font-black text-indigo-600">{Object.values(scores).reduce((a, b) => a + b, 0)}</span>
                         </div>
                     </div>
                  </div>

                  {/* Right: Notes History */}
                  <div className="w-full md:w-80 bg-gray-50 p-6 overflow-y-auto custom-scrollbar flex flex-col">
                       <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><StickyNote size={18}/> Team Remarks</h3>

                       <div className="flex-1 space-y-3 mb-4">
                           {juryNotes.filter(n => n.teamId === selectedTeam.id).length === 0 ? (
                               <p className="text-sm text-gray-400 text-center italic py-4">No remarks recorded yet.</p>
                           ) : (
                               juryNotes.filter(n => n.teamId === selectedTeam.id).map(note => (
                                   <div key={note.id} className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm text-sm">
                                       <p className="text-gray-700 mb-2">{note.note}</p>
                                       <div className="flex justify-between items-center text-[10px] text-gray-400">
                                           <span className="uppercase font-bold">{note.round || 'General'}</span>
                                           <span>{note.timestamp ? format(new Date(note.timestamp), 'MMM d, HH:mm') : ''}</span>
                                       </div>
                                   </div>
                               ))
                           )}
                       </div>

                       {/* Quick Add Note */}
                       <div className="mt-auto">
                           <button
                                onClick={() => { setNotingTeam(selectedTeam); setShowNoteModal(true); }}
                                className="w-full py-2 bg-white border border-gray-300 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-100 transition-colors"
                           >
                               + Add New Remark
                           </button>
                       </div>
                  </div>
              </div>

              <div className="p-5 border-t bg-gray-50 flex justify-end gap-3 shrink-0">
                 <button onClick={() => setSelectedTeam(null)} className="px-5 py-2.5 text-gray-600 font-semibold hover:bg-gray-200 rounded-lg text-sm">Cancel</button>
                 <button onClick={submitEvaluation} className="px-6 py-2.5 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-lg flex items-center gap-2 text-sm"><Check size={18} /> Submit Score</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

/* =========================================
   APP
   ========================================= */

const NotificationListener = ({ userRole }) => {
  const [toast, setToast] = useState(null);
  const [lastNotifId, setLastNotifId] = useState(null);

  useEffect(() => {
     if (!userRole) return;

     const q = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(1));
     const unsub = onSnapshot(q, (snapshot) => {
         if (!snapshot.empty) {
             const doc = snapshot.docs[0];
             const data = doc.data();
             const notifId = doc.id;

             // Check targeting
             let isTargeted = false;
             if (!data.targets || data.targets.includes('all')) isTargeted = true;
             else if (data.targets.includes(userRole)) isTargeted = true;

             if (isTargeted) {
                 // Check if new
                 // We use a simple local state tracking.
                 // Caveat: On first load, it might trigger.
                 // We can check timestamp vs "now" but clock skew matters.
                 // Better: store lastId in a ref or state.
                 setLastNotifId(prev => {
                     if (prev && prev !== notifId) {
                         // New Notification!
                         playNotificationTone(0.08);

                         setToast({ message: data.message, type: data.type, roundId: data.roundId });
                     }
                     return notifId;
                 });
             }
         }
     });
     return () => unsub();
  }, [userRole]);

  return (
      <AnimatePresence>
          {toast && (
             // Determine if we show a Toast or Full Screen Notification
             // Suppress Full Screen for Phase 3 Completion since we have the Celebration Overlay
             ((toast.message.includes('STARTED') || toast.message.includes('COMPLETED') || toast.message.includes('Advanced') || toast.type === 'urgent')
               && !(toast.message.includes('Phase III') && toast.message.includes('COMPLETED'))
               && !(toast.message.includes('Final') && toast.message.includes('COMPLETED')))
             ? <FullScreenNotification message={toast.message} type={toast.type} roundId={toast.roundId} onClose={() => setToast(null)} />
             : <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
          )}
      </AnimatePresence>
  );
};

const App = () => {
  const [role, setRole] = useState(() => {
    const saved = sessionStorage.getItem('dogfoodPreviewRole');
    return ['admin', 'jury', 'contestant', 'helper'].includes(saved) ? saved : 'admin';
  });
  const identities = {
    admin: {uid: 'local-admin', email: 'admin@localhost', displayName: 'Local Admin'},
    jury: {uid: 'local-jury', email: 'jury@localhost', displayName: 'Local Jury'},
    contestant: {uid: 'local-contestant', email: 'contestant@localhost', displayName: 'Local Contestant'},
    helper: {uid: 'local-helper', email: 'helper@localhost', displayName: 'Local Helper'},
  };
  const user = identities[role];
  auth.currentUser = user;
  const userProfile = {
    id: user.uid, email: user.email, name: user.displayName, role,
    teamId: role === 'contestant' ? 'preview-team' : undefined,
    attendanceMarked: role === 'contestant',
    assignedTrack: ['jury', 'helper'].includes(role) ? 'Open Innovation' : undefined,
    helperRole: role === 'helper' ? 'Registration Desk' : undefined,
  };

  const changeRole = (nextRole) => {
    if (!identities[nextRole]) return;
    sessionStorage.setItem('dogfoodPreviewRole', nextRole);
    setRole(nextRole);
  };

  const renderDashboard = () => {
    switch (role) {
      case 'admin': return <AdminDashboard preview />;
      case 'jury': return <JuryDashboard user={user} userProfile={userProfile} preview />;
      case 'contestant': return <ContestantDashboard user={user} userProfile={userProfile} preview />;
      case 'helper': return <HelperDashboard user={user} userProfile={userProfile} />;
      default: return null;
    }
  };

  return (
    <div className="font-sans text-gray-900 relative min-h-screen flex items-center justify-center">
      <AnimatedBackground />
      <NotificationListener userRole={role} />
      <AnimatePresence mode="wait">
        <motion.div
          key={role}
          initial={{ opacity: 0, y: 20, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -14, filter: 'blur(8px)' }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 w-full"
        >
          <div className="fixed bottom-4 right-4 z-50">
            <label className="portal-role-switcher flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-gray-700 shadow-lg">
              View as
              <select value={role} onChange={(event) => changeRole(event.target.value)} className="rounded border border-gray-200 px-2 py-1 text-xs">
                <option value="admin">Admin</option>
                <option value="jury">Jury</option>
                <option value="contestant">Contestant</option>
                <option value="helper">Helper</option>
              </select>
            </label>
          </div>
          {renderDashboard()}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
export default App;
