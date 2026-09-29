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
  Info
} from 'lucide-react';
import { settingsService } from '../services/api';

export default function Settings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const [formData, setFormData] = useState({
    home_name: 'Suburban Residence',
    home_address: '104 Maple Avenue',
    expected_active_start: '07:00',
    expected_active_end: '23:00',
    confidence_threshold: 0.55,
    detection_cooldown_sec: 5,
    auto_delete_events_days: 30,
    save_snapshots: true,
    notifications_enabled: true
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
            expected_active_start: s?.expected_active_start || '07:00',
            expected_active_end: s?.expected_active_end || '23:00',
            confidence_threshold: s?.confidence_threshold ?? 0.55,
            detection_cooldown_sec: s?.detection_cooldown_sec ?? 5,
            auto_delete_events_days: s?.auto_delete_events_days ?? 30,
            save_snapshots: Boolean(s?.save_snapshots),
            notifications_enabled: Boolean(s?.notifications_enabled)
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
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg(null);
    setErrorMsg(null);
    try {
      await settingsService.updateSettings(formData);
      setSuccessMsg('Settings and privacy preferences updated successfully.');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Failed to save settings.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-400 text-sm">Loading configuration...</div>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <SettingsIcon className="w-6 h-6 text-sky-400" /> System & Privacy Settings
        </h1>
        <p className="text-sm text-slate-400">Manage surveillance parameters, active hours, and data retention</p>
      </div>

      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/50 border border-emerald-900/60 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-900/60 text-xs text-rose-200">
          {errorMsg}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* 1. Home Activity Profile (Specification 14) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Home className="w-4 h-4 text-sky-400" /> Home Profile & Active Hours
          </h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Configure expected activity hours for contextual signals.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Home Name / Label</label>
              <input
                type="text"
                name="home_name"
                value={formData.home_name}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Monitoring Area / Address</label>
              <input
                type="text"
                name="home_address"
                value={formData.home_address}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Expected Active Start
              </label>
              <input
                type="time"
                name="expected_active_start"
                value={formData.expected_active_start}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-400" /> Expected Active End (Quiet Period Starts)
              </label>
              <input
                type="time"
                name="expected_active_end"
                value={formData.expected_active_end}
                onChange={handleChange}
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-white focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-slate-400 flex items-start gap-2">
            <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <span>
              <strong>Contextual Signal Notice:</strong> The quiet period ({formData.expected_active_end} &ndash; {formData.expected_active_start}) is used strictly as a statistical input. Activity during quiet hours is not presumed to be dangerous.
            </span>
          </div>
        </div>

        {/* 2. AI Detection Sensitivity */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-400" /> AI Detection Parameters
          </h2>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                <span>Minimum Confidence Threshold</span>
                <span className="font-mono text-sky-400">{Math.round(formData.confidence_threshold * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.30"
                max="0.95"
                step="0.05"
                name="confidence_threshold"
                value={formData.confidence_threshold}
                onChange={handleChange}
                className="w-full accent-sky-400 cursor-pointer"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Lower values detect more objects with higher false positive risk; higher values only trigger on clear view.
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Detection Event Cooldown (Seconds)</label>
              <input
                type="number"
                min="1"
                max="60"
                name="detection_cooldown_sec"
                value={formData.detection_cooldown_sec}
                onChange={handleChange}
                className="w-32 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-white focus:outline-none focus:border-sky-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Cooldown prevents repetitive database events while an object remains in the frame.
              </p>
            </div>
          </div>
        </div>

        {/* 3. Privacy & Data Retention (Specification 15) */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-400" /> Privacy & Data Retention
          </h2>

          <div className="space-y-3 text-xs">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Automatic Event Deletion Period</label>
              <select
                name="auto_delete_events_days"
                value={formData.auto_delete_events_days}
                onChange={handleChange}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
              >
                <option value="7">7 Days</option>
                <option value="14">14 Days</option>
                <option value="30">30 Days (Recommended)</option>
                <option value="90">90 Days</option>
              </select>
              <p className="text-[11px] text-slate-500 mt-1">
                Historical records older than this retention period are safely purged.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <input
                type="checkbox"
                id="save_snapshots"
                name="save_snapshots"
                checked={formData.save_snapshots}
                onChange={handleChange}
                className="w-4 h-4 rounded accent-sky-400 cursor-pointer"
              />
              <label htmlFor="save_snapshots" className="text-xs text-slate-300 cursor-pointer">
                Save snapshot images for verified detections
              </label>
            </div>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-lg shadow-sky-500/20 disabled:opacity-50 transition"
          >
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
