import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages のサブパスでも動くよう相対パスで出力
  base: './',
  server: { host: true },
  worker: { format: 'es' },
  build: { target: 'es2022' },
});
