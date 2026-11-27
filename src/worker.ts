import { handleApiRequest } from './server/apiRouter.ts';
import { createD1DbClient, type D1Database } from './server/d1Client.ts';
import { initSchemaAsync, seedBaselineConfigAsync } from './server/schema.ts';

export interface CloudflareWorkerEnv {
  DB?: D1Database;
  BEPARI_ADMIN_PASSCODE?: string;
  ASSETS?: {
    fetch(request: Request | string): Promise<Response>;
  };
}

let d1InitPromise: Promise<void> | null = null;

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

export async function handleCloudflareRequest(
  request: Request,
  env: CloudflareWorkerEnv
): Promise<Response> {
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

  if (pathname === '/api' || pathname.startsWith('/api/')) {
    if (!env?.DB) {
      if (method === 'GET' && pathname === '/api/runtime') {
        return jsonResponse({ engine: 'on-device', cloudAvailable: false }, 200);
      }
      return jsonResponse(
        {
          error: 'Cloud D1 database binding "DB" is not configured; using on-device database mode.',
          code: 'D1_BINDING_MISSING',
        },
        503
      );
    }

    const db = createD1DbClient(env.DB);
    if (!d1InitPromise) {
      d1InitPromise = (async () => {
        await initSchemaAsync(db);
        await seedBaselineConfigAsync(db);
      })().catch((err) => {
        d1InitPromise = null;
        throw err;
      });
    }
    await d1InitPromise;

    return handleApiRequest(request, db, {
      runtimeEngine: 'cloud-d1',
      envAdminPasscode: env.BEPARI_ADMIN_PASSCODE,
    });
  }

  if (env?.ASSETS) {
    return env.ASSETS.fetch(request);
  }

  return new Response('Not Found', { status: 404 });
}

export default {
  async fetch(request: Request, env: CloudflareWorkerEnv): Promise<Response> {
    return handleCloudflareRequest(request, env);
  },
};
