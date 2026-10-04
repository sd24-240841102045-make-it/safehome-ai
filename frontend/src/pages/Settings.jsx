import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Shield,
  Clock,
  Sliders,
  Trash2,
  Save,
  CheckCircle,
  Home,
  Info,
  Download,
  AlertTriangle,
  RefreshCw,
  FileText,
  Lock
} from 'lucide-react';
import { settingsService } from '../services/api';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [eraseModalOpen, setEraseModalOpen] = useState(false);
  const [erasePhrase, setErasePhrase] = useState('');
  const [erasing, setErasing] = useState(false);

  const [formData, setFormData] = useState({
    home_name: 'Suburban Residence',
    home_address: '104 Maple Avenue',
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    expected_active_start: '07:00',
    expected_active_end: '23:00',
    notification_quiet_hours_start: '22:00',
    notification_quiet_hours_end: '07:00',
    confidence_threshold: 0.50,
    event_cooldown_sec: 30,
    snapshot_retention_days: 7,
    event_retention_days: 90,
    save_snapshots: true,
    opt_in_live_preview: false,
    audio_enabled: false
  });

  useEffect(() => {
    async function loadSettings() {
      try {
        const res = await settingsService.getSettings();
        if (res.data.success) {
          const s = res.data.settings;
          const h = res.data.home;
          setFormData({
            home_name: h?.name || 'Suburban Residence',
            home_address: h?.address || '',
            timezone: h?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            expected_active_start: s?.expected_active_start || '07:00',
            expected_active_end: s?.expected_active_end || '23:00',
            notification_quiet_hours_start: s?.notification_quiet_hours_start || '22:00',
            notification_quiet_hours_end: s?.notification_quiet_hours_end || '07:00',
            confidence_threshold: s?.confidence_threshold ?? 0.50,
            event_cooldown_sec: s?.event_cooldown_sec ?? 30,
            snapshot_retention_days: s?.snapshot_retention_days ?? 7,
            event_retention_days: s?.event_retention_days ?? 90,
            save_snapshots: s?.save_snapshots !== 0,
            opt_in_live_preview: Boolean(s?.opt_in_live_preview),
            audio_enabled: Boolean(s?.audio_enabled)
          });
        }
      } catch (err) {
        console.error('Error loading settings:', err);
      } finally {
        setLoading(false);
      }
    }
    loadSettings();
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox'
          ? checked
          : (type === 'number' || type === 'range' || name.includes('retention') || name.includes('cooldown') || name === 'confidence_threshold')
          ? Number(value)
          : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      const payload = {
        ...formData,
        confidence_threshold: Number(formData.confidence_threshold),
        event_cooldown_sec: Number(formData.event_cooldown_sec),
        snapshot_retention_days: Number(formData.snapshot_retention_days),
        event_retention_days: Number(formData.event_retention_days),
        save_snapshots: Boolean(formData.save_snapshots),
        opt_in_live_preview: Boolean(formData.opt_in_live_preview),
        audio_enabled: Boolean(formData.audio_enabled)
      };
      await settingsService.updateSettings(payload);
      setSuccessMsg('Settings and privacy retention preferences saved successfully.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  const handlePurge = async () => {
    setPurging(true);
    setErrorMsg(null);
    try {
      const res = await settingsService.purgeExpiredData();
      setPurgeModalOpen(false);
      const purged = res.data.purged;
      setSuccessMsg(
        `Data retention purge complete! Removed ${purged.deleted_snapshots} snapshot files and ${purged.deleted_events} expired events.`
      );
      setTimeout(() => setSuccessMsg(null), 5000);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to execute data retention purge.');
    } finally {
      setPurging(false);
    }
  };

  const handleExportData = async () => {
    setExporting(true);
    setErrorMsg(null);
    try {
      const res = await settingsService.exportData();
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(res.data, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      downloadAnchor.setAttribute('download', `safehome-gdpr-export-${new Date().toISOString().slice(0, 10)}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      setSuccessMsg('GDPR data archive exported successfully as JSON.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to export user archive.');
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-400 text-sm">Loading configuration...</div>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Page Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <SettingsIcon className="w-5 h-5" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">System &amp; Privacy Settings</h1>
        </div>
        <p className="text-xs text-slate-400">
          Manage surveillance parameters, active hours, automated data retention, and privacy safeguards
        </p>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-800/60 text-xs text-emerald-200 flex items-center gap-2.5">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-800/60 text-xs text-rose-200 flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Home Activity Profile */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-800/80 pb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Home className="w-4 h-4 text-sky-400" /> Home Profile &amp; Active Hours
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Configure expected activity hours for contextual signals.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Home Name / Label</label>
              <input
                type="text"
                name="home_name"
                value={formData.home_name}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Monitoring Area / Address</label>
              <input
                type="text"
                name="home_address"
                value={formData.home_address}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition"
              />
            </div>

            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-sky-400" /> Home Timezone (IANA)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    if (detected) {
                      setFormData(prev => ({ ...prev, timezone: detected }));
                    }
                  }}
                  className="text-[11px] text-sky-400 hover:text-sky-300 font-medium transition"
                >
                  ⚡ Auto-Detect Local ({Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'})
                </button>
              </div>
              <input
                type="text"
                name="timezone"
                value={formData.timezone}
                onChange={handleChange}
                placeholder="e.g. Asia/Kolkata, America/New_York, Europe/London"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Used for hourly analytics profiles, quiet hour safety checks, and event timestamps.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Expected Active Start
              </label>
              <input
                type="time"
                name="expected_active_start"
                value={formData.expected_active_start}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Expected Active End
              </label>
              <input
                type="time"
                name="expected_active_end"
                value={formData.expected_active_end}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-400" /> Notification Quiet Hours Start
              </label>
              <input
                type="time"
                name="notification_quiet_hours_start"
                value={formData.notification_quiet_hours_start}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-purple-400" /> Notification Quiet Hours End
              </label>
              <input
                type="time"
                name="notification_quiet_hours_end"
                value={formData.notification_quiet_hours_end}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-white focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <span>
              <strong className="text-slate-200">Quiet Hours Notice:</strong> Standard notifications are suppressed between {formData.notification_quiet_hours_start} &ndash; {formData.notification_quiet_hours_end}. High-severity safety alerts will still bypass quiet hours.
            </span>
          </div>
        </div>

        {/* 2. AI Detection Sensitivity & Cooldown */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-800/80 pb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" /> AI Detection Parameters
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tune sensitivity thresholds and cooldown windows for edge inference.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1.5">
                <span>Minimum Confidence Threshold</span>
                <span className="font-mono text-sky-400 font-bold">{Math.round(formData.confidence_threshold * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.30"
                max="0.95"
                step="0.05"
                name="confidence_threshold"
                value={formData.confidence_threshold}
                onChange={handleChange}
                className="w-full h-2 bg-slate-950 rounded-lg appearance-none cursor-pointer accent-sky-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Lower values detect objects with higher sensitivity; higher values require high confidence before recording.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Event Cooldown Window (Seconds)</label>
              <input
                type="number"
                min="5"
                max="300"
                name="event_cooldown_sec"
                value={formData.event_cooldown_sec}
                onChange={handleChange}
                className="w-32 px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Prevents duplicate alerts and events while the same subject remains continuously in view.
              </p>
            </div>
          </div>
        </div>

        {/* 3. Privacy & Automated Data Retention */}
        <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-800/80 pb-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-400" /> Privacy Safeguards &amp; Sensor Options
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Control local file retention schedules and hardware telemetry sensors.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Snapshot Image Retention</label>
              <select
                name="snapshot_retention_days"
                value={formData.snapshot_retention_days}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition cursor-pointer"
              >
                <option value="3">3 Days</option>
                <option value="7">7 Days (Default)</option>
                <option value="14">14 Days</option>
                <option value="30">30 Days</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Snapshot files on disk older than this period are unlinked and permanently deleted.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">Event Record Retention</label>
              <select
                name="event_retention_days"
                value={formData.event_retention_days}
                onChange={handleChange}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 transition cursor-pointer"
              >
                <option value="30">30 Days</option>
                <option value="60">60 Days</option>
                <option value="90">90 Days (Default)</option>
                <option value="180">180 Days</option>
                <option value="365">1 Year</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Audit event rows and linked alerts are purged once they exceed this threshold.
              </p>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                id="save_snapshots"
                name="save_snapshots"
                checked={formData.save_snapshots}
                onChange={handleChange}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-0 cursor-pointer accent-sky-500"
              />
              <span className="text-xs text-slate-300">
                Save local snapshot images on verified detections (stored strictly on local laptop)
              </span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                id="opt_in_live_preview"
                name="opt_in_live_preview"
                checked={formData.opt_in_live_preview}
                onChange={handleChange}
                className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-0 cursor-pointer accent-sky-500"
              />
              <span className="text-xs text-slate-300">
                Enable live video stream relay to dashboard (requires active session)
              </span>
            </label>

            {/* Audio Anomaly Detection (Opt-in Only) */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 space-y-2">
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  id="audio_enabled"
                  name="audio_enabled"
                  checked={formData.audio_enabled}
                  onChange={handleChange}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-purple-500 focus:ring-0 cursor-pointer accent-purple-500"
                />
                <span className="text-xs font-semibold text-slate-200">
                  Opt-in: Audio Decibel Spike &amp; Loud Noise Detection (Phase 8)
                </span>
              </label>
              <p className="text-[11px] text-slate-400 pl-7 leading-relaxed">
                🛡️ <strong className="text-slate-300">Privacy Protection Guarantee:</strong> Raw audio waveforms are <em>never recorded, saved to disk, or sent to external servers</em>. Audio is processed purely transiently in-memory on the phone sensor node to detect sudden acoustic energy spikes.
              </p>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-sm disabled:opacity-50 transition cursor-pointer"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {/* 4. Privacy Actions: On-Demand Purge & GDPR Data Export */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="border-b border-slate-800/80 pb-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-sky-400" /> Data Management &amp; GDPR Rights
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Enforce local retention immediately, export your complete activity audit log for portability, or perform complete erasure.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            onClick={() => setPurgeModalOpen(true)}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 text-xs font-semibold transition cursor-pointer"
          >
            <Trash2 className="w-4 h-4 text-amber-400" />
            Purge Expired Data Now
          </button>

          <button
            type="button"
            onClick={handleExportData}
            disabled={exporting}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-semibold transition disabled:opacity-50 cursor-pointer"
          >
            <Download className="w-4 h-4 text-sky-400" />
            {exporting ? 'Generating Archive...' : 'Export All My Data (JSON)'}
          </button>

          <button
            type="button"
            onClick={() => {
              setErasePhrase('');
              setEraseModalOpen(true);
            }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold transition cursor-pointer"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            Erase All My Data (GDPR Wipe)
          </button>
        </div>
      </div>

      {/* Purge Confirmation Modal */}
      {purgeModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Execute Data Retention Purge?</h3>
                <p className="text-xs text-slate-400">Enforce configured retention limits immediately.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-400">Snapshot purge cutoff:</span>
                <span className="font-mono text-amber-400 font-semibold">&gt; {formData.snapshot_retention_days} days old</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Event record purge cutoff:</span>
                <span className="font-mono text-amber-400 font-semibold">&gt; {formData.event_retention_days} days old</span>
              </div>
              <p className="text-[11px] text-slate-500 pt-1.5 border-t border-slate-800">
                Expired image files on local disk will be permanently unlinked.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setPurgeModalOpen(false)}
                disabled={purging}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handlePurge}
                disabled={purging}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition disabled:opacity-50 cursor-pointer"
              >
                {purging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {purging ? 'Purging...' : 'Confirm Purge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Complete Data Erasure Modal (Hard Wipe) */}
      {eraseModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Permanent Data Erasure (GDPR)</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              All stored events, alert histories, sessions, incidents, pairing keys, and physical snapshot image files on disk will be immediately and permanently unlinked and erased.
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5">
                Type <span className="font-mono text-rose-400 font-bold">DELETE ALL MY DATA</span> to confirm:
              </label>
              <input
                type="text"
                value={erasePhrase}
                onChange={(e) => setErasePhrase(e.target.value)}
                placeholder="DELETE ALL MY DATA"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30 transition"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEraseModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={erasePhrase !== 'DELETE ALL MY DATA' || erasing}
                onClick={async () => {
                  try {
                    setErasing(true);
                    const res = await settingsService.eraseAllData(erasePhrase);
                    setEraseModalOpen(false);
                    setSuccessMsg(res.data.message || 'All data wiped successfully.');
                    setTimeout(() => setSuccessMsg(null), 5000);
                  } catch (err) {
                    setErrorMsg(err.response?.data?.error || 'Failed to erase data.');
                  } finally {
                    setErasing(false);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition disabled:opacity-40 cursor-pointer"
              >
                {erasing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {erasing ? 'Erasing...' : 'Permanently Erase Everything'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
