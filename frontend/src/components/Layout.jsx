import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Shield,
  LayoutDashboard,
  Smartphone,
  History,
  Bell,
  BarChart3,
  Settings,
  LogOut,
  Wifi,
  Cpu,
  Database,
  Menu,
  X,
  AlertTriangle
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
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/monitor', label: 'Phone Camera', icon: Smartphone, badge: 'Sensor Node' },
    { to: '/events', label: 'Event History', icon: History },
    { to: '/alerts', label: 'Alerts', icon: Bell, count: unreadAlerts },
    { to: '/analytics', label: 'Analytics (DS)', icon: BarChart3 },
    { to: '/settings', label: 'Settings & Privacy', icon: Settings }
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col md:flex-row">
      {/* Mobile Top Bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800 z-50">
        <div className="flex items-center gap-2">
          <Shield className="w-6 h-6 text-sky-400" />
          <span className="font-bold text-base tracking-wide text-white">SafeHome <span className="text-sky-400">AI</span></span>
        </div>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-lg bg-slate-800 text-slate-300 hover:text-white"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Sidebar Navigation */}
      <aside className={`
        ${mobileMenuOpen ? 'block' : 'hidden'} md:block
        fixed md:sticky top-0 left-0 h-screen w-64 bg-slate-900/95 backdrop-blur border-r border-slate-800
        flex flex-col justify-between p-4 z-40
      `}>
        <div>
          {/* Logo Brand */}
          <div className="hidden md:flex items-center gap-3 px-2 py-3 mb-6">
            <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Shield className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-base tracking-wide text-white flex items-center gap-1.5">
                SafeHome <span className="text-sky-400">AI</span>
              </div>
              <p className="text-xs text-slate-400">Surveillance & AI Safety</p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="space-y-1.5">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`
                    flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all
                    ${isActive
                      ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      {item.badge}
                    </span>
                  )}
                  {item.count > 0 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
                      {item.count}
                    </span>
                  )}
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Live System Health Pill & User Profile */}
        <div className="pt-4 border-t border-slate-800 space-y-3">
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-xs space-y-2">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">System Hardware</div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5"><Database className="w-3.5 h-3.5 text-slate-400" /> Database</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${health.database === 'online' ? 'text-emerald-400 bg-emerald-950/60' : 'text-rose-400 bg-rose-950/60'}`}>
                {health.database.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-300">
              <span className="flex items-center gap-1.5"><Cpu className="w-3.5 h-3.5 text-slate-400" /> AI Engine</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${health.ai_service === 'online' ? 'text-emerald-400 bg-emerald-950/60' : 'text-amber-400 bg-amber-950/60'}`}>
                {health.ai_service.toUpperCase()}
              </span>
            </div>
          </div>

          {/* User profile & Logout */}
          <div className="flex items-center justify-between px-2 pt-1">
            <div className="truncate">
              <div className="text-xs font-medium text-slate-200 truncate">{user?.full_name || 'Homeowner'}</div>
              <div className="text-[11px] text-slate-500 truncate">{user?.email || 'Authenticated'}</div>
            </div>
            <button
              onClick={handleLogout}
              title="Logout"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
        <Outlet />
      </main>
    </div>
  );
}
