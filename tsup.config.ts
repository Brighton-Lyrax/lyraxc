import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/interface/http/server.ts', 'src/interface/cli/index.ts'],
  format: ['esm'],
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: false,
  dts: false,
});
