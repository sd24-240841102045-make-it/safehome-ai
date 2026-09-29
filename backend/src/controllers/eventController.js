import crypto from 'crypto';
import { all, get, run } from '../services/db.js';

const DATA_SCIENCE_URL = process.env.DATA_SCIENCE_URL || 'http://127.0.0.1:8001';

export async function getEvents(req, res, next) {
  try {
    const {
      page = 1,
      limit = 20,
      event_type,
      object_class,
      is_unusual,
      min_confidence,
      start_date,
      end_date,
      search
    } = req.query;

    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const conditions = ['user_id = ?'];
    const params = [req.user.id];

    if (event_type) {
      conditions.push('event_type = ?');
      params.push(event_type);
    }

    if (object_class) {
      conditions.push('object_class = ?');
      params.push(object_class);
    }

    if (is_unusual !== undefined && is_unusual !== '') {
      conditions.push('is_unusual = ?');
      params.push(is_unusual === 'true' || is_unusual === '1' ? 1 : 0);
    }

    if (min_confidence) {
      conditions.push('confidence >= ?');
      params.push(parseFloat(min_confidence));
    }

    if (start_date) {
      conditions.push('timestamp >= ?');
      params.push(start_date);
    }

    if (end_date) {
      conditions.push('timestamp <= ?');
      params.push(end_date);
    }

    if (search) {
      conditions.push('(object_class LIKE ? OR location_label LIKE ?)');
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Total count for pagination
    const countSql = `SELECT COUNT(*) as total FROM events ${whereClause}`;
    const totalRow = await get(countSql, params);
    const total = totalRow ? parseInt(totalRow.total, 10) : 0;

    // Fetch items
    const querySql = `
      SELECT id, device_id, home_id, event_type, object_class, confidence, bounding_box,
             timestamp, location_label, snapshot_url, is_unusual, anomaly_score, metadata
      FROM events
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `;
    const rows = await all(querySql, [...params, parseInt(limit, 10), offset]);

    const events = rows.map((r) => ({
      ...r,
      is_unusual: Boolean(r.is_unusual),
      bounding_box: typeof r.bounding_box === 'string' ? safeJsonParse(r.bounding_box) : r.bounding_box,
      metadata: typeof r.metadata === 'string' ? safeJsonParse(r.metadata) : r.metadata
    }));

    res.json({
      success: true,
      events,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        pages: Math.ceil(total / parseInt(limit, 10)) || 1
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getEventById(req, res, next) {
  try {
    const { id } = req.params;
    const row = await get('SELECT * FROM events WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!row) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }

    res.json({
      success: true,
      event: {
        ...row,
        is_unusual: Boolean(row.is_unusual),
        bounding_box: safeJsonParse(row.bounding_box),
        metadata: safeJsonParse(row.metadata)
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function createEvent(req, res, next) {
  try {
    const {
      device_id,
      home_id,
      event_type = 'person_detected',
      object_class = 'person',
      confidence = 0.90,
      bounding_box = null,
      location_label = 'Phone Sensor',
      snapshot_url = null,
      metadata = {}
    } = req.body;

    const eventId = `evt_${crypto.randomUUID()}`;
    const timestamp = new Date().toISOString();

    // Query historical events for data science anomaly analysis
    let is_unusual = 0;
    let anomaly_score = 0.0;
    let anomalyReason = '';

    try {
      const pastEvents = await all(
        'SELECT event_type, object_class, confidence, timestamp FROM events WHERE user_id = ? ORDER BY timestamp DESC LIMIT 100',
        [req.user.id]
      );

      const dsRes = await fetch(`${DATA_SCIENCE_URL}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          current_event: {
            event_type,
            object_class,
            confidence,
            timestamp
          },
          historical_events: pastEvents
        }),
        signal: AbortSignal.timeout(2000)
      });

      if (dsRes.ok) {
        const dsData = await dsRes.json();
        if (dsData.is_unusual) {
          is_unusual = 1;
          anomaly_score = dsData.anomaly_score || 0.85;
          anomalyReason = dsData.reason || 'Unusual activity detected based on historical activity patterns.';
        }
      }
    } catch (err) {
      // Data Science service offline or timed out; continue gracefully
    }

    const bbJson = bounding_box ? JSON.stringify(bounding_box) : null;
    const metaJson = JSON.stringify({ ...metadata, anomaly_reason: anomalyReason });

    await run(
      `INSERT INTO events (
        id, user_id, device_id, home_id, event_type, object_class, confidence,
        bounding_box, timestamp, location_label, snapshot_url, is_unusual, anomaly_score, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        eventId,
        req.user.id,
        device_id || null,
        home_id || null,
        event_type,
        object_class,
        confidence,
        bbJson,
        timestamp,
        location_label,
        snapshot_url,
        is_unusual,
        anomaly_score,
        metaJson
      ]
    );

    // Create alert if unusual or high-confidence event
    if (is_unusual) {
      const alertId = `alt_${crypto.randomUUID()}`;
      await run(
        `INSERT INTO alerts (id, user_id, event_id, severity, title, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          alertId,
          req.user.id,
          eventId,
          'WARNING',
          `Unusual ${object_class.toUpperCase()} Activity`,
          anomalyReason || `Unusual activity detected for ${object_class} based on historical baseline.`
        ]
      );
    } else if (object_class === 'person' && confidence > 0.85) {
      const alertId = `alt_${crypto.randomUUID()}`;
      await run(
        `INSERT INTO alerts (id, user_id, event_id, severity, title, message)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          alertId,
          req.user.id,
          eventId,
          'INFO',
          'Person Detected',
          `Person observed at ${location_label} with ${Math.round(confidence * 100)}% confidence.`
        ]
      );
    }

    const createdEvent = await get('SELECT * FROM events WHERE id = ?', [eventId]);
    res.status(201).json({
      success: true,
      event: {
        ...createdEvent,
        is_unusual: Boolean(createdEvent.is_unusual),
        bounding_box,
        metadata: safeJsonParse(metaJson)
      }
    });
  } catch (err) {
    next(err);
  }
}

function safeJsonParse(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
  }
}
