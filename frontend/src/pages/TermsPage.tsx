import React from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowLeft, FileText } from 'lucide-react';

export const TermsPage: React.FC = () => {
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
          <FileText className="w-8 h-8 text-[#F26A3D]" />
          <div>
            <h1 className="font-serif text-4xl font-normal">Terms of Service</h1>
            <span className="text-xs font-mono text-[#5A6070] dark:text-[#A0A8B6]">
              Last updated: October 31, 2026
            </span>
          </div>
        </div>

        <div className="prose dark:prose-invert text-xs leading-relaxed space-y-4 text-[#5A6070] dark:text-[#A0A8B6]">
          <p>
            By accessing or using Dayfold ("the Service"), you agree to be bound by these Terms of Service.
          </p>

          <h3 className="font-serif text-lg font-medium text-[#15181F] dark:text-white pt-2">
            1. Nature of the Service
          </h3>
          <p>
            Dayfold is an AI-powered personal planning and scheduling assistant. While the scheduling engine performs deterministic time calculations, you retain full final responsibility for your commitments, attendance, and deadlines.
          </p>

          <h3 className="font-serif text-lg font-medium text-[#15181F] dark:text-white pt-2">
            2. Responsible Use
          </h3>
          <p>
            You agree not to misuse Dayfold, attempt unauthorized access to another user's schedule, or input malicious scripts into natural language fields.
          </p>

          <h3 className="font-serif text-lg font-medium text-[#15181F] dark:text-white pt-2">
            3. Disclaimer of Warranties
          </h3>
          <p>
            The service is provided on an "as is" and "as available" basis without warranties of any kind. Dayfold is not liable for missed meetings, calendar sync delays, or third-party provider downtime.
          </p>
        </div>
      </div>
    </div>
  );
};

