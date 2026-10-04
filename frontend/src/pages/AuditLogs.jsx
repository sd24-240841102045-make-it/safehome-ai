import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  RefreshCw,
  Clock,
  Download,
  Copy,
  Check,
  Terminal,
  ShieldAlert,
  Sliders,
  Layers,
  UserCheck,
  Smartphone,
  Shield,
  Key,
  Trash2,
  Lock,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { auditService } from '../services/api';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' | 'terminal'
  const [expandedLogId, setExpandedLogId] = useState(null);

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterType !== 'all') params.event_type = filterType;
      const res = await auditService.getAuditLogs(params);
      if (res.data?.success) {
        setLogs(res.data.logs || res.data.data || []);
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterType]);

  const formatLogLine = (log) => {
    const ts = new Date(log.created_at).toISOString().replace('T', ' ').slice(0, 19);
    const ip = log.ip_address || '127.0.0.1';
    const tag = (log.event_type || 'INFO').toUpperCase();
    const resType = log.resource_type || 'SYSTEM';
    const details = typeof log.details === 'object' && log.details !== null 
      ? JSON.stringify(log.details) 
      : log.details || '{}';

    let summaryText = '';
    switch (log.event_type) {
      case 'user_login':
        summaryText = `User login verified successfully (IP: ${ip})`;
        break;
      case 'user_registered':
        summaryText = `New user profile registered`;
        break;
      case 'device_paired':
        summaryText = `New sensor node paired: ${log.details?.device_name || log.resource_id || 'Camera Node'}`;
        break;
      case 'device_unpaired':
        summaryText = `Device node unpaired: ${log.resource_id || ''}`;
        break;
      case 'monitoring_started':
        summaryText = `Live camera monitoring started on device [${log.resource_id || 'Camera'}]`;
        break;
      case 'monitoring_stopped':
        summaryText = `Monitoring stopped on device [${log.resource_id || 'Camera'}]. Duration: ${log.details?.duration_seconds || 0}s, Frames: ${log.details?.frame_count || 0}`;
        break;
      case 'mode_changed':
        summaryText = `Armed security mode changed to "${(log.details?.new_mode || 'HOME').toUpperCase()}"`;
        break;
      case 'settings_updated':
        summaryText = `System configuration & privacy settings modified`;
        break;
      case 'feedback_submitted':
        summaryText = `Operator feedback logged: ${log.details?.feedback || 'reviewed'}`;
        break;
      case 'alert_resolved':
        summaryText = `Alert resolved by user: ${log.details?.title || log.resource_id || 'Security Alert'}`;
        break;
      case 'data_purged':
        summaryText = `Privacy retention purge executed: Removed ${log.details?.deleted_snapshots || 0} snapshots, ${log.details?.deleted_events || 0} events`;
        break;
      case 'complete_data_erased':
        summaryText = `GDPR Right-to-Erasure hard wipe executed. All user surveillance records purged.`;
        break;
      default:
        summaryText = `${log.event_type} on ${resType} (${details})`;
    }

    return `[${ts}] [${tag}] [IP: ${ip}] [${resType}] — ${summaryText}`;
  };

  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const formatted = formatLogLine(log).toLowerCase();
    return (
      formatted.includes(query) ||
      log.event_type?.toLowerCase().includes(query) ||
      log.resource_type?.toLowerCase().includes(query) ||
      log.ip_address?.toLowerCase().includes(query)
    );
  });

  const getPlainTextOutput = () => {
    if (filteredLogs.length === 0) return '# SafeHome AI Security Audit Log — No records matching query.';
    const header = [
      '# ============================================================================== #',
      '# SafeHome AI — Security & Administrative Audit Trail (Text Format)',
      `# Exported: ${new Date().toISOString()}`,
      `# Total Records: ${filteredLogs.length}`,
      '# ============================================================================== #\n'
    ].join('\n');

    const lines = filteredLogs.map((log) => formatLogLine(log)).join('\n');
    return `${header}\n${lines}`;
  };

  const handleCopyText = () => {
    navigator.clipboard.writeText(getPlainTextOutput());
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleDownloadLog = () => {
    const text = getPlainTextOutput();
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `safehome-security-audit-${new Date().toISOString().slice(0, 10)}.log`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getEventBadge = (eventType) => {
    if (eventType.includes('login') || eventType.includes('register')) {
      return { bg: 'bg-purple-500/10 text-purple-300 border-purple-500/20', icon: UserCheck, label: 'AUTH' };
    }
    if (eventType.includes('device') || eventType.includes('monitoring')) {
      return { bg: 'bg-sky-500/10 text-sky-300 border-sky-500/20', icon: Smartphone, label: 'DEVICE' };
    }
    if (eventType.includes('mode')) {
      return { bg: 'bg-amber-500/10 text-amber-300 border-amber-500/20', icon: Shield, label: 'MODE' };
    }
    if (eventType.includes('erase') || eventType.includes('purge') || eventType.includes('delete')) {
      return { bg: 'bg-rose-500/10 text-rose-300 border-rose-500/20', icon: Trash2, label: 'PRIVACY' };
    }
    return { bg: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20', icon: Lock, label: 'SYSTEM' };
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Terminal className="w-5 h-5" />
            </div>
            Security Audit Trail
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Immutable log of user authentications, sensor node pairings, armed mode shifts, and security decisions
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* View Switcher */}
          <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-0.5 text-xs font-medium">
            <button
              onClick={() => setViewMode('table')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                viewMode === 'table'
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Structured Table</span>
            </button>
            <button
              onClick={() => setViewMode('terminal')}
              className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                viewMode === 'terminal'
                  ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Terminal .log</span>
            </button>
          </div>

          <button
            onClick={fetchLogs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-800 hover:border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleCopyText}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-800 hover:border-slate-700 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button
            onClick={handleDownloadLog}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export .log</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search log by keyword, IP, action, resource, or timestamp..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500 font-mono transition-colors"
          />
        </div>

        <div>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
          >
            <option value="all">All Event Types ({logs.length})</option>
            <option value="user_login">User Authentication</option>
            <option value="monitoring_started">Monitoring Started / Stopped</option>
            <option value="device_paired">Device Pairings</option>
            <option value="mode_changed">Armed Security Modes</option>
            <option value="settings_updated">Settings & Configurations</option>
            <option value="alert_resolved">Alert Acknowledgments</option>
            <option value="data_purged">Data Purges & Wipes</option>
          </select>
        </div>
      </div>

      {/* ── STRUCTURED TABLE VIEW ── */}
      {viewMode === 'table' && (
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between text-xs font-semibold text-slate-400">
            <span>Security Operations Trail ({filteredLogs.length} entries)</span>
            <span className="font-mono text-[11px] text-slate-500">Immutable Storage</span>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
              <span>Fetching security audit entries...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs">
              No audit log records found matching the current query.
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80 max-h-[680px] overflow-y-auto">
              {filteredLogs.map((log) => {
                const badge = getEventBadge(log.event_type);
                const BadgeIcon = badge.icon;
                const isExpanded = expandedLogId === log.id;

                return (
                  <div key={log.id} className="p-4 hover:bg-slate-850/50 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className={`p-2 rounded-xl border shrink-0 ${badge.bg}`}>
                          <BadgeIcon className="w-4 h-4" />
                        </div>

                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                              {log.event_type.replace(/_/g, ' ')}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono border ${badge.bg}`}>
                              {badge.label}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              {log.resource_type} • ID: {log.resource_id || 'System'}
                            </span>
                          </div>

                          <div className="text-xs text-slate-300">
                            {formatLogLine(log).split(' — ')[1] || log.event_type}
                          </div>
                        </div>
                      </div>

                      <div className="flex sm:flex-col items-end justify-between gap-1 text-right shrink-0">
                        <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-500" />
                          {new Date(log.created_at).toLocaleString()}
                        </span>
                        {log.ip_address && (
                          <span className="text-[10px] font-mono text-slate-500">
                            IP: {log.ip_address}
                          </span>
                        )}
                        {log.details && (
                          <button
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className="text-[10px] text-sky-400 hover:text-sky-300 font-mono underline flex items-center gap-0.5 mt-0.5"
                          >
                            {isExpanded ? 'Hide Payload' : 'View Payload'}
                            {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {isExpanded && log.details && (
                      <div className="mt-3 p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] font-mono text-sky-300 overflow-x-auto">
                        <pre className="whitespace-pre-wrap">{JSON.stringify(log.details, null, 2)}</pre>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── PLAIN TEXT TERMINAL LOG STREAM VIEW ── */}
      {viewMode === 'terminal' && (
        <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 shadow-xl shadow-slate-950/60 space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 text-xs">
            <div className="flex items-center gap-2 text-slate-400">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-slate-200">security_audit.log</span>
              <span className="text-[11px] text-slate-500">({filteredLogs.length} events)</span>
            </div>
            <div className="text-[11px] text-slate-500">UTF-8 Plain Text Stream</div>
          </div>

          {loading ? (
            <div className="py-16 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <RefreshCw className="w-5 h-5 animate-spin text-sky-400" />
              <span>Streaming audit records...</span>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 text-center text-slate-500 text-xs">
              [SYS] No audit log records found matching the current query.
            </div>
          ) : (
            <div className="space-y-1.5 overflow-x-auto text-[11px] leading-relaxed max-h-[650px] overflow-y-auto pr-2 select-text">
              {filteredLogs.map((log, index) => {
                const line = formatLogLine(log);
                const isCritical = log.event_type.includes('erase') || log.event_type.includes('purge');
                const isMode = log.event_type.includes('mode');
                const isAuth = log.event_type.includes('login') || log.event_type.includes('register');

                return (
                  <div 
                    key={log.id || index}
                    className={`p-1.5 rounded hover:bg-slate-900/80 transition flex items-start gap-2 ${
                      isCritical ? 'text-rose-300' :
                      isMode ? 'text-amber-300' :
                      isAuth ? 'text-purple-300' :
                      'text-slate-300'
                    }`}
                  >
                    <span className="text-slate-600 select-none text-[10px] w-6 shrink-0 text-right">
                      {index + 1}
                    </span>
                    <span className="break-all whitespace-pre-wrap font-mono">
                      {line}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
