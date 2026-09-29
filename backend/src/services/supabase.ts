import { createClient, SupabaseClient } from '@supabase/supabase-js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { config } from '../config.js';
import { logger } from './logger.js';
import { DatabaseService } from './db.js';

export interface AuthUser {
  id: string;
  email: string;
  role: string;
  full_name?: string;
}

export interface AuthService {
  register(email: string, password: string, fullName: string): Promise<{ user: AuthUser; token: string }>;
  login(email: string, password: string): Promise<{ user: AuthUser; token: string }>;
  verifyToken(token: string): Promise<AuthUser | null>;
}

export class SafeHomeAuthService implements AuthService {
  private supabase: SupabaseClient | null = null;
  private db: DatabaseService;

  constructor(db: DatabaseService) {
    this.db = db;
    if (config.SUPABASE_URL && config.SUPABASE_ANON_KEY) {
      try {
        this.supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY);
        logger.info('[Auth] Connected to Supabase Auth instance at:', config.SUPABASE_URL);
      } catch (err: any) {
        logger.warn('[Auth] Failed to initialize Supabase client:', err.message);
      }
    } else {
      logger.info('[Auth] Using local Auth Provider (zero-setup offline development mode).');
    }
  }

  async register(email: string, password: string, fullName: string): Promise<{ user: AuthUser; token: string }> {
    const cleanEmail = email.toLowerCase().trim();

    if (this.supabase) {
      // 1. Production Supabase Auth Sign Up
      const { data, error } = await this.supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: { full_name: fullName.trim() }
        }
      });

      if (error || !data.user) {
        throw new Error(error?.message || 'Registration failed via Supabase Auth');
      }

      const userId = data.user.id;
      // Ensure profile, home, and user_settings exist
      await this.ensureUserRecords(userId, cleanEmail, fullName.trim());

      const token = data.session?.access_token || this.generateLocalToken(userId, cleanEmail);
      return {
        user: { id: userId, email: cleanEmail, full_name: fullName.trim(), role: 'homeowner' },
        token
      };
    } else {
      // 2. Local Auth Mode: matches Supabase Auth structure
      const existing = await this.db.get('SELECT id FROM profiles WHERE email = ?', [cleanEmail]);
      if (existing) {
        throw new Error('An account with this email already exists.');
      }

      const userId = crypto.randomUUID();
      await this.ensureUserRecords(userId, cleanEmail, fullName.trim(), password);

      const token = this.generateLocalToken(userId, cleanEmail);
      return {
        user: { id: userId, email: cleanEmail, full_name: fullName.trim(), role: 'homeowner' },
        token
      };
    }
  }

  async login(email: string, password: string): Promise<{ user: AuthUser; token: string }> {
    const cleanEmail = email.toLowerCase().trim();

    if (this.supabase) {
      // 1. Supabase Auth Sign In
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email: cleanEmail,
        password
      });

      if (error || !data.user || !data.session) {
        throw new Error(error?.message || 'Invalid email or password.');
      }

      const profile = await this.db.get('SELECT full_name FROM profiles WHERE id = ?', [data.user.id]);

      return {
        user: {
          id: data.user.id,
          email: cleanEmail,
          full_name: profile?.full_name || data.user.user_metadata?.full_name || 'Homeowner',
          role: 'homeowner'
        },
        token: data.session.access_token
      };
    } else {
      // 2. Local Auth Mode
      const profile = await this.db.get('SELECT id, email, full_name, role, password_hash FROM profiles WHERE email = ?', [cleanEmail]);
      if (!profile) {
        throw new Error('Invalid email or password.');
      }

      const isDemo = cleanEmail === 'demo@safehome.local' && password === 'SafeHome@2026';
      if (profile.password_hash) {
        const matches = bcrypt.compareSync(password, profile.password_hash);
        if (!matches && !isDemo) {
          throw new Error('Invalid email or password.');
        }
      } else if (!isDemo) {
        throw new Error('Invalid email or password.');
      }
      
      const token = this.generateLocalToken(profile.id, cleanEmail);
      return {
        user: {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          role: profile.role || 'homeowner'
        },
        token
      };
    }
  }

  async verifyToken(token: string): Promise<AuthUser | null> {
    try {
      if (this.supabase) {
        const { data, error } = await this.supabase.auth.getUser(token);
        if (error || !data.user) {
          // Fallback to local JWT verification if needed
          return this.verifyLocalJwt(token);
        }
        return {
          id: data.user.id,
          email: data.user.email || '',
          role: 'homeowner'
        };
      } else {
        return this.verifyLocalJwt(token);
      }
    } catch {
      return null;
    }
  }

  private generateLocalToken(userId: string, email: string): string {
    return jwt.sign(
      { sub: userId, id: userId, email, role: 'homeowner' },
      config.JWT_SECRET,
      { expiresIn: '7d' }
    );
  }

  private verifyLocalJwt(token: string): AuthUser | null {
    try {
      const decoded: any = jwt.verify(token, config.JWT_SECRET);
      return {
        id: decoded.sub || decoded.id,
        email: decoded.email,
        role: decoded.role || 'homeowner'
      };
    } catch {
      return null;
    }
  }

  private async ensureUserRecords(userId: string, email: string, fullName: string, password?: string): Promise<void> {
    // 1. Insert Profile
    const passwordHash = password ? bcrypt.hashSync(password, 10) : null;
    await this.db.run(
      'INSERT INTO profiles (id, email, full_name, role, password_hash) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
      [userId, email, fullName, 'homeowner', passwordHash]
    );

    // 2. Insert Home with default IANA Timezone (UTC)
    const homeId = crypto.randomUUID();
    await this.db.run(
      'INSERT INTO homes (id, user_id, name, address, timezone) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
      [homeId, userId, 'My Home', 'Primary Residence', 'UTC']
    );

    // 3. Insert User Settings
    await this.db.run(
      'INSERT INTO user_settings (user_id) VALUES (?) ON CONFLICT(user_id) DO NOTHING',
      [userId]
    );
  }
}
