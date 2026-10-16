import { app } from './app.js';
import { env } from './lib/env.js';

app.listen(env.PORT, () => {
  console.log(`API StudentOS em http://localhost:${env.PORT} (${env.NODE_ENV})`);
});
