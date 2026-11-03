import React, { useState } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { Sparkles, GraduationCap, Briefcase, Heart, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../store/useAuthStore';
import { DayfoldLogo } from '../components/DayfoldLogo';

interface AuthPageProps {
  mode: 'login' | 'signup';
}

export const AuthPage: React.FC<AuthPageProps> = ({ mode }) => {
  const navigate = useNavigate();
  const { login, register, demoLogin, isLoading } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    try {
      if (mode === 'signup') {
        if (!displayName.trim()) {
          setErrorMsg('Display name is required');
          return;
        }
        await register(email, password, displayName);
        navigate('/onboarding');
      } else {
        await login(email, password);
        navigate('/today');
      }
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Authentication failed');
    }
  };

  const handleDemo = async (profile: 'student' | 'professional' | 'personal') => {
    setErrorMsg(null);
    try {
      await demoLogin(profile);
      // Ensure the workspace lens is explicitly synchronized for the demo view
      const { useWorkspaceStore } = await import('../store/useWorkspaceStore');
      useWorkspaceStore.getState().setLens(profile);
      navigate('/today');
    } catch (err: any) {
      setErrorMsg(err.response?.data?.detail || err.message || 'Demo initialization failed');
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-6 py-12 bg-[#FBF9F5] dark:bg-[#0B0D12] text-[#15181F] dark:text-[#ECEFF4]">
      {/* Brand */}
      <NavLink to="/" className="mb-8 hover:opacity-90 transition-opacity">
        <DayfoldLogo size="lg" showTagline variant="full" />
      </NavLink>

      {/* Main Card */}
      <div className="w-full max-w-md bg-white dark:bg-[#12151C] border border-[#E8E3D9] dark:border-[#262B36] rounded-3xl p-8 shadow-sm">
        <div className="text-center mb-6">
          <h2 className="font-serif text-3xl font-normal">
            {mode === 'signup' ? 'Create your account' : 'Welcome back'}
          </h2>
          <p className="text-xs text-[#5A6070] dark:text-[#A0A8B6] mt-1.5">
            {mode === 'signup'
              ? 'Unfold your day with an intelligent personal assistant'
              : 'Sign in to access your daily schedule and commitments'}
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-[#D6453D]/30 flex items-center gap-2 text-xs text-[#D6453D]">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1">
                Display Name
              </label>
              <input
                type="text"
                required
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ananya Sharma"
                className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F26A3D]/40 text-[#15181F] dark:text-white"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@domain.com"
              className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F26A3D]/40 text-[#15181F] dark:text-white"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#5A6070] dark:text-[#A0A8B6] mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 text-sm bg-slate-50 dark:bg-[#1A1E27] border border-[#E8E3D9] dark:border-[#262B36] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#F26A3D]/40 text-[#15181F] dark:text-white"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 rounded-xl bg-[#C74E22] dark:bg-[#F26A3D] text-white font-semibold text-xs uppercase tracking-wider hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer shadow-sm mt-2"
          >
            {isLoading && <Loader2 className="w-4 h-4 animate-spin" />}
            <span>{mode === 'signup' ? 'Create Account' : 'Sign In'}</span>
          </button>
        </form>

        <div className="relative my-6 text-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-[#E8E3D9] dark:border-[#262B36]" />
          </div>
          <span className="relative px-3 text-[10px] font-mono uppercase bg-white dark:bg-[#12151C] text-[#7B8191]">
            or explore instant isolated demo
          </span>
        </div>

        {/* Instant Demo Launchers */}
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => handleDemo('student')}
            disabled={isLoading}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-[#5B63F0]/30 bg-[#ECEEFF]/50 dark:bg-[#1C1F3D]/50 hover:bg-[#ECEEFF] text-[#5B63F0] text-[11px] font-medium transition-colors cursor-pointer"
          >
            <GraduationCap className="w-4 h-4 mb-1" />
            <span>Student</span>
          </button>

          <button
            type="button"
            onClick={() => handleDemo('professional')}
            disabled={isLoading}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-[#1B7F83]/30 bg-[#E1F2F2]/50 dark:bg-[#12302F]/50 hover:bg-[#E1F2F2] text-[#1B7F83] text-[11px] font-medium transition-colors cursor-pointer"
          >
            <Briefcase className="w-4 h-4 mb-1" />
            <span>Professional</span>
          </button>

          <button
            type="button"
            onClick={() => handleDemo('personal')}
            disabled={isLoading}
            className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-[#D98A1F]/30 bg-[#FCF1DC]/50 dark:bg-[#3A2A10]/50 hover:bg-[#FCF1DC] text-[#D98A1F] text-[11px] font-medium transition-colors cursor-pointer"
          >
            <Heart className="w-4 h-4 mb-1" />
            <span>Personal</span>
          </button>
        </div>

        <div className="text-center mt-6 text-xs text-[#5A6070] dark:text-[#A0A8B6]">
          {mode === 'signup' ? (
            <span>
              Already have an account?{' '}
              <NavLink to="/login" className="text-[#F26A3D] font-medium hover:underline">
                Sign in
              </NavLink>
            </span>
          ) : (
            <span>
              New to Dayfold?{' '}
              <NavLink to="/signup" className="text-[#F26A3D] font-medium hover:underline">
                Create an account
              </NavLink>
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

