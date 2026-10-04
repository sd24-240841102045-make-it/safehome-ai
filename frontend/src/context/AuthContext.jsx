import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const saved = localStorage.getItem('user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState(() => localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function verifyAuth() {
      if (token) {
        try {
          const res = await authService.getMe();
          if (res.data.success && isMounted) {
            setUser(res.data.user);
            localStorage.setItem('user', JSON.stringify(res.data.user));
          }
        } catch (err) {
          // Only clear user credentials if the server explicitly rejected the token with 401 Unauthorized
          if (err?.response?.status === 401 || err?.response?.status === 403) {
            console.warn('[Auth] Token invalid or expired, logging out');
            if (isMounted) logout();
          } else {
            console.warn('[Auth] Backend reconnecting or network error, preserving cached session credentials');
          }
        }
      }
      if (isMounted) {
        setLoading(false);
      }
    }
    verifyAuth();
    return () => {
      isMounted = false;
    };
  }, [token]);

  const login = async (email, password) => {
    const res = await authService.login(email, password);
    if (res.data.success) {
      setUser(res.data.user);
      setToken(res.data.token);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('safehome_token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
    }
    return res.data;
  };

  const register = async (email, password, full_name) => {
    const res = await authService.register(email, password, full_name);
    if (res.data.success) {
      setUser(res.data.user);
      setToken(res.data.token);
      localStorage.setItem('token', res.data.token);
      localStorage.setItem('safehome_token', res.data.token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
    }
    return res.data;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('token');
    localStorage.removeItem('safehome_token');
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider value={{ user, token, isAuthenticated: Boolean(user && token), loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
