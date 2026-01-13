import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Custom plugin to log reloads
const logReloadPlugin = (env: Record<string, string>) => ({
  name: 'log-reload',
  configureServer(server) {
    console.log(`[Knox Web] Server starting...`);
    console.log(`[Knox Web] AI_API_URL = ${env.VITE_AI_API_URL || 'not set'}`);
    server.watcher.on('change', (file) => {
      console.log(`[Knox Web] File changed: ${file.split('/').slice(-2).join('/')}`);
    });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), logReloadPlugin(env)],
    server: {
      port: 3000,
      host: true, // needed for docker
    },
    build: {
      outDir: 'dist',
    },
    define: {
      // Fallback for any remaining process.env usage
      'process.env': {},
    },
  };
});
