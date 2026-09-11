import { loadContent } from '@ninjarena/content';
import { loadServerConfig } from './config/serverConfig';
import { InMemoryMatchResultRepository } from './persistence/matchResultRepository';
import { GameServer } from './server';
import { WebSocketTransport } from './transport/webSocketTransport';

const log = (line: string): void => {
  console.log(line);
};

const config = loadServerConfig(process.env);
const server = new GameServer({
  config,
  transport: new WebSocketTransport({ host: config.host, port: config.port }),
  content: loadContent(),
  repository: new InMemoryMatchResultRepository(),
  log,
});

await server.start();
log(`listening on ws://${config.host}:${config.port}`);

process.on('SIGINT', () => {
  log('shutting down');
  void server.stop().finally(() => process.exit(0));
});
