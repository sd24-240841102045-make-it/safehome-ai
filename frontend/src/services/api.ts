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
  getHardware: () => api.get('/system/hardware'),
  getNetworkInterfaces: () => api.get('/network-interfaces'),
  getDashboard: () => api.get('/dashboard')
};

export const eventService = {
  getEvents: (params?: any) => api.get('/events', { params }),
  getEventById: (id: string) => api.get(`/events/${id}`),
  createEvent: (data: any) => api.post('/events', data),
  submitFeedback: (id: string, feedback: 'correct' | 'false_alert' | 'unknown' | 'expected' | 'unexpected', feedback_reason?: string) =>
    api.patch(`/events/${id}/feedback`, { feedback, feedback_reason }),
  deleteEvent: (id: string) => api.delete(`/events/${id}`)
};

export const alertService = {
  getAlerts: (params?: any) => api.get('/alerts', { params }),
  markRead: (id: string) => api.patch(`/alerts/${id}`),
  resolveAlert: (id: string) => api.patch(`/alerts/${id}/resolve`),
  markAllRead: () => api.patch('/alerts/read-all'),
  deleteAlert: (id: string) => api.delete(`/alerts/${id}`)
};

export const incidentService = {
  getIncidents: (params?: any) => api.get('/incidents', { params }),
  acknowledge: (id: string) => api.patch(`/incidents/${id}/acknowledge`),
  resolve: (id: string) => api.patch(`/incidents/${id}/resolve`)
};

export const ruleService = {
  getRules: () => api.get('/rules'),
  createRule: (data: any) => api.post('/rules', data),
  updateRule: (id: string, data: any) => api.patch(`/rules/${id}`, data),
  deleteRule: (id: string) => api.delete(`/rules/${id}`),
  getHomeMode: () => api.get('/homes/mode'),
  setHomeMode: (mode: 'home' | 'away' | 'night' | 'disarmed', arming_delay_s?: number) =>
    api.post('/homes/mode', { mode, arming_delay_s })
};

export const timelineService = {
  getTimeline: (params?: any) => api.get('/timeline', { params })
};

export const memberService = {
  getMembers: () => api.get('/homes/members'),
  getInvites: () => api.get('/homes/invites'),
  createInvite: (role: string = 'member', email?: string) => api.post('/homes/invites', { role, email }),
  joinHome: (invite_code: string) => api.post('/homes/join', { invite_code }),
  removeMember: (id: string) => api.delete(`/homes/members/${id}`),
  updateRole: (id: string, role: string) => api.patch(`/homes/members/${id}/role`, { role })
};

export const auditService = {
  getAuditLogs: (params?: any) => api.get('/audit', { params })
};

export const analyticsService = {
  getAnalytics: (params?: any) => api.get('/analytics', { params })
};

export const settingsService = {
  getSettings: () => api.get('/settings'),
  updateSettings: (data: any) => api.put('/settings', data),
  purgeExpiredData: () => api.post('/settings/purge'),
  exportData: () => api.get('/settings/export'),
  eraseAllData: (confirm_phrase: string) => api.post('/settings/erase-all', { confirm_phrase })
};

export const deviceService = {
  getDevices: () => api.get('/devices'),
  createPairingCode: (homeId: string, deviceName: string) =>
    api.post('/devices/pair/generate', { home_id: homeId, device_name: deviceName }),
  exchangePairingCode: (code: string) => api.post('/devices/pair', { code }),
  deleteDevice: (id: string) => api.delete(`/devices/${id}`)
};

export const paymentService = {
  getConfig: () => api.get('/payments/config'),
  getPlans: () => api.get('/payments/plans'),
  getSubscription: () => api.get('/payments/subscription'),
  getHistory: () => api.get('/payments/history'),
  getInvoice: (id: string) => api.get(`/payments/invoice/${id}`),
  createOrder: (data: { plan_id: string; billing_cycle: 'monthly' | 'yearly'; home_id?: string }) =>
    api.post('/payments/create-order', data),
  verifyPayment: (data: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => api.post('/payments/verify', data),
  cancelSubscription: (reason?: string) => api.post('/payments/cancel-subscription', { reason })
};

export default api;

