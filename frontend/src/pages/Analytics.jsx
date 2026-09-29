import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart as PieIcon,
  ShieldAlert,
  Activity,
  Calendar,
  AlertCircle
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { analyticsService } from '../services/api';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadAnalytics() {
      try {
        const res = await analyticsService.getAnalytics();
        if (res.data.success) {
          setData(res.data.analytics);
        }
      } catch (err) {
        console.error('Analytics load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadAnalytics();
  }, []);

  if (loading) {
    return <div className="p-12 text-center text-slate-400 text-sm">Aggregating historical data science metrics...</div>;
  }

  const hasEnoughData = (data?.total_events || 0) >= 10;

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-sky-400" /> Data Science & Analytics
        </h1>
        <p className="text-sm text-slate-400">Statistical patterns, activity frequencies, and anomaly metrics</p>
      </div>

      {/* Limited Data Notice Banner (Specification 28) */}
      {!hasEnoughData && (
        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-900/60 text-amber-200 text-xs flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold text-amber-300">Data Science Baseline Notice</div>
            <p className="leading-relaxed">
              <strong>Not enough historical data for reliable anomaly analysis.</strong> (Currently {data?.total_events || 0} events recorded; 10+ samples required to fit statistical baselines and Isolation Forest models). System is actively collecting events.
            </p>
          </div>
        </div>
      )}

      {/* Top Statistical Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
          <div className="text-xs font-semibold text-slate-400 uppercase">Historical Events</div>
          <div className="mt-2 text-3xl font-extrabold text-white">{data?.total_events ?? 0}</div>
          <p className="mt-1 text-xs text-slate-500">Total database records</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
          <div className="text-xs font-semibold text-amber-400 uppercase">Unusual Events</div>
          <div className="mt-2 text-3xl font-extrabold text-amber-400">{data?.unusual_count ?? 0}</div>
          <p className="mt-1 text-xs text-slate-500">Statistically flagged by DS</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
          <div className="text-xs font-semibold text-sky-400 uppercase">Anomaly Rate</div>
          <div className="mt-2 text-3xl font-extrabold text-sky-400">{data?.unusual_percentage ?? 0}%</div>
          <p className="mt-1 text-xs text-slate-500">Of total detections</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
          <div className="text-xs font-semibold text-emerald-400 uppercase">DS Engine Status</div>
          <div className="mt-2 text-lg font-bold font-mono text-emerald-400">
            {hasEnoughData ? 'TRAINED & ACTIVE' : 'LEARNING'}
          </div>
          <p className="mt-1 text-xs text-slate-500">Isolation Forest (sklearn)</p>
        </div>
      </div>

      {/* Chart Grid: Events by Hour & Events by Type */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Events by Hour (24-hour histogram) */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" /> Events by Hour (24-Hour Activity Profile)
            </h3>
            <span className="text-xs text-slate-500 font-mono">00:00 - 23:00</span>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.events_by_hour || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Bar dataKey="total" name="Total Events" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="unusual" name="Unusual (DS)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-[11px] text-slate-500">
            Historical distribution helps detect unexpected activity outside of typical hours.
          </p>
        </div>

        {/* Events by Type (Donut) */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4 flex flex-col justify-between">
          <div>
            <h3 className="font-semibold text-sm text-white flex items-center gap-2 mb-2">
              <PieIcon className="w-4 h-4 text-emerald-400" /> Events by Category
            </h3>
            <div className="h-56 w-full flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data?.events_by_type || []}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                  >
                    {(data?.events_by_type || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="pt-2 border-t border-slate-800 text-[11px] text-slate-500">
            Categorized across humans, animals, vehicles, and general objects.
          </div>
        </div>
      </div>

      {/* Daily Activity Trend & Confidence Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Daily Activity Trend */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
          <h3 className="font-semibold text-sm text-white flex items-center gap-2">
            <Calendar className="w-4 h-4 text-sky-400" /> Daily Event History (Recent 14 Days)
          </h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data?.daily_activity || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="date" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                />
                <Area type="monotone" dataKey="count" name="Detections" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#colorCount)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Confidence Distribution */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
          <h3 className="font-semibold text-sm text-white flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" /> Detection Confidence Distribution
          </h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data?.confidence_distribution || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="range" stroke="#64748b" fontSize={10} tickLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                />
                <Bar dataKey="count" name="Events Count" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
