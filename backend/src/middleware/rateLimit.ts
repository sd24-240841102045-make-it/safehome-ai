import rateLimit from 'express-rate-limit';

/**
 * Rate Limiter for Authentication Endpoints (/api/auth/login, /api/auth/register)
 * Limits each client IP to 10 requests per 15 minutes to prevent brute-force attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again after 15 minutes.'
  }
});

/**
 * Rate Limiter for Device Pairing Endpoints (/api/devices/pair)
 * Limits each client IP to 15 pairing exchanges per 15 minutes to thwart code guessing.
 */
export const pairingLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: {
    success: false,
    error: 'Too many device pairing attempts. Please try again after 15 minutes.'
  }
});

/**
 * Factory to create custom rate limiters (useful for testing or specialized routes)
 */
export function createCustomLimiter(max: number, windowMs = 15 * 60 * 1000, message = 'Rate limit exceeded') {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    statusCode: 429,
    message: {
      success: false,
      error: message
    }
  });
}
