import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const ConfigSchema = z.object({
  PORT: z.coerce.number().default(5000),
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('sqlite:./safehome.sqlite'),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_ANON_KEY: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  PYTHON_SERVICE_URL: z.string().default('http://127.0.0.1:8000'),
  AI_SERVICE_SECRET: z.string().default('safehome_super_internal_ai_secret_key_2026'),
  CORS_ORIGIN: z.string().default('*'),
  JWT_SECRET: z.string().default('safehome_super_secret_jwt_key_2026_change_in_production')
});

export const config = ConfigSchema.parse(process.env);
