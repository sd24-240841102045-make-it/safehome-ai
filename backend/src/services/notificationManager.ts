export interface QuietHoursConfig {
  quietHoursStart: string; // '22:00'
  quietHoursEnd: string;   // '07:00'
  timezone?: string;       // 'UTC'
}

/**
 * Evaluates whether the current time falls within user-configured Notification Quiet Hours.
 * Note: Notification Quiet Hours only controls delivery/audibility of notifications;
 * it is strictly decoupled from Anomaly Expected Active Hours.
 */
export function isCurrentlyInQuietHours(config: QuietHoursConfig, date: Date = new Date()): boolean {
  try {
    const [startH, startM] = (config.quietHoursStart || '22:00').split(':').map(Number);
    const [endH, endM] = (config.quietHoursEnd || '07:00').split(':').map(Number);

    const currentH = date.getUTCHours();
    const currentM = date.getUTCMinutes();
    const currentMinutes = currentH * 60 + currentM;
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      // Quiet hours in same day (e.g. 13:00 to 17:00)
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      // Overnight quiet hours (e.g. 22:00 to 07:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  } catch {
    return false;
  }
}
