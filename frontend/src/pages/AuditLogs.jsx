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
  Sliders
} from 'lucide-react';
import { auditService } from '../services/api';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState('console'); // 'console' | 'table'

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filterType !== 'all') params.event_type = filterType;
      const res = await auditService.getAuditLogs(params);
      if (res.data?.success) {
        setLogs(res.data.data || []);
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
          <button
            onClick={fetchLogs}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-800 hover:border-slate-700 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={handleCopyText}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 text-xs font-medium border border-slate-800 hover:border-slate-700 transition"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied Log' : 'Copy Text'}
          </button>
          <button
            onClick={handleDownloadLog}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-xs shadow-sm transition"
          >
            <Download className="w-3.5 h-3.5" />
            Download .log
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="sm:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search log by keyword, IP, action, or timestamp..."
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
            <option value="all">All Event Types</option>
            <option value="user_login">Logins & Authentication</option>
            <option value="device_paired">Device Pairing & Unpairing</option>
            <option value="monitoring_started">Monitoring Streams</option>
            <option value="mode_changed">Armed Mode Changes</option>
            <option value="settings_updated">Settings & Privacy Updates</option>
            <option value="alert_resolved">Alert Acknowledgments</option>
            <option value="data_purged">Data Retention Purges</option>
            <option value="complete_data_erased">GDPR Data Erasures</option>
          </select>
        </div>
      </div>

      {/* Plain Text Console Terminal Log Viewer */}
      <div className="bg-slate-950 border border-slate-800/80 rounded-2xl p-4 shadow-xl shadow-slate-950/60 space-y-3 font-mono">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-slate-200">audit.log</span>
            <span className="text-[11px] text-slate-500">({filteredLogs.length} events logged)</span>
          </div>
          <div className="text-[11px] text-slate-500">UTF-8 • Plain Text Stream</div>
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
    </div>
  );
}
