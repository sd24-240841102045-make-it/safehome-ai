import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import os from 'os';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

import { initDatabase } from './services/db.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { setupWebSocket } from './websocket/streamHandler.js';

// Route imports
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import deviceRoutes from './routes/devices.js';
import eventRoutes from './routes/events.js';
import alertRoutes from './routes/alerts.js';
import analyticsRoutes from './routes/analytics.js';
import settingsRoutes from './routes/settings.js';

const app = express();
const server = http.createServer(app);

const PORT = parseInt(process.env.PORT, 10) || 5000;
const HOST = process.env.HOST || '0.0.0.0';

// 1. Security & Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for flexible local camera/blob streaming
  crossOriginEmbedderPolicy: false
}));

const corsOrigins = process.env.CORS_ORIGIN === '*'
  ? '*'
  : (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((o) => o.trim());

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('dev'));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Rate limiter for general API routes (relaxed for active local development)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' }
});
app.use('/api/', apiLimiter);

// 2. Discover local IP addresses for Phone-to-Laptop connection
function getLocalIps() {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        ips.push({
          interface: name,
          ip: net.address,
          url_phone_monitor: `http://${net.address}:5173/monitor`,
          url_backend_api: `http://${net.address}:${PORT}`
        });
      }
    }
  }
  return ips;
}

app.get('/api/network-interfaces', (req, res) => {
  res.json({
    success: true,
    port: PORT,
    local_ips: getLocalIps(),
    localhost: {
      url_dashboard: `http://localhost:5173`,
      url_monitor: `http://localhost:5173/monitor`
    }
  });
});

// 3. API Routes Mount
app.use('/api', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/devices', deviceRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/settings', settingsRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    service: 'SafeHome AI Backend API',
    status: 'online',
    version: '1.0.0',
    documentation: '/docs/api.md',
    health: '/api/health'
  });
});

// 4. Error Handling
app.use(notFoundHandler);
app.use(errorHandler);

// 5. WebSocket Server
const wss = new WebSocketServer({ server, path: '/ws' });
setupWebSocket(wss);

// 6. Server Initialization
async function startServer() {
  try {
    await initDatabase();

    server.listen(PORT, HOST, () => {
      console.log(`\n========================================================`);
      console.log(`🛡️  SafeHome AI Backend Server running on port ${PORT}`);
      console.log(`📡 WebSocket endpoint: ws://${HOST}:${PORT}/ws`);
      console.log(`🩺 Health endpoint:    http://localhost:${PORT}/api/health`);
      console.log(`🌐 Local IPs for Android Phone:`);
      const ips = getLocalIps();
      if (ips.length > 0) {
        ips.forEach((net) => {
          console.log(`   - ${net.interface}: http://${net.ip}:5173/monitor (Backend: ${net.ip}:${PORT})`);
        });
      } else {
        console.log(`   - http://localhost:5173/monitor`);
      }
      console.log(`========================================================\n`);
    });
  } catch (err) {
    console.error('Fatal backend startup error:', err);
    process.exit(1);
  }
}

startServer();

export { app, server };
