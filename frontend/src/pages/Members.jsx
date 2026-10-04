import React, { useState, useEffect } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  Key,
  Trash2,
  Copy,
  Check,
  Clock,
  Mail,
  UserCheck,
  AlertCircle,
  RefreshCw,
  X,
  UserX,
  ShieldAlert
} from 'lucide-react';
import { memberService } from '../services/api';

export default function Members() {
  const [members, setMembers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [myRole, setMyRole] = useState('member');
  const [homeName, setHomeName] = useState('My Home');
  const [loading, setLoading] = useState(true);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteRole, setInviteRole] = useState('member');
  const [inviteEmail, setInviteEmail] = useState('');
  const [newInviteCode, setNewInviteCode] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Modals for confirmation
  const [removeModalMember, setRemoveModalMember] = useState(null);
  const [roleChangeModal, setRoleChangeModal] = useState(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [membersRes, invitesRes] = await Promise.allSettled([
        memberService.getMembers(),
        memberService.getInvites()
      ]);

      if (membersRes.status === 'fulfilled' && membersRes.value.data?.success) {
        setMembers(membersRes.value.data.data.members || []);
        setMyRole(membersRes.value.data.data.my_role || 'member');
        setHomeName(membersRes.value.data.data.home_name || 'My Home');
      }

      if (invitesRes.status === 'fulfilled' && invitesRes.value.data?.success) {
        setInvites(invitesRes.value.data.data.invites || []);
      }
    } catch (err) {
      console.error('Failed to load member data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateInvite = async (e) => {
    e.preventDefault();
    try {
      const res = await memberService.createInvite(inviteRole, inviteEmail || undefined);
      if (res.data?.success) {
        setNewInviteCode(res.data.data.invite_code);
        fetchData();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to create invite code' });
    }
  };

  const handleJoinHome = async (e) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    try {
      setJoinLoading(true);
      const res = await memberService.joinHome(joinCodeInput.trim());
      if (res.data?.success) {
        setMessage({ type: 'success', text: 'Successfully joined home!' });
        setJoinCodeInput('');
        fetchData();
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to join home' });
    } finally {
      setJoinLoading(false);
    }
  };

  const confirmRemoveMember = async () => {
    if (!removeModalMember) return;
    try {
      setActionLoading(true);
      await memberService.removeMember(removeModalMember.id);
      setRemoveModalMember(null);
      setMessage({ type: 'success', text: `Member removed successfully.` });
      setTimeout(() => setMessage(null), 3000);
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to remove member' });
    } finally {
      setActionLoading(false);
    }
  };

  const confirmRoleChange = async () => {
    if (!roleChangeModal) return;
    try {
      setActionLoading(true);
      await memberService.updateRole(roleChangeModal.member.id, roleChangeModal.newRole);
      setRoleChangeModal(null);
      setMessage({ type: 'success', text: `Member role updated to ${roleChangeModal.newRole.toUpperCase()}.` });
      setTimeout(() => setMessage(null), 3000);
      fetchData();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.error || 'Failed to update role' });
    } finally {
      setActionLoading(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const getRoleBadge = (role) => {
    switch (role) {
      case 'owner':
        return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
      case 'admin':
        return 'bg-sky-500/15 text-sky-400 border-sky-500/30';
      case 'member':
        return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30';
      case 'viewer':
        return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
      default:
        return 'bg-slate-500/15 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Users className="w-5 h-5" />
            </div>
            Home Members & Access Sharing
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Grant family members, roommates, or co-occupants secure role-based access to <strong className="text-slate-200 font-semibold">{homeName}</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {(myRole === 'owner' || myRole === 'admin') && (
            <button
              onClick={() => {
                setNewInviteCode(null);
                setShowInviteModal(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-semibold shadow-sm transition"
            >
              <UserPlus className="w-4 h-4" />
              Invite Member
            </button>
          )}
          <button
            onClick={fetchData}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 transition"
            title="Refresh"
            aria-label="Refresh members"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-xl text-xs flex items-center gap-2 border ${message.type === 'success' ? 'bg-emerald-950/40 text-emerald-300 border-emerald-900/50' : 'bg-rose-950/40 text-rose-300 border-rose-900/50'}`}>
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{message.text}</span>
        </div>
      )}

      {/* Role Permission Matrix Card */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl shadow-slate-950/30">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5">Role Permissions Guide</h2>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 text-xs">
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="font-bold text-amber-400">Owner</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">Full control, billing, member deletion, mode shifting, GDPR purge.</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="font-bold text-sky-400">Admin</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">Invite members, switch modes, acknowledge alerts & incidents.</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="font-bold text-emerald-400">Member</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">View live feeds, acknowledge alerts, provide AI feedback.</p>
          </div>
          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-1">
            <div className="font-bold text-slate-400">Viewer</div>
            <p className="text-slate-400 text-[11px] leading-relaxed">Read-only access to timeline, events, and surveillance stats.</p>
          </div>
        </div>
      </div>

      {/* Members List */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl shadow-slate-950/40">
        <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h2 className="text-xs font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-400" />
            Current Home Members ({members.length})
          </h2>
          <span className="text-[11px] text-slate-400">Your role: <span className="font-semibold text-slate-200 capitalize">{myRole}</span></span>
        </div>

        <div className="divide-y divide-slate-800/60">
          {members.map((member) => (
            <div key={member.id} className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-800/30 transition">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 text-sm">
                  {member.full_name ? member.full_name.charAt(0).toUpperCase() : 'U'}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white flex items-center gap-2">
                    {member.full_name || 'Member'}
                    {member.role === 'owner' && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">Primary Owner</span>}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center gap-3 mt-0.5">
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {member.email}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Joined {new Date(member.joined_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-center">
                {myRole === 'owner' && member.role !== 'owner' ? (
                  <select
                    value={member.role}
                    onChange={(e) => setRoleChangeModal({ member, newRole: e.target.value })}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:border-sky-500 cursor-pointer"
                  >
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </select>
                ) : (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${getRoleBadge(member.role)}`}>
                    {member.role.toUpperCase()}
                  </span>
                )}

                {(myRole === 'owner' || myRole === 'admin') && member.role !== 'owner' && (
                  <button
                    onClick={() => setRemoveModalMember(member)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition cursor-pointer"
                    title="Remove Member"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Join Another Home Card */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
        <h2 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <Key className="w-4 h-4 text-emerald-400" />
          Join Another Home with an Invite Code
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Received a 6-digit or 8-digit SafeHome invite code from a family member? Enter it here to access their surveillance stream.
        </p>

        <form onSubmit={handleJoinHome} className="flex gap-2 max-w-md">
          <input
            type="text"
            placeholder="e.g. SAFE-A1B2C3"
            value={joinCodeInput}
            onChange={(e) => setJoinCodeInput(e.target.value)}
            className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white font-mono uppercase tracking-wider placeholder-slate-600 focus:outline-none focus:border-emerald-500"
          />
          <button
            type="submit"
            disabled={joinLoading || !joinCodeInput.trim()}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold transition"
          >
            {joinLoading ? 'Joining...' : 'Join Home'}
          </button>
        </form>
      </div>

      {/* Active Invites List */}
      {invites.length > 0 && (
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
          <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            Pending Invitation Codes ({invites.length})
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {invites.map((inv) => (
              <div key={inv.id} className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-mono text-sm font-bold text-sky-400">{inv.invite_code}</div>
                  <div className="text-[11px] text-slate-400">
                    Role: <span className="capitalize text-slate-200">{inv.role}</span> {inv.email && `• ${inv.email}`}
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard(inv.invite_code)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-white text-base flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-sky-400" />
                Invite Family Member
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {newInviteCode ? (
              <div className="space-y-4 text-center py-2">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto">
                  <Check className="w-6 h-6" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Invite Code Generated!</div>
                  <p className="text-xs text-slate-400 mt-1">Share this code with the user. Valid for 7 days.</p>
                </div>

                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                  <span className="font-mono text-lg font-bold text-sky-400 tracking-wider">{newInviteCode}</span>
                  <button
                    onClick={() => copyToClipboard(newInviteCode)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedCode ? 'Copied' : 'Copy Code'}
                  </button>
                </div>

                <button
                  onClick={() => setShowInviteModal(false)}
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Assign Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                  >
                    <option value="admin">Admin (Can manage devices & switch modes)</option>
                    <option value="member">Member (Can view stream & acknowledge alerts)</option>
                    <option value="viewer">Viewer (Read-only)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Member Email (Optional)</label>
                  <input
                    type="email"
                    placeholder="family.member@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold shadow-sm transition"
                  >
                    Create Invite
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Remove Member Confirmation Modal */}
      {removeModalMember && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-rose-400 font-bold text-sm">
                <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20">
                  <UserX className="w-4 h-4" />
                </div>
                <span>Remove Home Member</span>
              </div>
              <button
                onClick={() => setRemoveModalMember(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-300">
              <p>Are you sure you want to revoke home access for this user? They will no longer be able to view live streams or surveillance telemetry.</p>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="font-semibold text-white">{removeModalMember.full_name || 'Member'}</div>
                <div className="text-[11px] text-slate-400 font-mono">{removeModalMember.email}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wide">Role: {removeModalMember.role}</div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRemoveModalMember(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoveMember}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                {actionLoading ? 'Removing...' : 'Confirm Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Role Change Confirmation Modal */}
      {roleChangeModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5 text-sky-400 font-bold text-sm">
                <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20">
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <span>Confirm Role Change</span>
              </div>
              <button
                onClick={() => setRoleChangeModal(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-300">
              <p>
                Change permission role for <strong className="text-white">{roleChangeModal.member.full_name || roleChangeModal.member.email}</strong>?
              </p>
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="text-slate-500 block text-[10px]">CURRENT ROLE</span>
                  <span className="font-semibold text-slate-300 uppercase">{roleChangeModal.member.role}</span>
                </div>
                <div className="text-slate-600 font-bold">→</div>
                <div>
                  <span className="text-slate-500 block text-[10px]">NEW ROLE</span>
                  <span className="font-bold text-sky-400 uppercase">{roleChangeModal.newRole}</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRoleChangeModal(null)}
                disabled={actionLoading}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRoleChange}
                disabled={actionLoading}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-bold transition shadow-sm cursor-pointer disabled:opacity-50"
              >
                {actionLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {actionLoading ? 'Updating...' : 'Update Role'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
