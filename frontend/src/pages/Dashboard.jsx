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
  Timer,
  Zap,
  Gauge,
  Battery,
  BatteryCharging,
  WifiOff,
  BellRing,
  Sliders,
  ShieldAlert
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { systemService, alertService, deviceService, ruleService, incidentService, WS_BASE } from '../services/api';

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState({ backend: 'checking', database: 'checking', ai_service: 'checking' });
  const [networkInfo, setNetworkInfo] = useState(null);
  const [recentAlerts, setRecentAlerts] = useState([]);
  const [hardware, setHardware] = useState(null);
  const [homeMode, setHomeMode] = useState('home');
  const [incidents, setIncidents] = useState([]);
  const [sensorTelemetry, setSensorTelemetry] = useState(null);
  const [liveStream, setLiveStream] = useState({
    active: false,
    image: null,
    detections: [],
    timestamp: null,
    latency_ms: 0,
    processing_time_ms: 0,
    accelerator: 'CPU',
    device: 'cpu'
  });
  const [loading, setLoading] = useState(true);
  const [cameraStatus, setCameraStatus] = useState('OFFLINE');
  const [pairingModalOpen, setPairingModalOpen] = useState(false);
  const [pairingCode, setPairingCode] = useState(null);
  const [pairingExpiresAt, setPairingExpiresAt] = useState(null);
  const [pairingSecondsLeft, setPairingSecondsLeft] = useState(0);
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [copied, setCopied] = useState(false);
  const [currentClock, setCurrentClock] = useState(new Date());
  const wsRef = useRef(null);
  const canvasRef = useRef(null);
  const webrtcVideoRef = useRef(null);
  const pcRef = useRef(null);
  const [webrtcActive, setWebrtcActive] = useState(false);

  // 1-second live clock ticker
  useEffect(() => {
    const clockInterval = setInterval(() => setCurrentClock(new Date()), 1000);
    return () => clearInterval(clockInterval);
  }, []);

  // Load summary and system info
  const loadData = async () => {
    try {
      const [sumRes, healthRes, netRes, alertsRes, hwRes, modeRes, incidentsRes] = await Promise.allSettled([
        systemService.getDashboard(),
        systemService.getHealth(),
        systemService.getNetworkInterfaces(),
        alertService.getAlerts({ limit: 4 }),
        systemService.getHardware(),
        ruleService.getHomeMode(),
        incidentService.getIncidents({ status: 'open' })
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
      if (hwRes.status === 'fulfilled' && hwRes.value.data) {
        setHardware(hwRes.value.data.hardware || hwRes.value.data);
      }
      if (modeRes.status === 'fulfilled' && modeRes.value.data?.success) {
        setHomeMode(modeRes.value.data.current_mode || modeRes.value.data.data?.current_mode || 'home');
      }
      if (incidentsRes.status === 'fulfilled' && incidentsRes.value.data?.success) {
        setIncidents(incidentsRes.value.data.data || []);
      }
    } catch (e) {
      console.error('Error fetching dashboard data:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = async (newMode) => {
    try {
      setHomeMode(newMode);
      await ruleService.setHomeMode(newMode);
    } catch (err) {
      console.error('Failed to change mode:', err);
    }
  };

  const handleAcknowledgeIncident = async (id) => {
    try {
      await incidentService.acknowledge(id);
      loadData();
    } catch (err) {
      console.error('Failed to acknowledge incident:', err);
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

      ws.onmessage = async (event) => {
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
              processing_time_ms: msg.processing_time_ms || 0,
              accelerator: msg.accelerator || 'CPU',
              device: msg.device || 'cpu'
            });
            drawBoundingBoxes(msg.image, msg.detections);

            // Automatically request WebRTC P2P streaming if not already connecting
            if (!webrtcActive && !pcRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({
                type: 'webrtc_request_offer',
                device_id: msg.device_id
              }));
            }
          }

          if (msg.type === 'webrtc_offer' && msg.sdp) {
            try {
              if (pcRef.current) {
                pcRef.current.close();
              }

              const pc = new RTCPeerConnection({
                iceServers: [
                  { urls: 'stun:stun.l.google.com:19302' },
                  { urls: 'stun:stun1.l.google.com:19302' }
                ]
              });
              pcRef.current = pc;

              pc.ontrack = (event) => {
                if (event.streams && event.streams[0]) {
                  if (webrtcVideoRef.current) {
                    webrtcVideoRef.current.srcObject = event.streams[0];
                    webrtcVideoRef.current.play().catch(() => {});
                  }
                  setWebrtcActive(true);
                }
              };

              pc.onicecandidate = (event) => {
                if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
                  wsRef.current.send(JSON.stringify({
                    type: 'webrtc_ice_candidate',
                    device_id: msg.device_id,
                    candidate: event.candidate
                  }));
                }
              };

              pc.onconnectionstatechange = () => {
                if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
                  setWebrtcActive(false);
                }
              };

              await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);

              if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  type: 'webrtc_answer',
                  device_id: msg.device_id,
                  sdp: pc.localDescription
                }));
              }
            } catch (err) {
              console.warn('[Dashboard WebRTC] Handshake error:', err);
              setWebrtcActive(false);
            }
          }

          if (msg.type === 'webrtc_ice_candidate' && msg.candidate) {
            if (pcRef.current) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } catch (e) {
                console.warn('[Dashboard WebRTC] Candidate error:', e);
              }
            }
          }

          if (msg.type === 'device_status_change') {
            const isOnline = msg.status === 'streaming' || msg.status === 'online';
            setCameraStatus(isOnline ? 'ONLINE' : 'OFFLINE');
            if (isOnline) {
              if (!webrtcActive && wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({
                  type: 'webrtc_request_offer',
                  device_id: msg.device_id
                }));
              }
            } else {
              setLiveStream((prev) => ({ ...prev, active: false }));
              setWebrtcActive(false);
              if (pcRef.current) {
                pcRef.current.close();
                pcRef.current = null;
              }
            }
          }

          if (msg.type === 'device_telemetry') {
            setSensorTelemetry(msg.telemetry || msg);
          }

          if (msg.type === 'incident_opened') {
            setIncidents((prev) => [msg.incident, ...prev.filter((i) => i.id !== msg.incident.id)]);
          }

          if (msg.type === 'incident_resolved') {
            setIncidents((prev) => prev.filter((i) => i.id !== msg.incident_id));
          }

          if (msg.type === 'mode_changed' || msg.type === 'home_mode_changed') {
            setHomeMode(msg.current_mode || msg.mode);
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
      if (pcRef.current) {
        pcRef.current.close();
        pcRef.current = null;
      }
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

          const isMasked = det.class === 'masked_person' || det.is_masked;
          const strokeColor = isMasked ? '#f43f5e' : '#38bdf8';
          const fillColor = isMasked ? 'rgba(244, 63, 94, 0.95)' : 'rgba(56, 189, 248, 0.9)';

          // Box
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = isMasked ? 4 : 3;
          ctx.strokeRect(bb.x, bb.y, bb.width, bb.height);

          // Label badge
          let label = `${det.class.toUpperCase()} ${Math.round(det.confidence * 100)}%`;
          if (isMasked) {
            label = det.face_status === 'half_face' ? `⚠️ HALF-FACE ${Math.round(det.confidence * 100)}%` : `🚨 MASKED PERSON ${Math.round(det.confidence * 100)}%`;
          }

          ctx.font = 'bold 14px monospace';
          const textWidth = ctx.measureText(label).width;

          ctx.fillStyle = fillColor;
          ctx.fillRect(bb.x, Math.max(0, bb.y - 24), textWidth + 12, 24);

          ctx.fillStyle = isMasked ? '#ffffff' : '#0f172a';
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

  const currentProto = window.location.protocol;
  const rawIpUrl = networkInfo?.local_ips?.[0]?.url_phone_monitor || `${currentProto}//${window.location.hostname}:5173/monitor`;
  const primaryIpUrl = rawIpUrl.replace(/^https?:/, currentProto);
  const mobilePairingUrl = pairingCode ? `${primaryIpUrl}?code=${pairingCode}` : primaryIpUrl;
  const isMonitoringActive = cameraStatus === 'ONLINE' && health.ai_service === 'online';

  return (
    <div className="space-y-6">
      {/* Incident Alert Banner (Monitoring Watchdog) */}
      {incidents.length > 0 && (
        <div className="bg-rose-950/40 border border-rose-800/80 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>{incidents[0].title}</span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/30">
                  {incidents[0].severity}
                </span>
              </div>
              <p className="text-xs text-rose-200/80 mt-0.5">{incidents[0].message}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={() => handleAcknowledgeIncident(incidents[0].id)}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold shadow-sm transition cursor-pointer"
            >
              Acknowledge
            </button>
            <Link
              to="/timeline"
              className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium border border-slate-700 transition"
            >
              View Timeline
            </Link>
          </div>
        </div>
      )}

      {/* Title, Mode Switcher & Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            SafeHome <span className="text-sky-400">AI</span>
          </h1>
          <p className="text-xs text-slate-400">Real-time Home Safety &amp; Smart Surveillance Station</p>
        </div>

        {/* Security Mode Switcher Pill */}
        <div className="flex items-center gap-1 p-1 bg-slate-900 border border-slate-800/80 rounded-2xl self-start sm:self-auto">
          <button
            onClick={() => handleModeChange('home')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              homeMode === 'home'
                ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span>🏠</span> Home
          </button>
          <button
            onClick={() => handleModeChange('away')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              homeMode === 'away'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span>🚗</span> Away
          </button>
          <button
            onClick={() => handleModeChange('night')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              homeMode === 'night'
                ? 'bg-purple-600 text-white font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span>🌙</span> Night
          </button>
          <button
            onClick={() => handleModeChange('disarmed')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer ${
              homeMode === 'disarmed'
                ? 'bg-slate-700 text-slate-200 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <span>🛡️</span> Disarmed
          </button>
        </div>

        <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <div className="text-right hidden sm:block bg-slate-900 border border-slate-800/80 px-3 py-1.5 rounded-xl">
            <div className="text-xs font-mono font-bold text-white flex items-center gap-1.5 justify-end">
              <Clock className="w-3.5 h-3.5 text-sky-400" />
              {currentClock.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <div className="text-[10px] text-slate-400 font-mono">
              {summary?.home_timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local'}
            </div>
          </div>

          <button
            onClick={() => handleGeneratePairingCode()}
            disabled={isGeneratingCode}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shadow-sm transition cursor-pointer"
          >
            <QrCode className="w-4 h-4" /> Pair Phone Camera
          </button>
          <button
            onClick={loadData}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium border border-slate-700/80 transition cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      {/* System Status Banner */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3.5 flex items-center justify-between">
          <span className="flex items-center gap-2"><Activity className="w-4 h-4 text-sky-400" /> System Status &amp; Sensor Telemetry</span>
          {sensorTelemetry && (
            <span className="text-[11px] font-mono text-emerald-400 font-normal flex items-center gap-2">
              {sensorTelemetry.battery_level !== undefined && (
                <span className="flex items-center gap-1">
                  {sensorTelemetry.battery_charging ? <BatteryCharging className="w-3.5 h-3.5 text-amber-400" /> : <Battery className="w-3.5 h-3.5 text-emerald-400" />}
                  {Math.round(sensorTelemetry.battery_level * 100)}%
                </span>
              )}
              {sensorTelemetry.fps !== undefined && <span>{sensorTelemetry.fps} FPS</span>}
              {sensorTelemetry.latency_ms !== undefined && <span>{sensorTelemetry.latency_ms}ms</span>}
            </span>
          )}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <Camera className="w-3.5 h-3.5 text-slate-400" /> Camera
            </div>
            <div className={`text-base font-bold font-mono ${cameraStatus === 'ONLINE' ? 'text-emerald-400' : 'text-slate-400'}`}>
              {cameraStatus}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-slate-400" /> AI Engine
            </div>
            <div className={`text-base font-bold font-mono ${health.ai_service === 'online' ? 'text-emerald-400' : 'text-amber-400'}`}>
              {health.ai_service.toUpperCase()}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-slate-400" /> Database
            </div>
            <div className={`text-base font-bold font-mono ${health.database === 'online' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {health.database.toUpperCase()}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="text-xs text-slate-400 mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-slate-400" /> Surveillance
            </div>
            <div className={`text-base font-bold font-mono ${isMonitoringActive ? 'text-emerald-400' : 'text-amber-400'}`}>
              {isMonitoringActive ? 'ACTIVE' : 'STANDBY'}
            </div>
          </div>
        </div>
      </div>

      {/* GPU Acceleration & Edge Hardware Telemetry */}
      <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Hardware Acceleration &amp; Edge AI Engine
              </h2>
              <p className="text-xs text-slate-400">Host edge inference telemetry and dedicated VRAM status</p>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold self-start sm:self-auto ${
            hardware?.gpu_available
              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
              : 'bg-slate-800 text-slate-300 border border-slate-700'
          }`}>
            <span className={`w-2 h-2 rounded-full ${hardware?.gpu_available ? 'bg-emerald-400' : 'bg-slate-500'}`} />
            {hardware?.gpu_available ? '⚡ NVIDIA CUDA GPU Accelerated' : 'SIMD AVX2 CPU Fallback'}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>Compute Device</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                {hardware?.target_device || 'cuda:0'}
              </span>
            </div>
            <div className="text-sm font-bold text-slate-100 truncate">
              {hardware?.device_name || 'NVIDIA GeForce RTX 3050 Laptop GPU'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Mode: {hardware?.inference_mode || 'GPU Accelerated (RTX Tensor)'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>CUDA &amp; Driver</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                v{hardware?.cuda_version || '12.7'}
              </span>
            </div>
            <div className="text-sm font-bold text-slate-100">
              Driver {hardware?.driver_version || '566.07'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Provider: {hardware?.active_provider || 'CUDAExecutionProvider'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>VRAM Allocation</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                {hardware?.vram_total_mb ? `${Math.round((hardware.vram_used_mb / hardware.vram_total_mb) * 100)}% used` : 'N/A'}
              </span>
            </div>
            <div className="text-sm font-bold text-slate-100">
              {hardware?.vram_free_mb ? `${hardware.vram_free_mb} MB Free` : '3,346 MB Free'}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Total VRAM: {hardware?.vram_total_mb ? `${hardware.vram_total_mb} MB` : '4,096 MB'}
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
              <span>GPU Health &amp; Temp</span>
              <Gauge className="w-3.5 h-3.5 text-slate-500" />
            </div>
            <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <span>{hardware?.temperature_c != null ? `${hardware.temperature_c}°C` : 'Optimal'}</span>
              <span className="text-xs font-normal text-slate-400">|</span>
              <span className="text-xs font-normal text-slate-400">Load: {hardware?.gpu_utilization_pct ?? 0}%</span>
            </div>
            <div className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Zero cloud offload (100% Local)
            </div>
          </div>
        </div>
      </div>

      {/* Today's Events Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/90 border border-slate-800/80 p-5 rounded-2xl shadow-sm">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Total Events</div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-white">
            {summary?.today?.total ?? 0}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Recorded today from phone</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 p-5 rounded-2xl shadow-sm">
          <div className="text-xs font-semibold text-sky-400 uppercase tracking-wide flex items-center gap-1.5">
            <User className="w-3.5 h-3.5" /> Person Detections
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-sky-400">
            {summary?.today?.person ?? 0}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Human presence events</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 p-5 rounded-2xl shadow-sm">
          <div className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Other Detections</div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-emerald-400">
            {summary?.today?.other ?? 0}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Vehicles, pets &amp; objects</p>
        </div>

        <div className="bg-slate-900/90 border border-slate-800/80 p-5 rounded-2xl shadow-sm">
          <div className="text-xs font-semibold text-amber-400 uppercase tracking-wide flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Unusual Events
          </div>
          <div className="mt-2 text-2xl font-bold tracking-tight text-amber-400">
            {summary?.today?.unusual ?? 0}
          </div>
          <p className="mt-1 text-[11px] text-slate-500">Statistical anomalies (DS)</p>
        </div>
      </div>

      {/* Main Grid: Live Camera Stream & Setup Widget */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Camera View */}
        <div className="lg:col-span-2 bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${cameraStatus === 'ONLINE' ? 'bg-emerald-400' : 'bg-slate-600'}`}></span>
                <h3 className="font-semibold text-sm text-white">Live Phone Camera Stream</h3>
              </div>
              <div className="flex items-center gap-2.5">
                {liveStream.active && (
                  <>
                    <span className={`text-xs font-mono px-2 py-0.5 rounded border flex items-center gap-1 ${
                      webrtcActive
                        ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                        : 'bg-slate-800 text-slate-400 border-slate-700'
                    }`}>
                      <Radio className="w-3 h-3 text-current" />
                      {webrtcActive ? 'WebRTC P2P (30 FPS)' : 'WS Fallback (2 FPS)'}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-emerald-400" />
                      {liveStream.accelerator === 'NVIDIA CUDA' ? 'CUDA:0' : 'SIMD:CPU'}
                    </span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-emerald-400 border border-slate-700">
                      Latency: {liveStream.latency_ms}ms
                    </span>
                  </>
                )}
                <span className="text-xs font-mono text-slate-400">
                  {liveStream.timestamp ? new Date(liveStream.timestamp).toLocaleTimeString() : 'Waiting for phone'}
                </span>
              </div>
            </div>

            {/* Video Canvas Container */}
            <div className="relative aspect-video bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
              {liveStream.active ? (
                <>
                  <video
                    ref={webrtcVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-contain ${webrtcActive ? 'block' : 'hidden'}`}
                  />
                  <canvas
                    ref={canvasRef}
                    className={`w-full h-full object-contain ${webrtcActive ? 'absolute inset-0 pointer-events-none' : 'block'}`}
                  />
                </>
              ) : (
                <div className="text-center p-6 space-y-3">
                  <Camera className="w-10 h-10 text-slate-700 mx-auto" />
                  <div className="text-sm font-medium text-slate-300">Camera stream inactive</div>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    Pair your Android phone or open <span className="font-mono text-sky-400">/monitor</span> on the same Wi-Fi network and tap "Start Monitoring".
                  </p>
                  <button
                    onClick={() => handleGeneratePairingCode()}
                    className="px-4 py-2 rounded-xl bg-sky-500/10 text-sky-300 border border-sky-500/20 text-xs font-semibold hover:bg-sky-500/20 transition cursor-pointer"
                  >
                    Pair Phone Camera
                  </button>
                </div>
              )}

              {/* Live Overlay Status Tag */}
              {cameraStatus === 'ONLINE' && (
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-emerald-950/80 border border-emerald-800/80 text-emerald-400 text-xs font-mono font-bold flex items-center gap-1.5 backdrop-blur-sm">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                  LIVE INFERENCE ACTIVE
                </div>
              )}
            </div>
          </div>

          {/* Detections in Current Frame */}
          <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between text-xs text-slate-400 gap-2">
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
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-sky-400" /> Connect Android Phone
              </h3>
              <button
                onClick={() => handleGeneratePairingCode()}
                className="text-xs text-sky-400 hover:text-sky-300 font-semibold cursor-pointer"
              >
                + Pair Code
              </button>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Connect your phone to the <strong className="text-slate-200">same Wi-Fi network</strong> as this laptop. Open Chrome on the phone and navigate to:
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

            <div className="p-3 rounded-xl bg-sky-950/20 border border-sky-900/40 text-[11px] text-sky-300">
              💡 <strong>Tip:</strong> Allow camera permission when prompted on your phone. Stream operates with real-time edge processing.
            </div>
          </div>

          {/* Recent Safety Alerts */}
          <div className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" /> Recent Alerts
              </h3>
              <Link to="/alerts" className="text-xs text-sky-400 hover:underline">View All</Link>
            </div>

            {recentAlerts.length > 0 ? (
              <div className="space-y-2">
                {recentAlerts.map((alt) => (
                  <div key={alt.id} className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-xs space-y-1">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-md w-full shadow-xl space-y-5 text-center">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sky-400 font-bold text-sm">
                <QrCode className="w-5 h-5" /> Phone Camera Pairing
              </div>
              <button
                onClick={() => setPairingModalOpen(false)}
                className="text-slate-400 hover:text-white text-sm cursor-pointer"
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
                  className="p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
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
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
