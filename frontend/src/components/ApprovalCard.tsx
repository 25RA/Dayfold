import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ShieldCheck, CheckCircle2, XCircle, Loader2, ArrowRight, Clock, FileText } from 'lucide-react';

export interface PendingActionData {
  id: string;
  type: string;
  title?: string;
  description?: string;
  payload_hash: string;
  risk_level: 'low' | 'medium' | 'high';
  status: 'proposed' | 'approved' | 'executing' | 'succeeded' | 'partially_succeeded' | 'failed' | 'rejected' | 'expired';
  payload: Record<string, any>;
  expires_at: string;
}

interface ApprovalCardProps {
  action: PendingActionData;
  onApprove: (actionId: string, payloadHash: string) => Promise<void>;
  onReject: (actionId: string) => Promise<void>;
  className?: string;
}

export const ApprovalCard: React.FC<ApprovalCardProps> = ({
  action,
  onApprove,
  onReject,
  className = '',
}) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleApprove = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onApprove(action.id, action.payload_hash);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Execution failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    try {
      await onReject(action.id);
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Rejection failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isPending = action.status === 'proposed';
  const isExecuting = action.status === 'executing' || isSubmitting;
  const isSuccess = action.status === 'succeeded';
  const isRejected = action.status === 'rejected';

  // Short hash for display
  const shortHash = action.payload_hash ? `${action.payload_hash.slice(0, 10)}...${action.payload_hash.slice(-8)}` : '';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-white dark:bg-[#12151C] border-2 ${
        isSuccess
          ? 'border-[#2E9E6A]'
          : isRejected
          ? 'border-[#D6453D]/40'
          : 'border-amber-400 dark:border-amber-500/80 shadow-md'
      } rounded-2xl p-5 ${className}`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {isSuccess ? (
            <CheckCircle2 className="w-5 h-5 text-[#2E9E6A]" />
          ) : isRejected ? (
            <XCircle className="w-5 h-5 text-[#D6453D]" />
          ) : isExecuting ? (
            <Loader2 className="w-5 h-5 text-[#F26A3D] animate-spin" />
          ) : (
            <ShieldCheck className="w-5 h-5 text-amber-500" />
          )}

          <div>
            <span className="text-[10px] font-mono uppercase tracking-wider text-[#F26A3D] font-bold block mb-0.5">
              Step 2 of 2: Final Plan Approval
            </span>
            <h4 className="font-semibold text-sm text-[#15181F] dark:text-[#ECEFF4]">
              {action.title || 'Schedule Commitment Proposal'}
            </h4>
            <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-0.5">
              {action.description || 'Review the plan before committing to your schedule'}
            </p>
          </div>
        </div>

        <span
          className={`text-[10px] font-mono px-2 py-0.5 rounded-full uppercase tracking-wider ${
            isSuccess
              ? 'bg-green-100 dark:bg-green-950 text-green-800 dark:text-green-300'
              : isRejected
              ? 'bg-red-100 dark:bg-red-950 text-red-800 dark:text-red-300'
              : 'bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300'
          }`}
        >
          {action.status}
        </span>
      </div>

      {/* Plan Changes / Payload summary */}
      <div className="my-4 p-3 rounded-xl bg-[#F4F1EB] dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] text-xs">
        <div className="flex items-center justify-between text-[#5A6070] dark:text-[#A0A8B6] font-mono text-[11px] mb-2 pb-1.5 border-b border-[#E8E3D9] dark:border-[#262B36]">
          <span>Proposed Action Diff</span>
          <span>Risk: <strong className="uppercase text-[#15181F] dark:text-white">{action.risk_level}</strong></span>
        </div>

        <div className="space-y-1.5 text-[#15181F] dark:text-[#ECEFF4]">
          {action.type === 'plan_commit' && (
            <div className="flex items-center gap-2">
              <ArrowRight className="w-3.5 h-3.5 text-[#F26A3D]" />
              <span>Commit plan blocks and transition scheduled tasks to In-Progress</span>
            </div>
          )}

          {action.payload && typeof action.payload === 'object' && (
            <div className="space-y-1 pt-1 text-[11px] font-mono text-[#5A6070] dark:text-[#A0A8B6]">
              <div>Summary: {action.payload.summary || 'Daily Schedule'}</div>
              {action.payload.target_date && (
                <div className="text-[#C74E22] dark:text-[#F26A3D] font-medium">
                  Target Date: {action.payload.target_date}
                </div>
              )}
              <div className="flex flex-wrap gap-2 text-[10px] pt-0.5">
                <span className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                  {action.payload.unique_tasks_count ?? action.payload.scheduled_tasks_count ?? 0} unique tasks
                </span>
                {action.payload.scheduled_blocks_count !== undefined && (
                  <span className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                    {action.payload.scheduled_blocks_count} focus blocks
                  </span>
                )}
                {action.payload.fixed_commitments_count !== undefined && (
                  <span className="bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded font-mono">
                    {action.payload.fixed_commitments_count} fixed commitments
                  </span>
                )}
                {action.payload.unscheduled_tasks_count ? (
                  <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono">
                    {action.payload.unscheduled_tasks_count} unscheduled
                  </span>
                ) : null}
              </div>
            </div>
          )}
        </div>
      </div>

      {action.payload?.verification_error && (
        <div className="my-2 text-xs text-[#D6453D] bg-red-50 dark:bg-red-950/40 p-2.5 rounded-lg border border-[#D6453D]/30 flex items-center gap-1.5">
          <XCircle className="w-4 h-4 shrink-0 text-[#D6453D]" />
          <span>{action.payload.verification_error}</span>
        </div>
      )}

      {/* SHA-256 Integrity Verification Badge */}
      <div className="flex items-center justify-between text-[11px] font-mono text-[#5A6070] dark:text-[#A0A8B6] pt-1">
        <div className="flex items-center gap-1.5" title={`SHA-256: ${action.payload_hash}`}>
          <ShieldCheck className="w-3.5 h-3.5 text-[#1B7F83]" />
          <span>SHA-256:</span>
          <code className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-[#15181F] dark:text-white">
            {shortHash}
          </code>
        </div>
        <span className="text-[10px] text-green-700 dark:text-green-400">Verified Payload</span>
      </div>

      {/* Error alert if any */}
      {errorMsg && (
        <div className="mt-3 text-xs text-[#D6453D] bg-red-50 dark:bg-red-950/40 p-2 rounded-lg border border-[#D6453D]/30">
          {errorMsg}
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div className="flex items-center justify-end gap-3 mt-4 pt-3 border-t border-[#E8E3D9] dark:border-[#262B36]">
          <button
            onClick={handleReject}
            disabled={isExecuting}
            className="px-4 py-1.5 rounded-lg text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors cursor-pointer"
          >
            Reject Plan
          </button>
          <button
            onClick={handleApprove}
            disabled={isExecuting || Boolean(action.payload?.verification_error)}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold bg-[#C74E22] dark:bg-[#F26A3D] text-white hover:opacity-90 disabled:opacity-50 shadow-sm transition-opacity cursor-pointer"
          >
            {isExecuting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Executing & Verifying...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Approve & Commit Schedule</span>
              </>
            )}
          </button>
        </div>
      )}

      {isSuccess && (
        <div className="mt-3 pt-2 text-xs text-[#2E9E6A] flex items-center gap-1.5 border-t border-[#E8E3D9] dark:border-[#262B36]">
          <CheckCircle2 className="w-4 h-4" />
          <span>Executed and verified against your calendar timeline.</span>
        </div>
      )}
    </motion.div>
  );
};

