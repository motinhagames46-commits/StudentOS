import { app } from './app.js';
import { env } from './lib/env.js';

const server = app.listen(env.PORT, () => {
  console.log(`API StudentOS em http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
// Ligações lentas de propósito («slowloris») não ficam presas: cabeçalhos em 20 s, pedido completo em 180 s
// (chega para enviar um documento de 10 MB, 13 MB em base64, numa rede móvel fraca de 1 Mbit/s). O corpo grande
// dos documentos só é lido depois da sessão e dos limites de pedidos.
server.headersTimeout = 20_000;
server.requestTimeout = 180_000;
