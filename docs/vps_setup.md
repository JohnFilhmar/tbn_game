# VPS setup

A temporary way to run tbn_game on the shared VPS, at `https://tbn-game.filhmar.online`, before
the signed-image deploy of `docs/server_setup.md` is set up. You clone the repository on the
server, build the images there, and run the production compose file. The host's nginx serves the
domain with a username and password in front of the app's own sign in.

Commands marked `server$` run on the VPS as root, `you$` on your workstation.

## How this differs from the runbook

- **The domain is public.** The architecture assumes a server only the tailnet reaches. Here the
  internet reaches nginx, so every request must pass the credential gate before it reaches the
  app, and the app's owner sign in still applies behind it.
- **Images are built from the checkout**, not pulled as the digests CI signed. Nothing verifies
  them; deploy only commits you merged to `main`.
- **The secrets are a plain file on the server**, `/etc/tbn/tbn.env`, readable by root only,
  instead of the SOPS file the deploy job decrypts.

## What the box already runs

Five other apps and a monitoring stack share the server. tbn_game keeps out of their way:

| Port on 127.0.0.1 | tbn_game service | Taken by others |
| --- | --- | --- |
| 3100 | web, which nginx proxies to | 3000 to 3003, 5000 to 5005 |
| 3102 | sandbox launcher ops | |
| 3103 | egress proxy ops | |
| 3105 | Grafana | the box's own Grafana is on 3031, its Prometheus on 9091 |

The compose project is `tbn`, so its containers, volumes and networks are named `tbn-...` and
never meet the box's `grafana` and `prometheus` containers. The worker, the database, Prometheus
and SearXNG publish no port at all.

## 1. DNS

Add an A record `tbn-game.filhmar.online` pointing at `46.250.236.69`, and optionally an AAAA
record at `2407:3640:2353:4437::1`. Check it from your workstation before going on:

```
you$ nslookup tbn-game.filhmar.online 1.1.1.1
```

## 2. Clone

```
server$ git clone https://github.com/JohnFilhmar/tbn_game /opt/tbn_game
```

## 3. Secrets

Create the file empty with its permissions first, then fill it, so the secrets never sit in a
readable file:

```
server$ install -d -m 0700 /etc/tbn
server$ install -m 0600 /dev/null /etc/tbn/tbn.env
server$ tee /etc/tbn/tbn.env > /dev/null <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 32)
SEARXNG_SECRET=$(openssl rand -hex 32)
SECRETS_ENCRYPTION_KEY=$(openssl rand -base64 32)
GRAFANA_ADMIN_PASSWORD=$(openssl rand -hex 24)
EOF
```

Copy the file's contents into your password manager. Losing `SECRETS_ENCRYPTION_KEY` makes every
saved provider key unreadable, and `POSTGRES_PASSWORD` is fixed into the database volume on first
start. The optional settings at the bottom of `.env.example` go in the same file.

## 4. Start the stack

```
server$ /opt/tbn_game/scripts/vps_up.sh
```

It builds both images, starts the database, applies the migrations, starts every service, waits
for them to be healthy and prints `/health`. The first build takes several minutes.

Create the owner account once. The password is read from standard input, so it stays out of the
shell history:

```
server$ read -rs PASSWORD
server$ printf '%s' "$PASSWORD" | docker exec -i tbn-web-1 /nodejs/bin/node dist/admin.js \
  owner_create <username>
server$ unset PASSWORD
```

## 5. The credential gate

The gate needs two files only the host holds. Create both before nginx loads the site, or
`nginx -t` fails on the missing include and refuses every reload.

1. The gate token, 32 hex characters. A longer one overflows nginx's map hash and fails
   `nginx -t`.

   ```
   server$ token=$(openssl rand -hex 16)
   server$ install -m 0600 /dev/null /etc/nginx/tbn_game_gate.conf
   server$ tee /etc/nginx/tbn_game_gate.conf > /dev/null <<EOF
   map \$cookie_tbn_gate \$tbn_gate_realm {
       default "tbn game";
       "$token" off;
   }
   map \$host \$tbn_gate_token {
       default "$token";
   }
   EOF
   server$ unset token
   ```

2. The username and password the browser asks for. `openssl passwd` prompts for the password
   twice:

   ```
   server$ printf '%s:%s\n' <username> "$(openssl passwd -apr1)" > /etc/nginx/tbn_game.htpasswd
   server$ chown root:www-data /etc/nginx/tbn_game.htpasswd && chmod 0640 /etc/nginx/tbn_game.htpasswd
   ```

   Use a different password from the app's owner account, so one leak does not open both.

How it works: there are two ways in, and the domain answers nothing else.

