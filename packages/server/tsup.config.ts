import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node22',
  // Les paquets du workspace livrent du TypeScript: ils doivent être embarqués dans le bundle.
  noExternal: [/^@ninjarena\//],
  clean: true,
});
