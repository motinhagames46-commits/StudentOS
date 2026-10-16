// Inicia um PostgreSQL 17 local (sem Docker) em .pgdata/, para desenvolvimento e testes.
// Cria as bases de dados "studentos" e "studentos_test". Ctrl+C para parar.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dataDir = fileURLToPath(new URL('../.pgdata', import.meta.url));
const port = Number(process.env.PGPORT ?? 54329);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'studentos',
  password: 'studentos',
  port,
  persistent: true,
  onLog: () => {},
});

if (!existsSync(`${dataDir}/PG_VERSION`)) await pg.initialise();
await pg.start();

for (const name of ['studentos', 'studentos_test']) {
  try {
    await pg.createDatabase(name);
  } catch {
    // já existe
  }
}

console.log(`PostgreSQL pronto em postgresql://studentos:studentos@localhost:${port}/studentos`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
