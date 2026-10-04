import React, { useState, useEffect } from 'react';
import { Bell, CheckCircle, AlertTriangle, Info, Trash2, CheckCheck, ShieldAlert, X, RefreshCw } from 'lucide-react';
import { alertService } from '../services/api';

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [filterSeverity, setFilterSeverity] = useState('');
  const [filterUnreadOnly, setFilterUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [deleteModalAlert, setDeleteModalAlert] = useState(null);
  const [markAllModalOpen, setMarkAllModalOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

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

  useEffect(() => { fetchAlerts(); }, [filterSeverity, filterUnreadOnly]);

  const handleAction = async (action, id) => {
    try {
      setActionLoading(true);
      if (action === 'read') await alertService.markRead(id);
      else if (action === 'readAll') {
        await alertService.markAllRead();
        setMarkAllModalOpen(false);
      } else if (action === 'delete') {
        await alertService.deleteAlert(id);
        setDeleteModalAlert(null);
      }
      fetchAlerts();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  const getSeverityBadge = (sev) => {
    const map = {
      WARNING: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      CRITICAL: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      INFO: 'bg-sky-500/20 text-sky-300 border-sky-500/30'
    };
    return map[sev] || map.INFO;
  };

  return (
    <div className="space-y-6">
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
            onClick={() => setMarkAllModalOpen(true)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 text-xs font-semibold transition cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5 text-sky-400" /> Mark All Read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {[
          { label: 'All Alerts', active: !filterSeverity && !filterUnreadOnly, onClick: () => { setFilterSeverity(''); setFilterUnreadOnly(false); } },
          { label: `Unread (${unreadCount})`, active: filterUnreadOnly, onClick: () => setFilterUnreadOnly(!filterUnreadOnly) },
          { label: 'Warnings', active: filterSeverity === 'WARNING', onClick: () => setFilterSeverity(filterSeverity === 'WARNING' ? '' : 'WARNING') },
          { label: 'Informational', active: filterSeverity === 'INFO', onClick: () => setFilterSeverity(filterSeverity === 'INFO' ? '' : 'INFO') }
        ].map((tab, i) => (
          <button
            key={i}
            onClick={tab.onClick}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer ${
              tab.active ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm' : 'bg-slate-900/90 border border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Alerts List */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
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
                    <div className={`p-2 rounded-xl border ${alt.severity === 'CRITICAL' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : alt.severity === 'WARNING' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-sky-500/10 border-sky-500/20 text-sky-400'}`}>
                      {alt.severity === 'INFO' ? <Info className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-xs text-white">{alt.title}</span>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold border ${getSeverityBadge(alt.severity)}`}>
                        {alt.severity}
                      </span>
                      {!alt.is_read && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
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
                      onClick={() => handleAction('read', alt.id)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium border border-slate-700/80 transition cursor-pointer"
                    >
                      Mark Read
                    </button>
                  )}
                  <button
                    onClick={() => setDeleteModalAlert(alt)}
                    className="p-1.5 rounded-lg bg-slate-800/40 hover:bg-rose-950/50 hover:text-rose-400 text-slate-400 border border-slate-800 transition cursor-pointer"
                    title="Delete Alert"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs text-slate-400 leading-relaxed flex items-center gap-2">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <div>
          <strong className="text-slate-300">Safety Policy Notice:</strong> Assistive safety system alerting homeowners to observable visual detections and variations.
        </div>
      </div>

      {/* Delete Single Alert Confirmation Modal */}
      {deleteModalAlert && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-rose-400 font-bold text-sm">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <Trash2 className="w-4 h-4" />
                </div>
                <span>Delete Alert Record</span>
              </div>
              <button
                onClick={() => setDeleteModalAlert(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-300">
              <p>Are you sure you want to permanently delete this alert?</p>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="font-semibold text-white">{deleteModalAlert.title}</div>
                <div className="text-[11px] text-slate-400 line-clamp-2">{deleteModalAlert.message}</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalAlert(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAction('delete', deleteModalAlert.id)}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {actionLoading ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark All Read Confirmation Modal */}
      {markAllModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-sky-400 font-bold text-sm">
                <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20">
                  <CheckCheck className="w-4 h-4" />
                </div>
                <span>Mark All as Read</span>
              </div>
              <button
                onClick={() => setMarkAllModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Are you sure you want to mark all <span className="font-bold text-white font-mono">{unreadCount}</span> unread alerts as read?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMarkAllModalOpen(false)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAction('readAll')}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5" />}
                {actionLoading ? 'Updating...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

