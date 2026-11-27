import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { handleApiRequest } from './src/server/apiRouter.ts';
import { createInitializedNodeDbClient } from './src/server/db.ts';
import { verifyLegacyScryptPassword } from './src/server/nodeDbClient.ts';

const PORT = 3000;

async function startServer() {
  const { db } = await createInitializedNodeDbClient();

  const app = express();

  app.all('/api/*', express.text({ type: '*/*', limit: '2mb' }), async (req, res) => {
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') {
          headers.set(key, value);
        } else if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        }
      }

      const method = req.method.toUpperCase();
      const hasBody = method !== 'GET' && method !== 'HEAD' && typeof req.body === 'string' && req.body.length > 0;
      const webReq = new Request(`http://localhost:${PORT}${req.originalUrl}`, {
        method,
        headers,
        body: hasBody ? req.body : undefined,
      });

      const apiRes = await handleApiRequest(webReq, db, {
        runtimeEngine: 'node-sqlite',
        envAdminPasscode: process.env.BEPARI_ADMIN_PASSCODE,
        legacyScryptVerifier: verifyLegacyScryptPassword,
      });

      res.status(apiRes.status);
      apiRes.headers.forEach((value, key) => {
        res.setHeader(key, value);
      });
      const text = await apiRes.text();
      res.send(text);
    } catch (err) {
      console.error('Unhandled API error:', err);
      res.status(500).json({ error: 'Internal server error.' });
    }
  });

  // ---------------- Frontend Serving (Vite Dev / Production Dist) ----------------

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
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Bepari server running at http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Bepari server:', err);
  process.exit(1);
});
