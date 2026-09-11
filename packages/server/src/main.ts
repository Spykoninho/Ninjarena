import { loadContent } from '@ninjarena/content';
import { loadServerConfig } from './config/serverConfig';
import { InMemoryMatchResultRepository } from './persistence/matchResultRepository';
import { GameServer } from './server';
import { WebSocketTransport } from './transport/webSocketTransport';

const ANY_INTERFACE = '0.0.0.0';

const log = (line: string): void => {
  console.log(line);
};

const logError = (line: string): void => {
  console.error(line);
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const config = loadServerConfig(process.env);
const server = new GameServer({
  config,
  transport: new WebSocketTransport({ host: config.host, port: config.port, log: logError }),
  content: loadContent(),
  repository: new InMemoryMatchResultRepository(),
  log,
});

try {
  await server.start();
} catch (error) {
  logError(`failed to start on ${config.host}:${config.port}: ${messageOf(error)}`);
  process.exit(1);
}

// `0.0.0.0` n'est pas une adresse joignable: on affiche celle que le client peut composer.
const dialableHost = config.host === ANY_INTERFACE ? 'localhost' : config.host;
log(`listening on ws://${dialableHost}:${config.port}`);

const shutdown = (): void => {
  log('shutting down');
  server.stop().then(
    () => process.exit(0),
    (error: unknown) => {
      logError(`failed to stop cleanly: ${messageOf(error)}`);
      process.exit(1);
    },
  );
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
