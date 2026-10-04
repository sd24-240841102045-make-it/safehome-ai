import React, { useState, useEffect } from 'react';
import { 
  Sliders, 
  Shield, 
  ShieldAlert, 
  ShieldOff, 
  Moon, 
  Home, 
  Plus, 
  Check, 
  Trash2, 
  RefreshCw, 
  Clock, 
  AlertTriangle, 
  Bell, 
  Volume2 
} from 'lucide-react';
import { ruleService } from '../services/api';

export default function Rules() {
  const [currentMode, setCurrentMode] = useState('home');
  const [armingDelay, setArmingDelay] = useState(0);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // New rule form state
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState('person');
  const [newRuleModes, setNewRuleModes] = useState(['home', 'away', 'night']);
  const [newRuleSeverity, setNewRuleSeverity] = useState('WARNING');
  const [newRuleAction, setNewRuleAction] = useState('alert');
  const [newRuleConfidence, setNewRuleConfidence] = useState(0.50);

  const fetchModeAndRules = async () => {
    try {
      setLoading(true);
      setErrorMsg(null);
      const [modeRes, rulesRes] = await Promise.all([
        ruleService.getHomeMode(),
        ruleService.getRules()
      ]);

      if (modeRes.data?.success) {
        setCurrentMode(modeRes.data.current_mode || 'home');
        setArmingDelay(modeRes.data.arming_delay_s || 0);
      }

      if (rulesRes.data?.success) {
        setRules(rulesRes.data.rules || []);
      }
    } catch (err) {
      console.error('[Rules] Fetch error:', err);
      setErrorMsg('Failed to load rules and mode configuration.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModeAndRules();
  }, []);

  const handleSetMode = async (mode) => {
    try {
      setSavingMode(true);
      setErrorMsg(null);
      const res = await ruleService.setHomeMode(mode, armingDelay);

      if (res.data?.success) {
        setCurrentMode(res.data.current_mode);
        setSuccessMsg(`Armed mode updated to ${mode.toUpperCase()}`);
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err) {
      console.error('[Rules] Set mode error:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to update armed mode.');
    } finally {
      setSavingMode(false);
    }
  };

  const handleToggleRule = async (ruleId, currentEnabled) => {
    try {
      const res = await ruleService.updateRule(ruleId, { is_enabled: !currentEnabled });
      if (res.data?.success) {
        setRules(rules.map(r => r.id === ruleId ? { ...r, is_enabled: !currentEnabled } : r));
        setSuccessMsg(`Rule ${!currentEnabled ? 'enabled' : 'disabled'} successfully.`);
        setTimeout(() => setSuccessMsg(null), 2500);
      }
    } catch (err) {
      console.error('[Rules] Toggle error:', err);
      setErrorMsg('Failed to toggle rule state.');
    }
  };

  const handleDeleteRule = async (ruleId) => {
    try {
      const res = await ruleService.deleteRule(ruleId);
      if (res.data?.success) {
        setRules(rules.filter(r => r.id !== ruleId));
        setSuccessMsg('Rule deleted successfully.');
        setTimeout(() => setSuccessMsg(null), 2500);
      }
    } catch (err) {
      console.error('[Rules] Delete error:', err);
      setErrorMsg('Failed to delete rule.');
    }
  };

  const handleCreateRule = async (e) => {
    e.preventDefault();
    try {
      const res = await ruleService.createRule({
        name: newRuleName,
        target_categories: [newRuleCategory],
        modes: newRuleModes,
        severity: newRuleSeverity,
        action: newRuleAction,
        min_confidence: parseFloat(newRuleConfidence)
      });

      if (res.data?.success) {
        setShowCreateModal(false);
        setNewRuleName('');
        setSuccessMsg('New detection rule created successfully.');
        setTimeout(() => setSuccessMsg(null), 3000);
        fetchModeAndRules();
      }
    } catch (err) {
      console.error('[Rules] Create error:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to create rule.');
    }
  };

  const toggleModeSelection = (modeId) => {
    setNewRuleModes(prev => 
      prev.includes(modeId) 
        ? prev.filter(m => m !== modeId) 
        : [...prev, modeId]
    );
  };

  const modesConfig = [
    { id: 'home', label: 'Home Mode', desc: 'Discreet alerts for unexpected activity while occupants are home.', icon: Home, color: 'sky' },
    { id: 'away', label: 'Away Mode', desc: 'High-security mode. Persons trigger instant intrusion alerts.', icon: ShieldAlert, color: 'rose' },
    { id: 'night', label: 'Night Mode', desc: 'Enhanced perimeter surveillance during quiet sleep hours.', icon: Moon, color: 'purple' },
    { id: 'disarmed', label: 'Disarmed', desc: 'Sensors continue logging detections without sounding alerts.', icon: ShieldOff, color: 'slate' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Sliders className="w-5 h-5" />
            </div>
            Modes & Detection Rules
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Configure armed states, arming delays, and closed-typed AI trigger rules
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold flex items-center gap-2 shadow-sm transition self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Create Custom Rule
        </button>
      </div>

      {successMsg && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/50 text-xs text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-900/50 text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Mode Selector Matrix */}
      <div className="space-y-3">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
          <Shield className="w-4 h-4 text-sky-400" /> Active Armed Mode
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {modesConfig.map(m => {
            const Icon = m.icon;
            const isActive = currentMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleSetMode(m.id)}
                disabled={savingMode}
                className={`p-4 rounded-xl border text-left transition relative ${
                  isActive
                    ? 'bg-slate-900 border-sky-500/80 shadow-md shadow-sky-500/10 ring-1 ring-sky-500/40'
                    : 'bg-slate-900/70 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                {isActive && (
                  <span className="absolute top-3 right-3 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold bg-sky-500 text-slate-950 flex items-center gap-1">
                    <Check className="w-3 h-3" /> ACTIVE
                  </span>
                )}

                <Icon className={`w-5 h-5 mb-2.5 ${isActive ? 'text-sky-400' : 'text-slate-400'}`} />
                <h3 className="text-xs font-bold text-white mb-0.5">{m.label}</h3>
                <p className="text-[11px] text-slate-400 leading-relaxed">{m.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-400" /> Configured Detection Rules ({rules.length})
          </h2>
          <button onClick={fetchModeAndRules} className="text-xs text-slate-400 hover:text-white flex items-center gap-1">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-slate-500">Loading rules...</div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-xs">
            No rules configured yet. Default safety matrix is active.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rules.map(rule => (
              <div
                key={rule.id}
                className={`p-4 rounded-2xl border transition space-y-3 ${
                  rule.is_enabled
                    ? 'bg-slate-900/60 border-slate-800'
                    : 'bg-slate-950/40 border-slate-900 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-white">{rule.name}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{rule.description || 'Target detection rule'}</p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleRule(rule.id, rule.is_enabled)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                        rule.is_enabled
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {rule.is_enabled ? 'Enabled' : 'Disabled'}
                    </button>
                    {!rule.is_default && (
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    Target: {Array.isArray(rule.target_categories) ? rule.target_categories.join(', ') : rule.target_categories}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    Modes: {Array.isArray(rule.modes) ? rule.modes.join(', ') : rule.modes}
                  </span>
                  <span className={`px-2 py-0.5 rounded font-bold ${
                    rule.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400' :
                    rule.severity === 'WARNING' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-sky-500/20 text-sky-400'
                  }`}>
                    {rule.severity}
                  </span>
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                    Action: {rule.action}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Create Custom Detection Rule</h3>

            <form onSubmit={handleCreateRule} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Driveway Vehicle Watch"
                  value={newRuleName}
                  onChange={e => setNewRuleName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Target Object</label>
                  <select
                    value={newRuleCategory}
                    onChange={e => setNewRuleCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="person">Person</option>
                    <option value="vehicle">Vehicle</option>
                    <option value="animal">Animal</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Severity</label>
                  <select
                    value={newRuleSeverity}
                    onChange={e => setNewRuleSeverity(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                  >
                    <option value="INFO">INFO</option>
                    <option value="WARNING">WARNING</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
              </div>

              {/* Mode Checkboxes */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Apply in Modes</label>
                <div className="grid grid-cols-3 gap-2">
                  {['home', 'away', 'night'].map(mode => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => toggleModeSelection(mode)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition border ${
                        newRuleModes.includes(mode)
                          ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                          : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {newRuleModes.includes(mode) ? '✓ ' : ''}{mode.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Action</label>
                <select
                  value={newRuleAction}
                  onChange={e => setNewRuleAction(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                >
                  <option value="alert">Send Dashboard Alert</option>
                  <option value="alarm">Sound Audio Alarm + Alert</option>
                  <option value="log_only">Silent Log Only</option>
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs"
                >
                  Save Rule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
