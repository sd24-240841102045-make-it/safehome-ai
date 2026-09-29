import { all, get } from '../services/db.js';

export async function getDashboardSummary(req, res, next) {
  try {
    const userId = req.user.id;
    const today = new Date().toISOString().split('T')[0];

    // Count today's events
    const todayTotalRow = await get(
      `SELECT COUNT(*) as total FROM events WHERE user_id = ? AND timestamp LIKE ?`,
      [userId, `${today}%`]
    );

    // Count today's person detections
    const todayPersonRow = await get(
      `SELECT COUNT(*) as total FROM events WHERE user_id = ? AND object_class = 'person' AND timestamp LIKE ?`,
      [userId, `${today}%`]
    );

    // Count today's unusual detections
    const todayUnusualRow = await get(
      `SELECT COUNT(*) as total FROM events WHERE user_id = ? AND is_unusual = 1 AND timestamp LIKE ?`,
      [userId, `${today}%`]
    );

    // Active devices count
    const activeDevicesRow = await get(
      `SELECT COUNT(*) as total FROM devices WHERE user_id = ? AND status IN ('online', 'streaming')`,
      [userId]
    );

    // Recent 5 events
    const recentEvents = await all(
      `SELECT id, object_class, confidence, timestamp, is_unusual, location_label
       FROM events WHERE user_id = ? ORDER BY timestamp DESC LIMIT 5`,
      [userId]
    );

    const totalToday = todayTotalRow ? parseInt(todayTotalRow.total, 10) : 0;
    const personToday = todayPersonRow ? parseInt(todayPersonRow.total, 10) : 0;
    const unusualToday = todayUnusualRow ? parseInt(todayUnusualRow.total, 10) : 0;
    const otherToday = Math.max(0, totalToday - personToday);

    res.json({
      success: true,
      summary: {
        today: {
          total: totalToday,
          person: personToday,
          other: otherToday,
          unusual: unusualToday
        },
        devices: {
          active: activeDevicesRow ? parseInt(activeDevicesRow.total, 10) : 0
        },
        recent_events: recentEvents.map((e) => ({
          ...e,
          is_unusual: Boolean(e.is_unusual)
        }))
      }
    });
  } catch (err) {
    next(err);
  }
}

export async function getAnalytics(req, res, next) {
  try {
    const userId = req.user.id;

    // 1. Events by Hour (24-hour distribution)
    // Extract hour from ISO string timestamp
    const allEvents = await all(
      'SELECT object_class, confidence, timestamp, is_unusual FROM events WHERE user_id = ?',
      [userId]
    );

    const hourlyMap = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      label: `${String(i).padStart(2, '0')}:00`,
      total: 0,
      person: 0,
      animal: 0,
      vehicle: 0,
      unusual: 0
    }));

    const typeMap = {
      person: 0,
      animal: 0,
      vehicle: 0,
      other: 0
    };

    const confidenceBuckets = [
      { range: '50-60%', min: 0.50, max: 0.60, count: 0 },
      { range: '60-70%', min: 0.60, max: 0.70, count: 0 },
      { range: '70-80%', min: 0.70, max: 0.80, count: 0 },
      { range: '80-90%', min: 0.80, max: 0.90, count: 0 },
      { range: '90-100%', min: 0.90, max: 1.01, count: 0 }
    ];

    let unusualCount = 0;
    const dailyMap = {};

    allEvents.forEach((ev) => {
      const dt = new Date(ev.timestamp);
      const hour = isNaN(dt.getHours()) ? 0 : dt.getHours();
      const dateStr = ev.timestamp ? ev.timestamp.slice(0, 10) : 'Unknown';

      // Hourly
      if (hourlyMap[hour]) {
        hourlyMap[hour].total += 1;
        if (ev.object_class === 'person') hourlyMap[hour].person += 1;
        else if (['dog', 'cat', 'bird', 'animal'].includes(ev.object_class)) hourlyMap[hour].animal += 1;
        else if (['car', 'motorcycle', 'bicycle', 'bus', 'truck'].includes(ev.object_class)) hourlyMap[hour].vehicle += 1;
        if (ev.is_unusual) hourlyMap[hour].unusual += 1;
      }

      // Type
      if (ev.object_class === 'person') {
        typeMap.person += 1;
      } else if (['dog', 'cat', 'bird', 'animal'].includes(ev.object_class)) {
        typeMap.animal += 1;
      } else if (['car', 'motorcycle', 'bicycle', 'bus', 'truck'].includes(ev.object_class)) {
        typeMap.vehicle += 1;
      } else {
        typeMap.other += 1;
      }

      // Unusual
      if (ev.is_unusual) {
        unusualCount += 1;
      }

      // Confidence
      const conf = parseFloat(ev.confidence) || 0;
      for (const bucket of confidenceBuckets) {
        if (conf >= bucket.min && conf < bucket.max) {
          bucket.count += 1;
          break;
        }
      }

      // Daily
      dailyMap[dateStr] = (dailyMap[dateStr] || 0) + 1;
    });

    const dailyActivity = Object.entries(dailyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([date, count]) => ({ date, count }));

    const totalEvents = allEvents.length;
    const unusualPercentage = totalEvents > 0 ? Number(((unusualCount / totalEvents) * 100).toFixed(1)) : 0;

    res.json({
      success: true,
      analytics: {
        total_events: totalEvents,
        unusual_count: unusualCount,
        unusual_percentage: unusualPercentage,
        events_by_hour: hourlyMap,
        events_by_type: [
          { name: 'Person', value: typeMap.person, color: '#38bdf8' },
          { name: 'Animal', value: typeMap.animal, color: '#34d399' },
          { name: 'Vehicle', value: typeMap.vehicle, color: '#fbbf24' },
          { name: 'Other', value: typeMap.other, color: '#a78bfa' }
        ],
        daily_activity: dailyActivity,
        confidence_distribution: confidenceBuckets
      }
    });
  } catch (err) {
    next(err);
  }
}
