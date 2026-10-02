# tbn_game

A single-player game that is also a real work tool. You run a small company staffed by AI agents,
each shown as a character in a semi low poly 3D world. The agents do real work with real LLM
calls, and the world is a live view of that work. It runs as one monolith on one private server
that only its owner reaches over a VPN.

## Run it

Requires Docker with the compose plugin.

```
docker compose -f docker-compose.development.yml up --build --wait
curl http://127.0.0.1:3000/health
curl http://127.0.0.1:3001/health
```

To work on the code, install Node 24.21 (see `.node-version`), then `npm ci`, `npm run lint`,
`npm run typecheck` and `npm test`. `CLAUDE.md` lists every command and convention.

## Docs

- `docs/architecture.md`: what the system is and how it is built
- `docs/roadmap.md`: phases, exit criteria and required tests
- `docs/server_setup.md`: the runbook for the private server
- `docs/plans/` and `docs/reports/`: the plan and the report of each phase
