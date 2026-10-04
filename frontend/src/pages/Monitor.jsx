import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Camera,
  Play,
  Square,
  RefreshCw,
  Shield,
  CheckCircle2,
  AlertCircle,
  FlipHorizontal,
  Key,
  Radio,
  WifiOff,
  Maximize2,
  Minimize2,
  Lock,
  Unlock,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  BellRing,
  ShieldCheck,
  Zap,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Activity,
  Sun,
  Battery,
  BatteryCharging,
  Siren,
  ShieldAlert,
  AlertTriangle
} from 'lucide-react';
import { deviceService, WS_BASE } from '../services/api';
import InstallPrompt from '../components/InstallPrompt';

export default function Monitor() {
  const navigate = useNavigate();

  // Core state
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED');
  const [backendWsUrl, setBackendWsUrl] = useState(() => WS_BASE);
  const [facingMode, setFacingMode] = useState('environment');
  const [fps, setFps] = useState(0);
  const [streamFps, setStreamFps] = useState(10);
  const [latencyMs, setLatencyMs] = useState(0);
  const [lastDetections, setLastDetections] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [webrtcStatus, setWebrtcStatus] = useState('OFF');
  const [reconnectCountdown, setReconnectCountdown] = useState(0);

  // Covert Stealth Mode: Keep phone camera silent so it doesn't alert the person / intruder
  const [covertStealthMode, setCovertStealthMode] = useState(() => localStorage.getItem('safehome_covert_mode') !== 'false');
  const covertStealthModeRef = useRef(covertStealthMode);

  useEffect(() => {
    covertStealthModeRef.current = covertStealthMode;
    localStorage.setItem('safehome_covert_mode', String(covertStealthMode));
  }, [covertStealthMode]);

  // Phone Hardware Features: Torch & Battery & Tamper
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchActive, setTorchActive] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState(null);
  const [isCharging, setIsCharging] = useState(false);
  const [tamperGuardActive, setTamperGuardActive] = useState(true);

  // Loitering Alert System
  const [loiteringAlertsEnabled, setLoiteringAlertsEnabled] = useState(true);
  const [loiteringThresholdSec, setLoiteringThresholdSec] = useState(10);
  const [loiteringTimeInFrame, setLoiteringTimeInFrame] = useState(0);

  // Acoustic Sensor & Microphone Protection System
  const [micGuardActive, setMicGuardActive] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const [decibelLevel, setDecibelLevel] = useState(25);
  const [noiseThreshold, setNoiseThreshold] = useState(80);

  // Active Alarm State
  const [activeAlarm, setActiveAlarm] = useState(null);

  // Pairing state
  const [pairingCodeInput, setPairingCodeInput] = useState('');
  const [isPaired, setIsPaired] = useState(() =>
    Boolean(localStorage.getItem('safehome_device_token') || localStorage.getItem('safehome_token') || localStorage.getItem('device_token'))
  );
  const [deviceId, setDeviceId] = useState(
    () => localStorage.getItem('safehome_device_id') || `phone_${Date.now().toString(36)}`
  );
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingSuccessMsg, setPairingSuccessMsg] = useState(null);

  // --- Pairing Handler ---
  const handlePairDevice = useCallback(async (codeToPair = pairingCodeInput) => {
    const code = (codeToPair || '').trim().toUpperCase();
    if (code.length !== 6) {
      setErrorMsg('Pairing code must be exactly 6 characters.');
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
        setPairingSuccessMsg('Phone paired successfully with SafeHome AI Hub!');
        setTimeout(() => setPairingSuccessMsg(null), 4000);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Invalid or expired pairing code.');
    } finally {
      setPairingLoading(false);
    }
  }, [pairingCodeInput]);

  // UI collapse state
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const wsRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const frameIntervalRef = useRef(null);
  const frameCountRef = useRef(0);
  const shouldKeepReconnectingRef = useRef(false);
  const wakeLockSentinelRef = useRef(null);
  const containerRef = useRef(null);
  const pcRef = useRef(null);
  const streamFpsRef = useRef(streamFps);
  const heartbeatIntervalRef = useRef(null);

  // Backpressure gate: only send next frame AFTER AI result returns
  const waitingForResultRef = useRef(false);
  const lastSendTimeRef = useRef(0);
  const aiResolutionRef = useRef({ width: 480, height: 270 });

  // Timing / FPS tracking
  const fpsCountRef = useRef(0);
  const fpsTimerRef = useRef(null);
  const reconnectIntervalRef = useRef(null);

  // Audio / Alert Refs
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const noiseIntervalRef = useRef(null);
  const personPresenceStartRef = useRef(null);
  const lastPersonSeenTimeRef = useRef(0);
  const lastLoiteringTriggerRef = useRef(0);
  const lastNoiseTriggerRef = useRef(0);
  const lastMaskAlertTriggerRef = useRef(0);

  // Sync state to refs
  const loiteringAlertsEnabledRef = useRef(loiteringAlertsEnabled);
  const loiteringThresholdSecRef = useRef(loiteringThresholdSec);
  const micGuardActiveRef = useRef(micGuardActive);
  const micMutedRef = useRef(micMuted);
  const noiseThresholdRef = useRef(noiseThreshold);

  useEffect(() => { streamFpsRef.current = streamFps; }, [streamFps]);
  useEffect(() => { loiteringAlertsEnabledRef.current = loiteringAlertsEnabled; }, [loiteringAlertsEnabled]);
  useEffect(() => { loiteringThresholdSecRef.current = loiteringThresholdSec; }, [loiteringThresholdSec]);
  useEffect(() => { micGuardActiveRef.current = micGuardActive; }, [micGuardActive]);
  useEffect(() => { micMutedRef.current = micMuted; }, [micMuted]);
  useEffect(() => { noiseThresholdRef.current = noiseThreshold; }, [noiseThreshold]);

  // Read ?code= query param and auto-pair immediately
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam && codeParam.trim().length === 6) {
      const cleanCode = codeParam.trim().toUpperCase();
      setPairingCodeInput(cleanCode);
      handlePairDevice(cleanCode);
    }
  }, [handlePairDevice]);

  // --- Wake Lock ---
  const requestWakeLock = async () => {
    if ('wakeLock' in navigator) {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        wakeLockSentinelRef.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener('release', () => {
          setWakeLockActive(false);
          wakeLockSentinelRef.current = null;
        });
      } catch (err) {
        console.warn('[WakeLock]', err.message);
        setWakeLockActive(false);
      }
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockSentinelRef.current) {
      try { await wakeLockSentinelRef.current.release(); } catch {}
      wakeLockSentinelRef.current = null;
      setWakeLockActive(false);
    }
  };

  useEffect(() => {
    const onVis = async () => {
      if (document.visibilityState === 'visible' && monitoringActive) await requestWakeLock();
    };
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, [monitoringActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      shouldKeepReconnectingRef.current = false;
      stopFrameCapture();
      stopAudioMonitoring();
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
      if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
      if (fpsTimerRef.current) clearInterval(fpsTimerRef.current);
      releaseWakeLock();
    };
  }, []);

  // --- Audio Alarm ---
  const playAlarmSound = (tone = 'warning') => {
    // In Covert Stealth Mode, keep phone camera completely silent so it doesn't alert the person / intruder
    if (covertStealthModeRef.current && tone !== 'siren') {
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      if (tone === 'siren') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(1100, ctx.currentTime + 0.25);
        osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.5);
        osc.frequency.linearRampToValueAtTime(1100, ctx.currentTime + 0.75);
        gain.gain.setValueAtTime(0.5, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.85);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.85);
        return;
      } else if (tone === 'tamper') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(450, ctx.currentTime + 0.4);
      } else if (tone === 'loitering') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.35);
      } else if (tone === 'noise') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(950, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1400, ctx.currentTime + 0.3);
      } else {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.3);
      }
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.38);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.38);
    } catch (e) {
      console.warn('Audio alarm error:', e);
    }
  };

  // --- Torch / Flashlight Toggle ---
  const toggleTorch = async () => {
    try {
      const track = streamRef.current?.getVideoTracks()[0];
      if (track) {
        const nextState = !torchActive;
        await track.applyConstraints({
          advanced: [{ torch: nextState }]
        });
        setTorchActive(nextState);
      }
    } catch (e) {
      console.warn('Could not toggle torch:', e);
    }
  };

  // --- Manual Deterrent Siren ---
  const triggerManualSiren = () => {
    playAlarmSound('siren');
    if ('vibrate' in navigator) navigator.vibrate([400, 150, 400, 150, 600]);
    setActiveAlarm({
      type: 'siren',
      title: 'DETERRENT SIREN ACTIVATED',
      message: 'High-pitch security siren sounding from phone speaker.'
    });
  };

  // --- Battery Monitoring API ---
  useEffect(() => {
    if ('getBattery' in navigator) {
      navigator.getBattery().then((battery) => {
        const updateBattery = () => {
          setBatteryLevel(Math.round(battery.level * 100));
          setIsCharging(Boolean(battery.charging));
        };
        updateBattery();
        battery.addEventListener('levelchange', updateBattery);
        battery.addEventListener('chargingchange', updateBattery);
      }).catch(() => {});
    }
  }, []);

  // --- Anti-Theft / Phone Tamper Accelerometer Sensor ---
  const lastTamperTriggerRef = useRef(0);
  useEffect(() => {
    if (!monitoringActive || !tamperGuardActive) return;
    const handleMotion = (event) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const mag = Math.sqrt((acc.x || 0) ** 2 + (acc.y || 0) ** 2 + (acc.z || 0) ** 2);
      // High physical displacement (>24 m/s^2) indicates phone dropped, picked up or knocked over
      if (mag > 24) {
        const now = Date.now();
        if (now - lastTamperTriggerRef.current > 15000) {
          lastTamperTriggerRef.current = now;
          playAlarmSound('tamper');
          if (!covertStealthModeRef.current && 'vibrate' in navigator) navigator.vibrate([400, 100, 400, 100, 500]);
          setActiveAlarm({
            type: 'tamper',
            title: 'CAMERA TAMPER / MOVEMENT DETECTED',
            message: 'Physical displacement detected. Camera may have been moved or knocked over.'
          });
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type: 'tamper_alert',
              magnitude: Math.round(mag),
              timestamp: new Date().toISOString()
            }));
          }
        }
      }
    };
    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [monitoringActive, tamperGuardActive]);

  const triggerLoiteringAlarm = (durationSec) => {
    playAlarmSound('loitering');
    if (!covertStealthModeRef.current && 'vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 500]);
    setActiveAlarm({
      type: 'loitering',
      title: 'PERSON LOITERING DETECTED',
      message: `Person in zone for ${durationSec}s. Potential security concern.`
    });

    // Capture current frame for loitering snapshot
    let snapshotBase64 = null;
    try {
      if (videoRef.current && canvasRef.current) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx && video.videoWidth > 0 && video.videoHeight > 0) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          snapshotBase64 = canvas.toDataURL('image/jpeg', 0.80);
        }
      }
    } catch (e) {
      console.warn('Could not capture loitering snapshot:', e);
    }

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ 
        type: 'loitering_alert', 
        duration_sec: durationSec, 
        image: snapshotBase64,
        timestamp: new Date().toISOString() 
      }));
    }
  };

  const triggerNoiseAlarm = (db) => {
    playAlarmSound('noise');
    if (!covertStealthModeRef.current && 'vibrate' in navigator) navigator.vibrate([200, 80, 200, 80, 400]);
    setActiveAlarm({
      type: 'noise',
      title: 'LOUD NOISE DETECTED',
      message: `Acoustic spike of ${db} dB detected by microphone guard.`
    });
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'loud_noise_alert', decibels: db, timestamp: new Date().toISOString() }));
    }
  };

  // --- Microphone Guard ---
  const startAudioMonitoring = async () => {
    if (!micGuardActive) return;
    if (audioContextRef.current?.state === 'running') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new Ctx();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;
      const source = audioCtx.createMediaStreamSource(stream);
      source.connect(analyser); // NOT connected to destination — privacy preserved
      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      noiseIntervalRef.current = setInterval(() => {
        if (!analyserRef.current || !micGuardActiveRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) sum += dataArray[i] * dataArray[i];
        const rms = Math.sqrt(sum / bufferLength);
        const estimatedDb = Math.min(100, Math.max(20, Math.round(20 + rms * 0.75)));
        setDecibelLevel(estimatedDb);
        if (!micMutedRef.current && estimatedDb >= noiseThresholdRef.current) {
          const now = Date.now();
          if (now - lastNoiseTriggerRef.current > 12000) {
            lastNoiseTriggerRef.current = now;
            triggerNoiseAlarm(estimatedDb);
          }
        }
      }, 150);
    } catch (err) {
      console.warn('[Mic Guard] Access declined:', err);
    }
  };

  const stopAudioMonitoring = () => {
    if (noiseIntervalRef.current) { clearInterval(noiseIntervalRef.current); noiseIntervalRef.current = null; }
    if (micStreamRef.current) { micStreamRef.current.getTracks().forEach(t => t.stop()); micStreamRef.current = null; }
    if (audioContextRef.current) { audioContextRef.current.close().catch(() => {}); audioContextRef.current = null; }
    analyserRef.current = null;
  };

  // --- Camera ---
  const initCamera = async (facing = facingMode) => {
    try {
      setErrorMsg(null);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());

      if (!navigator.mediaDevices?.getUserMedia) {
        const isHttp = window.location.protocol === 'http:';
        const isNotLocal = !['localhost', '127.0.0.1'].includes(window.location.hostname);
        if (isHttp && isNotLocal) {
          const originUrl = `http://${window.location.hostname}:5173`;
          setErrorMsg(
            <div className="space-y-3 text-left">
              <div className="font-bold text-amber-300 flex items-center gap-1.5 text-sm">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Camera Blocked by Chrome Security</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Android Chrome blocks camera on local IPs. One-time fix:
              </p>
              <div className="p-3 bg-slate-900/90 border border-slate-700/60 rounded-xl space-y-2 text-xs text-slate-300">
                <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-400">
                  <li>Open: <code className="text-amber-400 font-mono text-[10px] break-all">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code></li>
                  <li>Set <strong className="text-emerald-400">Enabled</strong>, enter: <code className="text-emerald-300 font-mono font-bold">{originUrl}</code></li>
                  <li>Tap <strong className="text-sky-400">Relaunch</strong> &amp; refresh</li>
                </ol>
              </div>
            </div>
          );
          setPermissionGranted(false);
          return;
        }
        setErrorMsg('Camera API not available. Use HTTPS or allow insecure origins.');
        setPermissionGranted(false);
        return;
      }

      // No artificial FPS cap — let the phone camera run at native FPS
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Check torch / flashlight capability on video track
      try {
        const track = stream.getVideoTracks()[0];
        if (track && typeof track.getCapabilities === 'function') {
          const cap = track.getCapabilities();
          setTorchAvailable(Boolean(cap.torch));
        } else {
          setTorchAvailable(false);
        }
      } catch (e) {
        setTorchAvailable(false);
      }

      setPermissionGranted(true);
      setFacingMode(facing);
    } catch (err) {
      console.error('Camera error:', err);
      setPermissionGranted(false);
      setErrorMsg(
        err.name === 'NotAllowedError'
          ? 'Camera permission denied. Allow in browser settings.'
          : `Camera error: ${err.message}`
      );
    }
  };

  const switchCamera = () => initCamera(facingMode === 'environment' ? 'user' : 'environment');

  const toggleFullscreen = async () => {
    const elem = containerRef.current || document.documentElement;
    if (!document.fullscreenElement) {
      try { await elem.requestFullscreen(); setIsFullscreen(true); } catch {}
    } else {
      try { await document.exitFullscreen(); setIsFullscreen(false); } catch {}
    }
  };

  // --- Bounding Box Overlay ---
  const drawBoundingBoxes = useCallback((detections) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    const vW = video.videoWidth || 640;
    const vH = video.videoHeight || 480;
    canvas.width = vW;
    canvas.height = vH;
    ctx.clearRect(0, 0, vW, vH);

    const aiRes = aiResolutionRef.current || { width: vW, height: vH };
    const scaleX = vW / (aiRes.width || vW);
    const scaleY = vH / (aiRes.height || vH);

    const colors = {
      threat: ['#f43f5e', 'rgba(244,63,94,0.92)'],
      person: ['#38bdf8', 'rgba(56,189,248,0.85)'],
      vehicle: ['#f59e0b', 'rgba(245,158,11,0.85)'],
      animal: ['#a78bfa', 'rgba(167,139,250,0.85)'],
      default: ['#34d399', 'rgba(52,211,153,0.85)']
    };

    for (const det of detections) {
      const box = det.bounding_box;
      if (!box) continue;
      const cls = det.class;
      const isMasked = cls === 'masked_person' || det.is_masked;
      const key = isMasked ? 'threat'
                : ['person','car','truck','bus','motorcycle','bicycle'].includes(cls) ? (cls === 'person' ? 'person' : 'vehicle')
                : ['cat','dog','bird','horse','cow','sheep'].includes(cls) ? 'animal' : 'default';
      const [stroke, fill] = colors[key];

      const bx = box.x * scaleX;
      const by = box.y * scaleY;
      const bw = box.width * scaleX;
      const bh = box.height * scaleY;

      ctx.strokeStyle = stroke;
      ctx.lineWidth = isMasked ? 3.5 : 2.5;
      ctx.strokeRect(bx, by, bw, bh);

      let labelText = `${cls.toUpperCase()} ${Math.round(det.confidence * 100)}%`;
      if (isMasked) {
        labelText = det.face_status === 'half_face' ? `[HALF-FACE] ${Math.round(det.confidence * 100)}%` : `[MASKED PERSON] ${Math.round(det.confidence * 100)}%`;
      }

      ctx.font = 'bold 12px monospace';
      const tw = ctx.measureText(labelText).width;
      ctx.fillStyle = fill;
      ctx.fillRect(bx, Math.max(0, by - 20), tw + 8, 20);
      ctx.fillStyle = isMasked ? '#ffffff' : '#020617';
      ctx.fillText(labelText, bx + 4, Math.max(14, by - 5));
    }
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  };

  // --- BACKPRESSURE-GATED FRAME CAPTURE ---
  const stopFrameCapture = () => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    if (frameIntervalRef.current) { clearInterval(frameIntervalRef.current); frameIntervalRef.current = null; }
    if (fpsTimerRef.current) { clearInterval(fpsTimerRef.current); fpsTimerRef.current = null; }
  };

  const startFrameCapture = (ws) => {
    stopFrameCapture();
    waitingForResultRef.current = false;
    lastSendTimeRef.current = 0;
    fpsCountRef.current = 0;

    // FPS counter updated every second
    fpsTimerRef.current = setInterval(() => {
      setFps(fpsCountRef.current);
      fpsCountRef.current = 0;
    }, 1000);

    // Capture canvas with dynamic aspect ratio preservation
    const aiCanvas = document.createElement('canvas');
    const aiCtx = aiCanvas.getContext('2d', { willReadFrequently: true });

    const targetFps = streamFpsRef.current || 15;
    const minInterval = Math.max(33, Math.round(1000 / targetFps)); // min ms between sends

    const sendFrame = () => {
      if (!videoRef.current || videoRef.current.readyState < 2) {
        frameIntervalRef.current = setTimeout(sendFrame, 40);
        return;
      }
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        frameIntervalRef.current = setTimeout(sendFrame, 150);
        return;
      }

      const now = performance.now();

      // Backpressure failsafe: if waiting for AI result took > 600ms, unlock to prevent stall
      if (waitingForResultRef.current && (now - lastSendTimeRef.current < 600)) {
        frameIntervalRef.current = setTimeout(sendFrame, 20);
        return;
      }

      // Throttle to target FPS
      const elapsed = now - lastSendTimeRef.current;
      if (elapsed < minInterval) {
        frameIntervalRef.current = setTimeout(sendFrame, minInterval - elapsed);
        return;
      }

      // Calculate aspect-ratio preserving dimensions (max 480px)
      const vW = videoRef.current.videoWidth || 640;
      const vH = videoRef.current.videoHeight || 480;
      const maxDim = 480;
      const scale = Math.min(maxDim / vW, maxDim / vH, 1.0);
      const targetW = Math.max(160, Math.round((vW * scale) / 2) * 2);
      const targetH = Math.max(120, Math.round((vH * scale) / 2) * 2);

      if (aiCanvas.width !== targetW || aiCanvas.height !== targetH) {
        aiCanvas.width = targetW;
        aiCanvas.height = targetH;
        aiResolutionRef.current = { width: targetW, height: targetH };
      }

      aiCtx.drawImage(videoRef.current, 0, 0, targetW, targetH);
      const jpegBase64 = aiCanvas.toDataURL('image/jpeg', 0.55);

      waitingForResultRef.current = true;
      lastSendTimeRef.current = now;

      ws.send(JSON.stringify({
        type: 'frame',
        image: jpegBase64,
        client_time: performance.now(),
        timestamp: new Date().toISOString()
      }));

      fpsCountRef.current += 1;
      frameCountRef.current += 1;
      frameIntervalRef.current = setTimeout(sendFrame, minInterval);
    };

    sendFrame();
  };

  const startHeartbeat = (ws) => {
    if (heartbeatIntervalRef.current) clearInterval(heartbeatIntervalRef.current);
    heartbeatIntervalRef.current = setInterval(async () => {
      if (ws?.readyState !== WebSocket.OPEN) return;
      let batteryLevel = null;
      let batteryCharging = false;
      try {
        if (typeof navigator !== 'undefined' && 'getBattery' in navigator) {
          const b = await navigator.getBattery();
          batteryLevel = Math.round(b.level * 100);
          batteryCharging = b.charging;
        }
      } catch {}
      try {
        ws.send(JSON.stringify({
          type: 'heartbeat',
          battery_level: batteryLevel,
          battery_charging: batteryCharging,
          network_online: navigator.onLine,
          fps: fps,
          latency_ms: latencyMs,
          timestamp: Date.now()
        }));
      } catch {}
    }, 5000);
  };

  const stopHeartbeat = () => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  };

  // --- WebSocket ---
  const connectWebSocket = () => {
    try {
      setConnectionStatus('CONNECTING');
      setErrorMsg(null);
      if (wsRef.current) wsRef.current.close();

      const ws = new WebSocket(backendWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('CONNECTED');
        const deviceToken = localStorage.getItem('safehome_device_token') || localStorage.getItem('safehome_token');
        ws.send(JSON.stringify({
          type: 'register_phone',
          device_token: deviceToken,
          device_id: deviceId,
          device_name: 'Android Phone Camera'
        }));
        startFrameCapture(ws);
        setupWebRTC(ws);
        startHeartbeat(ws);
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'registered') setDeviceId(msg.device_id);

          if (msg.type === 'webrtc_answer' && msg.sdp && pcRef.current) {
            try {
              await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
              setWebrtcStatus('CONNECTED');
            } catch (e) { console.warn('[WebRTC] Answer error:', e); }
          }

          if (msg.type === 'webrtc_ice_candidate' && msg.candidate && pcRef.current) {
            try { await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate)); } catch {}
          }

          if (msg.type === 'webrtc_request_offer' && wsRef.current?.readyState === WebSocket.OPEN) {
            setupWebRTC(wsRef.current);
          }

          if (msg.type === 'detection_result') {
            // CRITICAL: release backpressure gate so next frame can be sent
            waitingForResultRef.current = false;

            const dets = msg.detections || [];
            setLastDetections(dets);

            // Accurate RTT latency using echo'd client_time (single clock, no cross-device drift)
            if (msg.client_time != null) {
              const rtt = Math.round(performance.now() - msg.client_time);
              setLatencyMs(Math.max(0, rtt));
            } else {
              setLatencyMs(msg.latency_ms || 0);
            }
            drawBoundingBoxes(dets);

            // Immediate threat alert on face mask or half-face concealment
            const maskedDet = dets.find(d => d.class === 'masked_person' || d.is_masked);
            if (maskedDet) {
              const now = Date.now();
              if (now - lastMaskAlertTriggerRef.current > 10000) {
                lastMaskAlertTriggerRef.current = now;
                playAlarmSound('noise');
                if ('vibrate' in navigator) navigator.vibrate([300, 100, 300, 100, 500]);
                const alertTitle = maskedDet.face_status === 'half_face' ? 'HALF-FACE VISIBLE DETECTED' : 'MASKED PERSON DETECTED';
                const alertMsg = maskedDet.anomaly_reason || maskedDet.face_reason || 'Person with face mask or half-face visible detected on camera.';
                setActiveAlarm({ type: 'threat', title: alertTitle, message: alertMsg });
              }
            }

            // Loitering detection with grace-period smoothing & synced refs
            if (loiteringAlertsEnabledRef.current) {
              const hasPerson = dets.some(d => {
                const c = (d.class || d.label || d.category || '').toLowerCase();
                return c === 'person';
              });
              const now = Date.now();
              const threshold = loiteringThresholdSecRef.current;

              if (hasPerson) {
                lastPersonSeenTimeRef.current = now;
                if (!personPresenceStartRef.current) personPresenceStartRef.current = now;
                const secondsInView = Math.floor((now - personPresenceStartRef.current) / 1000);
                setLoiteringTimeInFrame(secondsInView);
                if (secondsInView >= threshold && now - lastLoiteringTriggerRef.current > 15000) {
                  lastLoiteringTriggerRef.current = now;
                  triggerLoiteringAlarm(secondsInView);
                }
              } else {
                // 2.5s grace period: prevent instant timer resets due to camera/YOLO single-frame detection drops
                const timeSinceLastSeen = now - lastPersonSeenTimeRef.current;
                if (timeSinceLastSeen > 2500) {
                  personPresenceStartRef.current = null;
                  setLoiteringTimeInFrame(0);
                }
              }
            }
          }

          if (msg.type === 'safety_alert') {
            playAlarmSound(msg.severity === 'CRITICAL' ? 'noise' : 'loitering');
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
            setActiveAlarm({ type: 'safety', title: msg.title || 'SAFETY ALERT', message: msg.message || 'Alert triggered.' });
          }

          if (msg.type === 'error' && msg.code === 'AUTH_FAILED') {
            setErrorMsg('Auth expired. Re-pair your phone.');
            setIsPaired(false);
            localStorage.removeItem('safehome_device_token');
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onerror = () => {
        setConnectionStatus('ERROR');
        setErrorMsg('Connection failed. Check Wi-Fi and laptop address.');
      };

      ws.onclose = () => {
        stopHeartbeat();
        stopFrameCapture();
        stopAudioMonitoring();
        waitingForResultRef.current = false;
        if (shouldKeepReconnectingRef.current) {
          setConnectionStatus('RECONNECTING');
          scheduleReconnect();
        } else {
          setConnectionStatus('DISCONNECTED');
          setMonitoringActive(false);
          releaseWakeLock();
        }
      };
    } catch (err) {
      setErrorMsg(`Connection error: ${err.message}`);
      setConnectionStatus('ERROR');
      if (shouldKeepReconnectingRef.current) scheduleReconnect();
    }
  };

  const scheduleReconnect = () => {
    if (reconnectIntervalRef.current) clearInterval(reconnectIntervalRef.current);
    let countdown = 3;
    setReconnectCountdown(countdown);
    reconnectIntervalRef.current = setInterval(() => {
      countdown -= 1;
      setReconnectCountdown(countdown);
      if (countdown <= 0) {
        clearInterval(reconnectIntervalRef.current);
        reconnectIntervalRef.current = null;
        if (shouldKeepReconnectingRef.current) connectWebSocket();
      }
    }, 1000);
  };

  // --- WebRTC ---
  const setupWebRTC = async (ws) => {
    if (!streamRef.current) return;
    try {
      if (pcRef.current) pcRef.current.close();
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }]
      });
      pcRef.current = pc;
      streamRef.current.getTracks().forEach(track => pc.addTrack(track, streamRef.current));
      pc.onicecandidate = (e) => {
        if (e.candidate && ws?.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'webrtc_ice_candidate', device_id: deviceId, candidate: e.candidate }));
        }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setWebrtcStatus('CONNECTED');
        else if (['failed', 'disconnected'].includes(pc.connectionState)) setWebrtcStatus('FALLBACK');
      };
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'webrtc_offer', device_id: deviceId, sdp: pc.localDescription }));
        setWebrtcStatus('OFFERING');
      }
    } catch (err) {
      console.warn('[WebRTC] Setup error:', err);
      setWebrtcStatus('FALLBACK');
    }
  };

  // --- Start / Stop Monitoring ---
  const startMonitoring = async () => {
    if (!permissionGranted) await initCamera();
    shouldKeepReconnectingRef.current = true;
    connectWebSocket();
    await requestWakeLock();
    if (micGuardActive) startAudioMonitoring();
    setMonitoringActive(true);
  };

  const stopMonitoring = () => {
    shouldKeepReconnectingRef.current = false;
    if (reconnectIntervalRef.current) { clearInterval(reconnectIntervalRef.current); reconnectIntervalRef.current = null; }
    stopFrameCapture();
    stopAudioMonitoring();
    waitingForResultRef.current = false;
    releaseWakeLock();
    setActiveAlarm(null);
    personPresenceStartRef.current = null;
    setLoiteringTimeInFrame(0);
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    setWebrtcStatus('OFF');
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    setMonitoringActive(false);
    setConnectionStatus('DISCONNECTED');
    setLastDetections([]);
    clearCanvas();
  };

  // Latency color
  const latencyColor = latencyMs < 200 ? 'text-emerald-400' : latencyMs < 500 ? 'text-amber-400' : 'text-rose-400';

  return (
    <div
      ref={containerRef}
      className="min-h-screen bg-[#0b0f19] text-slate-100"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 12px)' }}
    >
      {/* Mobile-optimised scrollable container */}
      <div className="max-w-lg mx-auto px-3 py-3 space-y-3">

        {/* PWA Install Banner */}
        <InstallPrompt />

        {/* ── TOP NAV BAR ── */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-900 border border-slate-800">
          <div className="flex items-center gap-2.5">
            {/* Back Button */}
            <button
              onClick={() => { if (monitoringActive) stopMonitoring(); navigate('/'); }}
              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition active:scale-95"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-white flex items-center gap-2">
                <Shield className="w-4 h-4 text-sky-400" />
                SafeHome AI Camera
              </h1>
              <p className="text-[11px] text-slate-400">Phone Surveillance Sensor</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {monitoringActive ? (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40 flex items-center gap-1.5 animate-pulse">
                <span className="w-2 h-2 rounded-full bg-rose-400" />
                LIVE
              </span>
            ) : (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-slate-800 text-slate-400">
                STANDBY
              </span>
            )}
          </div>
        </div>

        {/* ── ACTIVE ALARM BANNER ── */}
        {activeAlarm && (
          <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950 via-rose-900 to-amber-950 border-2 border-rose-500 shadow-xl shadow-rose-950/60 animate-pulse flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-600/40 text-rose-300 shrink-0">
                <BellRing className="w-5 h-5 animate-bounce" />
              </div>
              <div>
                <h2 className="text-sm font-black text-rose-100 uppercase tracking-wide">{activeAlarm.title}</h2>
                <p className="text-xs text-rose-200/90 mt-0.5 leading-relaxed">{activeAlarm.message}</p>
                <p className="text-[10px] text-rose-300/70 font-mono mt-1">Siren & vibration active</p>
              </div>
            </div>
            <button
              onClick={() => setActiveAlarm(null)}
              className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shrink-0 shadow transition active:scale-95"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ── PAIRING SECTION ── */}
        {isPaired ? (
          <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/60 text-xs text-emerald-300 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Paired — ID: {deviceId.slice(0, 10)}…</span>
            </div>
            <button
              onClick={() => { localStorage.removeItem('safehome_device_token'); localStorage.removeItem('safehome_device_id'); setIsPaired(false); }}
              className="text-[11px] text-slate-400 hover:text-white underline"
            >
              Unpair
            </button>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
              <Key className="w-4 h-4" /> Pair with Laptop Hub
            </div>
            <p className="text-xs text-slate-400">Enter the 6-digit code from your laptop dashboard:</p>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                value={pairingCodeInput}
                onChange={e => setPairingCodeInput(e.target.value.toUpperCase())}
                placeholder="A9F2D1"
                className="flex-1 px-3 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono tracking-widest uppercase text-white focus:outline-none focus:border-sky-500 text-center"
              />
              <button
                onClick={() => handlePairDevice()}
                disabled={pairingLoading || pairingCodeInput.trim().length !== 6}
                className="px-4 py-2.5 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs hover:bg-sky-400 disabled:opacity-50 transition active:scale-95"
              >
                {pairingLoading ? 'Pairing…' : 'Pair'}
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
              <span>Reconnecting in {reconnectCountdown}s…</span>
            </div>
            <button onClick={connectWebSocket} className="text-xs text-white underline font-medium">Retry Now</button>
          </div>
        )}

        {/* Error Display */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-950/50 border border-rose-900/60 text-xs text-rose-200 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>{errorMsg}</div>
          </div>
        )}

        {/* ── CAMERA VIEWPORT ── */}
        <div className={`relative bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center ${
          isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none w-screen h-screen' : 'aspect-video'
        }`}>
          <video
            ref={videoRef}
            playsInline muted autoPlay
            className={`w-full h-full object-contain ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
          />
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />

          {/* HUD Badges — top left */}
          <div className="absolute top-2 left-2 flex flex-wrap items-center gap-1 pointer-events-none">
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border flex items-center gap-1 ${
              covertStealthMode ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' : 'bg-slate-900/60 text-slate-400 border-slate-800'
            }`}>
              {covertStealthMode ? (
                <>
                  <VolumeX className="w-2.5 h-2.5" /> Stealth (Silent)
                </>
              ) : (
                <>
                  <Volume2 className="w-2.5 h-2.5" /> Phone Sounds
                </>
              )}
            </span>
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border flex items-center gap-0.5 ${
              wakeLockActive ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-900/60 text-slate-400 border-slate-800'
            }`}>
              {wakeLockActive ? <Lock className="w-2.5 h-2.5" /> : <Unlock className="w-2.5 h-2.5" />}
              {wakeLockActive ? 'Awake' : 'Normal'}
            </span>
            {batteryLevel !== null && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-900/60 text-slate-300 border border-slate-800 flex items-center gap-0.5">
                {isCharging ? <BatteryCharging className="w-2.5 h-2.5 text-emerald-400" /> : <Battery className="w-2.5 h-2.5 text-amber-400" />}
                {batteryLevel}%
              </span>
            )}
            {monitoringActive && (
              <>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                  {fps} FPS
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                  latencyMs < 200 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : latencyMs < 500 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                  : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                }`}>
                  {latencyMs}ms
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold border flex items-center gap-0.5 ${
                  webrtcStatus === 'CONNECTED' ? 'bg-purple-500/20 text-purple-300 border-purple-500/40' : 'bg-slate-900/60 text-slate-400 border-slate-800'
                }`}>
                  <Radio className="w-2.5 h-2.5" />P2P:{webrtcStatus}
                </span>
              </>
            )}
          </div>

          {/* Viewport controls — top right */}
          <div className="absolute top-2 right-2 flex items-center gap-1.5">
            {permissionGranted && (
              <>
                <button
                  onClick={toggleTorch}
                  disabled={!torchAvailable}
                  className={`p-1.5 rounded-xl backdrop-blur border transition ${
                    torchActive
                      ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/30'
                      : torchAvailable
                      ? 'bg-slate-900/80 border-slate-700 text-slate-300 hover:text-white'
                      : 'bg-slate-900/40 border-slate-800 text-slate-600 opacity-40 cursor-not-allowed'
                  }`}
                  title={torchAvailable ? (torchActive ? 'Turn Off Torch' : 'Turn On Torch') : 'Torch not available on this camera'}
                >
                  <Sun className="w-4 h-4" />
                </button>
                <button
                  onClick={switchCamera}
                  className="p-1.5 rounded-xl bg-slate-900/80 backdrop-blur border border-slate-700 text-slate-300 hover:text-white transition"
                  title="Flip Camera"
                >
                  <FlipHorizontal className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={toggleFullscreen}
              className="p-1.5 rounded-xl bg-slate-900/80 backdrop-blur border border-slate-700 text-slate-300 hover:text-white transition"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>

          {/* Pre-permission overlay */}
          {!permissionGranted && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center space-y-4">
              <Camera className="w-12 h-12 text-sky-400" />
              <div className="space-y-1">
                <h3 className="font-semibold text-white text-sm">Camera Permission Required</h3>
                <p className="text-xs text-slate-400 max-w-xs">
                  Allow camera access to use this phone as a safety sensor.
                </p>
              </div>
              <button onClick={() => initCamera()} className="px-4 py-2.5 rounded-xl bg-sky-500 text-slate-950 font-bold text-xs hover:bg-sky-400 transition active:scale-95">
                Grant Camera Access
              </button>
            </div>
          )}
        </div>

        {/* ── START / STOP BUTTON ── */}
        {!monitoringActive ? (
          <button
            onClick={startMonitoring}
            className="w-full py-4 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 hover:brightness-110 active:scale-[0.99] transition"
          >
            <Activity className="w-5 h-5" /> Start Monitoring
          </button>
        ) : (
          <button
            onClick={stopMonitoring}
            className="w-full py-4 px-4 rounded-xl bg-gradient-to-r from-rose-600 to-rose-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-rose-600/20 hover:brightness-110 active:scale-[0.99] transition"
          >
            <Square className="w-5 h-5 fill-current" /> Stop Monitoring
          </button>
        )}

        {/* ── LIVE TELEMETRY ROW ── */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Status</div>
            <div className={`text-xs font-mono font-bold mt-1 ${connectionStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-slate-400'}`}>
              {connectionStatus}
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Stream</div>
            <div className="text-xs font-mono font-bold text-sky-400 mt-1">{fps} fps</div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/90 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase font-semibold">Latency</div>
            <div className={`text-xs font-mono font-bold mt-1 ${latencyColor}`}>{latencyMs} ms</div>
          </div>
        </div>

        {/* Live Detections */}
        {lastDetections.length > 0 && (
          <div className="px-3 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-slate-500 font-semibold mr-1">Detected:</span>
            {lastDetections.map((d, i) => (
              <span key={i} className="px-2 py-0.5 rounded-md bg-sky-500/20 text-sky-300 border border-sky-500/30 text-xs font-mono">
                {d.class} {Math.round(d.confidence * 100)}%
              </span>
            ))}
          </div>
        )}

        {/* ── STREAM FPS SELECTOR ── */}
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-400" /> AI Stream Rate
            </span>
            <span className="text-[11px] font-mono text-sky-400 font-bold">{streamFps} FPS</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[{v:10,l:'Smooth'},{v:15,l:'Ultra'},{v:2,l:'Eco'}].map(({v,l}) => (
              <button
                key={v}
                type="button"
                onClick={() => setStreamFps(v)}
                className={`py-2 rounded-xl text-xs font-semibold border transition active:scale-95 ${
                  streamFps === v
                    ? v===10 ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                    : v===15 ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                    : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
                }`}
              >
                {l} ({v} FPS)
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500">
            AI analyses frames at this rate. Camera preview always runs at full native speed.
          </p>
        </div>

        {/* ── PERSON LOITERING GUARD ── */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BellRing className={`w-4 h-4 ${loiteringAlertsEnabled ? 'text-amber-400' : 'text-slate-500'}`} />
              <div>
                <h3 className="text-xs font-bold text-white">Loitering Alarm</h3>
                <p className="text-[10px] text-slate-400">Siren + vibration if person lingers</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setLoiteringAlertsEnabled(!loiteringAlertsEnabled)}
              className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                loiteringAlertsEnabled ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}
            >
              {loiteringAlertsEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
          {loiteringAlertsEnabled && (
            <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Trigger after:</span>
                <div className="flex gap-1.5">
                  {[5, 10, 20].map(sec => (
                    <button key={sec} type="button" onClick={() => setLoiteringThresholdSec(sec)}
                      className={`px-2.5 py-0.5 rounded-lg text-xs font-mono transition ${
                        loiteringThresholdSec === sec ? 'bg-amber-500 text-slate-950 font-bold' : 'bg-slate-950 text-slate-400 border border-slate-800'
                      }`}
                    >{sec}s</button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[11px] font-mono">
                  <span className={loiteringTimeInFrame > 0 ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
                    {loiteringTimeInFrame > 0 ? `In zone: ${loiteringTimeInFrame}s` : 'Zone clear'}
                  </span>
                  <span className="text-slate-500">/{loiteringThresholdSec}s</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      loiteringTimeInFrame >= loiteringThresholdSec ? 'bg-rose-500 animate-pulse'
                      : loiteringTimeInFrame > 0 ? 'bg-amber-400' : 'bg-transparent'
                    }`}
                    style={{ width: `${Math.min(100, (loiteringTimeInFrame / loiteringThresholdSec) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── MICROPHONE GUARD ── */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                  Mic Guard
                  <span className="text-[10px] font-mono px-1.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Privacy</span>
                </h3>
                <p className="text-[10px] text-slate-400">Acoustic spike detection — zero audio saved</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                const next = !micGuardActive;
                setMicGuardActive(next);
                if (!next) stopAudioMonitoring();
                else if (monitoringActive) startAudioMonitoring();
              }}
              className={`px-3 py-1 rounded-full text-xs font-bold transition ${
                micGuardActive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-800 text-slate-500 border border-slate-700'
              }`}
            >
              {micGuardActive ? 'ACTIVE' : 'OFF'}
            </button>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-950 border border-emerald-500/20 text-[11px] text-slate-300 flex items-start gap-2">
            <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-semibold text-emerald-300">Privacy: </span>
              Decibels only — zero audio recorded, saved, or transmitted.
            </div>
          </div>

          {micGuardActive && (
            <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-sky-400" /> Noise Energy:
                </span>
                <div className="flex items-center gap-2">
                  <span className={`font-mono font-bold text-xs ${
                    decibelLevel >= noiseThreshold ? 'text-rose-400 animate-pulse' : decibelLevel > 60 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>{decibelLevel} dB</span>
                  <button
                    type="button"
                    onClick={() => setMicMuted(!micMuted)}
                    className={`p-1.5 rounded-lg border transition ${micMuted ? 'bg-rose-500/20 border-rose-500/40' : 'bg-slate-800 border-slate-700 hover:text-white'}`}
                  >
                    {micMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
                  </button>
                </div>
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden relative">
                <div className="absolute top-0 bottom-0 w-0.5 bg-rose-500/80 z-10" style={{ left: `${noiseThreshold}%` }} />
                <div
                  className={`h-full transition-all duration-150 ${
                    decibelLevel >= noiseThreshold ? 'bg-rose-500' : decibelLevel > 60 ? 'bg-amber-400' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, decibelLevel))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>20 dB</span>
                <span className="text-amber-400 font-bold">Trigger: {noiseThreshold} dB</span>
                <span>100 dB</span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Sensitivity:</span>
                <div className="flex gap-1.5">
                  {[{v:70,l:'70'},{v:80,l:'80'},{v:88,l:'88'}].map(({v,l}) => (
                    <button key={v} type="button" onClick={() => setNoiseThreshold(v)}
                      className={`px-2 py-0.5 rounded-lg text-xs font-mono transition ${
                        noiseThreshold === v ? 'bg-sky-500 text-slate-950 font-bold' : 'bg-slate-950 text-slate-400 border border-slate-800'
                      }`}
                    >{l} dB</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── PHONE HARDWARE DEFENSES & SENSORS ── */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-purple-400" />
              <div>
                <h3 className="text-xs font-bold text-white">Phone Hardware Defenses</h3>
                <p className="text-[10px] text-slate-400">Siren, flashlight & anti-theft sensors</p>
              </div>
            </div>
            {batteryLevel !== null && (
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300">
                {isCharging ? <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" /> : <Battery className="w-3.5 h-3.5 text-amber-400" />}
                <span>{batteryLevel}%</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/80">
            {/* Deterrent Siren Button */}
            <button
              type="button"
              onClick={triggerManualSiren}
              className="p-3 rounded-xl bg-gradient-to-r from-rose-950/80 to-rose-900/80 border border-rose-700/50 hover:border-rose-500 text-left transition active:scale-95 group"
            >
              <div className="flex items-center gap-1.5 text-rose-300 font-bold text-xs">
                <Siren className="w-4 h-4 animate-pulse group-hover:scale-110 transition" />
                Sound Siren
              </div>
              <p className="text-[10px] text-rose-200/70 mt-1">Blast deterrent alarm</p>
            </button>

            {/* Flashlight Torch Toggle */}
            <button
              type="button"
              onClick={toggleTorch}
              disabled={!torchAvailable}
              className={`p-3 rounded-xl border text-left transition active:scale-95 ${
                torchActive
                  ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                  : torchAvailable
                  ? 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                  : 'bg-slate-950/40 border-slate-900 text-slate-600 opacity-50 cursor-not-allowed'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold text-xs">
                <Sun className={`w-4 h-4 ${torchActive ? 'text-amber-400 fill-current' : 'text-slate-400'}`} />
                <span>{torchActive ? 'Torch: ON' : 'Torch: OFF'}</span>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">
                {torchAvailable ? 'Hardware LED flash' : 'Flash unavailable'}
              </p>
            </button>
          </div>

          {/* Covert Stealth Surveillance Toggle */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`p-1.5 rounded-lg ${covertStealthMode ? 'bg-indigo-500/20 text-indigo-300' : 'bg-slate-800 text-slate-400'}`}>
                <VolumeX className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-[11px] font-bold text-slate-200">Covert Stealth Mode (Phone Silent)</h4>
                <p className="text-[10px] text-slate-400">Keeps phone silent so intruder isn't alerted. Laptop sounds alarms.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setCovertStealthMode(!covertStealthMode)}
              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold font-mono transition ${
                covertStealthMode ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40' : 'bg-slate-900 text-slate-500 border border-slate-800'
              }`}
            >
              {covertStealthMode ? 'ON (SILENT)' : 'OFF'}
            </button>
          </div>

          {/* Anti-Tamper Shake / Displacement Guard Toggle */}
          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className={`w-4 h-4 ${tamperGuardActive ? 'text-emerald-400' : 'text-slate-500'}`} />
              <div>
                <h4 className="text-[11px] font-bold text-slate-200">Anti-Theft Tamper Sensor</h4>
                <p className="text-[10px] text-slate-400">Alerts if phone is moved or knocked over</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setTamperGuardActive(!tamperGuardActive)}
              className={`px-2.5 py-0.5 rounded-lg text-[10px] font-bold font-mono transition ${
                tamperGuardActive ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-slate-900 text-slate-500 border border-slate-800'
              }`}
            >
              {tamperGuardActive ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* ── ADVANCED: WEBSOCKET CONFIG (collapsible) ── */}
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="w-full px-4 py-3 flex items-center justify-between text-xs font-semibold text-slate-400 hover:text-white transition"
          >
            <span>Advanced — Backend Connection</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          {showAdvanced && (
            <div className="px-4 pb-4 space-y-2 border-t border-slate-800">
              <label className="text-[11px] text-slate-500 block mt-3">WebSocket Address</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={backendWsUrl}
                  onChange={e => setBackendWsUrl(e.target.value)}
                  disabled={monitoringActive}
                  placeholder="ws://192.168.1.10:5000/ws"
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-white focus:outline-none focus:border-sky-500 disabled:opacity-50"
                />
                <button
                  onClick={() => setBackendWsUrl(WS_BASE)}
                  disabled={monitoringActive}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50"
                  title="Reset to default"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
              <p className="text-[10px] text-slate-500">
                Must match laptop IP. Camera AI inference runs on laptop; results return to phone.
              </p>
            </div>
          )}
        </div>

        {/* Safety & Sensor Disclaimer */}
        <div className="p-3 rounded-xl bg-slate-900/50 border border-slate-800 text-[11px] text-slate-400 text-center leading-relaxed flex items-center justify-center gap-1.5 flex-wrap">
          <ShieldAlert className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span><span className="font-semibold text-slate-300">Safety Notice:</span> A phone camera is not a replacement for dedicated smoke, gas, fire, door or professional security sensors. AI results can be wrong.</span>
        </div>

      </div>
    </div>
  );
}
