import { defineConfig } from 'vite';

const PRODUCTION_BASE = '/ninjarena/';
const DEV_SERVER_URL = 'ws://localhost:8080';

export default defineConfig(({ command, isPreview }) => ({
  // Servi sous un sous-chemin en production (et en preview), à la racine en développement.
  base: command === 'build' || isPreview ? PRODUCTION_BASE : '/',
  server: {
    port: 5173,
    // Le client compose `<origine>/ws`: en dev, Vite relaie ce chemin vers le serveur de jeu.
    proxy: { '/ws': { target: DEV_SERVER_URL, ws: true } },
  },
  build: { target: 'es2022' },
}));