- **You:** a visit without a cookie lands on `/gate/owner`, where the browser asks for these
  credentials. The right ones set a cookie holding the gate token, valid for 7 days, and every
  later request with it, the API calls and the websocket included, goes straight through. The app
  then asks for its own owner sign in at the monitor.
- **A guest:** an invite link under `/invite/` sets the guest cookie, and nginx checks it with the
  web process on every request (`auth_request` to `/gate`), so revoking a guest shuts them out
  within seconds. A guest can never get the owner's gate cookie: only a right password at
  `/gate/owner` sets it.

`/invite/` is rate limited to 10 tries a minute per address. To change the password, rewrite the
htpasswd file. To sign every browser out of the owner gate, write a new token into the gate file.
Reload nginx after either.

## 6. nginx and HTTPS

```
server$ cp /opt/tbn_game/deploy/nginx/tbn_game.conf /etc/nginx/sites-available/tbn_game
server$ ln -sf /etc/nginx/sites-available/tbn_game /etc/nginx/sites-enabled/tbn_game
server$ nginx -t && systemctl reload nginx
server$ certbot --nginx -d tbn-game.filhmar.online
```

`certbot` adds the HTTPS server and the redirect from HTTP. Do not enter the credentials until it
has: before it, they would cross the internet in clear text.

Open `https://tbn-game.filhmar.online`. The browser asks for the gate credentials, then the app
shows its sign in at the monitor.

## 7. Guests and their model

Guests talk with idle agents on a small model served by llama.cpp on the box, in `/opt/llama_cpp`
beside LiteLLM, on the `llm_gateway` network; `scripts/vps_up.sh` joins the worker to that network
when it exists (`docker-compose.vps.yml`).

1. **llama.cpp** runs `techwithsergiu/Qwen3.5-text-0.8B-GGUF:Q4_K_M` under the model id
   `qwen3.5-0.8b`, two conversations of 8,192 tokens at a time, capped at 3 cores and 2 GB. Its
   compose file is the place to change the model; `docker compose up -d --wait` there applies it.
2. **The provider:** on the desk, Providers, add one named for example `Local llama`, format
   OpenAI chat completions, base URL `http://llama_cpp:8080/v1`, no API key, with the model
   `qwen3.5-0.8b` (context window 8192, output 1024, no prices).
3. **The guest model:** on the desk, Guests, pick that provider and model. Until one is picked,
   guests can walk and message but not talk to agents.
4. **Invite a friend** on the same screen: the link is shown once; send it. It works once, for 24
   hours, and signs them in as a guest for 30 days. A friend coming back after that gets a new link
   from their row.

A guest reads the desk but changes nothing, cannot build, change the room or use props that keep a
state, and talks only to agents that are idle. Their conversations never reach an agent's own
work.

## Updating

```
server$ cd /opt/tbn_game && git pull && scripts/vps_up.sh
```

When `deploy/nginx/tbn_game.conf` changed, copy it again and run `certbot --nginx -d
tbn-game.filhmar.online` once more, since the copy replaces the HTTPS lines certbot added.

Old images stay on disk untagged; `docker image prune` removes them.

## Operating

- **Status:** `docker ps --filter label=com.docker.compose.project=tbn`.
- **Logs:** `docker logs --since 1h tbn-web-1`, and the same for `tbn-worker-1` and the others.
- **Grafana** stays off the domain. Reach it through SSH: `you$ ssh -L 3105:127.0.0.1:3105 pvps`,
  then open `http://localhost:3105` and sign in as `admin` with `GRAFANA_ADMIN_PASSWORD`.
- **Stop:** `docker compose --env-file /etc/tbn/tbn.env -f /opt/tbn_game/docker-compose.production.yml
  down`. Add `--volumes` only to delete the company for good.
- **Backups and the unhealthy-container timer:** sections 7 and 8 of `docs/server_setup.md` apply
  unchanged.

## Moving to the signed deploy later

`docs/server_setup.md` still describes the target. On this box:

- the runner directory must not be `/opt/actions-runner`, which another project's runner already
  uses; pick `/opt/tbn-actions-runner` and adjust its steps;
- skip its Tailscale and firewall steps, since nginx serves the domain;
- put the four values of `/etc/tbn/tbn.env` into the SOPS file unchanged, since the database
  volume and the saved provider keys depend on them;
- remove the clone's stack first with the stop command above, without `--volumes`, so the deploy
  job's stack takes over the same `tbn` volumes.

## Local models on your workstation

A model on your workstation, such as Ollama, is out of reach: `host.docker.internal` now names the
VPS. Run the model on a host the VPS can reach and use that address as the provider's base URL.
