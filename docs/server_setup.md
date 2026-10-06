# Server setup

A runbook to follow by hand. It takes a spare Linux machine to a production stack that only your
tailnet can reach, deployed by the self-hosted runner from signed images, with dashboards and weekly
backups. Phase 3 makes the first production deploy possible; you can prepare the server at any
time.

Commands marked `server$` run on the server, `you$` on your workstation. Replace `<...>` values.

Until this is set up, `docs/vps_setup.md` runs the stack on the shared VPS from a clone, behind
nginx and a credential gate.

## What you need

- A spare x86_64 machine with Debian 13 or Ubuntu 24.04 LTS, wired networking, and room for Docker
  images and volumes. A GPU helps later for a local model server.
- Physical or console access. After step 3, SSH is reachable only over Tailscale.
- A Tailscale account and admin rights on `JohnFilhmar/tbn_game`.
- On your workstation: `gh`, `sops` and `age`.

## 1. Base system

- Install the OS with automatic security updates (`unattended-upgrades` on Debian and Ubuntu).
- Create your admin user, use SSH keys only, and set `PasswordAuthentication no` in
  `/etc/ssh/sshd_config`.
- In the firmware settings, set "restore on AC power loss" to "power on" so the machine boots by
  itself after a power cut. Docker and the runner start at boot, and the containers restart with
  them.

## 2. Docker

Install Docker Engine 28 or newer and the compose plugin from Docker's apt repository
(docs.docker.com, "Install Docker Engine"). The sandbox network uses the isolated gateway mode,
which older engines do not have. Then make both daemons start at boot and rotate container logs
by default:

```
server$ sudo systemctl enable --now containerd docker
server$ sudo tee /etc/docker/daemon.json > /dev/null <<'EOF'
{ "log-driver": "json-file", "log-opts": { "max-size": "10m", "max-file": "5" } }
EOF
server$ sudo systemctl restart docker
```

Docker bypasses host firewall rules for published ports. That is why both compose files publish
ports on `127.0.0.1` only and CI fails any other binding.

The sandbox launcher container joins the host's `docker` group to use `/var/run/docker.sock`. The
deploy job reads the group id from the socket and passes it as `DOCKER_GID`; nothing to configure.
Only that one container holds the socket: the web process, the worker, the proxy and every sandbox
container run without it.

## 3. Tailscale, HTTPS and the firewall

1. Install Tailscale (tailscale.com/download/linux) and join the tailnet:

   ```
   server$ sudo tailscale up
   ```

2. In the Tailscale admin console:
   - enable MagicDNS and HTTPS certificates;
   - disable key expiry for this machine, so it stays on the tailnet;
   - limit access to your own devices in the access controls.

3. Give the app an HTTPS address inside the tailnet. The browser needs a secure context for the 3D
   renderer. The setting persists across reboots.

   ```
   server$ sudo tailscale serve --bg --https=443 http://127.0.0.1:3100
   server$ tailscale serve status
   ```

   The app answers at `https://<machine>.<tailnet>.ts.net` once the stack runs, the desktop at
   `/app/`. Give Grafana its own HTTPS port the same way:

   ```
   server$ sudo tailscale serve --bg --https=8443 http://127.0.0.1:3105
   ```

   The dashboards then answer at `https://<machine>.<tailnet>.ts.net:8443`.

4. Deny all inbound traffic except the tailnet. Do this from the console or over Tailscale, because
   an SSH session over the LAN drops when the firewall turns on.

   ```
   server$ sudo ufw default deny incoming
   server$ sudo ufw default allow outgoing
   server$ sudo ufw allow in on tailscale0
   server$ sudo ufw enable
   ```

5. Check from another machine on the LAN that nothing answers, and from a tailnet device that SSH
   and `https://<machine>.<tailnet>.ts.net` do.

## 4. The deploy runner and its guard

The deploy job runs on a self-hosted runner on this server. The runner polls GitHub over outbound
HTTPS, so the server needs no inbound port. Its user can run Docker, which is equivalent to root.
That is why a job-started hook refuses every job except the production deploy dispatched from
`main` by you, and why pull request code never runs here.

1. Create the runner user, the stack directory and the hook directory:

   ```
   server$ sudo useradd --system --create-home --shell /bin/bash tbn-runner
   server$ sudo usermod -aG docker tbn-runner
   server$ sudo install -d -o tbn-runner -g tbn-runner -m 0755 /opt/tbn /opt/actions-runner
   server$ sudo install -d -o root -g root -m 0755 /opt/actions-runner-hooks
   ```

