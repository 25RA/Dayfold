import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Lightbulb,
  Calendar,
  Loader2,
  Info,
} from 'lucide-react';
import api from '../../lib/api';

interface WeeklyReviewData {
  start_date: string;
  end_date: string;
  reflections_count: number;
  has_sufficient_data: boolean;
  message?: string | null;
  accomplishments: string[];
  recurring_challenges: string[];
  key_learnings: string[];
  supporting_dates: string[];
}

export const WeeklyReviewCard: React.FC = () => {
  const [data, setData] = useState<WeeklyReviewData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchWeeklyReview = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/reflections/reviews/weekly');
      setData(res.data);
    } catch (err) {
      console.error('Failed to load weekly review:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchWeeklyReview();
  }, []);

  return (
    <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[#E8E3D9] dark:border-[#262B36] bg-[#FCFBF8] dark:bg-[#151922]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#E1F2F2] dark:bg-[#12302F] flex items-center justify-center text-[#1B7F83]">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-medium text-[#15181F] dark:text-[#ECEFF4]">
              Weekly Review
            </h3>
            <p className="text-[11px] font-mono text-[#7B8191] dark:text-[#A0A8B6]">
              7-Day Synthesis • Grounded observations from your reflections
            </p>
          </div>
        </div>

        {data?.has_sufficient_data && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#1B7F83] bg-[#E1F2F2] dark:bg-[#12302F] px-2.5 py-1 rounded-full">
            <span>{data.reflections_count} reflections analyzed</span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-[#7B8191]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-xs font-mono">Synthesizing weekly review...</span>
          </div>
        ) : !data?.has_sufficient_data ? (
          /* Insufficient Data State */
          <div className="py-8 px-4 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FFF1EB] dark:bg-[#2A1710] flex items-center justify-center text-[#F26A3D] mx-auto">
              <Calendar className="w-6 h-6" />
            </div>
            <h4 className="font-serif text-lg font-medium text-[#15181F] dark:text-[#ECEFF4]">
              More reflections needed
            </h4>
            <p className="text-xs text-[#7B8191] dark:text-[#A0A8B6] leading-relaxed">
              {data?.message ||
                'Dayfold requires at least 3 saved reflections in a 7-day period to synthesize grounded weekly observations without guessing.'}
            </p>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F5F2EB] dark:bg-[#191D26] text-[11px] font-mono text-[#5A6070] dark:text-[#A0A8B6]">
              <Info className="w-3.5 h-3.5 text-[#1B7F83]" />
              <span>Current entries this week: {data?.reflections_count || 0} / 3</span>
            </div>
          </div>
        ) : (
          /* Sufficient Data Synthesis */
          <div className="space-y-6">
            {/* Accomplishments */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <CheckCircle2 className="w-4 h-4 text-[#1B7F83]" />
                <h4 className="text-xs font-mono uppercase tracking-wider font-semibold text-[#1B7F83]">
                  What Went Well This Week
                </h4>
              </div>
              <ul className="space-y-2">
                {data.accomplishments.map((item, idx) => (
                  <li
                    key={idx}
                    className="p-3 rounded-xl bg-[#E1F2F2]/40 dark:bg-[#12302F]/30 border border-[#1B7F83]/20 text-xs text-[#15181F] dark:text-[#ECEFF4] leading-relaxed"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Recurring Challenges */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <AlertCircle className="w-4 h-4 text-[#F26A3D]" />
                <h4 className="text-xs font-mono uppercase tracking-wider font-semibold text-[#F26A3D]">
                  Recurring Challenges & Friction
                </h4>
              </div>
              <ul className="space-y-2">
                {data.recurring_challenges.map((item, idx) => (
                  <li
                    key={idx}
                    className="p-3 rounded-xl bg-[#FFF1EB]/40 dark:bg-[#2A1710]/30 border border-[#F26A3D]/20 text-xs text-[#15181F] dark:text-[#ECEFF4] leading-relaxed"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Key Learnings */}
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <Lightbulb className="w-4 h-4 text-[#D98A1F]" />
                <h4 className="text-xs font-mono uppercase tracking-wider font-semibold text-[#D98A1F]">
                  Key Learnings & Tactical Takeaways
                </h4>
              </div>
              <ul className="space-y-2">
                {data.key_learnings.map((item, idx) => (
                  <li
                    key={idx}
                    className="p-3 rounded-xl bg-[#FCF1DC]/40 dark:bg-[#3A2A10]/30 border border-[#D98A1F]/20 text-xs text-[#15181F] dark:text-[#ECEFF4] leading-relaxed"
                  >
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            {/* Supporting Dates Pill Bar */}
            {data.supporting_dates.length > 0 && (
              <div className="pt-3 border-t border-[#E8E3D9] dark:border-[#262B36] flex flex-wrap items-center gap-1.5 text-[10px] font-mono text-[#7B8191] dark:text-[#A0A8B6]">
                <span>Grounding evidence dates:</span>
                {data.supporting_dates.map((d) => (
                  <span
                    key={d}
                    className="px-2 py-0.5 rounded-md bg-[#F5F2EB] dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] text-[#15181F] dark:text-[#ECEFF4]"
                  >
                    {d}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
