import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  Play,
  Square,
  RefreshCw,
  Wifi,
  Shield,
  CheckCircle2,
  AlertCircle,
  Eye,
  Settings,
  FlipHorizontal,
  Key,
  QrCode,
  Radio,
  WifiOff
} from 'lucide-react';
import { deviceService, WS_BASE } from '../services/api';

export default function Monitor() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED'); // DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING, ERROR
  const [backendWsUrl, setBackendWsUrl] = useState(() => {
    return WS_BASE;
  });
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) or 'user' (front)
  const [fps, setFps] = useState(0);
  const [framesSent, setFramesSent] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);
  const [lastDetections, setLastDetections] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

  // Pairing state
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [isPaired, setIsPaired] = useState(() => {
    return Boolean(localStorage.getItem('safehome_device_token') || localStorage.getItem('device_token'));
  });
  const [deviceId, setDeviceId] = useState(() => {
    return localStorage.getItem('safehome_device_id') || `phone_${Date.now().toString(36)}`;
  });
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingSuccessMsg, setPairingSuccessMsg] = useState(null);
  const [reconnectCountdown, setReconnectCountdown] = useState(0);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const frameCountRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const shouldKeepReconnectingRef = useRef(false);

  // Read ?code=XXXXXX query parameter on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam && codeParam.length === 6) {
      setPairingCodeInput(codeParam.toUpperCase());
    }
  }, []);

  // Stop camera stream on unmount
  useEffect(() => {
    return () => {
      shouldKeepReconnectingRef.current = false;
      stopMonitoring();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  // Request camera access and start video preview
  const initCamera = async (facing = facingMode) => {
    try {
      setErrorMsg(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints = {
        video: {
          facingMode: facing,
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { max: 15 }
        },
        audio: false
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setPermissionGranted(true);
      setFacingMode(facing);
    } catch (err) {
      console.error('Camera access error:', err);
      setPermissionGranted(false);
      setErrorMsg(
        err.name === 'NotAllowedError'
          ? 'Camera permission was denied. Please allow camera permissions in your mobile browser settings.'
          : `Camera error: ${err.message}`
      );
    }
  };

  // Flip between front and rear cameras
  const switchCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    initCamera(nextMode);
  };

  // Exchange 6-digit pairing code with backend
  const handlePairDevice = async (codeToPair = pairingCodeInput) => {
    const code = codeToPair.trim().toUpperCase();
    if (code.length !== 6) {
      setErrorMsg('Pairing code must be exactly 6 alphanumeric characters.');
      return;
    }

    try {
      setPairingLoading(true);
      setErrorMsg(null);
      const res = await deviceService.exchangePairingCode(code);

      if (res.data.success) {
        localStorage.setItem('safehome_device_token', res.data.device_token);
        localStorage.setItem('safehome_device_id', res.data.device_id);
        setDeviceId(res.data.device_id);
        setIsPaired(true);
        setPairingSuccessMsg('Device successfully paired to your SafeHome AI system!');
        setTimeout(() => setPairingSuccessMsg(null), 4000);
      }
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Failed to exchange pairing code.';
      setErrorMsg(msg);
    } finally {
      setPairingLoading(false);
    }
  };

  // Start Monitoring: Connect WebSocket and stream frames at 2 FPS
  const startMonitoring = async () => {
    shouldKeepReconnectingRef.current = true;
    if (!permissionGranted) {
      await initCamera();
    }
    connectWebSocket();
  };

  const connectWebSocket = () => {
    try {
      setConnectionStatus('CONNECTING');
      const ws = new WebSocket(backendWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('CONNECTED');
        setMonitoringActive(true);
        setErrorMsg(null);
        setReconnectCountdown(0);

        const token =
          localStorage.getItem('safehome_device_token') ||
          localStorage.getItem('supabase_token') ||
          localStorage.getItem('token');

        // Register as a phone sensor node
        ws.send(JSON.stringify({
          type: 'register_phone',
          device_name: 'Android Phone Sensor',
          device_id: deviceId,
          token
        }));

        // Start frame capture loop at 2 FPS (500ms interval) for edge AI processing
        startFrameCaptureLoop(ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'detection_result') {
            setLastDetections(data.detections || []);
            setLatencyMs(data.latency_ms || data.processing_time_ms || 0);
            renderDetectionBoxes(data.detections || []);
          }
        } catch (e) {
          // ignore
        }
      };

      ws.onerror = (e) => {
        console.error('WS Error:', e);
        setConnectionStatus('ERROR');
        setErrorMsg('WebSocket connection error. Verify Wi-Fi and laptop backend address.');
      };

      ws.onclose = () => {
        stopFrameCaptureLoop();
        if (shouldKeepReconnectingRef.current) {
          setConnectionStatus('RECONNECTING');
          scheduleReconnect();
        } else {
          setConnectionStatus('DISCONNECTED');
          setMonitoringActive(false);
        }
      };
    } catch (err) {
      setErrorMsg(`Connection error: ${err.message}`);
      setConnectionStatus('ERROR');
      if (shouldKeepReconnectingRef.current) {
        scheduleReconnect();
      }
    }
  };

  const scheduleReconnect = () => {
    let countdown = 3;
    setReconnectCountdown(countdown);

    const interval = setInterval(() => {
      countdown -= 1;
      setReconnectCountdown(countdown);
      if (countdown <= 0) {
        clearInterval(interval);
        if (shouldKeepReconnectingRef.current) {
          connectWebSocket();
        }
      }
    }, 1000);
  };

  // Stop Monitoring
  const stopMonitoring = () => {
    shouldKeepReconnectingRef.current = false;
    stopFrameCaptureLoop();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setMonitoringActive(false);
    setConnectionStatus('DISCONNECTED');
    setLastDetections([]);
    clearCanvas();
  };

  // Frame capture loop sending base64 JPEG packets at 2 FPS (every 500ms)
  const startFrameCaptureLoop = (ws) => {
    stopFrameCaptureLoop();

    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = 640;
    captureCanvas.height = 480;
    const ctx = captureCanvas.getContext('2d');

    let lastFpsTime = Date.now();
    let sentInSecond = 0;

    // 2 FPS = 500ms interval for balanced edge CPU inference
    frameIntervalRef.current = setInterval(() => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      // Draw current video frame to hidden canvas
      ctx.drawImage(videoRef.current, 0, 0, captureCanvas.width, captureCanvas.height);
      const jpegBase64 = captureCanvas.toDataURL('image/jpeg', 0.60);

      ws.send(JSON.stringify({
        type: 'frame',
        image: jpegBase64,
        timestamp: new Date().toISOString()
      }));

      frameCountRef.current += 1;
      setFramesSent(frameCountRef.current);
      sentInSecond += 1;

      const now = Date.now();
      if (now - lastFpsTime >= 1000) {
        setFps(sentInSecond);
        sentInSecond = 0;
        lastFpsTime = now;
      }
    }, 500); // 2 FPS
  };

  const stopFrameCaptureLoop = () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
    setFps(0);
  };

  // Render AI detection overlays on the phone display
  const renderDetectionBoxes = (detections) => {
    const canvas = canvasRef.current;
    if (!canvas || !videoRef.current) return;
    const ctx = canvas.getContext('2d');

    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    detections.forEach((det) => {
      const bb = det.bounding_box;
      if (!bb) return;

      // Stroke bounding box
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.strokeRect(bb.x, bb.y, bb.width, bb.height);

      // Label background
      const text = `${det.class.toUpperCase()} ${Math.round(det.confidence * 100)}%`;
      ctx.font = 'bold 14px monospace';
      const textWidth = ctx.measureText(text).width;

      ctx.fillStyle = 'rgba(56, 189, 248, 0.9)';
      ctx.fillRect(bb.x, Math.max(0, bb.y - 24), textWidth + 12, 24);

      // Label text
      ctx.fillStyle = '#0f172a';
      ctx.fillText(text, bb.x + 6, Math.max(16, bb.y - 7));
    });
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  return (
    <div className="max-w-xl mx-auto space-y-4 pb-12">
      {/* Privacy Notice Banner */}
      <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-sky-400" />
          <div>
            <h1 className="text-sm font-bold text-white">SafeHome AI Camera Node</h1>
            <p className="text-[11px] text-slate-400">Android Surveillance Sensor</p>
          </div>
        </div>

        {/* Live Privacy Indicator */}
        <div className="flex items-center gap-2">
          {monitoringActive ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1.5 animate-pulse">
              <span className="w-2 h-2 rounded-full bg-rose-400"></span>
              STREAMING ACTIVE
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-slate-800 text-slate-400">
              STANDBY
            </span>
          )}
        </div>
      </div>

      {/* Pairing Banner / Status */}
      {isPaired ? (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/60 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Paired with SafeHome Home Hub ({deviceId.slice(0, 8)})</span>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem('safehome_device_token');
              localStorage.removeItem('safehome_device_id');
              setIsPaired(false);
            }}
            className="text-[11px] text-slate-400 hover:text-white underline"
          >
            Unpair
          </button>
        </div>
      ) : (
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
            <Key className="w-4 h-4" /> Pair Phone with Laptop Hub
          </div>
          <p className="text-xs text-slate-400">
            Enter the 6-digit code shown on your laptop dashboard to authorize this camera sensor:
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              maxLength={6}
              value={pairingCodeInput}
              onChange={(e) => setPairingCodeInput(e.target.value.toUpperCase())}
              placeholder="e.g. A9F2D1"
              className="flex-1 px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono tracking-widest uppercase text-white focus:outline-none focus:border-sky-500 text-center"
            />
            <button
              onClick={() => handlePairDevice()}
              disabled={pairingLoading || pairingCodeInput.trim().length !== 6}
              className="px-4 py-2.5 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs hover:bg-sky-400 disabled:opacity-50 transition"
            >
              {pairingLoading ? 'Pairing...' : 'Pair Camera'}
            </button>
          </div>
        </div>
      )}

      {pairingSuccessMsg && (
        <div className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-800 text-xs text-emerald-200 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>{pairingSuccessMsg}</span>
        </div>
      )}

      {/* Reconnecting Banner */}
      {connectionStatus === 'RECONNECTING' && (
        <div className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-800 text-xs text-amber-200 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-400" />
            <span>Connection dropped. Reconnecting in {reconnectCountdown}s...</span>
          </div>
          <button
            onClick={() => connectWebSocket()}
            className="text-xs text-white underline font-medium"
          >
            Retry Now
          </button>
        </div>
      )}

      {/* Error Display */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-900/60 text-xs text-rose-200 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div>{errorMsg}</div>
        </div>
      )}

      {/* Camera Viewport Container */}
      <div className="relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center">
        {/* HTML5 Video Element */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className={`w-full h-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
        />

        {/* Canvas Overlay for Live AI Bounding Boxes */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />

        {/* Pre-permission Placeholder */}
        {!permissionGranted && (
          <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center space-y-4">
            <Camera className="w-12 h-12 text-sky-400" />
            <div className="space-y-1">
              <h3 className="font-semibold text-white text-sm">Camera Permission Required</h3>
              <p className="text-xs text-slate-400 max-w-xs">
                Tap below to grant camera access to use this device as an intelligent safety sensor.
              </p>
            </div>
            <button
              onClick={() => initCamera()}
              className="px-4 py-2.5 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs hover:bg-sky-400 transition"
            >
              Grant Camera Permission
            </button>
          </div>
        )}

        {/* Quick Flip Camera Button */}
        {permissionGranted && (
          <button
            onClick={switchCamera}
            className="absolute top-3 right-3 p-2 rounded-xl bg-slate-900/80 backdrop-blur border border-slate-700 text-slate-300 hover:text-white"
            title="Switch Camera"
          >
            <FlipHorizontal className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Main Controls: Start/Stop Monitoring */}
      <div className="grid grid-cols-2 gap-3">
        {!monitoringActive ? (
          <button
            onClick={startMonitoring}
            className="col-span-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-[0.99] transition"
          >
            <Play className="w-4 h-4 fill-current" /> Start Monitoring
          </button>
        ) : (
          <button
            onClick={stopMonitoring}
            className="col-span-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-crimson-600 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 hover:brightness-110 active:scale-[0.99] transition"
          >
            <Square className="w-4 h-4 fill-current" /> Stop Monitoring
          </button>
        )}
      </div>

      {/* Live Telemetry / Diagnostics */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Telemetry & Connection</h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">Status</div>
            <div className={`text-xs font-mono font-bold mt-1 ${connectionStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-slate-400'}`}>
              {connectionStatus}
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">Stream FPS</div>
            <div className="text-xs font-mono font-bold text-sky-400 mt-1">
              {fps} fps
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">Latency</div>
            <div className="text-xs font-mono font-bold text-emerald-400 mt-1">
              {latencyMs} ms
            </div>
          </div>
        </div>

        {/* Current Detections List */}
        <div className="pt-2 border-t border-slate-800">
          <div className="text-[11px] text-slate-400 mb-1">Live Detections:</div>
          {lastDetections.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {lastDetections.map((d, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-mono">
                  {d.class} ({Math.round(d.confidence * 100)}%)
                </span>
              ))}
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">No targets detected in current view</div>
          )}
        </div>
      </div>

      {/* Laptop Backend Host Configuration */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 space-y-2">
        <label className="text-xs font-semibold text-slate-400 block">Laptop Backend WebSocket Address</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={backendWsUrl}
            onChange={(e) => setBackendWsUrl(e.target.value)}
            disabled={monitoringActive}
            placeholder="ws://192.168.1.10:5000/ws"
            className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-white focus:outline-none focus:border-sky-500 disabled:opacity-50"
          />
          <button
            onClick={() => setBackendWsUrl(WS_BASE)}
            disabled={monitoringActive}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50"
            title="Reset to default WebSocket address"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[11px] text-slate-500">
          Connects phone camera frames to the SafeHome AI inference service running on your laptop.
        </p>
      </div>
    </div>
  );
}
