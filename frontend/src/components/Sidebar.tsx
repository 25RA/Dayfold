import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  CheckSquare,
  Sparkles,
  BookOpen,
  History,
  Settings,
  Layers,
  GraduationCap,
  Briefcase,
  Heart,
  Sun,
  Moon,
  LogOut,
  Palette,
} from 'lucide-react';
import { useWorkspaceStore, ProfileLens } from '../store/useWorkspaceStore';
import { useAuthStore } from '../store/useAuthStore';
import { DayfoldLogo } from './DayfoldLogo';

interface SidebarProps {
  className?: string;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ className = '', onCloseMobile }) => {
  const { lens, setLens, theme, toggleTheme, terms } = useWorkspaceStore();
  const { user, logout } = useAuthStore();

  const lenses: { id: ProfileLens; label: string; icon: any; color: string; bg: string }[] = [
    { id: 'student', label: 'Student', icon: GraduationCap, color: 'text-[#5B63F0]', bg: 'bg-[#ECEEFF] dark:bg-[#1C1F3D]' },
    { id: 'professional', label: 'Professional', icon: Briefcase, color: 'text-[#1B7F83]', bg: 'bg-[#E1F2F2] dark:bg-[#12302F]' },
    { id: 'personal', label: 'Personal', icon: Heart, color: 'text-[#D98A1F]', bg: 'bg-[#FCF1DC] dark:bg-[#3A2A10]' },
    { id: 'all', label: 'All Lenses', icon: Layers, color: 'text-[#F26A3D]', bg: 'bg-[#FFF1EB] dark:bg-[#2A1710]' },
  ];

  const navItems = [
    { to: '/today', label: 'My Day', icon: CalendarIcon },
    { to: '/tasks', label: terms.taskPlural, icon: CheckSquare },
    { to: '/what-if', label: 'What-If Simulation', icon: Sparkles },
    { to: '/reflection', label: 'Reflection', icon: BookOpen },
    { to: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className={`w-64 flex flex-col justify-between bg-white dark:bg-[#12151C] border-r border-[#E8E3D9] dark:border-[#262B36] p-4 select-none ${className}`}>
      {/* Top Brand & Lens */}
      <div className="space-y-6">
        {/* Brand */}
        <div className="flex items-center justify-between px-2">
          <NavLink to="/today" className="hover:opacity-90 transition-opacity">
            <DayfoldLogo size="sm" showTagline variant="full" />
          </NavLink>

          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="Toggle theme"
          >
            {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4 text-amber-400" />}
          </button>
        </div>

        {/* Profile Lens Selector */}
        <div className="space-y-1.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#7B8191] dark:text-[#7C8695] px-2">
            Active Lens
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-[#F4F1EB] dark:bg-[#1A1E27] rounded-xl border border-[#E8E3D9] dark:border-[#262B36]">
            {lenses.map((l) => {
              const Icon = l.icon;
              const isActive = lens === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => setLens(l.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    isActive
                      ? `${l.bg} ${l.color} shadow-xs font-semibold`
                      : 'text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#15181F] dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{l.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="space-y-1">
          <div className="text-[10px] font-mono uppercase tracking-wider text-[#7B8191] dark:text-[#7C8695] px-2 mb-2">
            Workspace
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={onCloseMobile}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
                    isActive
                      ? 'bg-[#FFF1EB] dark:bg-[#2A1710] text-[#C74E22] dark:text-[#F26A3D] font-semibold shadow-xs'
                      : 'text-[#5A6070] dark:text-[#A0A8B6] hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-[#15181F] dark:hover:text-[#ECEFF4]'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* User Footer Profile */}
      <div className="pt-4 border-t border-[#E8E3D9] dark:border-[#262B36]">
        {user ? (
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-semibold text-xs text-[#15181F] dark:text-white shrink-0">
                {user.display_name?.charAt(0) || user.email?.charAt(0) || 'U'}
              </div>
              <div className="overflow-hidden">
                <span className="block text-xs font-medium text-[#15181F] dark:text-[#ECEFF4] truncate">
                  {user.display_name || user.email}
                </span>
                <span className="block text-[10px] text-[#7B8191] dark:text-[#7C8695] truncate">
                  {user.email}
                </span>
              </div>
            </div>

            <button
              onClick={logout}
              className="p-1.5 rounded-lg text-[#5A6070] dark:text-[#A0A8B6] hover:text-[#D6453D] hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
              title="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <NavLink
            to="/login"
            className="flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-semibold bg-[#15181F] dark:bg-white text-white dark:text-black hover:opacity-90"
          >
            Sign In
          </NavLink>
        )}
      </div>
    </aside>
  );
};

