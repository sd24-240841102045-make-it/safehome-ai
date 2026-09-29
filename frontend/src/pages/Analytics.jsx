import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  TrendingUp,
  PieChart as PieIcon,
  ShieldAlert,
  Activity,
  Calendar,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  HelpCircle,
  Terminal,
  Layers,
  Sparkles
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
import { analyticsService, eventService } from '../services/api';

export default function Analytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [feedbackLoading, setFeedbackLoading] = useState({});

  const loadAnalytics = async () => {
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
  };

  useEffect(() => {
    loadAnalytics();
  }, []);

  const handleFeedback = async (eventId, feedback) => {
    try {
      setFeedbackLoading((prev) => ({ ...prev, [eventId]: true }));
      await eventService.submitFeedback(eventId, feedback);
      // Update local state
      setData((prev) => {
        if (!prev) return prev;
        const updated = prev.recent_unusual_events?.map((ev) =>
          ev.id === eventId ? { ...ev, user_feedback: feedback } : ev
        );
        return { ...prev, recent_unusual_events: updated };
      });
    } catch (err) {
      console.error('Feedback submission error:', err);
    } finally {
      setFeedbackLoading((prev) => ({ ...prev, [eventId]: false }));
    }
  };

  if (loading) {
    return (
      <div className="p-16 text-center text-slate-400 text-sm space-y-2">
        <div className="inline-block w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
        <div>Aggregating historical data science metrics & fitting baselines...</div>
      </div>
    );
  }

  const isColdStart =
    data?.anomaly_analysis?.status === 'insufficient_data' ||
    (data?.total_events || 0) < 100 ||
    (data?.days_spanned || 0) < 7;

  // Maximum value for heatmap cell color normalization
  let maxHeatmapVal = 1;
  data?.heatmap?.forEach((row) => {
    row.hours.forEach((val) => {
      if (val > maxHeatmapVal) maxHeatmapVal = val;
    });
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-sky-400" /> Data Science & Anomaly Analytics
          </h1>
          <p className="text-sm text-slate-400">
            Statistical baselines, z-score outlier detection, and temporal activity models
          </p>
        </div>
        <button
          onClick={loadAnalytics}
          className="px-3.5 py-1.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold self-start sm:self-auto transition"
        >
          Refresh Analytics
        </button>
      </div>

      {/* Cold-Start Guard Banner */}
      {isColdStart && (
        <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-900/60 text-amber-200 text-xs space-y-3 shadow-lg">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <div className="font-bold text-amber-300 text-sm">
                Not enough historical data for reliable anomaly analysis.
              </div>
              <p className="text-slate-300 leading-relaxed">
                Statistical anomaly detection requires a minimum of <strong>100 historical events</strong> across at least <strong>7 days</strong> to establish reliable activity baselines without generating false alarms.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-1 text-slate-400 font-mono text-[11px]">
                <span>Events: {data?.total_events || 0} / 100</span>
                <span>Days spanned: {data?.days_spanned || 0} / 7 days</span>
              </div>
            </div>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between text-[11px]">
            <span className="text-slate-400 flex items-center gap-2">
              <Terminal className="w-4 h-4 text-sky-400" /> Demo seed command for testing:
            </span>
            <code className="text-sky-300 font-mono bg-slate-900 px-2.5 py-1 rounded-lg border border-slate-800">
              npm run seed:synthetic
            </code>
          </div>
        </div>
      )}

      {/* Top Statistical Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
          <div className="text-xs font-semibold text-slate-400 uppercase">Historical Events</div>
          <div className="mt-2 text-3xl font-extrabold text-white">{data?.total_events ?? 0}</div>
          <p className="mt-1 text-xs text-slate-500">{data?.days_spanned ?? 0} days recorded</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
          <div className="text-xs font-semibold text-amber-400 uppercase">Unusual Events</div>
          <div className="mt-2 text-3xl font-extrabold text-amber-400">{data?.unusual_count ?? 0}</div>
          <p className="mt-1 text-xs text-slate-500">{data?.unusual_percentage ?? 0}% anomaly rate</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
          <div className="text-xs font-semibold text-sky-400 uppercase flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" /> Peak Activity
          </div>
          <div className="mt-2 text-xl font-bold font-mono text-sky-400">
            {data?.peak_hour || '12:00 - 13:00'}
          </div>
          <p className="mt-1 text-xs text-slate-500">Highest daily frequency</p>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800">
          <div className="text-xs font-semibold text-emerald-400 uppercase flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" /> Baseline Engine
          </div>
          <div className="mt-2 text-base font-bold font-mono text-emerald-400">
            {isColdStart ? 'COLD START' : 'ACTIVE (z > 3.0)'}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {isColdStart ? 'Awaiting samples' : 'Hourly / Weekday Rolling'}
          </p>
        </div>
      </div>

      {/* Day-of-Week vs. Hour-of-Day Activity Heatmap */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" /> Day-of-Week vs. Hour-of-Day Activity Heatmap
          </h3>
          <span className="text-xs text-slate-500 font-mono">00:00 - 23:00 (Home Timezone)</span>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[640px] space-y-1.5">
            {/* Hour headers */}
            <div className="grid grid-cols-[48px_repeat(24,1fr)] gap-1 text-[10px] font-mono text-slate-500 text-center pb-1">
              <div></div>
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h}>{String(h).padStart(2, '0')}</div>
              ))}
            </div>

            {/* Day rows */}
            {data?.heatmap?.map((row, dIdx) => (
              <div key={dIdx} className="grid grid-cols-[48px_repeat(24,1fr)] gap-1 items-center">
                <div className="text-xs font-mono font-semibold text-slate-400 text-left">{row.dayName}</div>
                {row.hours.map((val, hIdx) => {
                  const intensity = maxHeatmapVal > 0 ? val / maxHeatmapVal : 0;
                  // Color interpolation from dark slate to bright sky blue
                  const bgClass =
                    val === 0
                      ? 'bg-slate-950 border-slate-800/80 text-transparent'
                      : intensity > 0.6
                      ? 'bg-sky-400 text-slate-950 font-bold'
                      : intensity > 0.3
                      ? 'bg-sky-600/80 text-white font-semibold'
                      : 'bg-sky-900/40 text-sky-300';

                  return (
                    <div
                      key={hIdx}
                      title={`${row.dayName} ${String(hIdx).padStart(2, '0')}:00 - ${val} events`}
                      className={`h-7 rounded flex items-center justify-center text-[10px] font-mono border transition-transform hover:scale-110 cursor-default ${bgClass}`}
                    >
                      {val > 0 ? val : ''}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] text-slate-500">
          Color brightness indicates detection frequency. Unexpected events occurring in dark cells during quiet hours trigger statistical anomaly alerts.
        </p>
      </div>

      {/* Chart Grid: Events by Hour & Events by Category */}
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
        </div>

        {/* Events by Category (Donut) */}
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
            Categorized across Person, Animal, Vehicle, and Other objects.
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

      {/* Human Feedback Review for Unusual Events */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm text-white flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-400" /> Human Feedback on Anomaly Detections
            </h3>
            <p className="text-xs text-slate-400">
              Marking events as "Expected" down-weights them in future baseline models. Marking "Unexpected" confirms anomalous behavior.
            </p>
          </div>
        </div>

        {data?.recent_unusual_events && data.recent_unusual_events.length > 0 ? (
          <div className="space-y-2.5">
            {data.recent_unusual_events.map((ev) => (
              <div
                key={ev.id}
                className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white capitalize">{ev.object_class}</span>
                    <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-mono text-[10px] border border-amber-500/30">
                      Score: {ev.anomaly_score ? Number(ev.anomaly_score).toFixed(2) : '0.85'}
                    </span>
                    <span className="text-slate-500 text-[11px] font-mono">
                      {new Date(ev.started_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Confidence: {Math.round(ev.confidence * 100)}% | Category: {ev.category}
                  </div>
                </div>

                {/* Feedback action buttons */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleFeedback(ev.id, 'expected')}
                    disabled={feedbackLoading[ev.id]}
                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition ${
                      ev.user_feedback === 'expected'
                        ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Expected</span>
                  </button>

                  <button
                    onClick={() => handleFeedback(ev.id, 'unexpected')}
                    disabled={feedbackLoading[ev.id]}
                    className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition ${
                      ev.user_feedback === 'unexpected'
                        ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50'
                        : 'bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800'
                    }`}
                  >
                    <XCircle className="w-3.5 h-3.5 text-rose-400" />
                    <span>Unexpected</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-xs text-slate-500">
            No unusual events recorded. When the data science engine flags activity as statistical outliers, they will appear here for feedback.
          </div>
        )}
      </div>
    </div>
  );
}