2. In GitHub, open Settings, Actions, Runners, "New self-hosted runner", Linux x64. Follow the
   download and checksum steps as `tbn-runner` in `/opt/actions-runner`, then configure it with the
   `tbn-production` label. Keep the default labels, because the deploy job asks for `self-hosted`,
   `linux` and `tbn-production`.

   ```
   server$ sudo -iu tbn-runner
   tbn-runner$ cd /opt/actions-runner
   tbn-runner$ ./config.sh --url https://github.com/JohnFilhmar/tbn_game --token <registration token> \
     --name tbn-server --labels tbn-production --work _work --unattended
   tbn-runner$ exit
   ```

3. Install the guard owned by root, and point the runner at it and at the SOPS key. The runner reads
   `.env` in its directory; making it root-owned stops a job from editing it.

   ```
   server$ git clone https://github.com/JohnFilhmar/tbn_game /tmp/tbn_game
   server$ sudo install -o root -g root -m 0755 /tmp/tbn_game/deploy/runner/job_started_guard.sh \
     /opt/actions-runner-hooks/job_started_guard.sh
   server$ sudo tee /opt/actions-runner/.env > /dev/null <<'EOF'
   ACTIONS_RUNNER_HOOK_JOB_STARTED=/opt/actions-runner-hooks/job_started_guard.sh
   SOPS_AGE_KEY_FILE=/home/tbn-runner/.config/sops/age/keys.txt
   EOF
   server$ sudo chown root:root /opt/actions-runner/.env && sudo chmod 0644 /opt/actions-runner/.env
   ```

4. Install the runner as a service, which starts at boot:

   ```
   server$ cd /opt/actions-runner && sudo ./svc.sh install tbn-runner && sudo ./svc.sh start
   ```

5. Install the tools the deploy job uses. `cosign` is installed by the workflow itself.

   ```
   server$ sudo apt-get install -y git curl jq age
   ```

   Install `sops` from its GitHub releases page (getsops/sops), checking the published checksum.

6. Check the guard by hand. The first command must print a refusal and exit 1; the second must
   admit the job and exit 0.

   ```
   server$ GITHUB_REPOSITORY=JohnFilhmar/tbn_game GITHUB_EVENT_NAME=pull_request \
     GITHUB_REF=refs/pull/1/merge /opt/actions-runner-hooks/job_started_guard.sh; echo "exit $?"
   server$ GITHUB_REPOSITORY=JohnFilhmar/tbn_game GITHUB_EVENT_NAME=workflow_dispatch \
     GITHUB_REF=refs/heads/main \
     GITHUB_WORKFLOW_REF=JohnFilhmar/tbn_game/.github/workflows/deploy.yml@refs/heads/main \
     GITHUB_TRIGGERING_ACTOR=JohnFilhmar /opt/actions-runner-hooks/job_started_guard.sh; echo "exit $?"
   ```

   Also check it end to end once:
   1. Push a branch with a throwaway workflow whose job runs on
      `[self-hosted, linux, tbn-production]`.
   2. Confirm the job fails in "Set up runner" with "Refused by the tbn job guard".
   3. Delete the branch.

## 5. GitHub settings

The repository is public, so environment protection rules and branch rulesets are available on
every GitHub plan.

1. **The `production` environment.** Open Settings, then Environments, then "New environment", and
   name it `production`.
   - Under "Required reviewers", add yourself. Leave "Prevent self-review" off, because you both
     dispatch and approve.
   - Under "Deployment branches and tags", choose "Selected branches and tags" and add `main`.

   If the repository ever becomes private on a Free or Pro plan, GitHub drops required reviewers.
   The runner guard, which admits only your own dispatch from `main`, is then the approval.

2. **A ruleset for `main`.** Under Settings, Rules, Rulesets:
   - require a pull request;
   - require the `ci` status checks;
   - block force pushes and deletions.

3. **Actions.** Under Settings, Actions, General:
   - require approval for workflows from all outside collaborators;
   - set the default workflow permissions to read only;
   - do not allow Actions to create or approve pull requests.

4. **Packages.** After the first build on `main`, open the `tbn_game/backend` package and check that
   it inherits access from the repository. The deploy job pulls it with its own short-lived token.

