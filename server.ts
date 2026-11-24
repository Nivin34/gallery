import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { PORT } from './server/config.js';
import { initDatabase } from './server/db.js';
import { adminRouter } from './server/routes/adminRoutes.js';
import { authRouter } from './server/routes/authRoutes.js';
import { fileRouter } from './server/routes/fileRoutes.js';
import { noteRouter } from './server/routes/noteRoutes.js';
import { publicRouter } from './server/routes/publicRoutes.js';
import { templateRouter } from './server/routes/templateRoutes.js';
import { ensureStorageRoot } from './server/storage.js';

async function bootstrap() {
  await initDatabase();
  await ensureStorageRoot();

  const app = express();
  app.set('trust proxy', true);
  app.use('/api/files', express.json({ limit: '45mb' }));
  app.use('/api/notes', express.json({ limit: '45mb' }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/files', fileRouter);
  app.use('/api/notes', noteRouter);
  app.use('/api/templates', templateRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/admin', adminRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  app.use((err: unknown, req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (req.path.startsWith('/api')) {
      console.error('[FolioVault] API error:', err);
      res.status(500).json({ error: 'Internal authentication or server error. Please try again.' });
      return;
    }
    next(err);
  });

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[FolioVault] Server listening on http://0.0.0.0:${PORT}`);
  });
}

bootstrap().catch((err) => {
  console.error('Failed to start FolioVault server:', err);
  process.exit(1);
});
