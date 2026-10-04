import React, { useState, useEffect } from 'react';
import {
  History,
  Search,
  Filter,
  Calendar,
  AlertTriangle,
  User,
  CheckCircle,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Info,
  Camera,
  Image as ImageIcon
} from 'lucide-react';
import { eventService } from '../services/api';

export default function Events() {
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 15, total: 0, pages: 1 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [objectClass, setObjectClass] = useState('');
  const [isUnusual, setIsUnusual] = useState('');
  const [minConfidence, setMinConfidence] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [deleteModalEvent, setDeleteModalEvent] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [notification, setNotification] = useState(null);

  const fetchEvents = async (page = 1) => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 15,
        search: search || undefined,
        object_class: objectClass || undefined,
        is_unusual: isUnusual !== '' ? isUnusual : undefined,
        min_confidence: minConfidence || undefined
      };

      const res = await eventService.getEvents(params);
      if (res.data.success) {
        setEvents(res.data.events);
        setPagination(res.data.pagination);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents(1);
  }, [objectClass, isUnusual, minConfidence]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    fetchEvents(1);
  };

  const handleDeleteEvent = async (eventId) => {
    setDeleting(true);
    try {
      await eventService.deleteEvent(eventId);
      setDeleteModalEvent(null);
      if (selectedEvent?.id === eventId) {
        setSelectedEvent(null);
      }
      setNotification('Event record and associated snapshot file deleted permanently.');
      setTimeout(() => setNotification(null), 4000);
      fetchEvents(pagination.page);
    } catch (err) {
      console.error('Failed to delete event:', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <History className="w-5 h-5" />
          </div>
          Event History & Snapshots
        </h1>
        <p className="text-xs text-slate-400 mt-1">Audit log of detected objects, camera snapshots, and statistical anomalies</p>
      </div>

      {notification && (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/50 text-xs text-emerald-300 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 shadow-xl shadow-slate-950/30 space-y-3">
        <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {/* Search text */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search object, label..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-sky-500 transition-colors placeholder:text-slate-500"
            />
          </div>

          {/* Object Class Filter */}
          <select
            value={objectClass}
            onChange={(e) => setObjectClass(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
          >
            <option value="">All Object Classes</option>
            <option value="person">Person</option>
            <option value="dog">Dog</option>
            <option value="cat">Cat</option>
            <option value="car">Vehicle / Car</option>
            <option value="bicycle">Bicycle</option>
          </select>

          {/* Unusual Filter */}
          <select
            value={isUnusual}
            onChange={(e) => setIsUnusual(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
          >
            <option value="">All Patterns</option>
            <option value="true">Unusual (Anomaly)</option>
            <option value="false">Normal Pattern</option>
          </select>

          {/* Min Confidence */}
          <select
            value={minConfidence}
            onChange={(e) => setMinConfidence(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-sky-500 transition-colors"
          >
            <option value="">Any Confidence</option>
            <option value="0.7">70%+ Confidence</option>
            <option value="0.8">80%+ Confidence</option>
            <option value="0.9">90%+ Confidence</option>
          </select>
        </form>
      </div>

      {/* Events Table */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl overflow-hidden shadow-xl shadow-slate-950/40">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs font-medium">Loading events...</div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <CheckCircle className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="text-xs font-semibold text-slate-200">No events found</div>
            <p className="text-[11px] text-slate-500">Try adjusting your filters or connect an active camera sensor.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/70 text-slate-400 font-semibold uppercase tracking-wider text-[10px] border-b border-slate-800/80">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Object Class</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4">Snapshot</th>
                  <th className="py-3 px-4">Pattern Flag</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {events.map((ev) => {
                  const dt = new Date(ev.started_at || ev.timestamp);
                  const formattedDate = dt.toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  });
                  const formattedTime = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <tr key={ev.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-300">
                        <div className="text-slate-200">{formattedDate}</div>
                        <div className="text-[10px] text-slate-500">{formattedTime}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-white capitalize">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-800/90 text-slate-200 border border-slate-700/60 text-xs">
                          {ev.object_class === 'person' && <User className="w-3.5 h-3.5 text-sky-400" />}
                          {ev.object_class}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className={`font-semibold ${ev.confidence > 0.85 ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {Math.round(ev.confidence * 100)}%
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        {ev.snapshot_path ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-sky-500/10 text-sky-400 border border-sky-500/20">
                            <ImageIcon className="w-3 h-3" /> Saved
                          </span>
                        ) : (
                          <span className="text-slate-500 text-[10px]">None</span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        {ev.is_unusual ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Unusual
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-slate-800/80 text-slate-400 border border-slate-700/50">
                            Normal
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => setSelectedEvent(ev)}
                            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                            title="View Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeleteModalEvent(ev)}
                            className="p-1.5 rounded-lg bg-slate-800/60 hover:bg-rose-950/60 hover:text-rose-400 text-slate-400 transition"
                            title="Delete Event & Snapshot"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div className="p-4 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <div>
            Showing {events.length} of {pagination.total} events
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchEvents(pagination.page - 1)}
              disabled={pagination.page <= 1}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-mono">
              Page {pagination.page} of {pagination.pages}
            </span>
            <button
              onClick={() => fetchEvents(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Event Details Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white">Event Details</h3>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {/* Snapshot image if available */}
            {selectedEvent.snapshot_path && (
              <div className="space-y-1">
                <div className="text-[11px] text-slate-400 font-semibold flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-sky-400" /> Event Snapshot (Stored Locally on Edge Hub)
                </div>
                <img
                  src={selectedEvent.snapshot_path}
                  alt="Detections Snapshot"
                  className="rounded-xl border border-slate-800 max-h-48 w-full object-cover bg-slate-950"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Event ID</span>
                <span className="font-mono text-slate-300 text-[10px]">{selectedEvent.id}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Detected Class</span>
                <span className="font-semibold text-sky-400 uppercase">{selectedEvent.object_class}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Confidence Score</span>
                <span className="font-mono font-bold text-white">{Math.round(selectedEvent.confidence * 100)}%</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Timestamp</span>
                <span className="font-mono text-slate-300">
                  {new Date(selectedEvent.started_at || selectedEvent.timestamp).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Statistical Anomaly</span>
                <span className={selectedEvent.is_unusual ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                  {selectedEvent.is_unusual ? 'YES (Flagged by Data Science Engine)' : 'NO (Normal Pattern)'}
                </span>
              </div>

              {selectedEvent.metadata?.anomaly_reason && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-900/50 text-amber-300 text-[11px] leading-relaxed">
                  <strong>Analysis:</strong> {selectedEvent.metadata.anomaly_reason}
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  const evToDel = selectedEvent;
                  setSelectedEvent(null);
                  setDeleteModalEvent(evToDel);
                }}
                className="flex-1 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 font-semibold text-xs transition"
              >
                Delete Event & Snapshot
              </button>
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="flex-1 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalEvent && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-white">Delete Event Record?</h3>
                <p className="text-xs text-slate-400">This removes the event and unlinks its snapshot file.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300">
              Are you sure you want to permanently delete event{' '}
              <span className="font-mono text-sky-400">{deleteModalEvent.id.slice(0, 8)}...</span>?
              {deleteModalEvent.snapshot_path && (
                <span className="block mt-1 text-[11px] text-amber-400">
                  ⚠️ The associated snapshot file on local disk will also be unlinked.
                </span>
              )}
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteModalEvent(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 font-medium transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteEvent(deleteModalEvent.id)}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-slate-950 text-xs font-bold transition disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
