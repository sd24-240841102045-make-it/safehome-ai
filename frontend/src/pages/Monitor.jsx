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
  FlipHorizontal
} from 'lucide-react';
import { WS_BASE } from '../services/api';

export default function Monitor() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED'); // DISCONNECTED, CONNECTING, CONNECTED, ERROR
  const [backendWsUrl, setBackendWsUrl] = useState(() => {
    const host = window.location.hostname || 'localhost';
    return `ws://${host}:5000/ws`;
  });
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) or 'user' (front)
  const [fps, setFps] = useState(0);
  const [framesSent, setFramesSent] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);
  const [lastDetections, setLastDetections] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const frameCountRef = useRef(0);

  // Stop camera stream on unmount
  useEffect(() => {
    return () => {
      stopMonitoring();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
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
          ? 'Camera permission was denied. Please allow camera permissions in your browser settings.'
          : `Camera error: ${err.message}`
      );
    }
  };

  // Flip between front and rear cameras
  const switchCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    initCamera(nextMode);
  };

  // Start Monitoring: Connect WebSocket and stream frames
  const startMonitoring = async () => {
    if (!permissionGranted) {
      await initCamera();
    }

    try {
      setConnectionStatus('CONNECTING');
      const ws = new WebSocket(backendWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('CONNECTED');
        setMonitoringActive(true);
        setErrorMsg(null);

        // Register as a phone sensor node
        ws.send(JSON.stringify({
          type: 'register_phone',
          device_name: 'Android Phone Sensor',
          device_id: `phone_${navigator.userAgent.includes('Android') ? 'android' : 'mobile'}_node`
        }));

        // Start frame capture loop (approx. 5 frames per second for smooth CPU AI processing)
        startFrameCaptureLoop(ws);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'detection_result') {
            setLastDetections(data.detections || []);
            setLatencyMs(data.processing_time_ms || 0);
            renderDetectionBoxes(data.detections || []);
          }
        } catch (e) {
          // ignore
        }
      };

      ws.onerror = (e) => {
        console.error('WS Error:', e);
        setConnectionStatus('ERROR');
        setErrorMsg('Failed to connect to laptop backend. Verify the IP address and Wi-Fi connection.');
      };

      ws.onclose = () => {
        setConnectionStatus('DISCONNECTED');
        setMonitoringActive(false);
        stopFrameCaptureLoop();
      };
    } catch (err) {
      setErrorMsg(`Connection error: ${err.message}`);
      setConnectionStatus('ERROR');
    }
  };

  // Stop Monitoring
  const stopMonitoring = () => {
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

  // Frame capture loop sending base64 JPEG packets
  const startFrameCaptureLoop = (ws) => {
    stopFrameCaptureLoop();

    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = 640;
    captureCanvas.height = 480;
    const ctx = captureCanvas.getContext('2d');

    let lastFpsTime = Date.now();
    let sentInSecond = 0;

    frameIntervalRef.current = setInterval(() => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      // Draw current video frame to hidden canvas
      ctx.drawImage(videoRef.current, 0, 0, captureCanvas.width, captureCanvas.height);
      const jpegBase64 = captureCanvas.toDataURL('image/jpeg', 0.65);

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
    }, 200); // 5 FPS
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
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 3;
      ctx.strokeRect(bb.x, bb.y, bb.width, bb.height);

      // Label background
      const text = `${det.class.toUpperCase()} ${Math.round(det.confidence * 100)}%`;
      ctx.font = 'bold 14px monospace';
      const textWidth = ctx.measureText(text).width;

      ctx.fillStyle = 'rgba(0, 229, 255, 0.85)';
      ctx.fillRect(bb.x, Math.max(0, bb.y - 24), textWidth + 12, 24);

      // Label text
      ctx.fillStyle = '#06090f';
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
      {/* Privacy Notice Banner (Specification 15) */}
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

      {/* Error / Alert Display */}
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
            <div className="text-[10px] text-slate-500 uppercase">AI Latency</div>
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

      {/* Laptop Backend Host Configuration (Specification 25) */}
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
            onClick={() => {
              const host = window.location.hostname || 'localhost';
              setBackendWsUrl(`ws://${host}:5000/ws`);
            }}
            disabled={monitoringActive}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50"
            title="Reset to current host"
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
