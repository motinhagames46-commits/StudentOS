# Deploy — Render + Neon (custo 0 €)

Arquitetura (secção 8.1 da especificação): **um só serviço web** no Render serve a API em `/api` e o frontend, na mesma origem. A base de dados PostgreSQL fica no **Neon**, numa região da UE (RGPD).

## 1. Base de dados no Neon

1. Entra em <https://console.neon.tech> (podes usar a conta do GitHub).
2. **Create project**:
   - Nome: `studentos`
   - Postgres: 17
   - Região: **AWS Europe Central 1 (Frankfurt)**
3. Em **Connection string**, desliga **Connection pooling** e copia o URL. Tem o formato `postgresql://utilizador:palavra-passe@ep-...eu-central-1.aws.neon.tech/neondb?sslmode=require`.
   As migrações do Prisma precisam da ligação direta, por isso o pooling tem de estar desligado.

## 2. Repositório no GitHub

O Render faz deploy a partir do GitHub.

1. Cria um repositório **privado** vazio, por exemplo `studentos`, sem README e sem `.gitignore`.
2. Na pasta do projeto:

   ```bash
   git remote add origin https://github.com/<utilizador>/studentos.git
   git push -u origin main
   ```

## 3. Serviço no Render

1. Entra em <https://dashboard.render.com> com a conta do GitHub.
2. **New → Blueprint** e escolhe o repositório `studentos`. O Render lê o [`render.yaml`](render.yaml).
3. Quando pedir `DATABASE_URL`, cola a connection string do Neon. O `JWT_SECRET` é gerado automaticamente.
4. **Apply**. O primeiro build demora 3 a 5 minutos.
   - Build: `npm ci --include=dev && npm run build`.
   - Arranque: o servidor aplica as migrações (`prisma migrate deploy`) e só depois começa a servir.
5. A aplicação fica em `https://studentos-xxxx.onrender.com`. Confirma que `/api/health` responde `{"status":"ok"}`.

Cada `git push` para `main` faz um novo deploy automaticamente.

## Notas

- **Plano gratuito do Render:** o serviço adormece após cerca de 15 minutos sem pedidos, e o primeiro pedido seguinte pode demorar até 1 minuto. Para a defesa, abre a app uns minutos antes.
- **Dados de demonstração:** em produção não há seed. Cria uma conta na própria app. Se quiseres a conta demo, corre localmente `DATABASE_URL="<url do Neon>" npm run db:seed`. A palavra-passe da conta demo é pública (está no código), por isso não a uses com dados reais.
- **Segredos:** nunca faças commit do `apps/api/.env`. Em produção, os segredos ficam só nas variáveis de ambiente do Render.
- **Backup antes da defesa:** `pg_dump "<url do Neon>" > backup.sql`. O Neon também guarda histórico com *point-in-time restore*.
- **Limites:** confirma os limites atuais dos planos gratuitos do Render e do Neon, porque mudam com frequência.
