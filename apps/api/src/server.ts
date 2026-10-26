import { app } from './app.js';
import { env } from './lib/env.js';

const server = app.listen(env.PORT, () => {
  console.log(`API StudentOS em http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
// Ligações lentas de propósito («slowloris») não ficam presas: cabeçalhos em 20 s, pedido completo em 60 s
// (chega para enviar um horário de 1 MB numa rede móvel fraca).
server.headersTimeout = 20_000;
server.requestTimeout = 60_000;
