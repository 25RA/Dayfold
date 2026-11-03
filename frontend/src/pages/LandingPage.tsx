import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Sparkles,
  ShieldCheck,
  Calendar,
  Clock,
  ArrowRight,
  GraduationCap,
  Briefcase,
  Heart,
  Mic,
  CheckCircle2,
  ChevronDown,
  Layers,
  Lock,
} from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { TimelineCanvas, TimelineBlock } from '../components/TimelineCanvas';
import { DayfoldLogo } from '../components/DayfoldLogo';

const getTodayAt = (hour: number, minute: number = 0) => {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
};

export const LandingPage: React.FC = () => {
  const navigate = useNavigate();
  const { demoLogin, isLoading } = useAuthStore();
  const [activeTab, setActiveTab] = useState<'student' | 'professional' | 'personal'>('student');
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  // Interactive sample schedules for the client-side sandbox
  const sampleBlocks: Record<'student' | 'professional' | 'personal', TimelineBlock[]> = {
    student: [
      {
        id: 's1',
        kind: 'fixed_event',
        title: 'Computer Networks Lecture (LT-3)',
        starts_at: getTodayAt(10, 0),
        ends_at: getTodayAt(12, 0),
        pinned: true,
      },
      {
        id: 's2',
        kind: 'task',
        title: 'DBMS Assignment: Normalization & Indexing',
        starts_at: getTodayAt(13, 0),
        ends_at: getTodayAt(15, 0),
        rationale: ['Due tomorrow at 11:59 PM', 'High effort (2h contiguous block)'],
      },
      {
        id: 's3',
        kind: 'break',
        title: 'Recovery Break & Coffee',
        starts_at: getTodayAt(15, 0),
        ends_at: getTodayAt(15, 30),
        rationale: ['Buffer after 2h deep focus session'],
      },
      {
        id: 's4',
        kind: 'task',
        title: 'Operating Systems Quiz Prep',
        starts_at: getTodayAt(16, 0),
        ends_at: getTodayAt(17, 30),
        rationale: ['Scheduled before evening hours', 'Exam in 3 days'],
      },
    ],
    professional: [
      {
        id: 'p1',
        kind: 'fixed_event',
        title: 'Executive Staff Sync',
        starts_at: getTodayAt(9, 30),
        ends_at: getTodayAt(10, 30),
        pinned: true,
      },
      {
        id: 'p2',
        kind: 'task',
        title: 'Q4 Product Roadmap & Architecture Spec',
        starts_at: getTodayAt(11, 0),
        ends_at: getTodayAt(13, 0),
        rationale: ['Morning deep work chronotype preference', 'Critical priority'],
      },
      {
        id: 'p3',
        kind: 'fixed_event',
        title: 'Design Review & Sprint Planning',
        starts_at: getTodayAt(14, 0),
        ends_at: getTodayAt(15, 0),
        pinned: true,
      },
      {
        id: 'p4',
        kind: 'task',
        title: 'Follow-ups & Client Architecture Proposals',
        starts_at: getTodayAt(15, 30),
        ends_at: getTodayAt(17, 0),
        rationale: ['Admin / shallow work block', 'Deliverable due Friday'],
      },
    ],
    personal: [
      {
        id: 'l1',
        kind: 'fixed_event',
        title: 'Family Dinner & Gathering',
        starts_at: getTodayAt(18, 30),
        ends_at: getTodayAt(20, 30),
        pinned: true,
      },
      {
        id: 'l2',
        kind: 'task',
        title: 'Bank Visit & Document Verification',
        starts_at: getTodayAt(11, 0),
        ends_at: getTodayAt(12, 0),
        rationale: ['Bank branch window closes at 3:00 PM on weekends'],
      },
      {
        id: 'l3',
        kind: 'task',
        title: 'Weekly Farmers Market & Groceries',
        starts_at: getTodayAt(13, 30),
        ends_at: getTodayAt(14, 45),
        rationale: ['15-minute transit buffer applied from bank'],
      },
      {
        id: 'l4',
        kind: 'task',
        title: 'Evening Run & Recovery Routine',
        starts_at: getTodayAt(16, 30),
        ends_at: getTodayAt(17, 30),
        rationale: ['Healthy lifestyle routine before dinner anchor'],
      },
    ],
  };

  const handleDemoLaunch = async (profile: 'student' | 'professional' | 'personal') => {
    try {
      await demoLogin(profile);
      navigate('/today');
    } catch (err) {
      console.error('Demo launch error:', err);
    }
  };

  const faqs = [
    {
      q: 'How does Dayfold prevent schedule hallucinations?',
      a: 'The LLM is the conversational interface, not the scheduler. Time arithmetic, overlap prevention, buffer insertion, and deadline prioritization are calculated by a pure, deterministic Python engine. The AI only proposes plans; you approve them before anything is scheduled.',
    },
    {
      q: 'What is the "Propose, Approve, Execute, Verify" model?',
      a: 'Whenever Dayfold suggests calendar updates or schedule changes, it generates a cryptographically signed SHA-256 payload hash. You inspect the exact diff and explicitly approve it. A dedicated backend executor runs the change idempotently and verifies the written result before confirming.',
    },
    {
      q: 'Can I use Dayfold across different areas of my life?',
      a: 'Yes. Dayfold features three tailored workspace lenses: Student (courses, study sessions, exams), Professional (meetings, deliverables, focus blocks), and Personal (errands, routines, appointments). They all share the same planning engine and data model.',
    },
    {
      q: 'Does What-If simulation modify my real commitments?',
      a: 'Never. What-If simulations run the deterministic engine in an isolated sandbox with hypothetical overrides (e.g. "What if my deadline moves up 3 days?"). Your actual calendar and tasks remain untouched until you explicitly promote and approve the scenario.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#FBF9F5] dark:bg-[#0B0D12] text-[#15181F] dark:text-[#ECEFF4] selection:bg-[#FFDFD1] dark:selection:bg-[#C74E22]">
      {/* Top Header */}
      <header className="border-b border-[#E8E3D9] dark:border-[#262B36] bg-white/70 dark:bg-[#12151C]/70 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-18 flex items-center justify-between">
          <NavLink to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
            <DayfoldLogo size="md" variant="full" />
          </NavLink>

          <div className="hidden md:flex items-center gap-8 text-sm font-medium text-[#5A6070] dark:text-[#A0A8B6]">
            <a href="#how-it-works" className="hover:text-[#15181F] dark:hover:text-white transition-colors">
              How It Works
            </a>
            <a href="#lenses" className="hover:text-[#15181F] dark:hover:text-white transition-colors">
              Workspace Lenses
            </a>
            <a href="#sandbox" className="hover:text-[#15181F] dark:hover:text-white transition-colors">
              Interactive Demo
            </a>
            <a href="#security" className="hover:text-[#15181F] dark:hover:text-white transition-colors">
              Trust & Security
            </a>
          </div>

          <div className="flex items-center gap-3">
            <NavLink
              to="/login"
              className="text-xs font-semibold px-4 py-2 rounded-xl text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Sign In
            </NavLink>
            <NavLink
              to="/signup"
              className="text-xs font-semibold px-4 py-2 rounded-xl bg-[#C74E22] dark:bg-[#F26A3D] text-white hover:opacity-90 transition-opacity shadow-sm"
            >
              Get Started Free
            </NavLink>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-20 pb-16 px-6 max-w-5xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF1EB] dark:bg-[#2A1710] border border-[#F26A3D]/30 text-[#C74E22] dark:text-[#FFA67F] text-xs font-mono mb-8"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>The Unfolding Day — Voice-First AI Chief-of-Staff</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          className="font-serif text-5xl md:text-7xl font-normal leading-[1.08] tracking-tight max-w-4xl mx-auto text-[#15181F] dark:text-[#ECEFF4]"
        >
          Speak your messy day. <br />
          <span className="italic font-normal text-[#C74E22] dark:text-[#F26A3D]">Unfold</span> a realistic, verified plan.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="text-lg md:text-xl text-[#5A6070] dark:text-[#A0A8B6] max-w-2xl mx-auto mt-6 leading-relaxed"
        >
          Dayfold converts voice and natural language into conflict-free daily schedules. Powered by deterministic time arithmetic, cryptographic approval integrity, and three tailored lenses.
        </motion.p>

        {/* Hero CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="flex flex-wrap items-center justify-center gap-4 mt-10"
        >
          <NavLink
            to="/signup"
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-[#C74E22] dark:bg-[#F26A3D] text-white font-medium text-sm hover:opacity-90 shadow-md transition-all"
          >
            <span>Start Free with Email</span>
            <ArrowRight className="w-4 h-4" />
          </NavLink>

          <button
            onClick={() => handleDemoLaunch('student')}
            disabled={isLoading}
            className="flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-white dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800 shadow-xs transition-all cursor-pointer"
          >
            <GraduationCap className="w-4 h-4 text-[#5B63F0]" />
            <span>Launch Instant Demo (Student)</span>
          </button>
        </motion.div>
      </section>

      {/* Interactive Sandbox Section */}
      <section id="sandbox" className="py-16 px-6 max-w-6xl mx-auto">
        <div className="text-center mb-8">
          <span className="text-xs font-mono uppercase tracking-wider text-[#1B7F83] dark:text-[#28A5AA]">
            Live Interactive Sandbox
          </span>
          <h2 className="font-serif text-3xl md:text-4xl mt-2 font-normal text-[#15181F] dark:text-[#ECEFF4]">
            Experience The Unfolding Day
          </h2>
          <p className="text-sm text-[#5A6070] dark:text-[#A0A8B6] max-w-lg mx-auto mt-2">
            Switch lenses below to inspect how Dayfold places fixed lectures, deep work focus blocks, and breaks.
          </p>
        </div>

        {/* Sandbox Tabs */}
        <div className="flex justify-center mb-8">
          <div className="flex gap-2 p-1.5 bg-[#F4F1EB] dark:bg-[#1A1E27] rounded-2xl border border-[#E8E3D9] dark:border-[#262B36]">
            <button
              onClick={() => setActiveTab('student')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'student'
                  ? 'bg-white dark:bg-[#12151C] text-[#5B63F0] font-semibold shadow-xs'
                  : 'text-[#5A6070] dark:text-[#A0A8B6]'
              }`}
            >
              <GraduationCap className="w-4 h-4" />
              <span>Student Lens</span>
            </button>
            <button
              onClick={() => setActiveTab('professional')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'professional'
                  ? 'bg-white dark:bg-[#12151C] text-[#1B7F83] font-semibold shadow-xs'
                  : 'text-[#5A6070] dark:text-[#A0A8B6]'
              }`}
            >
              <Briefcase className="w-4 h-4" />
              <span>Professional Lens</span>
            </button>
            <button
              onClick={() => setActiveTab('personal')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                activeTab === 'personal'
                  ? 'bg-white dark:bg-[#12151C] text-[#D98A1F] font-semibold shadow-xs'
                  : 'text-[#5A6070] dark:text-[#A0A8B6]'
              }`}
            >
              <Heart className="w-4 h-4" />
              <span>Personal Lens</span>
            </button>
          </div>
        </div>

        {/* Render TimelineCanvas with sample blocks */}
        <div className="max-w-4xl mx-auto shadow-lg rounded-2xl overflow-hidden">
          <TimelineCanvas
            blocks={sampleBlocks[activeTab]}
            date={new Date()}
            startHour={9}
            endHour={21}
          />
        </div>
      </section>

      {/* Three Audience Lenses Section */}
      <section id="lenses" className="py-20 px-6 max-w-6xl mx-auto border-t border-[#E8E3D9] dark:border-[#262B36]">
        <div className="text-center mb-16">
          <span className="text-xs font-mono uppercase tracking-wider text-[#F26A3D]">
            One Engine • Three Lenses
          </span>
          <h2 className="font-serif text-3xl md:text-5xl mt-2 font-normal text-[#15181F] dark:text-[#ECEFF4]">
            Personalized for Your Life Stage
          </h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {/* Student */}
          <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-[#ECEEFF] dark:bg-[#1C1F3D] flex items-center justify-center text-[#5B63F0] mb-4">
              <GraduationCap className="w-5 h-5" />
            </div>
            <h3 className="font-serif text-2xl font-medium text-[#15181F] dark:text-[#ECEFF4]">
              For Students
            </h3>
            <p className="text-sm text-[#5A6070] dark:text-[#A0A8B6] mt-2 leading-relaxed">
              Assignments, exam preparation, recurring class timetables, and internship pipelines.
            </p>
            <ul className="mt-6 space-y-2.5 text-xs text-[#15181F] dark:text-[#ECEFF4]">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#5B63F0]" />
                <span>Exams weighted by priority and urgency</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#5B63F0]" />
                <span>Class timetable sync and conflict checks</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#5B63F0]" />
                <span>Study sessions split into focus intervals</span>
              </li>
            </ul>
            <button
              onClick={() => handleDemoLaunch('student')}
              className="mt-6 w-full py-2 px-3 rounded-xl text-xs font-semibold border border-[#5B63F0]/30 text-[#5B63F0] hover:bg-[#ECEEFF] dark:hover:bg-[#1C1F3D] transition-colors cursor-pointer"
            >
              Try Student Workspace
            </button>
          </div>

          {/* Professional */}
          <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-[#E1F2F2] dark:bg-[#12302F] flex items-center justify-center text-[#1B7F83] mb-4">
              <Briefcase className="w-5 h-5" />
            </div>
            <h3 className="font-serif text-2xl font-medium text-[#15181F] dark:text-[#ECEFF4]">
              For Professionals
            </h3>
            <p className="text-sm text-[#5A6070] dark:text-[#A0A8B6] mt-2 leading-relaxed">
              Deliverables, client syncs, protected focus sessions, follow-ups, and review cycles.
            </p>
            <ul className="mt-6 space-y-2.5 text-xs text-[#15181F] dark:text-[#ECEFF4]">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#1B7F83]" />
                <span>Protected morning deep-work blocks</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#1B7F83]" />
                <span>Automatic meeting buffers and recovery</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#1B7F83]" />
                <span>Pending action tracking with deliverables</span>
              </li>
            </ul>
            <button
              onClick={() => handleDemoLaunch('professional')}
              className="mt-6 w-full py-2 px-3 rounded-xl text-xs font-semibold border border-[#1B7F83]/30 text-[#1B7F83] hover:bg-[#E1F2F2] dark:hover:bg-[#12302F] transition-colors cursor-pointer"
            >
              Try Professional Workspace
            </button>
          </div>

          {/* Personal */}
          <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="w-10 h-10 rounded-xl bg-[#FCF1DC] dark:bg-[#3A2A10] flex items-center justify-center text-[#D98A1F] mb-4">
              <Heart className="w-5 h-5" />
            </div>
            <h3 className="font-serif text-2xl font-medium text-[#15181F] dark:text-[#ECEFF4]">
              For Personal Life
            </h3>
            <p className="text-sm text-[#5A6070] dark:text-[#A0A8B6] mt-2 leading-relaxed">
              Errands with business hours, personal routines, fitness habits, appointments, and family goals.
            </p>
            <ul className="mt-6 space-y-2.5 text-xs text-[#15181F] dark:text-[#ECEFF4]">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#D98A1F]" />
                <span>Time windows for bank/grocery opening hours</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#D98A1F]" />
                <span>Transit buffer assumptions between errands</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-[#D98A1F]" />
                <span>Routines protected around fixed anchors</span>
              </li>
            </ul>
            <button
              onClick={() => handleDemoLaunch('personal')}
              className="mt-6 w-full py-2 px-3 rounded-xl text-xs font-semibold border border-[#D98A1F]/30 text-[#D98A1F] hover:bg-[#FCF1DC] dark:hover:bg-[#3A2A10] transition-colors cursor-pointer"
            >
              Try Personal Workspace
            </button>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="py-20 px-6 max-w-5xl mx-auto border-t border-[#E8E3D9] dark:border-[#262B36]">
        <div className="text-center mb-16">
          <span className="text-xs font-mono uppercase tracking-wider text-[#1B7F83] dark:text-[#28A5AA]">
            Workflow Architecture
          </span>
          <h2 className="font-serif text-3xl md:text-5xl mt-2 font-normal text-[#15181F] dark:text-[#ECEFF4]">
            How Dayfold Works
          </h2>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          <div className="p-5 rounded-2xl bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36]">
            <span className="font-mono text-xs text-[#C74E22] dark:text-[#F26A3D] font-bold">01 / SPEAK</span>
            <h4 className="font-serif text-xl font-medium mt-2">Natural Voice Input</h4>
            <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-2">
              Speak or type your commitments freely. Dayfold extracts tasks, deadlines, and durations.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36]">
            <span className="font-mono text-xs text-[#1B7F83] font-bold">02 / PLAN</span>
            <h4 className="font-serif text-xl font-medium mt-2">Deterministic Scheduler</h4>
            <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-2">
              Python scheduling engine computes available slots, prioritizes deadlines, and inserts buffers.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36]">
            <span className="font-mono text-xs text-amber-600 font-bold">03 / APPROVE</span>
            <h4 className="font-serif text-xl font-medium mt-2">Cryptographic OK</h4>
            <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-2">
              Review the exact proposal diff. A SHA-256 payload hash ensures what you see is what executes.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36]">
            <span className="font-mono text-xs text-green-600 font-bold">04 / VERIFY</span>
            <h4 className="font-serif text-xl font-medium mt-2">Read-Back & Audit</h4>
            <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-2">
              The executor runs steps idempotently, verifies the result on your timeline, and logs to the audit trail.
            </p>
          </div>
        </div>
      </section>

      {/* Trust & Security Section */}
      <section id="security" className="py-16 px-6 max-w-4xl mx-auto border-t border-[#E8E3D9] dark:border-[#262B36]">
        <div className="p-8 rounded-3xl bg-gradient-to-br from-white to-[#F4F1EB] dark:from-[#12151C] dark:to-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] shadow-sm">
          <div className="flex items-center gap-3 mb-4">
            <ShieldCheck className="w-8 h-8 text-[#1B7F83]" />
            <div>
              <h3 className="font-serif text-2xl font-medium text-[#15181F] dark:text-[#ECEFF4]">
                The Trust & Security Principle
              </h3>
              <span className="text-xs font-mono text-[#5A6070] dark:text-[#A0A8B6]">
                Why Dayfold never fabricates or silently modifies your calendar
              </span>
            </div>
          </div>
          <p className="text-sm text-[#5A6070] dark:text-[#A0A8B6] leading-relaxed">
            Unlike generative chatbots that hallucinate scheduling events, Dayfold enforces structural boundaries. The AI agent has zero direct write access to your calendar. Every consequential modification is persisted as an immutable Pending Action that requires your explicit review and cryptographic signature before execution.
          </p>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="py-16 px-6 max-w-3xl mx-auto border-t border-[#E8E3D9] dark:border-[#262B36]">
        <h2 className="font-serif text-3xl font-normal text-center mb-10 text-[#15181F] dark:text-[#ECEFF4]">
          Frequently Answered Questions
        </h2>

        <div className="space-y-4">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl overflow-hidden bg-white dark:bg-[#12151C]"
            >
              <button
                onClick={() => setFaqOpen(faqOpen === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left font-serif text-lg font-medium text-[#15181F] dark:text-[#ECEFF4] hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
              >
                <span>{faq.q}</span>
                <ChevronDown
                  className={`w-4 h-4 text-[#5A6070] transition-transform duration-200 ${
                    faqOpen === i ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {faqOpen === i && (
                <div className="px-5 pb-5 text-xs text-[#5A6070] dark:text-[#A0A8B6] leading-relaxed border-t border-[#E8E3D9]/50 dark:border-[#262B36]/50 pt-3">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#E8E3D9] dark:border-[#262B36] py-12 px-6 text-center text-xs text-[#5A6070] dark:text-[#A0A8B6]">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <NavLink to="/" className="hover:opacity-90 transition-opacity">
            <DayfoldLogo size="sm" showTagline variant="full" />
          </NavLink>

          <div className="flex items-center gap-6">
            <NavLink to="/privacy" className="hover:underline">Privacy Policy</NavLink>
            <NavLink to="/terms" className="hover:underline">Terms of Service</NavLink>
          </div>

          <p className="font-mono text-[11px]">
            © {new Date().getFullYear()} Dayfold. Built with deterministic scheduling & integrity verification.
          </p>
        </div>
      </footer>
    </div>
  );
};

