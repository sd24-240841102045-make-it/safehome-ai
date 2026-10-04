import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';

import Dashboard from './pages/Dashboard';
import Monitor from './pages/Monitor';
import Events from './pages/Events';
import Alerts from './pages/Alerts';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import Timeline from './pages/Timeline';
import Rules from './pages/Rules';
import AuditLogs from './pages/AuditLogs';
import Members from './pages/Members';
import Login from './pages/Login';
import Register from './pages/Register';

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Dedicated Android Phone Camera Monitor Route */}
          {/* Accessible standalone for mobile browsers on Wi-Fi without friction */}
          <Route path="/monitor" element={<Monitor />} />

          {/* Protected Laptop Dashboard & Surveillance Management Routes */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="events" element={<Events />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="timeline" element={<Timeline />} />
            <Route path="rules" element={<Rules />} />
            <Route path="members" element={<Members />} />
            <Route path="audit-logs" element={<AuditLogs />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings />} />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  </ErrorBoundary>
  );
}