5. **Security.** Turn on Dependabot alerts and security updates. Version updates are already
   configured in `.github/dependabot.yml`.

## 6. Secrets with SOPS

The deploy job decrypts `deploy/secrets/production.enc.env` with an age key that only the server
holds. You create both; no session ever does.

1. Create the server's key as `tbn-runner`, and keep a copy of it offline, for example in your
   password manager:

   ```
   server$ sudo -iu tbn-runner
   tbn-runner$ install -d -m 0700 ~/.config/sops/age
   tbn-runner$ age-keygen -o ~/.config/sops/age/keys.txt
   tbn-runner$ chmod 0600 ~/.config/sops/age/keys.txt
   ```

   It prints the public key, `age1...`.

2. On your workstation, make your own age key the same way, so you can edit the file later.

3. Add `.sops.yaml` at the repository root with both public keys:

   ```yaml
   creation_rules:
     - path_regex: deploy/secrets/.*\.enc\.env$
       age: <server public key>,<workstation public key>
   ```

4. Create the encrypted file. `sops edit` opens your editor and never writes plaintext into the
   repository.

   ```
   you$ sops edit deploy/secrets/production.enc.env
   ```

   Fill in the variables from the production section of `.env.example`:
   - `POSTGRES_PASSWORD` and `SEARXNG_SECRET`, each the output of `openssl rand -hex 32`;
   - `SECRETS_ENCRYPTION_KEY`, the output of `openssl rand -base64 32`;
   - `GRAFANA_ADMIN_PASSWORD`, for example the output of `openssl rand -hex 24`; you sign in to
     Grafana as `admin` with it;
   - any optional settings you want to change.

5. Commit `.sops.yaml` and the encrypted file through a pull request.

Because the repository is public, the encrypted file is public too. Variable names are readable,
but values are protected by age. gitleaks runs on every push and does not flag SOPS ciphertext.

## 7. Restart unhealthy containers

Docker restarts a container that crashes, but never one that turns unhealthy. A systemd timer
restarts unhealthy containers of the `tbn` stack every minute and logs to the journal.

```
server$ sudo install -m 0755 /tmp/tbn_game/deploy/host/tbn_restart_unhealthy.sh \
  /usr/local/sbin/tbn_restart_unhealthy
server$ sudo install -m 0644 /tmp/tbn_game/deploy/host/tbn_restart_unhealthy.service \
  /tmp/tbn_game/deploy/host/tbn_restart_unhealthy.timer /etc/systemd/system/
server$ sudo systemctl daemon-reload
server$ sudo systemctl enable --now tbn_restart_unhealthy.timer
server$ systemctl list-timers tbn_restart_unhealthy.timer
```

## 8. Weekly backups

`tbn_backup` writes a `pg_dump` custom-format dump of the database and a tarball of the workspace
volume, with their checksums, into a dated directory under `BACKUP_DIR`, and keeps the newest
`BACKUP_KEEP` sets. A systemd timer runs it every Sunday around 03:30. If it fails, it sends a
`backup_failed` notice through the stack, so attach an integration to that event (step 10).

Put `BACKUP_DIR` on another disk when you have one; the default is `/var/backups/tbn`.

```
server$ sudo install -d -m 0700 /etc/tbn
server$ printf 'BACKUP_DIR=/var/backups/tbn\nBACKUP_KEEP=4\n' | sudo tee /etc/tbn/backup.env
server$ sudo install -m 0755 /tmp/tbn_game/deploy/backup/tbn_backup.sh /usr/local/sbin/tbn_backup
server$ sudo install -m 0755 /tmp/tbn_game/deploy/backup/tbn_restore.sh /usr/local/sbin/tbn_restore
server$ sudo install -m 0644 /tmp/tbn_game/deploy/backup/tbn_backup.service \
  /tmp/tbn_game/deploy/backup/tbn_backup.timer /etc/systemd/system/
server$ sudo systemctl daemon-reload
server$ sudo systemctl enable --now tbn_backup.timer
server$ systemctl list-timers tbn_backup.timer
server$ rm -rf /tmp/tbn_game
```

The clone in `/tmp/tbn_game` is from step 4; clone it again if it is gone. When a later phase
changes these scripts, install them the same way.

After the first deploy, run one backup by hand and read its log:

