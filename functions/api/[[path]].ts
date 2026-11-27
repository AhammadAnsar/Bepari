import { handleApiRequest } from '../../src/server/apiRouter.ts';
import { createD1DbClient, type D1Database } from '../../src/server/d1Client.ts';
import { initSchemaAsync, seedBaselineConfigAsync } from '../../src/server/schema.ts';

interface CloudflareEnv {
  DB?: D1Database;
  BEPARI_ADMIN_PASSCODE?: string;
}

interface PagesFunctionContext {
  request: Request;
  env: CloudflareEnv;
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

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method.toUpperCase();

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
