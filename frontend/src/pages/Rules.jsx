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
  Volume2,
  Pencil,
  X
} from 'lucide-react';
import { ruleService } from '../services/api';

export default function Rules() {
  const [currentMode, setCurrentMode] = useState('home');
  const [armingDelay, setArmingDelay] = useState(0);
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingMode, setSavingMode] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [deleteModalRule, setDeleteModalRule] = useState(null);
  const [editModalRule, setEditModalRule] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // New rule form state
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleCategory, setNewRuleCategory] = useState('person');
  const [newRuleModes, setNewRuleModes] = useState(['home', 'away', 'night']);
  const [newRuleSeverity, setNewRuleSeverity] = useState('WARNING');
  const [newRuleAction, setNewRuleAction] = useState('alert');
  const [newRuleConfidence, setNewRuleConfidence] = useState(0.50);

  // Edit rule form state
  const [editForm, setEditForm] = useState({
    name: '',
    target_categories: ['person'],
    modes: ['home', 'away', 'night'],
    severity: 'WARNING',
    action: 'alert',
    min_confidence: 0.50
  });

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
      setActionLoading(true);
      const res = await ruleService.deleteRule(ruleId);
      if (res.data?.success) {
        setRules(rules.filter(r => r.id !== ruleId));
        setDeleteModalRule(null);
        setSuccessMsg('Rule deleted successfully.');
        setTimeout(() => setSuccessMsg(null), 2500);
      }
    } catch (err) {
      console.error('[Rules] Delete error:', err);
      setErrorMsg('Failed to delete rule.');
    } finally {
      setActionLoading(false);
    }
  };

  const openEditModal = (rule) => {
    setEditModalRule(rule);
    setEditForm({
      name: rule.name || '',
      target_categories: Array.isArray(rule.target_categories) ? rule.target_categories : [rule.target_categories || 'person'],
      modes: Array.isArray(rule.modes) ? rule.modes : [rule.modes || 'home'],
      severity: rule.severity || 'WARNING',
      action: rule.action || 'alert',
      min_confidence: rule.min_confidence || 0.50
    });
  };

  const handleUpdateRule = async (e) => {
    e.preventDefault();
    if (!editModalRule) return;
    try {
      setActionLoading(true);
      const res = await ruleService.updateRule(editModalRule.id, editForm);
      if (res.data?.success) {
        setEditModalRule(null);
        setSuccessMsg('Rule updated successfully.');
        setTimeout(() => setSuccessMsg(null), 3000);
        fetchModeAndRules();
      }
    } catch (err) {
      console.error('[Rules] Update error:', err);
      setErrorMsg(err.response?.data?.error || 'Failed to update rule.');
    } finally {
      setActionLoading(false);
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

  const toggleEditModeSelection = (modeId) => {
    setEditForm(prev => ({
      ...prev,
      modes: prev.modes.includes(modeId)
        ? prev.modes.filter(m => m !== modeId)
        : [...prev.modes, modeId]
    }));
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

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleToggleRule(rule.id, rule.is_enabled)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer ${
                        rule.is_enabled
                          ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {rule.is_enabled ? 'Enabled' : 'Disabled'}
                    </button>

                    <button
                      onClick={() => openEditModal(rule)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-sky-300 hover:bg-slate-800 transition cursor-pointer"
                      title="Edit Rule"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>

                    {!rule.is_default && (
                      <button
                        onClick={() => setDeleteModalRule(rule)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                        title="Delete Rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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

      {/* Delete Rule Confirmation Modal */}
      {deleteModalRule && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-rose-400 font-bold text-sm">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <Trash2 className="w-4 h-4" />
                </div>
                <span>Delete Detection Rule</span>
              </div>
              <button
                onClick={() => setDeleteModalRule(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-300">
              <p>Are you sure you want to permanently delete this rule? It will no longer trigger detection alarms.</p>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="font-semibold text-white">{deleteModalRule.name}</div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Modes: {Array.isArray(deleteModalRule.modes) ? deleteModalRule.modes.join(', ') : deleteModalRule.modes}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalRule(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteRule(deleteModalRule.id)}
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

      {/* Edit Rule Modal */}
      {editModalRule && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-sky-400 font-bold text-sm">
                <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20">
                  <Pencil className="w-4 h-4" />
                </div>
                <span>Edit Detection Rule</span>
              </div>
              <button
                onClick={() => setEditModalRule(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleUpdateRule} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Rule Name</label>
                <input
                  type="text"
                  required
                  value={editForm.name}
                  onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">Target Object</label>
                  <select
                    value={editForm.target_categories[0] || 'person'}
                    onChange={e => setEditForm({ ...editForm, target_categories: [e.target.value] })}
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
                    value={editForm.severity}
                    onChange={e => setEditForm({ ...editForm, severity: e.target.value })}
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
                      onClick={() => toggleEditModeSelection(mode)}
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition border inline-flex items-center justify-center gap-1 cursor-pointer ${
                        editForm.modes.includes(mode)
                          ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                          : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {editForm.modes.includes(mode) && <Check className="w-3 h-3 text-sky-400" />}
                      {mode.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Action</label>
                <select
                  value={editForm.action}
                  onChange={e => setEditForm({ ...editForm, action: e.target.value })}
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
                  onClick={() => setEditModalRule(null)}
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs transition cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Rule Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Create Custom Detection Rule</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

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
                      className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition border inline-flex items-center justify-center gap-1 cursor-pointer ${
                        newRuleModes.includes(mode)
                          ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                          : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                      }`}
                    >
                      {newRuleModes.includes(mode) && <Check className="w-3 h-3 text-sky-400" />}
                      {mode.toUpperCase()}
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
                  className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs cursor-pointer"
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
