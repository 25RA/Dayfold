import React, { useState } from 'react';
import { VoiceOrb } from '../components/VoiceOrb';
import { TimelineCanvas, TimelineBlock } from '../components/TimelineCanvas';
import { ApprovalCard, PendingActionData } from '../components/ApprovalCard';
import { useVoiceStore, VoiceState } from '../store/useVoiceStore';

export const DesignSystemPage: React.FC = () => {
  const { setState } = useVoiceStore();
  const [activeVoiceState, setActiveVoiceState] = useState<VoiceState>('idle');

  const voiceStates: VoiceState[] = [
    'idle',
    'listening',
    'thinking',
    'speaking',
    'awaiting_approval',
    'executing',
    'error',
  ];

  const handleVoiceStateChange = (s: VoiceState) => {
    setActiveVoiceState(s);
    setState(s);
  };

  const sampleBlocks: TimelineBlock[] = [
    {
      id: 'b1',
      kind: 'fixed_event',
      title: 'Class: Distributed Systems',
      starts_at: '2026-11-01T10:00:00Z',
      ends_at: '2026-11-01T11:30:00Z',
      pinned: true,
    },
    {
      id: 'b2',
      kind: 'task',
      title: 'Focus: DBMS Normalization Assignment',
      starts_at: '2026-11-01T12:00:00Z',
      ends_at: '2026-11-01T14:00:00Z',
      rationale: ['Due in 24h', 'Critical Priority'],
    },
    {
      id: 'b3',
      kind: 'break',
      title: 'Coffee & Stretch Break',
      starts_at: '2026-11-01T14:00:00Z',
      ends_at: '2026-11-01T14:15:00Z',
    },
    {
      id: 'b4',
      kind: 'task',
      title: 'Simulation: Exam Prep Block',
      starts_at: '2026-11-01T15:00:00Z',
      ends_at: '2026-11-01T16:30:00Z',
      is_simulation: true,
      rationale: ['Hypothetical reschedule'],
    },
  ];

  const sampleAction: PendingActionData = {
    id: 'pa_sample_99',
    type: 'plan_commit',
    title: 'Approve Schedule: Rest of Day (4 Blocks)',
    description: 'Commit 3 focus blocks and 1 buffer to your internal calendar',
    payload_hash: '3f2d9c84e1b072a45c6d8e9f1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
    risk_level: 'medium',
    status: 'proposed',
    payload: {
      plan_id: 'plan_test_01',
      summary: 'Rest of Day Plan',
      blocks_count: 4,
    },
    expires_at: new Date(Date.now() + 15 * 60000).toISOString(),
  };

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-12">
      <div>
        <div className="text-xs font-mono uppercase tracking-wider text-[#F26A3D] mb-1">
          Identity & Visual Tokens
        </div>
        <h1 className="font-serif text-4xl font-normal text-[#15181F] dark:text-[#ECEFF4]">
          Dayfold Design System
        </h1>
        <p className="text-sm text-[#5A6070] dark:text-[#A0A8B6] mt-2 max-w-2xl">
          Visual documentation of colors, typography, signature components, and verification states for "The Unfolding Day".
        </p>
      </div>

      {/* 1. Color Palette Swatches */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-medium">1. Brand & Profile Color Tokens</h2>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 text-xs">
          {/* Ember */}
          <div className="rounded-xl overflow-hidden border border-[#E8E3D9] dark:border-[#262B36] shadow-xs">
            <div className="h-14 bg-[#F26A3D]" />
            <div className="p-2.5 bg-white dark:bg-[#12151C]">
              <span className="font-semibold block">Ember</span>
              <span className="font-mono text-[10px] text-[#7B8191]">#F26A3D</span>
            </div>
          </div>

          {/* Dark Ember */}
          <div className="rounded-xl overflow-hidden border border-[#E8E3D9] dark:border-[#262B36] shadow-xs">
            <div className="h-14 bg-[#C74E22]" />
            <div className="p-2.5 bg-white dark:bg-[#12151C]">
              <span className="font-semibold block">Dark Ember</span>
              <span className="font-mono text-[10px] text-[#7B8191]">#C74E22</span>
            </div>
          </div>

          {/* Tide */}
          <div className="rounded-xl overflow-hidden border border-[#E8E3D9] dark:border-[#262B36] shadow-xs">
            <div className="h-14 bg-[#1B7F83]" />
            <div className="p-2.5 bg-white dark:bg-[#12151C]">
              <span className="font-semibold block">Tide</span>
              <span className="font-mono text-[10px] text-[#7B8191]">#1B7F83</span>
            </div>
          </div>

          {/* Student Indigo */}
          <div className="rounded-xl overflow-hidden border border-[#E8E3D9] dark:border-[#262B36] shadow-xs">
            <div className="h-14 bg-[#5B63F0]" />
            <div className="p-2.5 bg-white dark:bg-[#12151C]">
              <span className="font-semibold block">Student Indigo</span>
              <span className="font-mono text-[10px] text-[#7B8191]">#5B63F0</span>
            </div>
          </div>

          {/* Personal Marigold */}
          <div className="rounded-xl overflow-hidden border border-[#E8E3D9] dark:border-[#262B36] shadow-xs">
            <div className="h-14 bg-[#D98A1F]" />
            <div className="p-2.5 bg-white dark:bg-[#12151C]">
              <span className="font-semibold block">Personal Marigold</span>
              <span className="font-mono text-[10px] text-[#7B8191]">#D98A1F</span>
            </div>
          </div>

          {/* Warm Paper BG */}
          <div className="rounded-xl overflow-hidden border border-[#E8E3D9] dark:border-[#262B36] shadow-xs">
            <div className="h-14 bg-[#FBF9F5] border-b border-[#E8E3D9]" />
            <div className="p-2.5 bg-white dark:bg-[#12151C]">
              <span className="font-semibold block">Paper Light</span>
              <span className="font-mono text-[10px] text-[#7B8191]">#FBF9F5</span>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Typography Specimen */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-medium">2. Typography Specimen</h2>

        <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-6 space-y-6">
          <div>
            <span className="text-[10px] font-mono text-[#5A6070] dark:text-[#A0A8B6] uppercase">
              Instrument Serif — Editorial Display
            </span>
            <div className="font-serif text-4xl mt-1">
              "The unfolding of an organized day brings calm to mind."
            </div>
          </div>

          <div className="border-t border-[#E8E3D9] dark:border-[#262B36] pt-4">
            <span className="text-[10px] font-mono text-[#5A6070] dark:text-[#A0A8B6] uppercase">
              Geist Sans — UI Interface Text
            </span>
            <div className="text-sm mt-1 text-[#5A6070] dark:text-[#A0A8B6] max-w-xl">
              Dayfold communicates plans with short, legible, and honest statements. Details live directly on the interactive timeline canvas.
            </div>
          </div>

          <div className="border-t border-[#E8E3D9] dark:border-[#262B36] pt-4">
            <span className="text-[10px] font-mono text-[#5A6070] dark:text-[#A0A8B6] uppercase">
              Geist Mono — Numerals, Axis, & SHA-256 Hashes
            </span>
            <div className="font-mono text-sm mt-1 text-[#1B7F83]">
              09:30 AM — 11:00 AM • SHA-256: 3f2d9c84e1b072a45c6d8e9f
            </div>
          </div>
        </div>
      </section>

      {/* 3. VoiceOrb Visual States */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-medium">3. VoiceOrb State Machine</h2>
        <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6]">
          Click any state to preview the live animated orb treatment.
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {voiceStates.map((st) => (
            <button
              key={st}
              onClick={() => handleVoiceStateChange(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase cursor-pointer transition-all ${
                activeVoiceState === st
                  ? 'bg-[#C74E22] dark:bg-[#F26A3D] text-white font-bold shadow-xs'
                  : 'bg-[#F4F1EB] dark:bg-[#1A1E27] text-[#5A6070] dark:text-[#A0A8B6]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl p-8 flex justify-center">
          <VoiceOrb size="lg" />
        </div>
      </section>

      {/* 4. ApprovalCard Preview */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-medium">4. ApprovalCard with SHA-256 Verification</h2>
        <div className="max-w-xl">
          <ApprovalCard
            action={sampleAction}
            onApprove={async () => {}}
            onReject={async () => {}}
          />
        </div>
      </section>

      {/* 5. TimelineCanvas Preview */}
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-medium">5. TimelineCanvas (Day Grid)</h2>
        <TimelineCanvas blocks={sampleBlocks} startHour={9} endHour={18} />
      </section>
    </div>
  );
};

