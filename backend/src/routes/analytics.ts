import { Router, Request, Response, NextFunction } from 'express';
import { DatabaseService } from '../services/db.js';

export function createAnalyticsRouter(db: DatabaseService, authMiddleware: any): Router {
  const router = Router();
  router.use('/analytics', authMiddleware);

  router.get('/analytics', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;

      // 1. Fetch user's home timezone
      const home = await db.get('SELECT timezone FROM homes WHERE user_id = ? LIMIT 1', [userId]);
      const timeZone = home?.timezone || 'UTC';

      // 2. Fetch all events strictly for this user (Rule 1 & Rule 5)
      const allEvents = await db.query(
        'SELECT category, object_class, confidence, started_at, is_unusual FROM events WHERE user_id = ?',
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

      allEvents.forEach((ev: any) => {
        const timeVal = ev.started_at || ev.created_at;
        const dt = new Date(timeVal);

        // Convert to user's home timezone
        let hour = 0;
        let dateStr = 'Unknown';
        try {
          const hourStr = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hour12: false }).format(dt);
          hour = parseInt(hourStr, 10) % 24;
          dateStr = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(dt);
        } catch {
          hour = isNaN(dt.getHours()) ? 0 : dt.getHours();
          dateStr = timeVal ? timeVal.slice(0, 10) : 'Unknown';
        }

        // Hourly
        if (hourlyMap[hour]) {
          hourlyMap[hour].total += 1;
          const cat = ev.category || 'other';
          if (cat === 'person') hourlyMap[hour].person += 1;
          else if (cat === 'animal') hourlyMap[hour].animal += 1;
          else if (cat === 'vehicle') hourlyMap[hour].vehicle += 1;
          if (ev.is_unusual) hourlyMap[hour].unusual += 1;
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
  });

  return router;
}
