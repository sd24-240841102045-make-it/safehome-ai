import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  TrendingUp,
  PieChart as PieIcon,
  ShieldAlert,
  Activity,
  AlertCircle,
  Clock,
  CheckCircle,
  XCircle,
  Terminal,
  Sparkles,
  Globe,
  User,
  Car,
  Dog,
  Shield,
  Layers,
  Flame,
  Info,
  Camera,
  Play,
  ArrowRight
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

const formatEventDateTime = (isoString, timeZone) => {
  if (!isoString) return 'Unknown';
  try {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone || undefined,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }).format(d);
  } catch {
    return new Date(isoString).toLocaleString();
  }
};

const formatDayString = (year, month, day) => {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
};

export default function Analytics() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('all');
  const [feedbackLoading, setFeedbackLoading] = useState({});
  const [activeTab, setActiveTab] = useState('calendar'); // 'calendar' | 'matrix' | 'science'
  const [hoveredCell, setHoveredCell] = useState(null);

  // Calendar Navigation State
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDateStr, setSelectedDateStr] = useState(() => {
    const now = new Date();
    return formatDayString(now.getFullYear(), now.getMonth(), now.getDate());
  });

  const loadAnalytics = async (selectedRange = timeRange) => {
    try {
      setLoading(true);
      const res = await analyticsService.getAnalytics({ time_range: selectedRange });
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
    loadAnalytics(timeRange);
  }, [timeRange]);

  const handleFeedback = async (eventId, feedback) => {
    try {
      setFeedbackLoading((prev) => ({ ...prev, [eventId]: true }));
      await eventService.submitFeedback(eventId, feedback);
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

  // Calendar calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 = Sun, 1 = Mon ...
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const goToToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDateStr(formatDayString(today.getFullYear(), today.getMonth(), today.getDate()));
  };

  // Calendar cells generation
  const calendarCells = useMemo(() => {
    const cells = [];
    const calData = data?.calendar_data || {};

    // 1. Trailing days from previous month
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevYear = month === 0 ? year - 1 : year;
      const prevMo = month === 0 ? 11 : month - 1;
      const dateStr = formatDayString(prevYear, prevMo, dayNum);
      cells.push({
        dayNum,
        dateStr,
        isCurrentMonth: false,
        data: calData[dateStr] || null
      });
    }

    // 2. Days of current month
    for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
      const dateStr = formatDayString(year, month, dayNum);
      cells.push({
        dayNum,
        dateStr,
        isCurrentMonth: true,
        data: calData[dateStr] || null
      });
    }

    // 3. Leading days of next month to complete 6-row grid (42 cells) or 5-row (35 cells)
    const totalCells = cells.length > 35 ? 42 : 35;
    const remaining = totalCells - cells.length;
    for (let dayNum = 1; dayNum <= remaining; dayNum++) {
      const nextYear = month === 11 ? year + 1 : year;
      const nextMo = month === 11 ? 0 : month + 1;
      const dateStr = formatDayString(nextYear, nextMo, dayNum);
      cells.push({
        dayNum,
        dateStr,
        isCurrentMonth: false,
        data: calData[dateStr] || null
      });
    }

    return cells;
  }, [year, month, firstDayOfMonth, daysInMonth, daysInPrevMonth, data]);

  // Selected Day Details
  const selectedDayData = useMemo(() => {
    if (!selectedDateStr) return null;
    return data?.calendar_data?.[selectedDateStr] || {
      total: 0,
      person: 0,
      animal: 0,
      vehicle: 0,
      other: 0,
      unusual: 0,
      hours: Array(24).fill(0),
      events: []
    };
  }, [selectedDateStr, data]);

  const hasSelectedDayEvents = Boolean(selectedDayData && selectedDayData.total > 0);

  // Selected Day Hourly Chart Data
  const selectedDayHourly = useMemo(() => {
    const hours = selectedDayData?.hours || Array(24).fill(0);
    return hours.map((val, idx) => ({
      hour: `${String(idx).padStart(2, '0')}:00`,
      events: val
    }));
  }, [selectedDayData]);

  // Max events in matrix heatmap
  const maxMatrixEvents = useMemo(() => {
    if (!data?.heatmap || data.heatmap.length === 0) return 1;
    let max = 1;
    data.heatmap.forEach((row) => {
      row.hours.forEach((v) => {
        if (v > max) max = v;
      });
    });
    return max;
  }, [data?.heatmap]);

  // Max events across all days in month for calendar normalization
  let maxDayEvents = 1;
  if (data?.calendar_data) {
    Object.values(data.calendar_data).forEach((d) => {
      if (d.total > maxDayEvents) maxDayEvents = d.total;
    });
  }

  const isColdStart =
    data?.anomaly_analysis?.status === 'insufficient_data' ||
    (data?.total_events || 0) < 100 ||
    (data?.days_spanned || 0) < 7;

  return (
    <div className="space-y-6 pb-12">
      {/* Title & Navigation Ribbon */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <CalendarIcon className="w-5 h-5" />
            </div>
            Security Calendar & Heatmap Intelligence
          </h1>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-1 flex-wrap">
            <span>Interactive daily timeline, detection categories, and 24/7 activity patterns</span>
            {data?.timezone && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-sky-300 font-mono text-[10px]">
                <Globe className="w-3 h-3 text-sky-400" /> {data.timezone}
              </span>
            )}
          </div>
        </div>

        {/* View Switcher & Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex bg-slate-900/90 border border-slate-800 rounded-xl p-0.5 text-xs font-medium">
            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'calendar'
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              <span>Calendar View</span>
            </button>
            <button
              onClick={() => setActiveTab('matrix')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'matrix'
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>24/7 Heatmap</span>
            </button>
            <button
              onClick={() => setActiveTab('science')}
              className={`px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'science'
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Anomaly Science</span>
            </button>
          </div>

          <button
            onClick={() => loadAnalytics(timeRange)}
            className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="p-16 text-center text-slate-400 text-sm space-y-2">
          <div className="inline-block w-6 h-6 border-2 border-sky-400 border-t-transparent rounded-full animate-spin"></div>
          <div>Loading security heatmaps & calendar analytics...</div>
        </div>
      )}

      {/* Top Level Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-sm space-y-1">
          <div className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>Total Detections</span>
            <Activity className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {data?.total_events ?? 0}
          </div>
          <div className="text-[11px] text-slate-500">
            Total objects & people identified by camera
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-sm space-y-1">
          <div className="text-xs font-medium text-amber-400 flex items-center justify-between">
            <span>Unusual Events</span>
            <ShieldAlert className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-300 tracking-tight">
            {data?.unusual_count ?? 0}
          </div>
          <div className="text-[11px] text-slate-500">
            {data?.unusual_percentage ?? 0}% statistical outlier rate
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-sm space-y-1">
          <div className="text-xs font-medium text-emerald-400 flex items-center justify-between">
            <span>Busiest Time Window</span>
            <Clock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-emerald-300 tracking-tight">
            {data?.peak_hour || '12:00 - 13:00'}
          </div>
          <div className="text-[11px] text-slate-500">
            Peak activity hour of the day
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800/80 shadow-sm space-y-1">
          <div className="text-xs font-medium text-sky-400 flex items-center justify-between">
            <span>Selected Date</span>
            <CalendarIcon className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-lg font-bold text-sky-300 tracking-tight">
            {selectedDateStr ? new Date(`${selectedDateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'None'}
          </div>
          <div className="text-[11px] text-slate-400">
            {hasSelectedDayEvents ? `${selectedDayData.total} events recorded` : 'No camera activity'}
          </div>
        </div>
      </div>

      {/* ── TAB 1: CALENDAR VIEW & DAY DRILLDOWN ── */}
      {activeTab === 'calendar' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Monthly Calendar Grid (7 cols) */}
          <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-lg space-y-4">
            {/* Calendar Navigation Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  {monthNames[month]} {year}
                </h2>
                <button
                  onClick={goToToday}
                  className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-300 transition"
                >
                  Jump to Today
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={prevMonth}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                  title="Previous Month"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={nextMonth}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                  title="Next Month"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Instruction banner */}
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                Click any day tile on the calendar to view its 24-hour activity timeline and detections.
              </span>
            </div>

            {/* Day of Week Headers */}
            <div className="grid grid-cols-7 gap-1.5 text-center font-mono text-[11px] font-semibold text-slate-400 pb-1 border-b border-slate-800/80">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="py-1">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar Grid Cells */}
            <div className="grid grid-cols-7 gap-1.5">
              {calendarCells.map((cell, idx) => {
                const isSelected = selectedDateStr === cell.dateStr;
                const isToday = cell.dateStr === formatDayString(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                const dayEvents = cell.data?.total || 0;
                const hasUnusual = (cell.data?.unusual || 0) > 0;

                // Heatmap intensity styling
                let bgStyle = 'bg-slate-950/60 border-slate-800/60 hover:border-slate-700 text-slate-400';
                if (cell.isCurrentMonth && dayEvents > 0) {
                  const ratio = dayEvents / maxDayEvents;
                  if (hasUnusual) {
                    bgStyle = ratio > 0.4
                      ? 'bg-rose-950/70 border-rose-700/80 text-rose-100 shadow-sm shadow-rose-900/20'
                      : 'bg-rose-950/40 border-rose-900/60 text-rose-200';
                  } else {
                    if (ratio > 0.6) {
                      bgStyle = 'bg-sky-900/70 border-sky-600/80 text-sky-100 shadow-sm shadow-sky-900/20';
                    } else if (ratio > 0.25) {
                      bgStyle = 'bg-sky-950/60 border-sky-800/70 text-sky-200';
                    } else {
                      bgStyle = 'bg-slate-900/90 border-slate-800 text-slate-200';
                    }
                  }
                }

                return (
                  <button
                    key={`${cell.dateStr}-${idx}`}
                    onClick={() => setSelectedDateStr(cell.dateStr)}
                    className={`min-h-[76px] p-2 rounded-xl border flex flex-col justify-between text-left transition relative ${bgStyle} ${
                      !cell.isCurrentMonth ? 'opacity-25 pointer-events-none' : 'opacity-100'
                    } ${
                      isSelected
                        ? 'ring-2 ring-sky-400 border-sky-400 bg-sky-950/90 shadow-lg shadow-sky-500/20'
                        : ''
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span
                        className={`text-xs font-semibold ${
                          isToday
                            ? 'px-1.5 py-0.5 rounded-full bg-sky-500 text-slate-950 font-bold'
                            : isSelected
                            ? 'text-sky-300 font-bold'
                            : 'text-slate-300'
                        }`}
                      >
                        {cell.dayNum}
                      </span>
                      {hasUnusual && (
                        <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" title="Unusual threat detected" />
                      )}
                    </div>

                    {dayEvents > 0 ? (
                      <div className="space-y-1 mt-1">
                        <div className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-950/80 text-slate-200 inline-block border border-slate-800">
                          {dayEvents} {dayEvents === 1 ? 'event' : 'events'}
                        </div>
                        {/* Category Dots */}
                        <div className="flex items-center gap-1">
                          {(cell.data?.person || 0) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" title="Person" />}
                          {(cell.data?.vehicle || 0) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Vehicle" />}
                          {(cell.data?.animal || 0) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Animal" />}
                          {(cell.data?.unusual || 0) > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-400" title="Threat" />}
                        </div>
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-600 font-mono">—</div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-3 border-t border-slate-800/80 flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-sky-400" /> Person
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400" /> Vehicle
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400" /> Animal
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-rose-400" /> Unusual / Threat
                </span>
              </div>
            </div>
          </div>

          {/* Selected Day Timeline & Details Panel (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-lg space-y-4">
              {/* Day Header */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-sky-400" />
                    {selectedDateStr
                      ? new Date(`${selectedDateStr}T00:00:00`).toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      : 'Select a Date'}
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    {hasSelectedDayEvents
                      ? `${selectedDayData.total} detection events recorded on this date`
                      : 'No camera activity recorded on this day'}
                  </p>
                </div>
                {selectedDayData?.unusual > 0 && (
                  <span className="px-2.5 py-1 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 text-xs font-semibold flex items-center gap-1">
                    <ShieldAlert className="w-3.5 h-3.5" />
                    {selectedDayData.unusual} Unusual
                  </span>
                )}
              </div>

              {/* If day has recorded events */}
              {hasSelectedDayEvents ? (
                <>
                  {/* Category Breakdown Chips */}
                  <div className="grid grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <User className="w-3.5 h-3.5 text-sky-400 mx-auto mb-1" />
                      <div className="text-xs font-bold text-white">{selectedDayData.person}</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider">Person</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <Car className="w-3.5 h-3.5 text-amber-400 mx-auto mb-1" />
                      <div className="text-xs font-bold text-white">{selectedDayData.vehicle}</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider">Vehicle</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <Dog className="w-3.5 h-3.5 text-emerald-400 mx-auto mb-1" />
                      <div className="text-xs font-bold text-white">{selectedDayData.animal}</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider">Animal</div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <Layers className="w-3.5 h-3.5 text-purple-400 mx-auto mb-1" />
                      <div className="text-xs font-bold text-white">{selectedDayData.other}</div>
                      <div className="text-[9px] text-slate-500 uppercase tracking-wider">Other</div>
                    </div>
                  </div>

                  {/* Hourly Activity Chart */}
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                      <span>Hourly Activity (00:00 - 23:00)</span>
                      <span className="text-slate-500 font-mono text-[10px]">24-Hour Graph</span>
                    </div>
                    <div className="h-44 w-full bg-slate-950/80 rounded-xl p-2 border border-slate-800/80">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={selectedDayHourly} margin={{ top: 8, right: 10, left: -25, bottom: 0 }}>
                          <defs>
                            <linearGradient id="dayHourlyGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.5} />
                              <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis dataKey="hour" stroke="#64748b" fontSize={9} tickLine={false} interval={3} />
                          <YAxis stroke="#64748b" fontSize={9} tickLine={false} allowDecimals={false} />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '10px', fontSize: '11px' }}
                            labelStyle={{ color: '#94a3b8' }}
                          />
                          <Area type="monotone" dataKey="events" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#dayHourlyGrad)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Day's Event Log */}
                  <div className="space-y-2 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                      <span>Recorded Detections on this Date</span>
                      <span className="text-slate-500 text-[10px] font-mono">{selectedDayData.events.length} shown</span>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {selectedDayData.events.map((ev) => (
                        <div
                          key={ev.id}
                          className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-white capitalize">{ev.object_class || ev.category}</span>
                              {ev.is_unusual ? (
                                <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[9px] font-mono border border-rose-500/30 inline-flex items-center gap-1">
                                  <AlertCircle className="w-2.5 h-2.5 text-rose-400" />
                                  UNUSUAL
                                </span>
                              ) : null}
                            </div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              {formatEventDateTime(ev.started_at, data?.timezone)} • {Math.round((ev.confidence || 0.8) * 100)}% confidence
                            </div>
                          </div>

                          {Boolean(ev.is_unusual) ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleFeedback(ev.id, 'expected')}
                                disabled={feedbackLoading[ev.id]}
                                className={`p-1 rounded-md text-[10px] font-medium transition ${
                                  ev.user_feedback === 'expected'
                                    ? 'bg-emerald-500/30 text-emerald-300 border border-emerald-500/50'
                                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                                }`}
                                title="Mark Expected"
                              >
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                              </button>
                              <button
                                onClick={() => handleFeedback(ev.id, 'unexpected')}
                                disabled={feedbackLoading[ev.id]}
                                className={`p-1 rounded-md text-[10px] font-medium transition ${
                                  ev.user_feedback === 'unexpected'
                                    ? 'bg-rose-500/30 text-rose-300 border border-rose-500/50'
                                    : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                                }`}
                                title="Mark Unexpected"
                              >
                                <XCircle className="w-3.5 h-3.5 text-rose-400" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                /* Empty state when 0 events on selected date */
                <div className="py-8 px-4 text-center space-y-4 bg-slate-950/60 rounded-xl border border-slate-800/80">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 text-slate-500 flex items-center justify-center mx-auto">
                    <Camera className="w-6 h-6" />
                  </div>

                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-white">No Camera Detections on this Day</h4>
                    <p className="text-[11px] text-slate-400 max-w-xs mx-auto leading-relaxed">
                      The phone camera was offline or detected no people/objects on{' '}
                      <span className="text-sky-300 font-medium">
                        {selectedDateStr ? new Date(`${selectedDateStr}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'this date'}
                      </span>.
                    </p>
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                    <button
                      onClick={() => navigate('/monitor')}
                      className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs flex items-center gap-2 shadow-sm transition"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Start Camera Monitoring</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: PROPER 24/7 ACTIVITY HEATMAP MATRIX ── */}
      {activeTab === 'matrix' && (
        <div className="space-y-6">
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                  <Flame className="w-4 h-4 text-amber-400" /> 24/7 Temporal Activity Heatmap (7 Days × 24 Hours)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cell colors map detection intensity from midnight (00:00) to 23:00 across each day of the week.
                </p>
              </div>

              {/* Heatmap Legend Bar */}
              <div className="flex items-center gap-1 text-[10px] text-slate-400 font-mono">
                <span>Less</span>
                <div className="w-3 h-3 rounded bg-slate-950 border border-slate-800" />
                <div className="w-3 h-3 rounded bg-sky-950 border border-sky-900" />
                <div className="w-3 h-3 rounded bg-sky-700 border border-sky-600" />
                <div className="w-3 h-3 rounded bg-sky-500 border border-sky-400" />
                <div className="w-3 h-3 rounded bg-sky-300 border border-sky-200" />
                <span>More</span>
              </div>
            </div>

            {/* Robust 25-column CSS Grid */}
            <div className="overflow-x-auto pb-3 pt-1">
              <div className="min-w-[760px] space-y-1.5">
                {/* Header Row: 24 Hours */}
                <div
                  className="gap-1 items-center font-mono text-[10px] text-slate-400 font-semibold"
                  style={{ display: 'grid', gridTemplateColumns: '50px repeat(24, minmax(26px, 1fr))' }}
                >
                  <div className="text-slate-500 text-[10px]">Day</div>
                  {Array.from({ length: 24 }, (_, i) => (
                    <div key={i} className="text-center">
                      {String(i).padStart(2, '0')}
                    </div>
                  ))}
                </div>

                {/* 7 Rows for Days of Week */}
                {data?.heatmap && data.heatmap.length > 0 ? (
                  data.heatmap.map((row) => (
                    <div
                      key={row.day}
                      className="gap-1 items-center"
                      style={{ display: 'grid', gridTemplateColumns: '50px repeat(24, minmax(26px, 1fr))' }}
                    >
                      <div className="text-xs font-semibold text-slate-300 font-mono">{row.dayName}</div>
                      {row.hours.map((val, hIdx) => {
                        const ratio = val > 0 ? val / maxMatrixEvents : 0;
                        let cellBg = 'bg-slate-950/80 border-slate-850 text-slate-700';

                        if (val > 0) {
                          if (ratio >= 0.75) {
                            cellBg = 'bg-sky-300 border-sky-200 text-slate-950 font-bold shadow-sm shadow-sky-400/20';
                          } else if (ratio >= 0.45) {
                            cellBg = 'bg-sky-500 border-sky-400 text-white font-semibold';
                          } else if (ratio >= 0.20) {
                            cellBg = 'bg-sky-700/80 border-sky-600 text-sky-100';
                          } else {
                            cellBg = 'bg-sky-950 border-sky-900 text-sky-300';
                          }
                        }

                        return (
                          <div
                            key={hIdx}
                            onMouseEnter={() => setHoveredCell({ day: row.dayName, hour: hIdx, count: val })}
                            onMouseLeave={() => setHoveredCell(null)}
                            className={`h-8 rounded-lg border flex items-center justify-center text-[10px] font-mono transition-all duration-150 cursor-pointer hover:scale-105 hover:ring-2 hover:ring-sky-400 hover:z-10 ${cellBg}`}
                            title={`${row.dayName} at ${String(hIdx).padStart(2, '0')}:00 — ${val} detections`}
                          >
                            {val > 0 ? val : ''}
                          </div>
                        );
                      })}
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-slate-500">
                    No heatmap data available yet. Start camera monitoring to build 24/7 activity patterns.
                  </div>
                )}
              </div>
            </div>

            {/* Hover details footer */}
            <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs">
              {hoveredCell ? (
                <div className="flex items-center gap-2 text-sky-300 font-mono">
                  <Clock className="w-4 h-4 text-sky-400" />
                  <span>
                    <strong>{hoveredCell.day}</strong> at <strong>{String(hoveredCell.hour).padStart(2, '0')}:00</strong>: {hoveredCell.count} events recorded
                  </span>
                </div>
              ) : (
                <span className="text-slate-500 text-[11px] flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-slate-400" /> Hover over any cell in the heatmap grid to inspect exact time-window detections
                </span>
              )}
            </div>
          </div>

          {/* Hourly Distribution & Category Split */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-sky-400" /> Hourly Activity Baseline (All Time)
              </h3>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data?.events_by_hour || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="label" stroke="#64748b" fontSize={10} tickLine={false} />
                    <YAxis stroke="#64748b" fontSize={10} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }}
                    />
                    <Bar dataKey="total" name="Total Events" fill="#38bdf8" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="unusual" name="Unusual (DS)" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg space-y-4">
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <PieIcon className="w-4 h-4 text-emerald-400" /> Detections by Category
              </h3>
              <div className="h-60 w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={data?.events_by_type || []}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                    >
                      {(data?.events_by_type || []).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px' }} />
                    <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: ANOMALY DATA SCIENCE ── */}
      {activeTab === 'science' && (
        <div className="space-y-6">
          {/* Cold start guard */}
          {isColdStart && (
            <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-900/60 text-amber-200 text-xs space-y-3 shadow-lg">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <div className="font-bold text-amber-300 text-sm">
                    Not enough historical data for full anomaly baseline.
                  </div>
                  <p className="text-slate-300 leading-relaxed">
                    Statistical anomaly detection requires a minimum of <strong>100 historical events</strong> across at least <strong>7 days</strong> to establish reliable baselines.
                  </p>
                  <div className="flex flex-wrap items-center gap-4 pt-1 text-slate-400 font-mono text-[11px]">
                    <span>Events: {data?.total_events || 0} / 100</span>
                    <span>Days spanned: {data?.days_spanned || 0} / 7 days</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Anomaly Review Queue */}
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
                          Anomaly Score: {ev.anomaly_score ? Number(ev.anomaly_score).toFixed(2) : '0.85'}
                        </span>
                        <span className="text-slate-400 text-[11px] font-mono">
                          {formatEventDateTime(ev.started_at, data?.timezone)}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Confidence: {Math.round(ev.confidence * 100)}% | Category: {ev.category}
                      </div>
                    </div>

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
      )}
    </div>
  );
}
