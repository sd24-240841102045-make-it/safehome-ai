import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Shield, Lock, Mail, AlertCircle, ArrowRight, KeyRound, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid credentials. Please verify your email and password.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail('demo@safehome.local');
    setPassword('SafeHome@2026');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
      <div className="max-w-md w-full space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-1.5">
          <div className="inline-flex p-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 mb-1">
            <Shield className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            SafeHome <span className="text-sky-400">AI</span>
          </h1>
          <p className="text-xs text-slate-400">Local-First Intelligent Home Safety Platform</p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-6 sm:p-7 shadow-xl shadow-slate-950/60 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3.5">
            <div>
              <h2 className="text-sm font-semibold text-white">Sign In</h2>
              <p className="text-[11px] text-slate-400">Access your local surveillance dashboard</p>
            </div>
            <button
              type="button"
              onClick={fillDemo}
              className="text-[11px] font-medium text-sky-400 hover:text-sky-300 flex items-center gap-1.5 bg-sky-500/10 hover:bg-sky-500/15 px-2.5 py-1 rounded-lg border border-sky-500/20 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" /> Quick Demo
            </button>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-900/50 text-xs text-rose-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3.5">
            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Email Address</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="email"
                  required
                  placeholder="homeowner@safehome.local"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors placeholder:text-slate-600"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-300 block mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-9 pr-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors placeholder:text-slate-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 transition duration-150"
            >
              {loading ? 'Authenticating...' : 'Sign In'} <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          <div className="text-center pt-1 border-t border-slate-800/60">
            <span className="text-xs text-slate-400">Need a new account? </span>
            <Link to="/register" className="text-xs font-semibold text-sky-400 hover:text-sky-300 hover:underline">
              Create account
            </Link>
          </div>
        </div>

        {/* Quick link for mobile camera pairing */}
        <div className="text-center space-y-3">
          <div>
            <Link to="/monitor" className="text-xs text-slate-400 hover:text-slate-200 transition-colors underline">
              Using a phone as a camera? Open /monitor directly
            </Link>
          </div>

          <p className="text-[11px] text-slate-400 max-w-sm mx-auto leading-relaxed border-t border-slate-800/80 pt-3 flex items-center justify-center gap-1.5 flex-wrap">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span><strong className="text-slate-400">Notice:</strong> A phone camera is not a replacement for dedicated smoke, gas, fire, door or professional security sensors. AI results can be wrong.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
