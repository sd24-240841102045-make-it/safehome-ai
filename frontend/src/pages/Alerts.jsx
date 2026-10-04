import React, { useState, useEffect } from 'react';
import {
  Bell,
  CheckCircle,
  AlertTriangle,
  Info,
  Trash2,
  CheckCheck,
  Filter
} from 'lucide-react';
import { alertService } from '../services/api';

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const res = await alertService.getAlerts({
        severity: filterSeverity || undefined,
        unread_only: filterUnreadOnly || undefined
      });
      if (res.data.success) {
        setAlerts(res.data.alerts);
        setUnreadCount(res.data.unread_count);
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, [filterSeverity, filterUnreadOnly]);

  const handleMarkRead = async (id) => {
    try {
      await alertService.markRead(id);
      fetchAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await alertService.markAllRead();
      fetchAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    try {
      await alertService.deleteAlert(id);
      fetchAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Bell className="w-5 h-5" />
            </div>
            Alert Center
          </h1>
          <p className="text-xs text-slate-400 mt-1">Real-time safety notifications and detected activity alerts</p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 text-xs font-semibold transition"
          >
            <CheckCheck className="w-3.5 h-3.5 text-sky-400" /> Mark All as Read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setFilterSeverity(''); setFilterUnreadOnly(false); }}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            !filterSeverity && !filterUnreadOnly
              ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
              : 'bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          All Alerts
        </button>
        <button
          onClick={() => setFilterUnreadOnly(!filterUnreadOnly)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            filterUnreadOnly
              ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
              : 'bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          Unread Only {unreadCount > 0 && `(${unreadCount})`}
        </button>
        <button
          onClick={() => setFilterSeverity('WARNING')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            filterSeverity === 'WARNING'
              ? 'bg-amber-500 text-slate-950 font-semibold shadow-sm'
              : 'bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          Warnings
        </button>
        <button
          onClick={() => setFilterSeverity('INFO')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
            filterSeverity === 'INFO'
              ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
              : 'bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          Informational
        </button>
      </div>

      {/* Alerts List */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl shadow-slate-950/40">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">Loading alerts...</div>
        ) : alerts.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckCircle className="w-8 h-8 text-emerald-500/60 mx-auto" />
            <div className="text-xs font-semibold text-slate-200">No alerts found</div>
            <p className="text-[11px] text-slate-500">Your home surveillance environment is operating normally.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {alerts.map((alt) => (
              <div
                key={alt.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition ${
                  alt.is_read ? 'opacity-70 bg-slate-950/40' : 'bg-slate-900/80 hover:bg-slate-850/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 shrink-0">
                    {alt.severity === 'WARNING' ? (
                      <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                    ) : alt.severity === 'CRITICAL' ? (
                      <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                        <AlertTriangle className="w-4 h-4" />
                      </div>
                    ) : (
                      <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
                        <Info className="w-4 h-4" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs text-white">{alt.title}</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${
                        alt.severity === 'WARNING' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                        alt.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                        'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                      }`}>
                        {alt.severity}
                      </span>
                      {!alt.is_read && (
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-400" title="Unread"></span>
                      )}
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">{alt.message}</p>
                    <div className="text-[10px] font-mono text-slate-500">
                      {new Date(alt.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  {!alt.is_read && (
                    <button
                      onClick={() => handleMarkRead(alt.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700/80 transition"
                    >
                      Mark Read
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(alt.id)}
                    className="p-1.5 rounded-lg bg-slate-800/40 hover:bg-rose-950/50 hover:text-rose-400 text-slate-400 border border-slate-800 transition"
                    title="Delete Alert"
                    aria-label="Delete Alert"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400 leading-relaxed">
        🛡️ <strong className="text-slate-300">Safety Policy Notice:</strong> This assistive safety system alerts homeowners to observable visual detections and statistical variations. It never contacts emergency authorities automatically.
      </div>
    </div>
  );
}
