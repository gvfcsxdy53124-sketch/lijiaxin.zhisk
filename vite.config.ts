import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import {asrDevMiddleware} from './src/server/asrMiddleware';
import {imageVisionDevMiddleware} from './src/server/imageVisionMiddleware';

export default defineConfig({
  base: process.env.GITHUB_PAGES_BASE || '/',
  plugins: [
    {
      name: 'local-dev-ai-api',
      apply: 'serve',
      configureServer(server) {
        server.middlewares.use(asrDevMiddleware);
        server.middlewares.use(imageVisionDevMiddleware);
      },
    },
    react(),
    tailwindcss()
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    host: '0.0.0.0',
    port: 3000,
  },
});
