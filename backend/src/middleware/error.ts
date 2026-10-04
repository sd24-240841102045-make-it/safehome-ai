import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../services/logger.js';
import { config } from '../config.js';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // 1. Handle Zod Validation Errors cleanly as 400 Bad Request
  if (err instanceof ZodError || err.name === 'ZodError') {
    const formattedErrors = err.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`).join(', ') || 'Validation error';
    logger.warn(`[Validation Error] ${req.method} ${req.url} - ${formattedErrors}`);
    return res.status(400).json({
      success: false,
      error: formattedErrors,
      details: err.errors
    });
  }

  // 2. Handle Body Parser JSON Syntax Errors
  if (err instanceof SyntaxError && 'body' in err) {
    logger.warn(`[JSON Syntax Error] ${req.method} ${req.url}`);
    return res.status(400).json({
      success: false,
      error: 'Malformed JSON payload in request body'
    });
  }

  // 3. Unhandled Server Errors
  logger.error(`Unhandled error during ${req.method} ${req.url}`, err);

  const statusCode = err.statusCode || (res.statusCode !== 200 ? res.statusCode : 500);

  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error',
    ...(config.NODE_ENV === 'development' ? { stack: err.stack } : {})
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: `Endpoint not found: ${req.method} ${req.originalUrl}`
  });
}

