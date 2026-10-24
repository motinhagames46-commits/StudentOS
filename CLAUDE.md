@AGENTS.md

## Específico do Claude Code

- As instruções partilhadas estão em `AGENTS.md` (importado acima); não as dupliques aqui.
- Servidores de desenvolvimento: `.claude/launch.json` (`api` na porta 4000, `web` na 5173). Verifica alterações visíveis no browser integrado do cliente, com dados de teste locais.
- Plugins, MCP e skills do projeto: `.claude/settings.json`, `.mcp.json` e `.claude/skills/`; estado e evidência em `docs/setup.md`.
- Memória: índice nativo do cliente para esta pasta (ver `docs/setup.md#memória-e-harness`); factos duráveis vão para a documentação versionada.