```
server$ sudo systemctl start tbn_backup.service
server$ journalctl -u tbn_backup.service --since today
server$ sudo ls -l /var/backups/tbn
```

### Restore

A restore replaces the database and the workspace with one backup set. It stops `web`, `worker`,
`sandbox` and `egress_proxy`, restores the dump into a fresh database and renames it to `tbn`,
keeps the database it replaced as `tbn_replaced_<time>`, and replaces the workspace volume's
content. It asks you to type the project name first.

```
server$ sudo tbn_restore /var/backups/tbn/tbn_<time>
```

Then start the stack again with the deploy workflow, or on the server with the decrypted secrets
(`docker compose --env-file <file> -f /opt/tbn/docker-compose.production.yml up --detach
--wait`). Sign in and check the company is as it was. When it is, drop the old database with the
command the restore printed: `docker exec tbn-postgres-1 dropdb --username=tbn tbn_replaced_<time>`.

Practise a restore once on a scratch machine or the development stack
(`TBN_COMPOSE_PROJECT=tbn_development`) before you need it.

## 9. First deploy

1. Merge the phase pull request into `main` yourself. CI runs on `main` and signs both images, the
   backend and the sandbox. The run summary of each image job shows its digest.
2. Dispatch the deploy with both digests, in the Actions tab or with:

   ```
   you$ gh workflow run deploy.yml --repo JohnFilhmar/tbn_game --ref main \
     -f image_digest=sha256:<backend digest> -f sandbox_image_digest=sha256:<sandbox digest>
   ```

3. Approve the `production` deployment when GitHub asks.
4. The job runs on the server. It:
   1. verifies the cosign signatures and the SBOM attestations of both images from CI on `main`;
   2. pulls both images;
   3. decrypts the secrets into the runner's temporary directory;
   4. copies the stack files, Prometheus's configuration and Grafana's provisioning to `/opt/tbn`;
   5. runs `prisma migrate deploy`;
   6. starts the stack;
   7. checks that `/health` reports the deployed commit and that Grafana is healthy;
   8. deletes the decrypted file.
5. From a tailnet device: `curl https://<machine>.<tailnet>.ts.net/health`.
6. Create the owner account once. The password is read from standard input, so it stays out of
   the shell history and the process list:

   ```
   server$ read -rs PASSWORD
   server$ printf '%s' "$PASSWORD" | docker exec -i tbn-web-1 /nodejs/bin/node dist/admin.js \
     owner_create <username>
   ```

7. Open `https://<machine>.<tailnet>.ts.net/app/` and sign in. Add a provider, recruit a manager
   and assign it a task; `scripts/demo_phase_3.sh` lists the steps.
8. Open `https://<machine>.<tailnet>.ts.net:8443`, sign in as `admin`, and check that the tbn
   overview dashboard shows the four processes up.


## 10. Operating the stack

- **Status.** The production compose file needs its secrets to render, so read state from Docker:
  `docker ps --filter label=com.docker.compose.project=tbn`.
- **Logs.** `docker logs --since 1h tbn-web-1`, and the same for `tbn-worker-1`, `tbn-sandbox-1`,
  `tbn-egress_proxy-1` and the other services. Container logs rotate at 10 MB times 5 files. The
  proxy logs every request with the run and agent ids; a sandbox container's output is in its
  job row, `GET /sandbox_jobs/:id`.
- **Notifications.** On the desktop's Integrations screen, attach an integration to
  `process_restarted`, `run_failed`, `backup_failed`, `disk_nearly_full` and the other events to
  hear about them; the Notification log tab shows each one and how it went.
- **Dashboards.** Grafana's tbn overview shows the processes, queue depth, run failures, spend,
  cache hit rate, proxy refusals and the workspace disk. Prometheus keeps 30 days
  (`PROMETHEUS_RETENTION`). Grafana has no alerting; alerts are the notification channels.
- **Rollback.** Dispatch the deploy again with an earlier digest from a previous run summary.
  Migrations only move forward, so a rollback across a migration needs a forward fix instead.
- **Reboot test.** Run `sudo reboot`. Afterwards every container is up and healthy,
  `tailscale serve status` shows the mapping, and the runner is online in GitHub.
- **Updates.** Dependabot proposes monthly updates of npm packages, base images and actions. They
  go through every CI gate, and you merge and deploy them like any other change.

