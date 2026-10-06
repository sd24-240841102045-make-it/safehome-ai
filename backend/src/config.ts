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
  JWT_SECRET: z.string().default('safehome_super_secret_jwt_key_2026_change_in_production'),
  RAZORPAY_KEY_ID: z.string().default('rzp_test_safehome_dev'),
  RAZORPAY_KEY_SECRET: z.string().default('safehome_dev_razorpay_secret_key_2026'),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default('')
});

export const config = ConfigSchema.parse(process.env);

if (config.NODE_ENV === 'production') {
  if (config.JWT_SECRET === 'safehome_super_secret_jwt_key_2026_change_in_production') {
    throw new Error('SECURITY ALERT: Default JWT_SECRET is not permitted in production. Set a secure JWT_SECRET in your environment.');
  }
  if (config.AI_SERVICE_SECRET === 'safehome_super_internal_ai_secret_key_2026') {
    throw new Error('SECURITY ALERT: Default AI_SERVICE_SECRET is not permitted in production. Set a secure AI_SERVICE_SECRET in your environment.');
  }
  if (config.RAZORPAY_KEY_SECRET === 'safehome_dev_razorpay_secret_key_2026') {
    console.warn('⚠️ SECURITY NOTICE: Default dev RAZORPAY_KEY_SECRET is in use. Configure live Razorpay API keys in production.');
  }
}
