import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Cpu,
  Database,
  ShieldCheck,
  AlertTriangle,
  User,
  Activity,
  Smartphone,
  ExternalLink,
  RefreshCw,
  Clock,
  Eye,
  Key,
  Copy,
  Check,
  QrCode,
  Radio,
  Timer
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { systemService, alertService, deviceService, WS_BASE } from '../services/api';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState({ backend: 'checking', database: 'checking', ai_service: 'checking' });
  const [networkInfo, setNetworkInfo] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [liveStream, setLiveStream] = useState({
    active: false,
    image: null,
    detections: [],
    timestamp: null,
    latency_ms: 0,
    processing_time_ms: 0
  });
  const [loading, setLoading] = useState(true);
  const [cameraStatus, setCameraStatus] = useState('OFFLINE');
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [pairingCode, setPairingCode] = useState(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState(null);
  const [pairingSecondsLeft, setPairingSecondsLeft] = useState(0);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const wsRef = useRef(null);
  const canvasRef = useRef(null);

  // Load summary and system info
  const loadData = async () => {
    try {
      const [sumRes, healthRes, netRes, alertsRes] = await Promise.allSettled([
        systemService.getDashboard(),
        systemService.getHealth(),
        systemService.getNetworkInterfaces(),
        alertService.getAlerts({ limit: 4 })
      ]);

      if (sumRes.status === 'fulfilled' && sumRes.value.data.success) {
        setSummary(sumRes.value.data.summary);
      }
      if (healthRes.status === 'fulfilled' && healthRes.value.data) {
        setHealth(healthRes.value.data);
      }
      if (netRes.status === 'fulfilled' && netRes.value.data.success) {
        setNetworkInfo(netRes.value.data);
      }
      if (alertsRes.status === 'fulfilled' && alertsRes.value.data.success) {
        setRecentAlerts(alertsRes.value.data.alerts);
      }
    } catch (e) {
      console.error('Error fetching dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 10000);
    return () => clearInterval(timer);
  }, []);

  // Countdown timer for pairing code expiry (5 minutes)
  useEffect(() => {
    if (!pairingExpiresAt) return;
    const interval = setInterval(() => {
      const left = Math.max(0, Math.floor((new Date(pairingExpiresAt).getTime() - Date.now()) / 1000));
      setPairingSecondsLeft(left);
      if (left <= 0) {
        setPairingCode(null);
        setPairingExpiresAt(null);
        clearInterval(interval);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [pairingExpiresAt]);

  // Setup WebSocket connection for live camera frames & real-time events
  useEffect(() => {
    let ws = null;
    try {
      ws = new WebSocket(WS_BASE);
      wsRef.current = ws;

      ws.onopen = () => {
        const token = localStorage.getItem('supabase_token') || localStorage.getItem('token');
        ws.send(JSON.stringify({ type: 'register_dashboard', token }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'live_frame') {
            setCameraStatus('ONLINE');
            setLiveStream({
              active: true,
              image: msg.image,
              detections: msg.detections || [],
              timestamp: msg.timestamp,
              latency_ms: msg.latency_ms || 0,
              processing_time_ms: msg.processing_time_ms || 0
            });
            drawBoundingBoxes(msg.image, msg.detections);
          }

          if (msg.type === 'device_status_change') {
            const isOnline = msg.status === 'streaming' || msg.status === 'online';
            setCameraStatus(isOnline ? 'ONLINE' : 'OFFLINE');
            if (!isOnline) {
              setLiveStream((prev) => ({ ...prev, active: false }));
            }
          }

          if (msg.type === 'new_event') {
            loadData();
          }
        } catch (err) {
          // parse error
        }
      };

      ws.onclose = () => {
        // ws closed
      };
    } catch (err) {
      console.warn('WebSocket connection error:', err);
    }

    return () => {
      if (ws) ws.close();
    };
  }, []);

  // Draw detection boxes onto live canvas overlay
  const drawBoundingBoxes = (imageSrc, detections) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      // Render detections
      if (detections && detections.length > 0) {
        detections.forEach((det) => {
          const bb = det.bounding_box;
          if (!bb) return;

          // Box
          ctx.strokeStyle = '#38bdf8';
          ctx.lineWidth = 3;
          ctx.strokeRect(bb.x, bb.y, bb.width, bb.height);

          // Label badge
          const label = `${det.class.toUpperCase()} ${Math.round(det.confidence * 100)}%`;
          ctx.font = 'bold 14px monospace';
          const textWidth = ctx.measureText(label).width;

          ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
          ctx.fillRect(bb.x, Math.max(0, bb.y - 24), textWidth + 12, 24);

          ctx.fillStyle = '#0f172a';
          ctx.fillText(label, bb.x + 6, Math.max(16, bb.y - 7));
        });
      }
    };
    img.src = imageSrc;
  };

  // Generate 6-digit short-lived pairing code
  const handleGeneratePairingCode = async () => {
    try {
      setIsGeneratingCode(true);
      const res = await deviceService.createPairingCode(undefined, 'Android Phone Sensor');
      if (res.data.success) {
        setPairingCode(res.data.pairing_code);
        setPairingExpiresAt(res.data.expires_at);
        const left = Math.max(0, Math.floor((new Date(res.data.expires_at).getTime() - Date.now()) / 1000));
        setPairingSecondsLeft(left);
        setPairingModalOpen(true);
      }
    } catch (e) {
      console.error('Failed to generate pairing code:', e);
    } finally {
      setIsGeneratingCode(false);
    }
  };

  const copyPairingCode = () => {
    if (pairingCode) {
      navigator.clipboard.writeText(pairingCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Format seconds to mm:ss
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const primaryIpUrl = networkInfo?.local_ips?.[0]?.url_phone_monitor || `http://${window.location.hostname}:5173/monitor`;
  const mobilePairingUrl = pairingCode ? `${primaryIpUrl}?code=${pairingCode}` : primaryIpUrl;
  const isMonitoringActive = cameraStatus === 'ONLINE' && health.ai_service === 'online';

  return (
    <div className="space-y-6">
      {/* Title & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            SafeHome <span className="text-sky-400">AI</span>
          </h1>
          <p className="text-sm text-slate-400">Real-time Home Safety & Smart Surveillance Station</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => handleGeneratePairingCode()}
            disabled={isGeneratingCode}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-400 hover:to-blue-500 text-sm font-semibold shadow-lg shadow-sky-500/20 transition active:scale-[0.98]"
          >
            <QrCode className="w-4 h-4" /> Pair Phone Camera
          </button>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 text-sm font-medium transition"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* System Status Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" /> System Status
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-slate-400" /> Camera
            </div>
            <div className={`text-base font-bold font-mono ${cameraStatus === 'ONLINE' ? 'text-emerald-400' : 'text-slate-400'}`}>
              {cameraStatus}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-slate-400" /> AI Engine
            </div>
            <div className={`text-base font-bold font-mono ${health.ai_service === 'online' ? 'text-emerald-400' : 'text-amber-400'}`}>
              {health.ai_service.toUpperCase()}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-slate-400" /> Database
            </div>
            <div className={`text-base font-bold font-mono ${health.database === 'online' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {health.database.toUpperCase()}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> Surveillance
            </div>
            <div className={`text-base font-bold font-mono ${isMonitoringActive ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isMonitoringActive ? 'ACTIVE' : 'STANDBY'}
            </div>
          </div>
        </div>
      </div>

      {/* Today's Events Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl relative overflow-hidden">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Events</div>
          <div className="mt-2 text-3xl font-extrabold text-white">
            {summary?.today?.total ?? 0}
          </div>
          <p className="mt-1 text-xs text-slate-500">Recorded today from phone</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl relative overflow-hidden">
          <div className="text-xs font-semibold text-sky-400 uppercase tracking-wide flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> Person Detections
          </div>
          <div className="mt-2 text-3xl font-extrabold text-sky-400">
            {summary?.today?.person ?? 0}
          </div>
          <p className="mt-1 text-xs text-slate-500">Human presence events</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl relative overflow-hidden">
          <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Other Detections</div>
          <div className="mt-2 text-3xl font-extrabold text-emerald-400">
            {summary?.today?.other ?? 0}
          </div>
          <p className="mt-1 text-xs text-slate-500">Vehicles, pets & objects</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-5 rounded-2xl relative overflow-hidden">
          <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Unusual Events
          </div>
          <div className="mt-2 text-3xl font-extrabold text-amber-400">
            {summary?.today?.unusual ?? 0}
          </div>
          <p className="mt-1 text-xs text-slate-500">Statistical anomalies (DS)</p>
        </div>
      </div>

      {/* Main Grid: Live Camera Stream & Setup Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Camera View */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${cameraStatus === 'ONLINE' ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`}></span>
                <h3 className="font-semibold text-sm text-white">Live Phone Camera Stream</h3>
              </div>
              <div className="flex items-center gap-3">
                {liveStream.active && (
                  <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                    Latency: {liveStream.latency_ms}ms
                  </span>
                )}
                <span className="text-xs font-mono text-slate-400">
                  {liveStream.timestamp ? new Date(liveStream.timestamp).toLocaleTimeString() : 'Waiting for phone'}
                </span>
              </div>
            </div>

            {/* Video Canvas Container */}
            <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
              {liveStream.active && liveStream.image ? (
                <canvas ref={canvasRef} className="w-full h-full object-contain" />
              ) : (
                <div className="text-center p-6 space-y-3">
                  <Camera className="w-12 h-12 text-slate-700 mx-auto" />
                  <div className="text-sm font-medium text-slate-300">Camera stream inactive</div>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Pair your Android phone or open <span className="font-mono text-sky-400">/monitor</span> on the same Wi-Fi network and tap "Start Monitoring".
                  </p>
                  <button
                    onClick={() => handleGeneratePairingCode()}
                    className="px-4 py-2 rounded-xl bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-semibold hover:bg-sky-500/30 transition"
                  >
                    Pair Phone Camera
                  </button>
                </div>
              )}

              {/* Live Overlay Status Tag */}
              {cameraStatus === 'ONLINE' && (
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 text-xs font-mono font-bold flex items-center gap-1.5 backdrop-blur">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                  LIVE INFERENCE ACTIVE
                </div>
              )}
            </div>
          </div>

          {/* Detections in Current Frame */}
          <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
            <div>
              Detected in frame:{' '}
              {liveStream.detections && liveStream.detections.length > 0 ? (
                liveStream.detections.map((d, i) => (
                  <span key={i} className="inline-block px-2 py-0.5 ml-1 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20 font-mono">
                    {d.class} ({Math.round(d.confidence * 100)}%)
                  </span>
                ))
              ) : (
                <span className="text-slate-500 italic">No targets detected in current frame</span>
              )}
            </div>
            <div className="font-mono text-[11px] text-slate-500">
              Detector: OpenCV HOG/SVM + YOLOv8n
            </div>
          </div>
        </div>

        {/* Right Column: Phone Pairing Instructions & Recent Alerts */}
        <div className="space-y-6">
          {/* Phone Connection / Same Wi-Fi Guide */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-sky-400" /> Connect Android Phone
              </h3>
              <button
                onClick={() => handleGeneratePairingCode()}
                className="text-xs text-sky-400 hover:text-sky-300 font-semibold"
              >
                + Pair Code
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Connect your phone to the <strong>same Wi-Fi network</strong> as this laptop. Open Chrome on the phone and navigate to:
            </p>

            <div className="space-y-2">
              {networkInfo?.local_ips && networkInfo.local_ips.length > 0 ? (
                networkInfo.local_ips.map((net, i) => (
                  <div key={i} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-sky-300 break-all flex items-center justify-between">
                    <span>{net.url_phone_monitor}</span>
                    <a
                      href={net.url_phone_monitor}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-400 hover:text-white ml-2"
                      title="Open link"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ))
              ) : (
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-sky-300">
                  http://localhost:5173/monitor
                </div>
              )}
            </div>

            <div className="p-3 rounded-xl bg-sky-950/30 border border-sky-900/50 text-[11px] text-sky-300">
              💡 <strong>Tip:</strong> Allow camera permission when prompted on your phone. Stream operates at 1-2 fps for real-time edge processing.
            </div>
          </div>

          {/* Recent Safety Alerts */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> Recent Alerts
              </h3>
              <a href="/alerts" className="text-xs text-sky-400 hover:underline">View All</a>
            </div>

            {recentAlerts.length > 0 ? (
              <div className="space-y-2">
                {recentAlerts.map((alt) => (
                  <div key={alt.id} className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`font-semibold ${alt.severity === 'WARNING' ? 'text-amber-400' : 'text-sky-400'}`}>
                        {alt.title}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(alt.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[11px] line-clamp-1">{alt.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-xs text-slate-500">
                No active safety alerts. System operating normally.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 6-Digit Phone Pairing Modal */}
      {pairingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-5 text-center">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                <QrCode className="w-5 h-5" /> Phone Camera Pairing
              </div>
              <button
                onClick={() => setPairingModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400">
              Scan this QR code with your Android phone camera or enter the 6-digit code on the monitor page.
            </p>

            {/* QR Code Container */}
            <div className="p-4 bg-white rounded-2xl inline-block shadow-inner mx-auto">
              <QRCodeSVG value={mobilePairingUrl} size={180} level="M" />
            </div>

            {/* 6-Digit Code Display */}
            <div className="space-y-1">
              <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Pairing Code</div>
              <div className="flex items-center justify-center gap-2">
                <div className="font-mono text-3xl font-extrabold tracking-widest text-sky-400 bg-slate-950 px-5 py-2.5 rounded-xl border border-slate-800">
                  {pairingCode}
                </div>
                <button
                  onClick={copyPairingCode}
                  className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                  title="Copy Code"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Countdown Timer */}
            <div className="flex items-center justify-center gap-1.5 text-xs font-mono text-amber-400">
              <Timer className="w-3.5 h-3.5" />
              <span>Expires in {formatTime(pairingSecondsLeft)} (single-use)</span>
            </div>

            <button
              onClick={() => setPairingModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
