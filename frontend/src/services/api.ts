import axios from 'axios';

// Relative API URLs through the Vite proxy (Specification 1)
export const API_BASE = '/api';

export const WS_BASE = (() => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return `${protocol}//${host}/ws`;
})();

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000
});

// Attach JWT token from Supabase Auth or local storage
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('supabase_token') || localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authService = {
  login: (email: string, password: string) => api.post('/auth/login', { email, password }),
  register: (email: string, password: string, full_name: string) =>
    api.post('/auth/register', { email, password, full_name }),
  getMe: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout')
};

export const systemService = {
  getHealth: () => api.get('/health'),
  getNetworkInterfaces: () => api.get('/network-interfaces'),
  getDashboard: () => api.get('/dashboard')
};

export const eventService = {
  getEvents: (params?: any) => api.get('/events', { params }),
  getEventById: (id: string) => api.get(`/events/${id}`),
  createEvent: (data: any) => api.post('/events', data),
  submitFeedback: (id: string, feedback: 'expected' | 'unexpected' | null) =>
    api.patch(`/events/${id}/feedback`, { feedback }),
  deleteEvent: (id: string) => api.delete(`/events/${id}`)
};

export const alertService = {
  getAlerts: (params?: any) => api.get('/alerts', { params }),
  markRead: (id: string) => api.patch(`/alerts/${id}`),
  markAllRead: () => api.patch('/alerts/read-all'),
  deleteAlert: (id: string) => api.delete(`/alerts/${id}`)
};

export const analyticsService = {
  getAnalytics: () => api.get('/analytics')
};

export const settingsService = {
  getSettings: () => api.get('/settings'),
  updateSettings: (data: any) => api.put('/settings', data),
  purgeExpiredData: () => api.post('/settings/purge'),
  exportData: () => api.get('/settings/export')
};

export const deviceService = {
  getDevices: () => api.get('/devices'),
  createPairingCode: (homeId: string, deviceName: string) =>
    api.post('/devices/pair/generate', { home_id: homeId, device_name: deviceName }),
  exchangePairingCode: (code: string) => api.post('/devices/pair', { code }),
  deleteDevice: (id: string) => api.delete(`/devices/${id}`)
};

export default api;
