import { handleCloudflareRequest, type CloudflareWorkerEnv } from '../../src/worker.ts';

interface PagesFunctionContext {
  request: Request;
  env: CloudflareWorkerEnv;
}

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  return handleCloudflareRequest(context.request, context.env);
}
