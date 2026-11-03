import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap, Briefcase, Heart, Check, Clock, Sparkles, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import api from '../lib/api';
import { useAuthStore } from '../store/useAuthStore';
import { useWorkspaceStore, ProfileLens } from '../store/useWorkspaceStore';
import { ALL_24_HOURS } from '../lib/timeOptions';

export const OnboardingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { setLens } = useWorkspaceStore();

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedProfiles, setSelectedProfiles] = useState<ProfileLens[]>(['student']);
  const [primaryProfile, setPrimaryProfile] = useState<ProfileLens>('student');
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(18);
  const [focusLength, setFocusLength] = useState(90);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleProfile = (p: ProfileLens) => {
    if (selectedProfiles.includes(p)) {
      if (selectedProfiles.length > 1) {
        const next = selectedProfiles.filter((item) => item !== p);
        setSelectedProfiles(next);
        if (primaryProfile === p) setPrimaryProfile(next[0]);
      }
    } else {
      setSelectedProfiles([...selectedProfiles, p]);
    }
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      const workingHours = {
        monday: { start_hour: startHour, start_minute: 0, end_hour: endHour, end_minute: 0 },
        tuesday: { start_hour: startHour, start_minute: 0, end_hour: endHour, end_minute: 0 },
        wednesday: { start_hour: startHour, start_minute: 0, end_hour: endHour, end_minute: 0 },
        thursday: { start_hour: startHour, start_minute: 0, end_hour: endHour, end_minute: 0 },
        friday: { start_hour: startHour, start_minute: 0, end_hour: endHour, end_minute: 0 },
      };

      await api.post('/users/me/onboarding/complete', {
        profiles: selectedProfiles,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
        working_hours: workingHours,
        focus_block_minutes: focusLength,
        break_minutes: 15,
      });

      // Update workspace lens
      setLens(primaryProfile);

      navigate('/today');
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FBF9F5] dark:bg-[#0B0D12] text-[#15181F] dark:text-[#ECEFF4] flex flex-col justify-center items-center px-6 py-12">
      <div className="w-full max-w-xl bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-3xl p-8 shadow-sm">
        {/* Step Indicator */}
        <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#E8E3D9] dark:border-[#262B36]">
          <span className="font-serif text-2xl font-medium">Personalize Dayfold</span>
          <span className="text-xs font-mono text-[#5A6070] dark:text-[#A0A8B6]">
            Step {step} of 2
          </span>
        </div>

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h3 className="font-serif text-xl font-medium">Which workspace lenses fit your life?</h3>
              <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-1">
                Select all that apply. Dayfold will adapt terminology, suggestions, and scheduling weights.
              </p>
            </div>

            <div className="space-y-3">
              {/* Student */}
              <div
                onClick={() => toggleProfile('student')}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                  selectedProfiles.includes('student')
                    ? 'border-[#5B63F0] bg-[#ECEEFF]/40 dark:bg-[#1C1F3D]/40'
                    : 'border-[#E8E3D9] dark:border-[#262B36] hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#ECEEFF] dark:bg-[#1C1F3D] flex items-center justify-center text-[#5B63F0]">
                    <GraduationCap className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#15181F] dark:text-[#ECEFF4]">Student</h4>
                    <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6]">
                      Classes, assignments, revision, exams & study sessions
                    </p>
                  </div>
                </div>
                {selectedProfiles.includes('student') && (
                  <Check className="w-5 h-5 text-[#5B63F0]" />
                )}
              </div>

              {/* Professional */}
              <div
                onClick={() => toggleProfile('professional')}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                  selectedProfiles.includes('professional')
                    ? 'border-[#1B7F83] bg-[#E1F2F2]/40 dark:bg-[#12302F]/40'
                    : 'border-[#E8E3D9] dark:border-[#262B36] hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#E1F2F2] dark:bg-[#12302F] flex items-center justify-center text-[#1B7F83]">
                    <Briefcase className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#15181F] dark:text-[#ECEFF4]">Professional</h4>
                    <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6]">
                      Meetings, deliverables, focus time & review cycles
                    </p>
                  </div>
                </div>
                {selectedProfiles.includes('professional') && (
                  <Check className="w-5 h-5 text-[#1B7F83]" />
                )}
              </div>

              {/* Personal */}
              <div
                onClick={() => toggleProfile('personal')}
                className={`p-4 rounded-2xl border-2 transition-all cursor-pointer flex items-center justify-between ${
                  selectedProfiles.includes('personal')
                    ? 'border-[#D98A1F] bg-[#FCF1DC]/40 dark:bg-[#3A2A10]/40'
                    : 'border-[#E8E3D9] dark:border-[#262B36] hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-[#FCF1DC] dark:bg-[#3A2A10] flex items-center justify-center text-[#D98A1F]">
                    <Heart className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-[#15181F] dark:text-[#ECEFF4]">Personal</h4>
                    <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6]">
                      Errands, routines, appointments & family commitments
                    </p>
                  </div>
                </div>
                {selectedProfiles.includes('personal') && (
                  <Check className="w-5 h-5 text-[#D98A1F]" />
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#C74E22] dark:bg-[#F26A3D] text-white font-semibold text-xs uppercase tracking-wider hover:opacity-90 cursor-pointer shadow-sm"
              >
                <span>Continue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h3 className="font-serif text-xl font-medium">Daily Rhythm & Operating Hours</h3>
              <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-1">
                The deterministic planner schedules tasks within your operating window and inserts breaks.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1.5">
                  Day Starts At
                </label>
                <select
                  value={startHour}
                  onChange={(e) => {
                    const newStart = Number(e.target.value);
                    setStartHour(newStart);
                    if (newStart >= endHour) {
                      setEndHour(Math.min(23, newStart + 1));
                    }
                  }}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
                >
                  {ALL_24_HOURS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1.5">
                  Day Ends At
                </label>
                <select
                  value={endHour}
                  onChange={(e) => setEndHour(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
                >
                  {ALL_24_HOURS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1.5">
                Target Focus Block Duration
              </label>
              <select
                value={focusLength}
                onChange={(e) => setFocusLength(Number(e.target.value))}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl text-[#15181F] dark:text-white"
              >
                <option value={45}>45 Minutes (Short sprints)</option>
                <option value={60}>60 Minutes (Standard class/study)</option>
                <option value={90}>90 Minutes (Deep focus blocks)</option>
                <option value={120}>120 Minutes (Extended deep work)</option>
              </select>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setStep(1)}
                className="text-xs font-medium text-[#5A6070] hover:text-[#15181F] dark:hover:text-white"
              >
                Back
              </button>

              <button
                onClick={handleFinish}
                disabled={isSubmitting}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#C74E22] dark:bg-[#F26A3D] text-white font-semibold text-xs uppercase tracking-wider hover:opacity-90 cursor-pointer shadow-sm"
              >
                {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Unfold My Day</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

