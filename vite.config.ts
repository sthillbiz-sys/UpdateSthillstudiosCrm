import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

const normalizeBasePath = (input?: string) => {
  const raw = (input || '/employeelogin').trim();
  if (!raw || raw === '/') {
    return '/employeelogin';
  }
  return `/${raw.replace(/^\/+|\/+$/g, '')}`;
};

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  const basePath = normalizeBasePath(env.CRM_BASE_PATH);

  return {
    base: mode === 'production' ? `${basePath}/` : '/',
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
