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
  WifiOff,
  Maximize2,
  Minimize2,
  Lock,
  Unlock,
  Smartphone,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Bell,
  BellRing,
  ShieldCheck,
  Zap
} from 'lucide-react';
import { deviceService, WS_BASE } from '../services/api';
import InstallPrompt from '../components/InstallPrompt';

export default function Monitor() {
  const [permissionGranted, setPermissionGranted] = useState(false);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('DISCONNECTED'); // DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING, ERROR
  const [backendWsUrl, setBackendWsUrl] = useState(() => WS_BASE);
  const [facingMode, setFacingMode] = useState('environment'); // 'environment' (back) or 'user' (front)
  const [fps, setFps] = useState(0);
  const [streamFps, setStreamFps] = useState(10); // Default 10 FPS for fluid laptop playback
  const [framesSent, setFramesSent] = useState(0);
  const [latencyMs, setLatencyMs] = useState(0);
  const [lastDetections, setLastDetections] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [webrtcStatus, setWebrtcStatus] = useState('OFF');

  // Loitering Alert System
  const [loiteringAlertsEnabled, setLoiteringAlertsEnabled] = useState(true);
  const [loiteringThresholdSec, setLoiteringThresholdSec] = useState(10);
  const [loiteringTimeInFrame, setLoiteringTimeInFrame] = useState(0);

  // Acoustic Sensor & Microphone Protection System
  const [micGuardActive, setMicGuardActive] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const [decibelLevel, setDecibelLevel] = useState(25);
  const [noiseThreshold, setNoiseThreshold] = useState(80);

  // Active Alarm State (Visual/Audio on Phone)
  const [activeAlarm, setActiveAlarm] = useState(null); // { type, title, message }

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
  const wakeLockSentinelRef = useRef(null);
  const containerRef = useRef(null);
  const pcRef = useRef(null);
  const streamFpsRef = useRef(streamFps);

  // Audio / Alert Refs
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const micStreamRef = useRef(null);
  const noiseIntervalRef = useRef(null);
  const personPresenceStartRef = useRef(null);
  const lastLoiteringTriggerRef = useRef(0);
  const lastNoiseTriggerRef = useRef(0);

  // Dynamically update capture loop when target stream FPS changes
  useEffect(() => {
    streamFpsRef.current = streamFps;
    if (monitoringActive && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      startFrameCaptureLoop(wsRef.current);
    }
  }, [streamFps]);

  // Read ?code=XXXXXX query parameter on load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const codeParam = params.get('code');
    if (codeParam && codeParam.length === 6) {
      setPairingCodeInput(codeParam.toUpperCase());
    }
  }, []);

  // Screen Wake Lock API helpers
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
        console.warn('[WakeLock] Unable to acquire screen wake lock:', err.message);
        setWakeLockActive(false);
      }
    }
  };

  const releaseWakeLock = async () => {
    if (wakeLockSentinelRef.current) {
      try {
        await wakeLockSentinelRef.current.release();
      } catch {}
      wakeLockSentinelRef.current = null;
      setWakeLockActive(false);
    }
  };

  // Re-acquire wake lock if phone tab visibility returns to visible while active
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && monitoringActive) {
        await requestWakeLock();
      }
    };

    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [monitoringActive]);

  // Stop camera stream & wake lock on unmount
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
      releaseWakeLock();
    };
  }, []);

  // Web Audio API Synthesizer (Zero Audio Files Needed - 100% Offline Siren)
  const playAlarmSound = (tone = 'warning') => {
    try {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (tone === 'loitering') {
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
      console.warn('Audio alarm playback error:', e);
    }
  };

  // Trigger Person Loitering Alarm on Phone
  const triggerLoiteringAlarm = (durationSec) => {
    playAlarmSound('loitering');
    if ('vibrate' in navigator) {
      navigator.vibrate([300, 100, 300, 100, 500]);
    }
    setActiveAlarm({
      type: 'loitering',
      title: '🚨 PERSON LOITERING DETECTED',
      message: `Person detected continuously in zone for ${durationSec}s. Potential security concern.`
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'loitering_alert',
        duration_sec: durationSec,
        timestamp: new Date().toISOString()
      }));
    }
  };

  // Trigger Loud Noise Alarm on Phone
  const triggerNoiseAlarm = (db) => {
    playAlarmSound('noise');
    if ('vibrate' in navigator) {
      navigator.vibrate([200, 80, 200, 80, 400]);
    }
    setActiveAlarm({
      type: 'noise',
      title: '🔊 LOUD NOISE DETECTED',
      message: `Acoustic spike of ${db} dB detected by microphone guard.`
    });

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'loud_noise_alert',
        decibels: db,
        timestamp: new Date().toISOString()
      }));
    }
  };

  // Initialize Microphone Privacy-Protected Acoustic Monitoring
  // STRICT PRIVACY GUARANTEE: Audio is processed exclusively in-memory for RMS amplitude extraction.
  // Audio is NEVER recorded, saved to storage, or transmitted over any network connection.
  const startAudioMonitoring = async () => {
    if (!micGuardActive) return;
    try {
      if (audioContextRef.current && audioContextRef.current.state === 'running') return;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      micStreamRef.current = stream;

      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.3;

      const source = audioCtx.createMediaStreamSource(stream);
      // NOTE: Connect ONLY to analyser. DO NOT connect to destination to prevent audio loop feedback.
      source.connect(analyser);

      audioContextRef.current = audioCtx;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      noiseIntervalRef.current = setInterval(() => {
        if (!analyserRef.current || !micGuardActive) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / bufferLength);
        const estimatedDb = Math.min(100, Math.max(20, Math.round(20 + rms * 0.75)));
        setDecibelLevel(estimatedDb);

        if (!micMuted && estimatedDb >= noiseThreshold) {
          const now = Date.now();
          if (now - lastNoiseTriggerRef.current > 12000) { // 12-second alert cooldown
            lastNoiseTriggerRef.current = now;
            triggerNoiseAlarm(estimatedDb);
          }
        }
      }, 150);
    } catch (err) {
      console.warn('[Mic Guard] Audio monitoring access declined or unsupported:', err);
    }
  };

  const stopAudioMonitoring = () => {
    if (noiseIntervalRef.current) {
      clearInterval(noiseIntervalRef.current);
      noiseIntervalRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
  };

  // Request camera access and start video preview
  const initCamera = async (facing = facingMode) => {
    try {
      setErrorMsg(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      // Check for Secure Context / mediaDevices support
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const isHttp = window.location.protocol === 'http:';
        const isNotLocalhost = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';

        if (isHttp && isNotLocalhost) {
          const originUrl = `http://${window.location.hostname}:5173`;
          setErrorMsg(
            <div className="space-y-3 text-left">
              <div className="font-bold text-amber-300 flex items-center gap-1.5 text-sm">
                <span>⚠️</span> Camera Permission Blocked by Chrome
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Android Chrome blocks camera access over local Wi-Fi IP (<code className="text-emerald-400 font-mono text-[11px]">{window.location.hostname}</code>) without a one-time permission.
              </p>
              <div className="p-3 bg-slate-900/90 border border-slate-700/60 rounded-xl space-y-2 text-xs text-slate-300">
                <div className="font-semibold text-slate-200">Quick 30-Second Fix in Phone Chrome:</div>
                <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-400">
                  <li>
                    Open a new tab and paste: <br />
                    <code className="text-amber-400 select-all font-mono break-all text-[11px]">chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>
                  </li>
                  <li>
                    Set flag to <strong className="text-emerald-400">Enabled</strong> and enter:<br />
                    <code className="text-emerald-300 select-all font-mono font-bold text-xs">{originUrl}</code>
                  </li>
                  <li>Tap <strong className="text-sky-400">Relaunch</strong>, then refresh this page!</li>
                </ol>
              </div>
            </div>
          );
          setPermissionGranted(false);
          return;
        }

        setErrorMsg('Camera hardware API (navigator.mediaDevices) is not available in this browser context.');
        setPermissionGranted(false);
        return;
      }

      const constraints = {
        video: {
          facingMode: facing,
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { max: 15 }
        },
        audio: false // Strict Privacy: Audio is never recorded or transmitted
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
          ? 'Camera permission denied. Please allow camera permissions in Android browser settings.'
          : `Camera error: ${err.message}`
      );
    }
  };

  // Flip between front and rear cameras
  const switchCamera = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    initCamera(nextMode);
  };

  // Fullscreen Toggle
  const toggleFullscreen = async () => {
    const elem = containerRef.current || document.documentElement;
    if (!document.fullscreenElement) {
      try {
        await elem.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.warn('Fullscreen error:', err);
      }
    } else {
      try {
        await document.exitFullscreen();
        setIsFullscreen(false);
      } catch (err) {
        console.warn('Exit fullscreen error:', err);
      }
    }
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
        setPairingSuccessMsg('Phone paired successfully with SafeHome AI Hub!');
        setTimeout(() => setPairingSuccessMsg(null), 4000);
      }
    } catch (err) {
      setErrorMsg(err.response?.data?.error || 'Invalid or expired pairing code. Please generate a new code.');
    } finally {
      setPairingLoading(false);
    }
  };

  // Start Monitoring
  const startMonitoring = async () => {
    if (!permissionGranted) {
      await initCamera();
    }

    shouldKeepReconnectingRef.current = true;
    connectWebSocket();
    await requestWakeLock();
    if (micGuardActive) {
      startAudioMonitoring();
    }
    setMonitoringActive(true);
  };

  // Connect to Laptop Backend WebSocket
  const connectWebSocket = () => {
    try {
      setConnectionStatus('CONNECTING');
      setErrorMsg(null);

      if (wsRef.current) {
        wsRef.current.close();
      }

      const ws = new WebSocket(backendWsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('CONNECTED');

        // Send registration with device token
        const deviceToken = localStorage.getItem('safehome_device_token');
        ws.send(JSON.stringify({
          type: 'register_phone',
          device_token: deviceToken,
          device_id: deviceId,
          device_name: 'Android Phone Sensor'
        }));

        startFrameCaptureLoop(ws);
        setupWebRTC(ws);
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);

          if (msg.type === 'registered') {
            setDeviceId(msg.device_id);
          }

          if (msg.type === 'webrtc_answer' && msg.sdp) {
            if (pcRef.current) {
              try {
                await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                setWebrtcStatus('CONNECTED');
              } catch (e) {
                console.warn('[WebRTC Phone] Remote description error:', e);
              }
            }
          }

          if (msg.type === 'webrtc_ice_candidate' && msg.candidate) {
            if (pcRef.current) {
              try {
                await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
              } catch (e) {
                console.warn('[WebRTC Phone] Add candidate error:', e);
              }
            }
          }

          if (msg.type === 'webrtc_request_offer') {
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              setupWebRTC(wsRef.current);
            }
          }

          if (msg.type === 'detection_result') {
            const dets = msg.detections || [];
            setLastDetections(dets);
            if (msg.client_time) {
              const rtt = Math.round(performance.now() - msg.client_time);
              setLatencyMs(rtt);
            } else {
              setLatencyMs(msg.latency_ms || 0);
            }
            drawBoundingBoxes(dets);

            // Loitering Person Safety Detection
            if (loiteringAlertsEnabled) {
              const hasPerson = dets.some((d) => d.class === 'person');
              const now = Date.now();
              if (hasPerson) {
                if (!personPresenceStartRef.current) {
                  personPresenceStartRef.current = now;
                }
                const secondsInView = Math.floor((now - personPresenceStartRef.current) / 1000);
                setLoiteringTimeInFrame(secondsInView);

                if (secondsInView >= loiteringThresholdSec) {
                  if (now - lastLoiteringTriggerRef.current > 15000) { // 15s cooldown
                    lastLoiteringTriggerRef.current = now;
                    triggerLoiteringAlarm(secondsInView);
                  }
                }
              } else {
                personPresenceStartRef.current = null;
                setLoiteringTimeInFrame(0);
              }
            }
          }

          if (msg.type === 'safety_alert') {
            playAlarmSound(msg.severity === 'CRITICAL' ? 'noise' : 'loitering');
            if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);
            setActiveAlarm({
              type: 'safety',
              title: msg.title || '🚨 SAFETY ALERT',
              message: msg.message || 'Surveillance activity alert triggered.'
            });
          }

          if (msg.type === 'error' && msg.code === 'AUTH_FAILED') {
            setErrorMsg('Authentication expired. Please re-pair your phone.');
            setIsPaired(false);
            localStorage.removeItem('safehome_device_token');
          }
        } catch {
          // ignore
        }
      };

      ws.onerror = (e) => {
        console.error('WS Error:', e);
        setConnectionStatus('ERROR');
        setErrorMsg('WebSocket connection failed. Verify laptop address & local Wi-Fi connection.');
      };

      ws.onclose = () => {
        stopFrameCaptureLoop();
        stopAudioMonitoring();
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
    stopAudioMonitoring();
    releaseWakeLock();
    setActiveAlarm(null);
    personPresenceStartRef.current = null;
    setLoiteringTimeInFrame(0);
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    setWebrtcStatus('OFF');
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    setMonitoringActive(false);
    setConnectionStatus('DISCONNECTED');
    setLastDetections([]);
    clearCanvas();
  };

  // WebRTC P2P Initiation
  const setupWebRTC = async (ws) => {
    if (!streamRef.current) return;
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

      // Add local camera tracks to WebRTC stream
      streamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, streamRef.current);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate && ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'webrtc_ice_candidate',
            device_id: deviceId,
            candidate: event.candidate
          }));
        }
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          setWebrtcStatus('CONNECTED');
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setWebrtcStatus('FALLBACK');
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'webrtc_offer',
          device_id: deviceId,
          sdp: pc.localDescription
        }));
        setWebrtcStatus('OFFERING');
      }
    } catch (err) {
      console.warn('[WebRTC Phone] Setup error:', err);
      setWebrtcStatus('FALLBACK');
    }
  };

  // Frame capture loop sending base64 JPEG packets at target streamFps (10 FPS default = 100ms interval)
  const startFrameCaptureLoop = (ws) => {
    stopFrameCaptureLoop();

    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = 640;
    captureCanvas.height = 480;
    const ctx = captureCanvas.getContext('2d');

    let lastFpsTime = Date.now();
    let sentInSecond = 0;
    const targetFps = streamFpsRef.current || 10;
    const intervalMs = Math.max(50, Math.round(1000 / targetFps));

    frameIntervalRef.current = setInterval(() => {
      if (!videoRef.current || videoRef.current.readyState < 2) return;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      // Draw current video frame to hidden canvas
      ctx.drawImage(videoRef.current, 0, 0, captureCanvas.width, captureCanvas.height);
      const jpegBase64 = captureCanvas.toDataURL('image/jpeg', 0.60);

      ws.send(JSON.stringify({
        type: 'frame',
        image: jpegBase64,
        client_time: performance.now(),
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
    }, intervalMs);
  };

  const stopFrameCaptureLoop = () => {
    if (frameIntervalRef.current) {
      clearInterval(frameIntervalRef.current);
      frameIntervalRef.current = null;
    }
  };

  // Draw real-time bounding box overlays received from backend AI detection
  const drawBoundingBoxes = (detections) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const det of detections) {
      const box = det.bounding_box;
      if (!box) continue;

      const x = box.x;
      const y = box.y;
      const w = box.width;
      const h = box.height;

      // Styled bounding box
      ctx.strokeStyle = det.class === 'person' ? '#38bdf8' : '#34d399';
      ctx.lineWidth = 3;
      ctx.strokeRect(x, y, w, h);

      // Label background
      ctx.fillStyle = det.class === 'person' ? 'rgba(56, 189, 248, 0.85)' : 'rgba(52, 211, 153, 0.85)';
      const label = `${det.class.toUpperCase()} ${Math.round(det.confidence * 100)}%`;
      ctx.font = 'bold 12px Inter, sans-serif';
      const textWidth = ctx.measureText(label).width;
      ctx.fillRect(x, Math.max(0, y - 20), textWidth + 8, 20);

      // Label text
      ctx.fillStyle = '#020617';
      ctx.fillText(label, x + 4, Math.max(14, y - 5));
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  return (
    <div ref={containerRef} className="max-w-xl mx-auto space-y-4 pb-12">
      {/* PWA Install Banner */}
      <InstallPrompt />

      {/* Privacy Notice Banner */}
      <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-sky-400" />
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              SafeHome AI Camera Node
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-400 border border-sky-500/30">
                PWA v1.0
              </span>
            </h1>
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

      {/* Active Siren / Safety Alert Banner */}
      {activeAlarm && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-950 via-rose-900 to-amber-950 border-2 border-rose-500 shadow-xl shadow-rose-950/60 animate-pulse flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-rose-600/40 text-rose-300 shrink-0">
              <BellRing className="w-6 h-6 animate-bounce" />
            </div>
            <div>
              <h2 className="text-sm font-black text-rose-100 uppercase tracking-wide">
                {activeAlarm.title}
              </h2>
              <p className="text-xs text-rose-200/90 mt-0.5 leading-relaxed">
                {activeAlarm.message}
              </p>
              <div className="text-[10px] text-rose-300/80 font-mono mt-1">
                Audio siren & vibration active on this phone
              </div>
            </div>
          </div>
          <button
            onClick={() => setActiveAlarm(null)}
            className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs shrink-0 shadow transition"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Pairing Banner / Status */}
      {isPaired ? (
        <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-900/60 text-xs text-emerald-300 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>Paired with Laptop Hub ({deviceId.slice(0, 8)})</span>
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
      <div className={`relative aspect-video bg-slate-950 rounded-2xl overflow-hidden border border-slate-800 shadow-2xl flex items-center justify-center ${isFullscreen ? 'fixed inset-0 z-50 rounded-none border-none aspect-auto h-screen w-screen' : ''}`}>
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

        {/* HUD Overlay Badges */}
        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5 pointer-events-none">
          {wakeLockActive ? (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <Lock className="w-3 h-3" /> Screen Awake
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-mono text-slate-400 bg-slate-900/60 border border-slate-800 flex items-center gap-1">
              <Unlock className="w-3 h-3" /> Screen Normal
            </span>
          )}

          {monitoringActive && (
            <>
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                {fps} FPS
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border flex items-center gap-1 ${
                webrtcStatus === 'CONNECTED'
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                  : 'bg-slate-900/60 text-slate-400 border-slate-800'
              }`}>
                <Radio className="w-3 h-3" />
                P2P: {webrtcStatus}
              </span>
            </>
          )}
        </div>

        {/* Viewport Control Buttons */}
        <div className="absolute top-3 right-3 flex items-center gap-1.5">
          {permissionGranted && (
            <button
              onClick={switchCamera}
              className="p-2 rounded-xl bg-slate-900/80 backdrop-blur border border-slate-700 text-slate-300 hover:text-white transition"
              title="Switch Camera (Front/Rear)"
            >
              <FlipHorizontal className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-900/80 backdrop-blur border border-slate-700 text-slate-300 hover:text-white transition"
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>

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
      {/* Stream Smoothness & Frame Rate Selector */}
      <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-400" /> Laptop Stream Fluidity
          </span>
          <span className="text-[11px] font-mono text-sky-400 font-bold">{streamFps} FPS Target</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => setStreamFps(10)}
            className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition ${
              streamFps === 10
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-sm'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Smooth (10 FPS)
          </button>
          <button
            type="button"
            onClick={() => setStreamFps(15)}
            className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition ${
              streamFps === 15
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Ultra (15 FPS)
          </button>
          <button
            type="button"
            onClick={() => setStreamFps(2)}
            className={`py-2 px-2.5 rounded-xl text-xs font-semibold border transition ${
              streamFps === 2
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm'
                : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-white'
            }`}
          >
            Eco (2 FPS)
          </button>
        </div>
        <p className="text-[10px] text-slate-500">
          Controls frame delivery rate to your laptop screen. 10–15 FPS provides smooth, real-time security viewing.
        </p>
      </div>

      {/* Loitering Alert Protection Card */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BellRing className={`w-4 h-4 ${loiteringAlertsEnabled ? 'text-amber-400' : 'text-slate-500'}`} />
            <div>
              <h3 className="text-xs font-bold text-white">Person Loitering Alarm</h3>
              <p className="text-[10px] text-slate-400">Triggers siren & vibration if someone lingers in view</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLoiteringAlertsEnabled(!loiteringAlertsEnabled)}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              loiteringAlertsEnabled
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40'
                : 'bg-slate-800 text-slate-500 border border-slate-700'
            }`}
          >
            {loiteringAlertsEnabled ? 'ENABLED' : 'DISABLED'}
          </button>
        </div>

        {loiteringAlertsEnabled && (
          <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Trigger Duration:</span>
              <div className="flex gap-1.5">
                {[5, 10, 20].map((sec) => (
                  <button
                    key={sec}
                    type="button"
                    onClick={() => setLoiteringThresholdSec(sec)}
                    className={`px-2.5 py-0.5 rounded-lg text-xs font-mono transition ${
                      loiteringThresholdSec === sec
                        ? 'bg-amber-500 text-slate-950 font-bold'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    {sec}s
                  </button>
                ))}
              </div>
            </div>

            {/* Live Loitering Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-mono">
                <span className={loiteringTimeInFrame > 0 ? 'text-amber-400 font-semibold' : 'text-slate-500'}>
                  {loiteringTimeInFrame > 0 ? `Person in zone: ${loiteringTimeInFrame}s` : 'No person currently in view'}
                </span>
                <span className="text-slate-500">{loiteringThresholdSec}s limit</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-950 border border-slate-800 overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${
                    loiteringTimeInFrame >= loiteringThresholdSec
                      ? 'bg-rose-500 animate-pulse'
                      : loiteringTimeInFrame > 0
                      ? 'bg-amber-400'
                      : 'bg-transparent'
                  }`}
                  style={{
                    width: `${Math.min(100, (loiteringTimeInFrame / loiteringThresholdSec) * 100)}%`
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Microphone Safety & Acoustic Sensor Guard */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <div>
              <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                Microphone Safety Guard
                <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Protected
                </span>
              </h3>
              <p className="text-[10px] text-slate-400">Acoustic spike & loud noise anomaly detection</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !micGuardActive;
              setMicGuardActive(next);
              if (!next) {
                stopAudioMonitoring();
              } else if (monitoringActive) {
                startAudioMonitoring();
              }
            }}
            className={`px-3 py-1 rounded-full text-xs font-bold transition ${
              micGuardActive
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-500 border border-slate-700'
            }`}
          >
            {micGuardActive ? 'ACTIVE' : 'OFF'}
          </button>
        </div>

        {/* Strict Privacy Shield Badge */}
        <div className="p-2.5 rounded-xl bg-slate-950 border border-emerald-500/20 text-[11px] text-slate-300 flex items-start gap-2">
          <Shield className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-semibold text-emerald-300">Privacy Guarantee: </span>
            Zero audio is recorded, saved, or transmitted. The microphone samples acoustic decibel energy strictly in volatile memory.
          </div>
        </div>

        {micGuardActive && (
          <div className="space-y-2.5 pt-1 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5 text-sky-400" /> Live Noise Energy:
              </span>
              <div className="flex items-center gap-2">
                <span className={`font-mono font-bold text-xs ${
                  decibelLevel >= noiseThreshold
                    ? 'text-rose-400 animate-pulse'
                    : decibelLevel > 60
                    ? 'text-amber-400'
                    : 'text-emerald-400'
                }`}>
                  {decibelLevel} dB
                </span>
                <button
                  type="button"
                  onClick={() => setMicMuted(!micMuted)}
                  className={`p-1.5 rounded-lg border text-xs transition ${
                    micMuted
                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                  }`}
                  title={micMuted ? 'Microphone muted (no alarms)' : 'Microphone unmuted'}
                >
                  {micMuted ? <MicOff className="w-3.5 h-3.5 text-rose-400" /> : <Mic className="w-3.5 h-3.5 text-emerald-400" />}
                </button>
              </div>
            </div>

            {/* Live Decibel Meter Bar */}
            <div className="space-y-1">
              <div className="w-full h-2.5 rounded-full bg-slate-950 border border-slate-800 overflow-hidden relative">
                {/* Marker for trigger threshold */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-rose-500 z-10"
                  style={{ left: `${noiseThreshold}%` }}
                />
                <div
                  className={`h-full transition-all duration-150 ${
                    decibelLevel >= noiseThreshold
                      ? 'bg-rose-500'
                      : decibelLevel > 60
                      ? 'bg-amber-400'
                      : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.min(100, Math.max(0, decibelLevel))}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>Quiet (20 dB)</span>
                <span className="text-amber-400 font-bold">Trigger: {noiseThreshold} dB</span>
                <span>Loud (100 dB)</span>
              </div>
            </div>

            {/* Sensitivity Selector */}
            <div className="flex items-center justify-between text-xs text-slate-400 pt-1">
              <span>Alert Sensitivity:</span>
              <div className="flex gap-1.5">
                {[
                  { val: 70, label: '70 dB' },
                  { val: 80, label: '80 dB' },
                  { val: 88, label: '88 dB' }
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => setNoiseThreshold(item.val)}
                    className={`px-2 py-0.5 rounded-lg text-xs font-mono transition ${
                      noiseThreshold === item.val
                        ? 'bg-sky-500 text-slate-950 font-bold'
                        : 'bg-slate-950 text-slate-400 border border-slate-800 hover:text-white'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live Telemetry / Diagnostics */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-4 space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
          <span>Telemetry & Connection</span>
          <span className="text-[10px] text-emerald-400 font-normal">Mic: Privacy Guarded</span>
        </h3>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">Status</div>
            <div className={`text-xs font-mono font-bold mt-1 ${connectionStatus === 'CONNECTED' ? 'text-emerald-400' : 'text-slate-400'}`}>
              {connectionStatus}
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">Stream Rate</div>
            <div className="text-xs font-mono font-bold text-sky-400 mt-1">
              {fps} fps
            </div>
          </div>

          <div className="p-2 rounded-xl bg-slate-950 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">Inference Latency</div>
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
