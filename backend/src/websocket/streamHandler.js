import crypto from 'crypto';
import { run, get, all } from '../services/db.js';

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000';
const DATA_SCIENCE_URL = process.env.DATA_SCIENCE_URL || 'http://127.0.0.1:8001';

// In-memory registry of active WebSocket connections
const connectedPhones = new Map();     // deviceId -> ws
const connectedDashboards = new Set(); // set of ws clients
const lastEventTimeMap = new Map();    // key: `${userId}_${objectClass}` -> timestamp (cooldown)

export function setupWebSocket(wss) {
  wss.on('connection', (ws, req) => {
    let clientType = 'unknown';
    let deviceId = null;
    let userId = 'usr_demo_01'; // Default fallback user for unauthenticated camera quick-pair

    ws.on('message', async (data) => {
      try {
        const msg = JSON.parse(data.toString());

        // 1. Phone Camera Registration
        if (msg.type === 'register_phone') {
          clientType = 'phone';
          deviceId = msg.device_id || `phone_${Date.now().toString(36)}`;
          userId = msg.user_id || userId;
          connectedPhones.set(deviceId, ws);

          console.log(`[WS] Phone connected: ${deviceId} for user ${userId}`);

          // Update device status in DB
          try {
            await run(
              `INSERT INTO devices (id, user_id, name, device_type, status, last_ping)
               VALUES (?, ?, ?, 'phone_camera', 'streaming', ?)
               ON CONFLICT(id) DO UPDATE SET status = 'streaming', last_ping = ?`,
              [deviceId, userId, msg.device_name || 'Phone Camera', new Date().toISOString(), new Date().toISOString()]
            );
          } catch (e) {
            // device update error
          }

          ws.send(JSON.stringify({
            type: 'registered',
            device_id: deviceId,
            status: 'connected',
            message: 'Camera node registered with SafeHome AI backend'
          }));

          // Notify dashboards that a camera came online
          broadcastToDashboards({
            type: 'device_status_change',
            device_id: deviceId,
            status: 'streaming'
          });
          return;
        }

        // 2. Dashboard Client Registration
        if (msg.type === 'register_dashboard') {
          clientType = 'dashboard';
          userId = msg.user_id || userId;
          connectedDashboards.add(ws);
          console.log(`[WS] Dashboard client connected for user ${userId}`);
          ws.send(JSON.stringify({
            type: 'dashboard_registered',
            active_cameras: connectedPhones.size
          }));
          return;
        }

        // 3. Frame Packet from Phone
        if (msg.type === 'frame') {
          if (!msg.image) return;

          // Forward to AI service for real-time inference
          let aiResult = { detections: [], processing_time_ms: 0 };
          try {
            const aiRes = await fetch(`${AI_SERVICE_URL}/detect`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ image: msg.image }),
              signal: AbortSignal.timeout(2000)
            });

            if (aiRes.ok) {
              aiResult = await aiRes.json();
            }
          } catch (err) {
            // AI service offline or busy
          }

          // Send detection overlay coordinates back to phone camera screen
          if (ws.readyState === ws.OPEN) {
            ws.send(JSON.stringify({
              type: 'detection_result',
              detections: aiResult.detections,
              processing_time_ms: aiResult.processing_time_ms
            }));
          }

          // Broadcast live video frame + bounding boxes to laptop dashboard
          broadcastToDashboards({
            type: 'live_frame',
            device_id: deviceId,
            image: msg.image,
            detections: aiResult.detections,
            timestamp: new Date().toISOString()
          });

          // Check if an event should be created (with cooldown per class to avoid spam)
          if (aiResult.detections && aiResult.detections.length > 0) {
            await handleDetectionEvents(userId, deviceId, aiResult.detections, msg.image);
          }
          return;
        }

        // 4. Ping/Heartbeat
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
          return;
        }
      } catch (err) {
        console.error('[WS Error]', err.message);
      }
    });

    ws.on('close', async () => {
      if (clientType === 'phone' && deviceId) {
        connectedPhones.delete(deviceId);
        console.log(`[WS] Phone disconnected: ${deviceId}`);
        try {
          await run(`UPDATE devices SET status = 'offline' WHERE id = ?`, [deviceId]);
        } catch {}
        broadcastToDashboards({
          type: 'device_status_change',
          device_id: deviceId,
          status: 'offline'
        });
      } else if (clientType === 'dashboard') {
        connectedDashboards.delete(ws);
      }
    });
  });
}

