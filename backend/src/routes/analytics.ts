import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../services/db.js';
import { config } from '../config.js';
import { logger } from '../services/logger.js';

export function createAnalyticsRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();
  router.use('/analytics', authMiddleware);

  router.get('/analytics', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      // 1. Fetch user's home timezone & active hours
      const home = await db.get(
        'SELECT timezone, active_hours_start, active_hours_end FROM homes WHERE user_id = ? LIMIT 1',
        [userId]
      );
      const timeZone = home?.timezone || 'UTC';
      const activeStart = home?.active_hours_start || '07:00';
      const activeEnd = home?.active_hours_end || '23:00';

      // 2. Fetch all events strictly for this user (Rule 1 & Rule 5)
      const allEvents = await db.query(
        `SELECT id, category, object_class, confidence, started_at, is_unusual, anomaly_score, user_feedback
         FROM events WHERE user_id = ? ORDER BY started_at ASC`,
        [userId]
      );

      // Hourly map (24 hours)
      const hourlyMap = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        label: `${String(i).padStart(2, '0')}:00`,
        total: 0,
        person: 0,
        animal: 0,
        vehicle: 0,
        unusual: 0
      }));

      // 7 days (0=Sun..6=Sat) x 24 hours activity heatmap matrix
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const heatmap = Array.from({ length: 7 }, (_, d) => ({
        day: d,
        dayName: dayNames[d],
        hours: Array.from({ length: 24 }, () => 0)
      }));

      const typeMap: Record<string, number> = {
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
      const dailyMap: Record<string, number> = {};
      const uniqueDates = new Set<string>();

      // Windows aggregation for Python /analyze service
      // Key: `${dateStr}_${hour}_${category}` -> window item
      const windowAggregation = new Map<string, any>();

      allEvents.forEach((ev: any) => {
        const timeVal = ev.started_at || ev.created_at;
        const dt = new Date(timeVal);

        let hour = 0;
        let weekday = 0;
        let dateStr = 'Unknown';

        try {
          const hourStr = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(dt);
          hour = parseInt(hourStr, 10) % 24;
          const weekdayStr = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'narrow' }).format(dt);
          // 0 = Sunday ... 6 = Saturday
          weekday = dt.getDay();
          dateStr = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
        } catch {
          hour = isNaN(dt.getHours()) ? 0 : dt.getHours();
          weekday = dt.getDay();
          dateStr = timeVal ? timeVal.slice(0, 10) : 'Unknown';
        }

        if (dateStr !== 'Unknown') {
          uniqueDates.add(dateStr);
        }

        // Hourly histogram
        if (hourlyMap[hour]) {
          hourlyMap[hour].total += 1;
          const cat = ev.category || 'other';
          if (cat === 'person') hourlyMap[hour].person += 1;
          else if (cat === 'animal') hourlyMap[hour].animal += 1;
          else if (cat === 'vehicle') hourlyMap[hour].vehicle += 1;
          if (ev.is_unusual) hourlyMap[hour].unusual += 1;
        }

        // Heatmap cell
        if (heatmap[weekday] && heatmap[weekday].hours[hour] !== undefined) {
          heatmap[weekday].hours[hour] += 1;
        }

        // Category breakdown
        const cat = ev.category || 'other';
        if (typeMap[cat] !== undefined) {
          typeMap[cat] += 1;
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

        // Aggregate into time windows for Python analyzer
        const windowKey = `${dateStr}_${hour}_${cat}`;
        if (!windowAggregation.has(windowKey)) {
          windowAggregation.set(windowKey, {
            timestamp_utc: dt.toISOString(),
            hour,
            weekday,
            category: cat,
            event_count: 0,
            user_feedback: ev.user_feedback || null
          });
        }
        windowAggregation.get(windowKey).event_count += 1;
      });

      const dailyActivity = Object.entries(dailyMap)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .slice(-14)
        .map(([date, count]) => ({ date, count }));

      const totalEvents = allEvents.length;
      const daysSpanned = uniqueDates.size;
      const unusualPercentage = totalEvents > 0 ? Number(((unusualCount / totalEvents) * 100).toFixed(1)) : 0;

      // Find peak activity hour
      let peakHour = 0;
      let maxHourlyEvents = 0;
      hourlyMap.forEach((h) => {
        if (h.total > maxHourlyEvents) {
          maxHourlyEvents = h.total;
          peakHour = h.hour;
        }
      });
      const peakHourStr = `${String(peakHour).padStart(2, '0')}:00 - ${String((peakHour + 1) % 24).padStart(2, '0')}:00`;

      // 3. Call Python Anomaly Analysis Engine
      let anomalyAnalysis: any = {
        status: totalEvents >= 100 && daysSpanned >= 7 ? 'analyzed' : 'insufficient_data',
        is_unusual: false,
        anomaly_score: 0.0,
        z_score: null,
        baseline: {
          mean: 0.0,
          std: 0.0,
          sample_count: totalEvents,
          days_spanned: daysSpanned
        },
        reason: 'Not enough historical data for reliable anomaly analysis.'
      };

      try {
        const currentHour = new Date().getUTCHours();
        const currentWeekday = new Date().getUTCDay();
        const startH = parseInt(activeStart.split(':')[0], 10);
        const endH = parseInt(activeEnd.split(':')[0], 10);
        const isQuiet = currentHour < startH || currentHour >= endH;

        const pyPayload = {
          timezone: timeZone,
          time_windows: Array.from(windowAggregation.values()),
          current_window: {
            timestamp_utc: new Date().toISOString(),
            hour: currentHour,
            weekday: currentWeekday,
            category: 'person',
            event_count: 1,
            is_quiet_hours: isQuiet
          }
        };

        const pyRes = await fetch(`${config.PYTHON_SERVICE_URL}/analyze`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pyPayload),
          signal: AbortSignal.timeout(3000)
        });

        if (pyRes.ok) {
          anomalyAnalysis = await pyRes.json();
        }
      } catch (err: any) {
        logger.warn(`[Analytics] Python anomaly engine query: ${err.message}`);
      }

      // 4. Fetch recent unusual events for homeowner feedback review
      const recentUnusual = await db.query(
        `SELECT id, category, object_class, confidence, started_at, is_unusual, anomaly_score, user_feedback
         FROM events WHERE user_id = ? AND is_unusual = 1 ORDER BY started_at DESC LIMIT 10`,
        [userId]
      );

      res.json({
        success: true,
        analytics: {
          total_events: totalEvents,
          unusual_count: unusualCount,
          unusual_percentage: unusualPercentage,
          days_spanned: daysSpanned,
          peak_hour: peakHourStr,
          events_by_hour: hourlyMap,
          events_by_type: [
            { name: 'Person', value: typeMap.person, color: '#38bdf8' },
            { name: 'Animal', value: typeMap.animal, color: '#34d399' },
            { name: 'Vehicle', value: typeMap.vehicle, color: '#fbbf24' },
            { name: 'Other', value: typeMap.other, color: '#a78bfa' }
          ],
          daily_activity: dailyActivity,
          confidence_distribution: confidenceBuckets,
          heatmap: heatmap,
          anomaly_analysis: anomalyAnalysis,
          recent_unusual_events: recentUnusual
        }
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
