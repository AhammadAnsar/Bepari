import type { Context } from 'hono';
import { BlockedDatabaseError } from '../../db/index.ts';

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: 400 | 401 | 403 | 404 | 409 | 422 | 423 | 500 | 503;
  public readonly fieldErrors?: Record<string, string>;

  constructor(
    code: string,
    message: string,
    statusCode: 400 | 401 | 403 | 404 | 409 | 422 | 423 | 500 | 503 = 400,
    fieldErrors?: Record<string, string>
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.fieldErrors = fieldErrors;
  }
}

export function okResponse<T>(c: Context, data: T, status: 200 | 201 = 200) {
  const requestId = (c.get('requestId' as never) as string) || crypto.randomUUID();
  return c.json(
    {
      data,
      meta: {
        requestId,
        timestamp: new Date().toISOString(),
      },
    },
    status
  );
}

export function handleApiError(c: Context, err: unknown) {
  const requestId = (c.get('requestId' as never) as string) || crypto.randomUUID();

  if (err instanceof BlockedDatabaseError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.details.messageBn,
          messageEn: err.details.messageEn,
          details: err.details,
          fieldErrors: {},
          requestId,
        },
      },
      503
    );
  }

  if (err instanceof AppError) {
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          fieldErrors: err.fieldErrors || {},
          requestId,
        },
      },
      err.statusCode
    );
  }

  console.error(`[API Error][${requestId}]`, err);
  return c.json(
    {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'সার্ভারে একটি অপ্রত্যাশিত ত্রুটি ঘটেছে। অনুগ্রহ করে আবার চেষ্টা করুন।',
        fieldErrors: {},
        requestId,
      },
    },
    500
  );
}
