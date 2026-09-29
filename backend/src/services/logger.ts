import fs from 'fs';
import path from 'path';

const logDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const errorLogPath = path.join(logDir, 'error.log');

export const logger = {
  info: (msg: string, ...args: any[]) => {
    console.log(`[INFO ${new Date().toISOString()}] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: any[]) => {
    console.warn(`[WARN ${new Date().toISOString()}] ${msg}`, ...args);
  },
  error: (msg: string, err?: any) => {
    const time = new Date().toISOString();
    const stack = err instanceof Error ? err.stack : JSON.stringify(err);
    const line = `[ERROR ${time}] ${msg} - Details: ${stack}\n`;
    
    console.error(`[ERROR ${time}] ${msg}`, err || '');
    try {
      fs.appendFileSync(errorLogPath, line, 'utf8');
    } catch (e) {
      console.error('Failed to append to error.log', e);
    }
  }
};
