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
import { createHealthRouter } from './routes/health.js';
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

  // 3. Network IP Discovery for mobile pairing
  function getLocalIps() {
    const ifaces = os.networkInterfaces();
    const ips: Array<{ interface: string; ip: string }> = [];
    for (const name of Object.keys(ifaces)) {
      for (const net of ifaces[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          ips.push({ interface: name, ip: net.address });
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

  // 4. API Routes
  app.use('/api', createHealthRouter(db));

  app.get('/', (req, res) => {
    res.json({
      service: 'SafeHome AI Gateway',
      status: 'online',
      version: '2.0.0',
      health: '/api/health'
    });
  });

  // 5. Error Handlers
  app.use(notFoundHandler);
  app.use(errorHandler);

  // 6. WebSocket Server
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    logger.info('[WS] Client connected');
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (err: any) {
        logger.error('[WS Error]', err);
      }
    });
  });

  // 7. Start Server
  server.listen(config.PORT, config.HOST, () => {
    logger.info(`====================================================`);
    logger.info(`🛡️  SafeHome AI Backend (TS) running on port ${config.PORT}`);
    logger.info(`🩺 Health endpoint: http://localhost:${config.PORT}/api/health`);
    logger.info(`📡 WebSocket endpoint: ws://${config.HOST}:${config.PORT}/ws`);
    logger.info(`====================================================`);
  });

  return { app, server, db, wss };
}

// Start if executed directly
if (process.env.NODE_ENV !== 'test') {
  bootstrap().catch((err) => {
    logger.error('Failed to start SafeHome AI Backend:', err);
    process.exit(1);
  });
}
