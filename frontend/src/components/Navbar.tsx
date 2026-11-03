import React from 'react';
import { Menu, Sparkles, Plus, Clock } from 'lucide-react';
import { useWorkspaceStore } from '../store/useWorkspaceStore';
import { format } from 'date-fns';

interface NavbarProps {
  onOpenMobileSidebar: () => void;
  onOpenQuickAdd?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenMobileSidebar, onOpenQuickAdd }) => {
  const { lens, terms, selectedDate } = useWorkspaceStore();

  const lensBadgeColors = {
    student: 'bg-[#ECEEFF] dark:bg-[#1C1F3D] text-[#5B63F0] border-[#5B63F0]/30',
    professional: 'bg-[#E1F2F2] dark:bg-[#12302F] text-[#1B7F83] border-[#1B7F83]/30',
    personal: 'bg-[#FCF1DC] dark:bg-[#3A2A10] text-[#D98A1F] border-[#D98A1F]/30',
    all: 'bg-[#FFF1EB] dark:bg-[#2A1710] text-[#F26A3D] border-[#F26A3D]/30',
  };

  return (
    <header className="h-16 border-b border-[#E8E3D9] dark:border-[#262B36] bg-white/80 dark:bg-[#12151C]/80 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          onClick={onOpenMobileSidebar}
          className="lg:hidden p-2 rounded-xl text-[#5A6070] hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-serif text-xl font-medium text-[#15181F] dark:text-[#ECEFF4]">
              {format(selectedDate, 'EEEE')}
            </h1>
            <span
              className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase tracking-wider ${lensBadgeColors[lens]}`}
            >
              {lens} Lens
            </span>
          </div>
          <span className="text-xs text-[#5A6070] dark:text-[#A0A8B6] font-mono">
            {format(selectedDate, 'MMMM d, yyyy')}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {onOpenQuickAdd && (
          <button
            onClick={onOpenQuickAdd}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#C74E22] dark:bg-[#F26A3D] text-white hover:opacity-90 shadow-xs transition-opacity cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Add {terms.taskSingular}</span>
          </button>
        )}
      </div>
    </header>
  );
};

