import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  Smartphone,
  History,
  Bell,
  BarChart3,
  Calendar,
  Settings,
  LogOut,
  Wifi,
  Cpu,
  Database,
  Menu,
  X,
  AlertTriangle,
  Clock,
  Sliders,
  Users,
  ShieldAlert,
  CreditCard
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { systemService, alertService } from '../services/api';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [health, setHealth] = useState({ backend: 'checking', database: 'checking', ai_service: 'checking' });
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  // Poll system health and unread alerts every 8 seconds
  useEffect(() => {
    let isMounted = true;
    async function fetchStatus() {
      try {
        const [healthRes, alertsRes] = await Promise.allSettled([
          systemService.getHealth(),
          alertService.getAlerts({ unread_only: true, limit: 1 })
        ]);

        if (isMounted) {
          if (healthRes.status === 'fulfilled' && healthRes.value.data) {
            setHealth({
              backend: healthRes.value.data.backend || 'offline',
              database: healthRes.value.data.database || 'offline',
              ai_service: healthRes.value.data.ai_service || 'offline'
            });
          }
          if (alertsRes.status === 'fulfilled' && alertsRes.value.data) {
            setUnreadAlerts(alertsRes.value.data.unread_count || 0);
          }
        }
      } catch (e) {
        // network error
      }
    }

    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/', label: 'Live Dashboard', icon: LayoutDashboard },
    { to: '/monitor', label: 'Phone Camera', icon: Smartphone, badge: 'Sensor Node' },
    { to: '/analytics', label: 'Security Calendar & Analytics', icon: Calendar, badge: 'New Calendar' },
    { to: '/timeline', label: 'Security Timeline', icon: Clock },
    { to: '/events', label: 'Event History', icon: History },
    { to: '/alerts', label: 'Security Alerts', icon: Bell, count: unreadAlerts },
    { to: '/rules', label: 'Modes & Rules', icon: Sliders },
    { to: '/billing', label: 'Plans & Billing', icon: CreditCard, badge: 'Razorpay' },
    { to: '/members', label: 'Home Members', icon: Users },
    { to: '/audit-logs', label: 'Audit Logs', icon: ShieldAlert },
    { to: '/settings', label: 'Settings & Privacy', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Mobile Top Bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900/90 backdrop-blur border-b border-slate-800 z-50">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Shield className="w-5 h-5" />
          </div>
          <span className="font-bold text-sm tracking-tight text-white">SafeHome <span className="text-sky-400">AI</span></span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-lg bg-slate-850 border border-slate-800 text-slate-300 hover:text-white"
          aria-label="Toggle navigation menu"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`
        ${mobileMenuOpen ? 'block' : 'hidden'} md:block
        fixed md:sticky top-0 left-0 h-screen w-64 bg-slate-900/90 backdrop-blur border-r border-slate-800/80
        flex flex-col justify-between p-4 z-40
      `}>
        <div className="space-y-6">
          {/* Logo Brand */}
          <div className="hidden md:flex items-center gap-3 px-2 py-1">
            <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight text-white flex items-center gap-1.5">
                SafeHome <span className="text-sky-400">AI</span>
              </div>
              <p className="text-[11px] text-slate-400">Local Intelligent Surveillance</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors
                    ${isActive
                      ? 'bg-sky-500/10 text-sky-400 font-semibold border border-sky-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}
                  `}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      {item.badge}
                    </span>
                  )}
                  {item.count > 0 && (
                    <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {item.count}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Live System Health Pill & User Profile */}
        <div className="pt-4 border-t border-slate-800/80 space-y-3">
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-xs space-y-2">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">System Status</div>
            <div className="flex items-center justify-between text-slate-300 text-[11px]">
              <span className="flex items-center gap-1.5 text-slate-400"><Database className="w-3 h-3 text-slate-400" /> Database</span>
              <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                <span className={`w-1.5 h-1.5 rounded-full ${health.database === 'online' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                <span className={health.database === 'online' ? 'text-emerald-400' : 'text-rose-400'}>{health.database}</span>
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300 text-[11px]">
              <span className="flex items-center gap-1.5 text-slate-400"><Cpu className="w-3 h-3 text-slate-400" /> AI Service</span>
              <span className="inline-flex items-center gap-1 font-mono text-[10px]">
                <span className={`w-1.5 h-1.5 rounded-full ${health.ai_service === 'online' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                <span className={health.ai_service === 'online' ? 'text-emerald-400' : 'text-amber-400'}>{health.ai_service}</span>
              </span>
            </div>
          </div>

          {/* User profile & Logout */}
          <div className="flex items-center justify-between px-1">
            <div className="truncate pr-2">
              <div className="text-xs font-semibold text-slate-200 truncate">{user?.full_name || 'Homeowner'}</div>
              <div className="text-[11px] text-slate-400 truncate font-mono">{user?.email || 'authenticated'}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 transition"
              aria-label="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto">
        <div className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
        
        {/* Safety & AI Disclaimer Footer */}
        <footer className="border-t border-slate-800/60 bg-slate-950/40 py-3 px-4 text-center">
          <p className="text-[11px] text-slate-400 max-w-3xl mx-auto leading-relaxed flex items-center justify-center gap-1.5 flex-wrap">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span><strong className="text-slate-400">Important Safety Notice:</strong> A phone camera is not a replacement for dedicated smoke, gas, fire, door or professional security sensors. AI results can be wrong.</span>
          </p>
        </footer>
      </main>
    </div>
  );
}
