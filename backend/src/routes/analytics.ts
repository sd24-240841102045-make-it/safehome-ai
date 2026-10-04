import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../services/db.js';
import { config } from '../config.js';
import { logger } from '../services/logger.js';

// Helper to extract timezone-accurate date components
function getLocalTimeComponents(date: Date, timeZone: string) {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
      hourCycle: 'h23',
      weekday: 'short'
    });
    const parts = formatter.formatToParts(date);
    const partMap: Record<string, string> = {};
    parts.forEach(p => { partMap[p.type] = p.value; });

    const hour = parseInt(partMap.hour || '0', 10) % 24;
    const year = partMap.year || '1970';
    const month = partMap.month || '01';
    const day = partMap.day || '01';
    const dateStr = `${year}-${month}-${day}`;
    const weekdayName = partMap.weekday || 'Sun';
    const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const weekday = weekdayMap[weekdayName] ?? date.getDay();

    return { hour, weekday, dateStr, weekdayName };
  } catch {
    return {
      hour: isNaN(date.getHours()) ? 0 : date.getHours(),
      weekday: date.getDay(),
      dateStr: date.toISOString().slice(0, 10),
      weekdayName: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getDay()]
    };
  }
}

export function createAnalyticsRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();
  router.use('/analytics', authMiddleware);

  router.get('/analytics', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const timeRange = (req.query.time_range as string) || 'all';

      // 1. Fetch user's home timezone & active hours
      const home = await db.get(
        'SELECT timezone, active_hours_start, active_hours_end FROM homes WHERE user_id = ? LIMIT 1',
        [userId]
      );
      const timeZone = home?.timezone || 'UTC';
      const activeStart = home?.active_hours_start || '07:00';
      const activeEnd = home?.active_hours_end || '23:00';

      // Optional time-range cutoff
      let cutoffIso: string | null = null;
      const now = new Date();
      if (timeRange === '24h') {
        cutoffIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      } else if (timeRange === '7d') {
        cutoffIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (timeRange === '30d') {
        cutoffIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      }

      // 2. Fetch all events strictly for this user (with optional range filter)
      let allEventsQuery = `SELECT id, category, object_class, confidence, started_at, is_unusual, anomaly_score, user_feedback
         FROM events WHERE user_id = ?`;
      const queryParams: any[] = [userId];

      if (cutoffIso) {
        allEventsQuery += ` AND started_at >= ?`;
        queryParams.push(cutoffIso);
      }
      allEventsQuery += ` ORDER BY started_at ASC`;

      const allEvents = await db.query(allEventsQuery, queryParams);

      // Hourly map (24 hours) in user's home timezone
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
      const windowAggregation = new Map<string, any>();

      allEvents.forEach((ev: any) => {
        const timeVal = ev.started_at || ev.created_at;
        const dt = new Date(timeVal);

        const { hour, weekday, dateStr } = getLocalTimeComponents(dt, timeZone);

        if (dateStr && dateStr !== 'Unknown') {
          uniqueDates.add(dateStr);
          dailyMap[dateStr] = (dailyMap[dateStr] || 0) + 1;
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

        // Heatmap cell (timezone-adjusted day & hour)
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

        // Confidence distribution
        const conf = parseFloat(ev.confidence) || 0;
        for (const bucket of confidenceBuckets) {
          if (conf >= bucket.min && conf < bucket.max) {
            bucket.count += 1;
            break;
          }
        }

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
        .map(([date, count]) => {
          let label = date;
          try {
            const [y, m, d] = date.split('-').map(Number);
            const dObj = new Date(Date.UTC(y, m - 1, d));
            label = new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(dObj);
          } catch {}
          return { date, label, count };
        });

      const totalEvents = allEvents.length;
      const daysSpanned = uniqueDates.size;
      const unusualPercentage = totalEvents > 0 ? Number(((unusualCount / totalEvents) * 100).toFixed(1)) : 0;

      // Find peak activity hour in user's home timezone
      let peakHour = 0;
      let maxHourlyEvents = 0;
      hourlyMap.forEach((h) => {
        if (h.total > maxHourlyEvents) {
          maxHourlyEvents = h.total;
          peakHour = h.hour;
        }
      });
      const peakHourStr = `${String(peakHour).padStart(2, '0')}:00 - ${String((peakHour + 1) % 24).padStart(2, '0')}:00`;

      // 3. Call Python Anomaly Analysis Engine with timezone-aware current time
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
        const { hour: currentLocalHour, weekday: currentLocalWeekday } = getLocalTimeComponents(now, timeZone);
        const startH = parseInt(activeStart.split(':')[0], 10);
        const endH = parseInt(activeEnd.split(':')[0], 10);
        const isQuiet = currentLocalHour < startH || currentLocalHour >= endH;

        const pyPayload = {
          timezone: timeZone,
          time_windows: Array.from(windowAggregation.values()),
          current_window: {
            timestamp_utc: now.toISOString(),
            hour: currentLocalHour,
            weekday: currentLocalWeekday,
            category: 'person',
            event_count: 1,
            is_quiet_hours: isQuiet
          }
        };

        const pyRes = await fetch(`${config.PYTHON_SERVICE_URL}/analyze`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': config.AI_SERVICE_SECRET
          },
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
          timezone: timeZone,
          time_range: timeRange,
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
