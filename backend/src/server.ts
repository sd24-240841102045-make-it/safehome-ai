import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import os from 'os';

import { config } from './config.js';
import { logger } from './services/logger.js';
import { createDatabaseService } from './services/db.js';
import { SafeHomeAuthService } from './services/supabase.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { createHealthRouter } from './routes/health.js';
import { createAuthRouter } from './routes/auth.js';
import { createDashboardRouter } from './routes/dashboard.js';
import { createEventsRouter } from './routes/events.js';
import { createDevicesRouter } from './routes/devices.js';
import { createAlertsRouter } from './routes/alerts.js';
import { createSettingsRouter } from './routes/settings.js';
import { createAnalyticsRouter } from './routes/analytics.js';
import { StreamWebSocketHandler } from './websocket/streamHandler.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';

export async function bootstrap() {
  const app = express();
  const server = http.createServer(app);

  // 1. Security & Core Middleware
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(cors({
    origin: config.CORS_ORIGIN === '*' ? '*' : config.CORS_ORIGIN.split(',').map((o) => o.trim()),
    credentials: true
  }));
  app.use(morgan('dev'));
  app.use(express.json({ limit: '15mb' }));

  // 2. Initialize Database Service
  const db = await createDatabaseService();

  // 3. Initialize Auth Service & Middleware
  const authService = new SafeHomeAuthService(db);
  const authMiddleware = createAuthMiddleware(authService);

  // 4. Network IP Discovery for mobile pairing
  function getLocalIps() {
    const ifaces = os.networkInterfaces();
    const ips: Array<{ interface: string; ip: string; url_phone_monitor: string; url_backend: string }> = [];
    const vitePort = 5173;
    for (const name of Object.keys(ifaces)) {
      for (const net of ifaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          ips.push({
            interface: name,
            ip: net.address,
            url_phone_monitor: `http://${net.address}:${vitePort}/monitor`,
            url_backend: `http://${net.address}:${config.PORT}`
          });
        }
      }
    }
    return ips;
  }

  app.get('/api/network-interfaces', (req, res) => {
    res.json({
      success: true,
      port: config.PORT,
      local_ips: getLocalIps()
    });
  });

  // 5. API Routes
  app.use('/api', createHealthRouter(db));
  app.use('/api/auth', createAuthRouter(authService, db, authMiddleware));
  app.use('/api', createDashboardRouter(db, authMiddleware));
  app.use('/api', createEventsRouter(db, authMiddleware));
  app.use('/api', createDevicesRouter(db, authMiddleware));
  app.use('/api', createAlertsRouter(db, authMiddleware));
  app.use('/api', createSettingsRouter(db, authMiddleware));
  app.use('/api', createAnalyticsRouter(db, authMiddleware));

  app.get('/', (req, res) => {
    res.json({
      service: 'SafeHome AI Gateway',
      status: 'online',
      version: '2.0.0',
      health: '/api/health'
    });
  });

  // 6. Error Handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  // 7. WebSocket Server
  const wss = new WebSocketServer({ server, path: '/ws' });
  const streamHandler = new StreamWebSocketHandler(wss, db, authService);

  // 8. Start Server (skip listening during automated tests)
  if (process.env.NODE_ENV !== 'test') {
    server.listen(config.PORT, config.HOST, () => {
      logger.info(`====================================================`);
      logger.info(`🛡️  SafeHome AI Backend (TS) running on port ${config.PORT}`);
      logger.info(`🩺 Health endpoint: http://localhost:${config.PORT}/api/health`);
      logger.info(`📡 WebSocket endpoint: ws://${config.HOST}:${config.PORT}/ws`);
      logger.info(`====================================================`);
    });
  }

  return { app, server, db, wss, authService };
}

// Start if executed directly
if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    logger.error('Failed to start SafeHome AI Backend:', err);
    process.exit(1);
  });
}