// Broadcast helper for dashboards
function broadcastToDashboards(payload) {
  const data = JSON.stringify(payload);
  for (const client of connectedDashboards) {
    if (client.readyState === client.OPEN) {
      client.send(data);
    }
  }
}

// Event persistence with cooldown and anomaly check
async function handleDetectionEvents(userId, deviceId, detections, imageBase64) {
  const now = Date.now();
  const COOLDOWN_MS = 6000; // 6 seconds cooldown per object class

  for (const det of detections) {
    const objectClass = det.class;
    const confidence = det.confidence;

    // Check cooldown
    const cooldownKey = `${userId}_${objectClass}`;
    const lastTime = lastEventTimeMap.get(cooldownKey) || 0;
    if (now - lastTime < COOLDOWN_MS) {
      continue;
    }
    lastEventTimeMap.set(cooldownKey, now);

    // Prepare event data
    const eventId = `evt_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();
    let isUnusual = 0;
    let anomalyScore = 0.0;
    let anomalyReason = '';

    // Data Science analysis
    try {
      const pastEvents = await all(
        'SELECT event_type, object_class, confidence, timestamp FROM events WHERE user_id = ? ORDER BY timestamp DESC LIMIT 60',
        [userId]
      );

      const dsRes = await fetch(`${DATA_SCIENCE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_event: {
            event_type: `${objectClass}_detected`,
            object_class: objectClass,
            confidence: confidence,
            timestamp: timestamp
          },
          historical_events: pastEvents
        }),
        signal: AbortSignal.timeout(1500)
      });

      if (dsRes.ok) {
        const dsData = await dsRes.json();
        if (dsData.is_unusual) {
          isUnusual = 1;
          anomalyScore = dsData.anomaly_score || 0.82;
          anomalyReason = dsData.reason || 'Unusual activity detected based on historical activity patterns.';
        }
      }
    } catch (e) {
      // Data science offline or timeout
    }

    const bbJson = det.bounding_box ? JSON.stringify(det.bounding_box) : null;
    const metadataJson = JSON.stringify({
      detected_via: 'phone_live_stream',
      anomaly_reason: anomalyReason
    });

    try {
      await run(
        `INSERT INTO events (
          id, user_id, device_id, event_type, object_class, confidence,
          bounding_box, timestamp, location_label, is_unusual, anomaly_score, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventId,
          userId,
          deviceId,
          `${objectClass}_detected`,
          objectClass,
          confidence,
          bbJson,
          timestamp,
          'Phone Sensor Camera',
          isUnusual,
          anomalyScore,
          metadataJson
        ]
      );

      let createdAlert = null;

      // Create alert
      if (isUnusual) {
        const alertId = `alt_${crypto.randomUUID()}`;
        const alertTitle = `Unusual ${objectClass.toUpperCase()} Activity`;
        const alertMessage = anomalyReason || `Unusual frequency of ${objectClass} activity detected at this time.`;

        await run(
          `INSERT INTO alerts (id, user_id, event_id, severity, title, message)
           VALUES (?, ?, ?, 'WARNING', ?, ?)`,
          [alertId, userId, eventId, alertTitle, alertMessage]
        );

        createdAlert = {
          id: alertId,
          event_id: eventId,
          severity: 'WARNING',
          title: alertTitle,
          message: alertMessage,
          created_at: timestamp
        };
      } else if (objectClass === 'person' && confidence >= 0.70) {
        const alertId = `alt_${crypto.randomUUID()}`;
        const alertTitle = 'Person Detected';
        const alertMessage = `Person observed by camera node with ${Math.round(confidence * 100)}% confidence.`;

        await run(
          `INSERT INTO alerts (id, user_id, event_id, severity, title, message)
           VALUES (?, ?, ?, 'INFO', ?, ?)`,
          [alertId, userId, eventId, alertTitle, alertMessage]
        );

        createdAlert = {
          id: alertId,
          event_id: eventId,
          severity: 'INFO',
          title: alertTitle,
          message: alertMessage,
          created_at: timestamp
        };
      }

      // Broadcast new event & alert to dashboard in real-time
      broadcastToDashboards({
        type: 'new_event',
        event: {
          id: eventId,
          object_class: objectClass,
          confidence: confidence,
          timestamp: timestamp,
          is_unusual: Boolean(isUnusual),
          location_label: 'Phone Sensor Camera'
        },
        alert: createdAlert
      });
    } catch (dbErr) {
      console.error('[Event DB Error]', dbErr.message);
    }
  }
}
