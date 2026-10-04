import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  AlertTriangle, 
  Shield, 
  Camera, 
  ShieldAlert, 
  Activity, 
  Filter, 
  Search, 
  CheckCircle2, 
  RefreshCw,
  Eye,
  Calendar,
  Lock,
  Smartphone,
  X,
  Maximize2
} from 'lucide-react';
import { timelineService } from '../services/api';

export default function Timeline() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [streamType, setStreamType] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [previewImage, setPreviewImage] = useState(null);

  const fetchTimeline = async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 30,
        stream_type: streamType
      };
      if (searchQuery) params.search = searchQuery;

      const res = await timelineService.getTimeline(params);
      if (res.data?.success) {
        setItems(res.data.timeline || []);
      }
    } catch (err) {
      console.error('[Timeline] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, [streamType, page]);

  const getItemBadge = (item) => {
    switch (item.item_type) {
      case 'alert':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> ALERT
          </span>
        );
      case 'incident':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3" /> INCIDENT
          </span>
        );
      case 'audit':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1">
            <Lock className="w-3 h-3" /> SECURITY AUDIT
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30 flex items-center gap-1">
            <Camera className="w-3 h-3" /> EVENT
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <Clock className="w-5 h-5" />
            </div>
            Unified Security Timeline
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Chronological audit stream combining camera events, safety alerts, device incidents, and mode changes
          </p>
        </div>

        <button
          onClick={fetchTimeline}
          disabled={loading}
          className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 hover:border-slate-700 text-xs font-medium flex items-center gap-2 self-start sm:self-auto transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: 'All Activity' },
          { id: 'alerts', label: 'Alerts Only' },
          { id: 'events', label: 'Camera Events' },
          { id: 'incidents', label: 'Device Incidents' },
          { id: 'audit', label: 'Security Logs' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => { setStreamType(tab.id); setPage(1); }}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              streamType === tab.id
                ? 'bg-sky-500 text-slate-950 font-semibold shadow-sm'
                : 'bg-slate-900/90 text-slate-400 hover:text-slate-200 border border-slate-800 hover:border-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Timeline Stream */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 text-xs">
          <Activity className="w-6 h-6 animate-spin mx-auto mb-2 text-sky-400" />
          Loading security timeline...
        </div>
      ) : items.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900/40 border border-slate-800 text-slate-400 text-xs">
          No security events or alerts recorded in this filter window.
        </div>
      ) : (
        <div className="relative border-l border-slate-800 ml-4 pl-6 space-y-6">
          {items.map((item, idx) => {
            const snapshot = item.snapshot_path || item.metadata?.snapshot_path;

            return (
              <div key={`${item.item_type}_${item.id}_${idx}`} className="relative group">
                {/* Timeline marker node */}
                <div className={`absolute -left-[31px] top-1.5 w-3.5 h-3.5 rounded-full border-2 ${
                  item.item_type === 'incident' ? 'bg-rose-500 border-slate-950' :
                  item.item_type === 'alert' ? 'bg-amber-500 border-slate-950' :
                  item.item_type === 'audit' ? 'bg-purple-500 border-slate-950' :
                  'bg-sky-500 border-slate-950'
                }`} />

                <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getItemBadge(item)}
                      <h3 className="text-sm font-bold text-white">{item.title}</h3>
                    </div>
                    <span className="text-[11px] font-mono text-slate-400">
                      {new Date(item.timestamp).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 leading-relaxed">
                    {item.description}
                  </p>

                  {/* Snapshot Visual Thumbnail */}
                  {snapshot && (
                    <div className="pt-2">
                      <div 
                        onClick={() => setPreviewImage({ url: snapshot, title: item.title, timestamp: item.timestamp })}
                        className="relative w-48 h-28 rounded-xl overflow-hidden border border-slate-800 hover:border-sky-500 group/img cursor-pointer transition shadow-md"
                      >
                        <img
                          src={snapshot}
                          alt="Event snapshot"
                          className="w-full h-full object-cover group-hover/img:scale-105 transition duration-300"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                        <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover/img:opacity-100 transition flex items-center justify-center gap-1.5 text-xs text-white font-medium backdrop-blur-[1px]">
                          <Maximize2 className="w-4 h-4 text-sky-400" />
                          <span>Enlarge</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Full Resolution Image Lightbox Modal */}
      {previewImage && (
        <div 
          onClick={() => setPreviewImage(null)}
          className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-3xl max-w-2xl w-full p-5 space-y-4 shadow-2xl relative"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">{previewImage.title}</h3>
                <p className="text-xs font-mono text-slate-400">
                  Captured: {new Date(previewImage.timestamp).toLocaleString()}
                </p>
              </div>
              <button 
                onClick={() => setPreviewImage(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="rounded-2xl overflow-hidden border border-slate-800 bg-black flex items-center justify-center max-h-[70vh]">
              <img 
                src={previewImage.url} 
                alt="Event snapshot full view" 
                className="w-full h-auto object-contain max-h-[70vh]"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
