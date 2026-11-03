import React from 'react';
import { NavLink } from 'react-router-dom';
import { ShieldCheck, ArrowLeft } from 'lucide-react';

export const PrivacyPolicyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#FBF9F5] dark:bg-[#0B0D12] text-[#15181F] dark:text-[#ECEFF4] p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <NavLink
          to="/"
          className="inline-flex items-center gap-2 text-xs font-mono text-[#F26A3D] hover:underline"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
        </NavLink>

        <div className="flex items-center gap-3">
          <ShieldCheck className="w-8 h-8 text-[#1B7F83]" />
          <div>
            <h1 className="font-serif text-4xl font-normal">Privacy Policy</h1>
            <span className="text-xs font-mono text-[#5A6070] dark:text-[#A0A8B6]">
              Last updated: October 31, 2026
            </span>
          </div>
        </div>

        <div className="prose dark:prose-invert text-xs leading-relaxed space-y-4 text-[#5A6070] dark:text-[#A0A8B6]">
          <p>
            At Dayfold, trust and privacy are fundamental architectural requirements. This document explains how we collect, process, and protect your data.
          </p>

          <h3 className="font-serif text-lg font-medium text-[#15181F] dark:text-white pt-2">
            1. Zero Unapproved Calendar Modification
          </h3>
          <p>
            Dayfold AI agents cannot write directly to your external calendars. Consequential writes, deletions, and reschedules always produce an immutable Pending Action requiring your explicit approval.
          </p>

          <h3 className="font-serif text-lg font-medium text-[#15181F] dark:text-white pt-2">
            2. Voice and Audio Processing
          </h3>
          <p>
            When you use speech recognition, microphone audio is processed in real time to extract text. Dayfold does not record, retain, or train proprietary models on your personal voice audio.
          </p>

          <h3 className="font-serif text-lg font-medium text-[#15181F] dark:text-white pt-2">
            3. Data Isolation and Storage
          </h3>
          <p>
            Your tasks, events, and schedules are strictly isolated by your user identifier. We never sell, rent, or monetize your schedule data with advertisers or third parties.
          </p>

          <h3 className="font-serif text-lg font-medium text-[#15181F] dark:text-white pt-2">
            4. Your Rights and Deletion
          </h3>
          <p>
            You have the right to inspect, export, or permanently delete your account and all associated data at any time from your settings.
          </p>
        </div>
      </div>
    </div>
  );
};

