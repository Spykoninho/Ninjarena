import { loadContent } from '@ninjarena/content';
import { loadServerConfig } from './config/serverConfig';
import { FileAccountRepository } from './persistence/fileAccountRepository';
import { FileMapRepository } from './persistence/fileMapRepository';
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

const start = async (): Promise<GameServer> => {
  const config = loadServerConfig(process.env);
  const server = new GameServer({
    config,
    transport: new WebSocketTransport({ host: config.host, port: config.port, log: logError }),
    content: loadContent(),
    results: new InMemoryMatchResultRepository(),
    maps: new FileMapRepository({ dir: config.mapsDir, log: logError }),
    accounts: new FileAccountRepository({ file: config.accountsFile, log: logError }),
    log,
  });
  await server.start();
  // `0.0.0.0` n'est pas une adresse joignable: on affiche celle que le client peut composer.
  const dialableHost = config.host === ANY_INTERFACE ? 'localhost' : config.host;
  log(`listening on ws://${dialableHost}:${config.port}`);
  return server;
};

const shutdown = (server: GameServer): void => {
  log('shutting down');
  server.stop().then(
    () => process.exit(0),
    (error: unknown) => {
      logError(`failed to stop cleanly: ${messageOf(error)}`);
      process.exit(1);
    },
  );
};

try {
  const server = await start();
  process.on('SIGINT', () => {
    shutdown(server);
  });
  process.on('SIGTERM', () => {
    shutdown(server);
  });
} catch (error) {
  // Configuration invalide ou port déjà pris: une ligne d'erreur, puis on sort.
  logError(`failed to start: ${messageOf(error)}`);
  process.exit(1);
}
