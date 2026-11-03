import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  Quote,
  Calendar,
  Sparkles,
  Info,
  Loader2,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import api from '../../lib/api';

interface PatternCitation {
  date: string;
  quote_or_summary: string;
}

interface PatternItem {
  theme: string;
  category: string;
  observation: string;
  evidence_citations: PatternCitation[];
  frequency_count: number;
  takeaway?: string | null;
}

interface PatternDiscoveryData {
  reflections_analyzed_count: number;
  has_sufficient_data: boolean;
  message?: string | null;
  patterns: PatternItem[];
}

export const PatternDiscoveryCard: React.FC = () => {
  const [data, setData] = useState<PatternDiscoveryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchPatterns = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/reflections/patterns/discover?days=30');
      setData(res.data);
    } catch (err) {
      console.error('Failed to load patterns:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPatterns();
  }, []);

  return (
    <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-[#E8E3D9] dark:border-[#262B36] bg-[#FCFBF8] dark:bg-[#151922]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#FCF1DC] dark:bg-[#3A2A10] flex items-center justify-center text-[#D98A1F]">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-serif text-lg font-medium text-[#15181F] dark:text-[#ECEFF4]">
              Pattern Discovery
            </h3>
            <p className="text-[11px] font-mono text-[#7B8191] dark:text-[#A0A8B6]">
              30-Day Theme Analysis • Supported by explicit reflection citations
            </p>
          </div>
        </div>

        {data?.has_sufficient_data && (
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#D98A1F] bg-[#FCF1DC] dark:bg-[#3A2A10] px-2.5 py-1 rounded-full">
            <span>{data.patterns.length} recurring themes</span>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12 text-[#7B8191]">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            <span className="text-xs font-mono">Analyzing recurring themes...</span>
          </div>
        ) : !data?.has_sufficient_data ? (
          /* Insufficient Data State */
          <div className="py-8 px-4 text-center max-w-md mx-auto space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-[#FCF1DC] dark:bg-[#3A2A10] flex items-center justify-center text-[#D98A1F] mx-auto">
              <Brain className="w-6 h-6" />
            </div>
            <h4 className="font-serif text-lg font-medium text-[#15181F] dark:text-[#ECEFF4]">
              Building pattern history
            </h4>
            <p className="text-xs text-[#7B8191] dark:text-[#A0A8B6] leading-relaxed">
              {data?.message ||
                'Pattern discovery requires at least 4 saved reflections to identify recurring themes with high confidence.'}
            </p>
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#F5F2EB] dark:bg-[#191D26] text-[11px] font-mono text-[#5A6070] dark:text-[#A0A8B6]">
              <Info className="w-3.5 h-3.5 text-[#D98A1F]" />
              <span>Current entries: {data?.reflections_analyzed_count || 0} / 4</span>
            </div>
          </div>
        ) : data.patterns.length === 0 ? (
          /* No Recurring Patterns Yet */
          <div className="py-8 px-4 text-center max-w-md mx-auto space-y-2">
            <p className="font-serif text-base text-[#15181F] dark:text-[#ECEFF4]">
              No recurring patterns identified yet
            </p>
            <p className="text-xs text-[#7B8191] dark:text-[#A0A8B6]">
              Every pattern requires citations from at least two distinct dates. Continue reflecting naturally.
            </p>
          </div>
        ) : (
          /* Patterns List */
          <div className="space-y-4">
            {data.patterns.map((p, idx) => (
              <div
                key={idx}
                className="p-4 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] bg-[#FCFBF8] dark:bg-[#151922] space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#F26A3D]" />
                    <h4 className="font-semibold text-sm text-[#15181F] dark:text-[#ECEFF4]">
                      {p.theme}
                    </h4>
                  </div>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#F4F1EB] dark:bg-[#1F2430] text-[#5A6070] dark:text-[#A0A8B6] border border-[#E8E3D9] dark:border-[#262B36]">
                    {p.category} • {p.frequency_count} days
                  </span>
                </div>

                <p className="text-xs text-[#5A6070] dark:text-[#CBD2E1] leading-relaxed">
                  {p.observation}
                </p>

                {/* Evidence Citations */}
                <div className="space-y-1.5 pt-1">
                  <div className="text-[10px] font-mono uppercase tracking-wider text-[#7B8191] dark:text-[#A0A8B6]">
                    Supporting Evidence (Direct citations):
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {p.evidence_citations.map((c, cIdx) => (
                      <div
                        key={cIdx}
                        className="p-2.5 rounded-lg bg-white dark:bg-[#1A1E27] border border-[#E8E3D9]/70 dark:border-[#262B36]/70 text-xs text-[#5A6070] dark:text-[#A0A8B6] flex flex-col justify-between"
                      >
                        <p className="italic text-[#15181F] dark:text-[#ECEFF4] line-clamp-2">
                          "{c.quote_or_summary}"
                        </p>
                        <span className="text-[10px] font-mono text-[#F26A3D] mt-1.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {c.date}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {p.takeaway && (
                  <div className="pt-2 border-t border-dashed border-[#E8E3D9] dark:border-[#262B36] text-xs text-[#1B7F83] dark:text-[#28A5AA] flex items-start gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{p.takeaway}</span>
                  </div>
                )}
              </div>
            ))}

            {/* Read-only guarantee note */}
            <div className="pt-2 text-center text-[10px] font-mono text-[#7B8191] dark:text-[#A0A8B6]">
              All pattern insights are strictly read-only and never alter your tasks or schedules.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

