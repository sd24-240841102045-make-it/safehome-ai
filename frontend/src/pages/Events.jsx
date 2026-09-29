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
  ChevronLeft,
  ChevronRight,
  Info
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
          <History className="w-6 h-6 text-sky-400" /> Event History
        </h1>
        <p className="text-sm text-slate-400">Database audit trail of all safety and object detections</p>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-lg space-y-3">
        <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-3">
          {/* Search text */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search by location, tag, or label..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-sky-500"
            />
          </div>

          {/* Object Class Filter */}
          <select
            value={objectClass}
            onChange={(e) => setObjectClass(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
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
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="">All Patterns</option>
            <option value="true">Unusual Events Only (DS)</option>
            <option value="false">Normal Baseline Activity</option>
          </select>

          {/* Min Confidence */}
          <select
            value={minConfidence}
            onChange={(e) => setMinConfidence(e.target.value)}
            className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-200 focus:outline-none focus:border-sky-500"
          >
            <option value="">Any Confidence</option>
            <option value="0.70">&ge; 70% Confidence</option>
            <option value="0.85">&ge; 85% Confidence</option>
            <option value="0.90">&ge; 90% Confidence</option>
          </select>

          <button
            type="submit"
            className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition"
          >
            Apply
          </button>
        </form>
      </div>

      {/* Events Table / Card List */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-sm">Loading historical events...</div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <History className="w-10 h-10 text-slate-700 mx-auto" />
            <div className="text-sm font-medium text-slate-300">No events found</div>
            <p className="text-xs text-slate-500">No detections matched your current filter criteria.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Detected Target</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4">Location</th>
                  <th className="py-3 px-4">Unusual Pattern</th>
                  <th className="py-3 px-4 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {events.map((ev) => {
                  const dt = new Date(ev.timestamp);
                  const formattedDate = dt.toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric'
                  });
                  const formattedTime = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <tr key={ev.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4 font-mono text-slate-300">
                        <div>{formattedDate}</div>
                        <div className="text-[11px] text-slate-500">{formattedTime}</div>
                      </td>
                      <td className="py-3 px-4 font-medium text-white capitalize">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800 text-slate-200">
                          {ev.object_class === 'person' && <User className="w-3.5 h-3.5 text-sky-400" />}
                          {ev.object_class}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className={`font-semibold ${ev.confidence > 0.85 ? 'text-emerald-400' : 'text-slate-300'}`}>
                          {Math.round(ev.confidence * 100)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {ev.location_label || 'Phone Camera'}
                      </td>
                      <td className="py-3 px-4">
                        {ev.is_unusual ? (
                          <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                            YES (Unusual)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400">
                            NO (Normal)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => setSelectedEvent(ev)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-base text-white">Event Details</h3>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Event ID</span>
                <span className="font-mono text-slate-300">{selectedEvent.id}</span>
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
                <span className="font-mono text-slate-300">{new Date(selectedEvent.timestamp).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-800">
                <span className="text-slate-500">Statistical Anomaly</span>
                <span className={selectedEvent.is_unusual ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                  {selectedEvent.is_unusual ? 'YES (Flagged by Data Science)' : 'NO (Normal Pattern)'}
                </span>
              </div>

              {selectedEvent.metadata?.anomaly_reason && (
                <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-900/50 text-amber-300 text-[11px] leading-relaxed">
                  <strong>Analysis:</strong> {selectedEvent.metadata.anomaly_reason}
                </div>
              )}

              {selectedEvent.bounding_box && (
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-400">
                  <div>Bounding Box Coordinates:</div>
                  <div>x: {selectedEvent.bounding_box.x}, y: {selectedEvent.bounding_box.y}</div>
                  <div>width: {selectedEvent.bounding_box.width}, height: {selectedEvent.bounding_box.height}</div>
                </div>
              )}
            </div>

            <button
              onClick={() => setSelectedEvent(null)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
