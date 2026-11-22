import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import * as dotenv from 'dotenv';
import { apiApp } from './src/server/app.ts';
import {
  logStartupConfigurationSummary,
  resolveTrustedProxyHops,
} from './src/server/shared/config.ts';

dotenv.config();

async function startServer() {
  // Validate required & optional environment variables at startup
  const startupConfig = logStartupConfigurationSummary();

  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const trustedHops = resolveTrustedProxyHops();

  if (trustedHops > 0) {
    app.set('trust proxy', trustedHops);
  } else {
    app.set('trust proxy', false);
  }

  // Forward all /api/* requests to our Hono application
  app.use('/api', async (req, res) => {
    try {
      // Never blindly trust X-Forwarded-Proto unless TRUSTED_PROXY_HOPS > 0
      const protocol =
        trustedHops > 0
          ? req.headers['x-forwarded-proto'] || req.protocol || 'http'
          : req.protocol || 'http';
      const host = req.headers.host || `localhost:${PORT}`;
      const url = new URL(req.originalUrl, `${protocol}://${host}`);

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else if (typeof value === 'string') {
          headers.set(key, value);
        }
      }

      const hasBody = !['GET', 'HEAD'].includes(req.method.toUpperCase());
      let bodyBuffer: Buffer | undefined;
      if (hasBody) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        }
        bodyBuffer = Buffer.concat(chunks);
      }

      const fetchReq = new Request(url.toString(), {
        method: req.method,
        headers,
        body:
          bodyBuffer && bodyBuffer.length > 0
            ? new Uint8Array(bodyBuffer)
            : undefined,
      });

      const response = await apiApp.fetch(fetchReq);
      res.status(response.status);
      response.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });
      const arrayBuf = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuf));
    } catch (err) {
      console.error('Error bridging request to Hono app:', err);
      res.status(500).json({
        error: {
          code: 'BRIDGE_ERROR',
          message: 'Internal server error',
        },
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Production build not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bepari full-stack server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Bepari server:', err);
  process.exit(1);
});
