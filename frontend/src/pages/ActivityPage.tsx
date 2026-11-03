import React, { useState, useEffect } from 'react';
import { ShieldCheck, History, ArrowRight, CheckCircle2, User, Bot, RefreshCw, Sparkles, Calendar, Check } from 'lucide-react';
import api from '../lib/api';

interface AuditItem {
  id: string;
  actor: string;
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, any>;
  at: string;
}

export const ActivityPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchActivity = async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/users/me/activity');
      setLogs(res.data);
    } catch (err) {
      console.error('Failed to load activity logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
  }, []);

  const getActionBadge = (action: string) => {
    if (action.startsWith('simulation')) {
      return {
        label: 'Simulation',
        className: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400',
        icon: Sparkles,
      };
    }
    if (action === 'action.approve' || action === 'action.execute') {
      return {
        label: 'Committed Execution',
        className: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
        icon: CheckCircle2,
      };
    }
    if (action === 'action.reject') {
      return {
        label: 'Rejected',
        className: 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-400',
        icon: History,
      };
    }
    if (action.startsWith('plan.')) {
      return {
        label: 'Plan Generated',
        className: 'bg-[#FFF1EB] dark:bg-[#2A1710] border-[#F26A3D]/30 text-[#C74E22] dark:text-[#FFA67F]',
        icon: Calendar,
      };
    }
    return {
      label: action,
      className: 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-[#5A6070] dark:text-[#A0A8B6]',
      icon: History,
    };
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-serif text-3xl font-normal text-[#15181F] dark:text-[#ECEFF4]">
            Activity & Audit History
          </h2>
          <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-1">
            Immutable, append-only audit trail verifying every proposal, approval, simulation, and execution.
          </p>
        </div>

        <button
          onClick={fetchActivity}
          className="p-2.5 rounded-xl border border-[#E8E3D9] dark:border-[#262B36] hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer text-[#5A6070] dark:text-[#A0A8B6]"
          title="Refresh logs"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-2xl overflow-hidden shadow-sm">
        <div className="divide-y divide-[#E8E3D9] dark:divide-[#262B36]">
          {logs.map((log) => {
            const badge = getActionBadge(log.action);
            const BadgeIcon = badge.icon;

            return (
              <div key={log.id} className="p-4 flex items-start justify-between gap-4 text-xs">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-[#5A6070] dark:text-[#A0A8B6]">
                    {log.actor === 'agent' ? (
                      <Bot className="w-4 h-4 text-[#F26A3D]" />
                    ) : (
                      <User className="w-4 h-4 text-[#1B7F83]" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold uppercase text-[#15181F] dark:text-white">
                        {log.action}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full border ${badge.className}`}>
                        <BadgeIcon className="w-3 h-3" />
                        <span>{badge.label}</span>
                      </span>
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[#5A6070] dark:text-[#A0A8B6]">
                        {log.actor}
                      </span>
                    </div>

                    {log.entity_type && (
                      <div className="text-[11px] text-[#5A6070] dark:text-[#A0A8B6] mt-0.5">
                        Target: {log.entity_type} {log.entity_id ? `(${log.entity_id.slice(0, 8)}...)` : ''}
                      </div>
                    )}

                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <div className="text-[10px] font-mono bg-slate-50 dark:bg-[#1A1E27] p-2 rounded-lg border border-[#E8E3D9]/60 dark:border-[#262B36]/60 mt-1.5 max-w-lg overflow-x-auto">
                        <pre className="whitespace-pre-wrap">{JSON.stringify(log.metadata, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="font-mono text-[10px] text-[#7B8191] dark:text-[#7C8695]">
                    {new Date(log.at).toLocaleString()}
                  </span>
                  <div className="flex items-center justify-end gap-1 text-[10px] text-green-600 dark:text-green-400 mt-1">
                    <ShieldCheck className="w-3 h-3" />
                    <span>Audited</span>
                  </div>
                </div>
              </div>
            );
          })}

          {logs.length === 0 && !isLoading && (
            <div className="p-12 text-center text-[#5A6070] dark:text-[#A0A8B6]">
              <History className="w-8 h-8 mx-auto mb-2 opacity-40 text-[#F26A3D]" />
              <p className="font-serif text-lg text-[#15181F] dark:text-[#ECEFF4]">No audit entries yet</p>
              <p className="text-xs mt-1">Actions you approve, simulate, or execute will appear here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

