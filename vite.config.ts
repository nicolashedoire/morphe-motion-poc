import { defineConfig, loadEnv } from 'vite';
import { createApiMiddleware } from './server/planner.mjs';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const options = { apiKey: process.env.OPENAI_API_KEY || env.OPENAI_API_KEY || '', model: process.env.OPENAI_MODEL || env.OPENAI_MODEL || 'gpt-4.1-mini' };
  return {
    base: './',
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true },
    plugins: [{
      name: 'morphe-local-planner',
      configureServer(server) { server.middlewares.use(createApiMiddleware(options)); },
      configurePreviewServer(server) { server.middlewares.use(createApiMiddleware(options)); },
    }],
  };
});
