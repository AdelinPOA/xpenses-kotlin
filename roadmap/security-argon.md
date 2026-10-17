# Production-Readiness, SRE & Infrastructure Security Audit Report

**Target Host:** `hst-dbn` (`192.168.100.48` / Tailscale `100.68.34.49`)  
**Public Production Endpoint:** `https://xpenses.nt-automation.cc`  
**Audit Date:** 2026-10-17 (EEST / UTC+3)  
**Execution Context:** `uid=0(root)` — Read-Only Audit (zero modifications made to system, services, firewall, or containers)

---

## 1. Executive Summary

### Production-Readiness Verdict: **NOT READY FOR PUBLIC PRODUCTION**

While the underlying Debian 13 (Trixie) Proxmox guest VM and core Dockerized services (`xpenses-frontend`, `xpenses-backend`, `xpenses-db`, `xpenses-redis`, `wiki-app`, `wiki-db`, `wiki-db-backup`) are currently up and operational, **critical application-level and host-level security flaws make it unsafe to continue exposing `xpenses.nt-automation.cc` to the public internet without immediate remediation**:

1. **Confirmed Live Admin Account Compromise Risk (`CRITICAL`):** `SEED_DEMO_USERS=true` is enabled in `/root/xpenses-kotlin/.env` on the live production server. All four seeded demo accounts—including full administrator `mod1` (`role=mod`) and finance officer `cfo1` (`role=chef_finance`)—are active (`is_active=t`) in the production PostgreSQL database alongside 21 real employee accounts and **currently accept their publicly documented default passwords (`mod1/mod1`, `cfo1/cfo1`, `manager1/manager1`, `tech1/tech1`)**, verified via HTTP `200 OK` against `/api/auth/login`.
2. **Confirmed Rate-Limiting Bypass on Public Endpoints (`HIGH`):** Setting `server.forward-headers-strategy: framework` in `backend-kotlin-jpa/src/main/resources/application.yml` registers Spring's `ForwardedHeaderFilter` before `RateLimitingFilter`. Because `ForwardedHeaderFilter` unconditionally rewrites `request.remoteAddr` using the client-supplied `X-Forwarded-For` header before `RateLimitingFilter.extractClientIp()` executes, `RateLimitingFilter`'s `trustedProxies` check is completely defeated. Verified by sending `X-Forwarded-For: 203.0.113.99` to `/api/auth/refresh`, which recorded `xpenses:rate-limit:rl:/api/auth/refresh:203.0.113.99:*` in Redis.
3. **Unbacked-Up Production Receipt & Signature Storage (`HIGH`):** While PostgreSQL databases (`xpenses-db` and `wiki-db`) have daily automated dumps on local disk, the `xpenses-kotlin_xpenses-data` Docker volume containing **112 MB of production receipts and 168 KB of user signatures** (`/app/data/receipts` and `/app/data/signatures`) has **zero application-level backup jobs**, and all DB backups reside exclusively on the single local VM disk (`/dev/sda1`) with no off-host replication verified.
4. **Permissive Host Firewall, Root Password SSH, and World-Readable Production `.env` (`HIGH`):**
   - `iptables` / `nftables` `INPUT` policy is `ACCEPT` with zero host firewall restrictions on LAN interface `ens18`, and `sshd` permits root password authentication (`PermitRootLogin yes`, `PasswordAuthentication yes`), with logs confirming interactive root password logins (`Accepted password for root`).
   - Production secrets file `/root/xpenses-kotlin/.env` has `0644` (`-rw-r--r--`) permissions.
5. **Active Co-Residency of Heavy AI/IDE Development Tooling on a Memory-Constrained Production Host (`HIGH`):** The VM has 7.75 GiB RAM (only ~3.6 GiB available, 515 MiB swapped out, and a confirmed kernel OOM-kill of `next-server` in system logs). Despite rules in `AGENTS.md` noting tight memory constraints, multiple concurrent AI coding agents, LSP servers (`tsserver`, `opengrep`, `ast-grep`, `marksman`), `tsc --noEmit`, and headless Chrome processes are actively running on the production host alongside live containers.

### Evidence-Based Readiness Scores

| Category | Score | Justification |
|---|---|---|
| **Security** | **2.5 / 10** | Live `mod1/mod1` admin credentials active in prod; `X-Forwarded-For` rate-limit bypass; `PermitRootLogin yes` + `PasswordAuthentication yes` on SSH; `INPUT ACCEPT` firewall; `0644` permissions on `.env`. |
| **Reliability** | **6.0 / 10** | Core containers healthy (`Up 7 weeks` for DBs), but co-resident dev/AI/LSP/Playwright workloads caused a historical kernel OOM kill (`next-server`) and two `systemd-journald` 3-minute watchdog timeouts. |
| **Performance** | **6.5 / 10** | 24 vCPUs provide ample CPU headroom, but 7.75 GiB RAM with 515 MiB active swap and spike-prone JVM/Node/LSP processes create memory pressure (`vmstat` shows active swap-in/swap-out). |
| **Backup & Recovery** | **4.5 / 10** | Daily `pg_dump` jobs run for `xpenses-db` and `wiki-db`, and `qemu-guest-agent` records daily `fsfreeze`/`fsthaw` events (indicating hypervisor snapshots/backups), but **112 MB of uploaded receipts/signatures have no application backup**, no off-host backup is verifiable from the guest, and no restore tests exist. |
| **Maintainability** | **5.5 / 10** | Clean multi-stage Dockerfiles for XPenses, but Docker has **24.1 GB of reclaimable/build-cache bloat** (64% of images + 9.5 GB build cache), 5 orphaned stopped containers, no container log rotation (`max-size`), and live development occurs directly in `/root/xpenses-kotlin` on the production VM. |

---

## 2. Infrastructure Inventory

### 2.1 Virtual Machine & OS Profile

| Attribute | Observed Value | Evidence / Source |
|---|---|---|
| **Hostname** | `hst-dbn` | `uname -a` |
| **Hypervisor** | Proxmox VE (KVM / QEMU full virtualization) | `lscpu`, `qemu-guest-agent.service` active |
| **Operating System** | Debian GNU/Linux 13.6 (Trixie) | `/etc/os-release`, `/etc/debian_version` |
| **Kernel** | `6.12.101+deb13-amd64` (`#1 SMP PREEMPT_DYNAMIC 2026-08-05`) | `uname -a` |
| **Uptime** | 55 days, 9 hours, 57 minutes | `uptime` |
| **vCPU Allocation** | 24 vCPUs (`Intel Xeon E5-2699 v4 @ 2.20GHz`, 2 sockets, 1 NUMA node) | `lscpu` |
| **RAM & Swap** | 7.75 GiB RAM (`4.1 GiB` used, `3.6 GiB` avail) + `5.1 GiB` swap on `/dev/sda5` (`515 MiB` used) | `free -h`, `swapon --show` |
| **Storage** | `100 GB` QEMU VirtIO SCSI disk (`/dev/sda`): `93 GB` `ext4` on `/` (`51 GB` used, `38 GB` free, `58%` capacity, `16%` inodes) | `df -hT`, `df -i`, `lsblk` |
| **Time Sync** | `systemd-timesyncd` active, NTP synchronized (`Europe/Bucharest EEST +0300`) | `timedatectl` |
| **Network Interfaces** | `ens18` (`192.168.100.48/24`, gw `192.168.100.1`), `tailscale0` (`100.68.34.49/32`, tailnet `tail75a8b2.ts.net`) | `ip -br addr`, `ip route`, `tailscale status` |
| **DNS Resolution** | Tailscale MagicDNS (`100.100.100.100`, `fd7a:115c:a1e0::53`) | `/etc/resolv.conf` |
| **Pending OS Updates** | `0` pending packages (`0 upgraded, 0 newly installed`), no `/var/run/reboot-required` | `apt-get -s upgrade` |

### 2.2 Host Listening Services & Network Exposure

| Protocol | Local Bind Address & Port | Process / Service | Intended Scope | Actual Network Exposure |
|---|---|---|---|---|
| `TCP` | `0.0.0.0:22` & `[::]:22` | `sshd` (PID 1029) | Admin SSH access | All interfaces (LAN `192.168.100.48`, Tailscale `100.68.34.49`) |
| `TCP` | `0.0.0.0:3001` | `docker-proxy` -> `xpenses-frontend:3000` | Public Web App (via Cloudflare / upstream proxy) | All IPv4 interfaces (`ens18` LAN + `tailscale0` + localhost) |
| `TCP` | `0.0.0.0:3000` | `docker-proxy` -> `wiki-app:3000` | Internal/Company Wiki (`requarks/wiki`) | All IPv4 interfaces (`ens18` LAN + `tailscale0` + localhost) |
| `TCP` | `127.0.0.1:8001` | `docker-proxy` -> `xpenses-backend:8080` | Backend REST API | Loopback (`127.0.0.1`) + Docker bridge (`xpenses-net`), proxied publicly via Next.js `/api/*` rewrite |
| `TCP` | `100.68.34.49:443`, `100.122.190.8:443`, `100.68.34.49:47636` | `tailscaled` (PID 939) | Tailscale Serve (`https://hst-dbn.tail75a8b2.ts.net`) | Tailnet-only (currently serving `/tmp/architecture-review-1788771984.html`) |
| `UDP` | `0.0.0.0:41641` & `[::]:41641` | `tailscaled` (PID 939) | WireGuard / Tailscale peer-to-peer tunnel | All interfaces (UDP hole-punching / direct peer links) |
| `TCP` | `127.0.0.1:37083`, `127.0.0.1:38399` | `agy` (PID 3739666) | AI coding agent internal IPC | Loopback only (`127.0.0.1`) |

### 2.3 Reverse Proxy & Upstream Architecture

- **No local reverse proxy (`Caddy`, `Nginx`, `Traefik`) or local `cloudflared` daemon is running on `hst-dbn`.** Although `cloudflared 2026.8.2` is installed via APT and a `caddy:2-alpine` Docker image exists locally, neither is configured or running on this VM.
- **Public Ingress Path (`xpenses.nt-automation.cc`):** Resolves publicly to Cloudflare Anycast IPs (`188.114.96.3`, `188.114.97.3`, `2a06:98c1:3120::3`, `2a06:98c1:3121::3`). Traffic is terminated at Cloudflare and forwarded via an upstream reverse proxy/tunnel host on the LAN/Tailnet (note in `/root/xpenses-kotlin/.env`: `# Required by the current Cloudflare origin path; replace with a TLS reverse proxy when available. FRONTEND_BIND_IP=0.0.0.0`) directly to `hst-dbn:3001` (`xpenses-frontend`) over **plaintext HTTP**.
- **API Routing:** `xpenses-frontend` (Next.js standalone server) proxies `/api/:path*` to `http://backend:8080/api/:path*` over the internal Docker bridge network `xpenses-kotlin_xpenses-net` (`172.20.0.0/16`) via `frontend/next.config.ts`.

### 2.4 Docker Containers Inventory (Docker Engine `29.7.2`, Compose `v5.5.0`)

| Container Name | Image | Status / Health | Published Ports | Docker Network & IP | Runtime UID | CPU / Mem Limits |
|---|---|---|---|---|---|---|
| `xpenses-frontend` | `xpenses-frontend:latest` | `Up (healthy)` | `0.0.0.0:3001->3000/tcp` | `xpenses-kotlin_xpenses-net` (`172.20.0.2`) | `1001` (`nextjs`) | `4.0 CPUs` / `1 GiB` |
| `xpenses-backend` | `xpenses-backend:latest` | `Up (healthy)` | `127.0.0.1:8001->8080/tcp` | `xpenses-kotlin_xpenses-net` (`172.20.0.4`) | `100` (`appuser`) | `8.0 CPUs` / `2 GiB` |
| `xpenses-db` | `postgres:16-alpine@sha256:16bc17...` | `Up 7 weeks (healthy)` | `5432/tcp` (internal) | `xpenses-kotlin_xpenses-net` (`172.20.0.5`) | `70` (`postgres`) | `4.0 CPUs` / `1 GiB` |
| `xpenses-redis` | `redis:7.4-alpine` | `Up 7 weeks (healthy)` | `6379/tcp` (internal) | `xpenses-kotlin_xpenses-net` (`172.20.0.3`) | `999` (`redis`) | **None (`0` / Unlimited)** |
| `wiki-app` | `requarks/wiki:2.5.314` | `Up 7 weeks (no healthcheck)` | `0.0.0.0:3000->3000/tcp` | `wiki-js_wiki-network` (`172.19.0.2`) | `1000` (`node`) | **None (`0` / Unlimited)** |
| `wiki-db` | `postgres:15-alpine` | `Up 7 weeks (healthy)` | `5432/tcp` (internal) | `wiki-js_wiki-network` (`172.19.0.3`) | `70` (`postgres`) | **None (`0` / Unlimited)** |
| `wiki-db-backup` | `prodrigestivill/postgres-backup-local:15` | `Up 7 weeks (healthy)` | `5432/tcp` (internal) | `wiki-js_wiki-network` (`172.19.0.4`) | **`0` (`root`)** | **None (`0` / Unlimited)** |
| `xpenses-test-frontend` | `xpenses-test-frontend:latest` | `Exited (0) 3 months ago` | None | `xpenses-test_test-net` | `1001` | `2.0 CPUs` / `512 MiB` |
| `xpenses-test-backend` | `xpenses-test-backend:latest` | `Exited (143) 3 months ago` | None | `xpenses-test_test-net` | `100` | `4.0 CPUs` / `1 GiB` |
| `xpenses-test-db` | `postgres:16-alpine@sha256:16bc17...` | `Exited (0) 3 months ago` | None | `xpenses-test_test-net` | `70` | `2.0 CPUs` / `512 MiB` |
| `bookstack` | `lscr.io/linuxserver/bookstack` | `Exited (137) 5 months ago` | None | Orphaned | `0` | None |
| `bookstack_db` | `lscr.io/linuxserver/mariadb` | `Exited (0) 5 months ago` | None | Orphaned | `0` | None |

---

## 3. Findings Table

| Severity | Component | Finding | Evidence | Impact | Recommended Fix |
|---|---|---|---|---|---|
| **CRITICAL** | `xpenses-backend` / `xpenses-db` (`/root/xpenses-kotlin/.env`, `DataInitializer.kt`) | **Default demo accounts (`mod1`, `cfo1`, `manager1`, `tech1`) are enabled and authenticable with default passwords in production.** | `/root/xpenses-kotlin/.env` sets `SEED_DEMO_USERS=true`. Querying `xpenses-db` shows `mod1` (`role=mod`), `cfo1` (`role=chef_finance`), `manager1`, and `tech1` with `is_active=t`. `POST /api/auth/login` with `{"username":"mod1","password":"mod1"}` returned `HTTP 200`. | Complete unauthenticated-to-admin takeover of `https://xpenses.nt-automation.cc`. Any internet user can log in as `mod1/mod1` (credentials visible in repo `Makefile` and `DataInitializer.kt`) and read/modify all employee expenses, receipts, signatures, users, and LDAP/IMAP settings. | Set `SEED_DEMO_USERS=false` in `/root/xpenses-kotlin/.env` and deactivate or delete users `mod1`, `cfo1`, `manager1`, and `tech1` (and `tech2` if demo) in PostgreSQL `xpenses-db`. |
| **HIGH** | `xpenses-backend` (`application.yml`, `RateLimitingFilter.kt`) | **Rate limiting is trivially bypassed via `X-Forwarded-For` header spoofing due to `server.forward-headers-strategy: framework`.** | `server.forward-headers-strategy: framework` registers Spring's `ForwardedHeaderFilter` before `RateLimitingFilter`. Sending `POST http://127.0.0.1:3001/api/auth/refresh -H "X-Forwarded-For: 203.0.113.99"` created Redis key `xpenses:rate-limit:rl:/api/auth/refresh:203.0.113.99:29869762` even though `trustedProxies` is empty. | Attackers can brute-force `/api/auth/login` (bypassing the 5 req/min limit), spam `/api/ocr/scan`, or abuse `/api/expenses/bulk-upload` by rotating `X-Forwarded-For` headers on each request. | Remove `server.forward-headers-strategy: framework` (or restrict it strictly behind a verified local reverse proxy that strips untrusted `X-Forwarded-For` headers) and configure `TRUSTED_PROXY_ADDRESSES` to the exact immediate proxy IP(s), ensuring Next.js rewrites pass verified client IPs safely. |
| **HIGH** | Backup & DR (`scripts/backup-db.sh`, `xpenses-data` volume) | **112 MB of production expense receipts and 168 KB of user signatures in `xpenses-kotlin_xpenses-data` have no application backup; all DB backups are local-only.** | `/var/lib/docker/volumes/xpenses-kotlin_xpenses-data/_data` holds `112M` in `receipts/` and `168K` in `signatures/`. Root's crontab only runs `backup-db.sh` (`pg_dump` to `/backups` on `/dev/sda1`). No off-host sync (rclone, restic, borg, rsync, S3) exists on the VM. | If the `xpenses-data` volume is corrupted or deleted, all uploaded tax/expense receipts and signatures are permanently lost unless a full Proxmox VM backup exists and is restored. If the Proxmox storage pool fails without external backups, 100% of data is lost. | Extend `/root/xpenses-kotlin/scripts/backup-db.sh` to archive `/var/lib/docker/volumes/xpenses-kotlin_xpenses-data/_data` (and `/opt/wiki-js`), encrypt backups, and ship them off-host (S3/B2/remote NAS). Verify Proxmox Backup Server (PBS) schedule on hypervisor. |
| **HIGH** | Linux Host SSH (`/etc/ssh/sshd_config`) | **Root SSH login and password authentication are enabled (`PermitRootLogin yes`, `PasswordAuthentication yes`) with no brute-force protection (`fail2ban`/`crowdsec` absent).** | `sshd -T` shows `permitrootlogin yes` and `passwordauthentication yes` on `0.0.0.0:22` and `[::]:22`. `journalctl -u ssh` confirms multiple `Accepted password for root` and `Failed password for root` events from `100.88.2.96`, `100.88.184.11`, and `192.168.100.22`. `/etc/shadow` has an active password hash for `root`. | Compromising any host on the LAN (`192.168.100.0/24`) or Tailnet—or accidental port-forwarding of TCP 22—allows password brute-forcing against `root`. | Set `PermitRootLogin prohibit-password` (or `no`) and `PasswordAuthentication no` in `/etc/ssh/sshd_config` after verifying SSH key access for all admin devices. Install `fail2ban` or restrict `sshd` bind/firewall to `tailscale0` (`100.68.34.49`). |
| **HIGH** | Host Firewall (`iptables` / `nftables`) | **Host `INPUT` firewall policy is `ACCEPT` (no UFW or restrictive nftables rules); Docker ports `3000` and `3001` bind to `0.0.0.0` in cleartext HTTP.** | `iptables -S` and `nft list ruleset` show `chain INPUT { policy accept; }` with only `ts-input` (which drops spoofed CGNAT `100.64.0.0/10` on non-Tailscale interfaces and accepts everything else). `xpenses-frontend` (`0.0.0.0:3001`) and `wiki-app` (`0.0.0.0:3000`) are reachable in cleartext HTTP across the LAN/Tailnet. | Any device or compromised VM on `192.168.100.0/24` (or Tailnet) can intercept cleartext HTTP traffic to `:3000`/`:3001`, bypass Cloudflare WAF/rate-limiting by hitting `:3001` directly, or probe host services. | Implement a default-drop `INPUT` firewall (via `ufw` or `nftables`) allowing only Tailscale (`tailscale0` / UDP `41641`) and restricting TCP `3000`/`3001` in `DOCKER-USER` chain exclusively to the upstream reverse proxy IP (`192.168.100.x` / `100.88.2.96`). |
| **HIGH** | Host Memory & Co-Resident Workloads (`ps aux`, `journalctl -k`) | **Live development/AI tooling (`pi`, `agy`, `tsc`, multiple `tsserver` & LSP daemons, `chrome-headless`) runs directly on the memory-constrained production host.** | Only `3.6 GiB` of `7.75 GiB` RAM is available; `515 MiB` of swap is in use; `/proc/pressure/io` shows `full avg10=0.67`. Kernel log records: `Aug 24 23:54:56 hst-dbn kernel: Out of memory: Killed process 2930522 (next-server)` and two `systemd-journald.service: Watchdog timeout (limit 3min)!` events on Aug 25. | High risk of Linux OOM-killer terminating production containers (`xpenses-db`, `xpenses-backend`, `xpenses-frontend`) or freezing system I/O during TypeScript typechecking, Gradle builds, or Playwright test runs. | Separate development/CI/agent workloads onto a dedicated dev VM or container with strict cgroup memory limits (`MemoryMax=2G`), and never run headless browsers or parallel LSPs on the production host. |
| **MEDIUM** | Secrets Management (`/root/xpenses-kotlin/.env`) | **Production `.env` file containing `JWT_SECRET`, `ENCRYPTION_SECRET`, and `SPRING_DATASOURCE_PASSWORD` is world-readable (`0644`).** | `ls -la /root/xpenses-kotlin/.env` shows `-rw-r--r-- 1 root root 842`. (While `/root` is `0700`, any process or container mount reading `/root/xpenses-kotlin` with non-root UID can read `.env`). | Violates least-privilege secret file permissions; increases risk of accidental secret disclosure via tooling or container builds. | Change permissions on `/root/xpenses-kotlin/.env` to `0600` (`chmod 600 /root/xpenses-kotlin/.env`). Ensure `.dockerignore` excludes `.env*` in all build contexts. |
| **MEDIUM** | Docker Resource Limits & Log Rotation (`docker inspect`) | **Multiple production containers (`xpenses-redis`, `wiki-app`, `wiki-db`, `wiki-db-backup`) have no CPU/memory limits, and no container has log rotation configured.** | `docker inspect` shows `Memory=0 NanoCpus=0` for `xpenses-redis`, `wiki-app`, `wiki-db`, and `wiki-db-backup`. `/etc/docker/daemon.json` does not exist; `LogConfig` is `{"Config":{},"Type":"json-file"}` (unbounded log size). `wiki-app` log is currently `5.1 MB`. | A memory leak in `wiki-app` (`node`) or unbounded Redis growth can exhaust all 7.75 GiB host RAM and trigger a host-wide OOM event. Unbounded JSON logs can gradually exhaust `/dev/sda1`. | Configure `/etc/docker/daemon.json` with `"log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "3"}` and add `deploy.resources.limits` for `xpenses-redis` (e.g., `256M`), `wiki-app` (`1024M`), `wiki-db` (`512M`), and `wiki-db-backup` (`256M`). |
| **MEDIUM** | Disk Capacity & Docker Bloat (`docker system df`) | **24.1 GB of `/dev/sda1` (over 25% of total disk) is consumed by unused Docker images, stopped containers, orphaned volumes, and BuildKit cache.** | `docker system df` shows: Images `14.61 GB` (`9.36 GB` / 64% reclaimable, including `2.74 GB` `xpenses-ocr-sidecar`, `1.33 GB` `wiki-app-wiki-app`, `1.17 GB` `gradle:8.5-jdk21`), Build Cache `9.51 GB`, Local Volumes `1.20 GB` (`962.7 MB` / 80% reclaimable across 8 unused volumes), plus 5 stopped containers (`bookstack`, `bookstack_db`, `xpenses-test-*`). | Reduces free disk headroom on the 93 GB root filesystem (`58%` used, `38 GB` free) and slows down hypervisor full-disk backups. | After reviewing orphaned stacks (`bookstack*`, `xpenses-test*`), remove unused stopped containers, prune dangling images and old BuildKit cache (`docker builder prune`), while strictly preserving production volumes (`xpenses-kotlin_pgdata`, `xpenses-kotlin_redisdata`, `xpenses-kotlin_xpenses-data`). |
| **MEDIUM** | Web Security Headers (`frontend/next.config.ts`) | **Frontend responses (`https://xpenses.nt-automation.cc/login`) lack `Strict-Transport-Security` (HSTS), `X-Content-Type-Options`, and `Referrer-Policy`, and leak `x-powered-by: Next.js`.** | `curl -sI https://xpenses.nt-automation.cc/login` returns `Content-Security-Policy`, `x-powered-by: Next.js`, and `cache-control: s-maxage=31536000`, but omits `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and `Permissions-Policy` (which are only present on `/api/*` responses from Spring Boot). | First-visit HTTPS downgrade/SSL-stripping risk on top-level navigation to `xpenses.nt-automation.cc`, MIME-sniffing exposure on frontend assets, and framework fingerprinting. | Add `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(self), microphone=(), geolocation=()`, and `poweredByHeader: false` in `frontend/next.config.ts`. |
| **MEDIUM** | Tailscale Serve Exposure (`tailscale serve status`) | **Tailscale Serve is actively publishing a temporary HTML file (`/tmp/architecture-review-1788771984.html`) on `https://hst-dbn.tail75a8b2.ts.net`.** | `tailscale serve status` shows `https://hst-dbn.tail75a8b2.ts.net (tailnet only) |-- / path /tmp/architecture-review-1788771984.html` and `tailscaled` listens on `100.68.34.49:443` and `100.122.190.8:443`. | Unintended persistent exposure of internal architecture review documentation to all users/devices on the Tailnet (note `tailscale status` includes multiple users/devices). | If no longer required, disable with `tailscale serve reset` or `tailscale serve --https=443 off`. |
| **LOW** | Container Healthcheck & Hardening (`wiki-app`, `wiki-db-backup`, `xpenses-backend`) | **`wiki-app` has no Docker healthcheck; `wiki-db-backup` runs as `uid=0(root)`; `xpenses-backend` starts as `root` before `su-exec` and logs a Spring `UserDetailsServiceAutoConfiguration` warning.** | `docker inspect wiki-app` has no `Healthcheck`. `docker top wiki-db-backup` runs as `root`. `xpenses-backend` entrypoint runs `chown -R appuser:appgroup /app/data` as root before `su-exec appuser`, and logs `Using generated security password... UserDetailsServiceAutoConfiguration`. | Docker cannot detect if `wiki-app` hangs internally; `xpenses-backend` retains root capabilities in the container namespace if `su-exec` were ever bypassed; redundant `inMemoryUserDetailsManager` bean in Spring Security. | Add a healthcheck to `wiki-app` in `/opt/wiki-js/docker-compose.yml`; exclude `UserDetailsServiceAutoConfiguration.class` in `@SpringBootApplication` in `XpensesApplication.kt`; add `security_opt: ["no-new-privileges:true"]` and `cap_drop: ["ALL"]` (with minimal `cap_add` where needed) across Compose services. |
| **LOW** | Kernel & Systemd Hygiene (`dmesg`, `sysctl`, `/etc/ssh`) | **Kernel `overlayfs` lowerdir warning, recurring `systemd-ssh-generator` AF_VSOCK errors, and minor `sysctl`/`sshd` defaults (`X11Forwarding yes`, `rp_filter=0`, `send_redirects=1`).** | `dmesg -T` shows `overlayfs: lowerdir is in-use as upperdir/workdir of another mount` and `systemd-ssh-generator: Failed to query local AF_VSOCK CID`. `sysctl` shows `net.ipv4.conf.all.rp_filter = 0`, `net.ipv4.conf.all.send_redirects = 1`, `kernel.kptr_restrict = 0`. | Minor attack surface expansion on LAN (`send_redirects=1`, `rp_filter=0`, `X11Forwarding yes`) and log noise from `systemd-ssh-generator`. | Set `X11Forwarding no` in `/etc/ssh/sshd_config`; configure `/etc/sysctl.d/99-hardening.conf` (`net.ipv4.conf.all.send_redirects=0`, `kernel.kptr_restrict=1`); mask `systemd-ssh-generator` if VSOCK is unused. |

---

## 4. Immediate Security Risks

### 4.1 Live Administrative Demo Credentials (`mod1/mod1`, `cfo1/cfo1`) on Public Production (`CRITICAL`)
- **What Could Happen:** Any external attacker who discovers `https://xpenses.nt-automation.cc` (or reads the public/shared source code where `Makefile` and `DataInitializer.kt` document `tech1/tech1`, `manager1/manager1`, `cfo1/cfo1`, and `mod1/mod1`) can immediately sign in as `mod1` (`role: mod`, full administrator). With `mod` privileges, an attacker can view and download all 25 users' expense reports, receipt images, digital signatures, and personal email addresses; create/modify users; and read/reconfigure LDAP, IMAP, OCR, and FX provider integrations (`/api/settings/**`).
- **Supporting Evidence:**
  - `/root/xpenses-kotlin/.env` contains `SEED_DEMO_USERS=true`, injected into `xpenses-backend` (`SEED_DEMO_USERS=true`).
  - Querying `xpenses-db` (`SELECT id, username, email, role, is_active FROM users;`) confirmed `id=1 (tech1)`, `id=2 (manager1)`, `id=3 (cfo1)`, and `id=4 (mod1)` are all active (`is_active = t`) alongside real employees (`id=6..25`).
  - Executing a read-only login check against `http://127.0.0.1:8001/api/auth/login` confirmed HTTP `200 OK` for `mod1/mod1`, `cfo1/cfo1`, `manager1/manager1`, and `tech1/tech1`.
- **Urgency:** **Immediate (P0 — fix within minutes).**

### 4.2 Complete Bypass of API Rate Limiting via `X-Forwarded-For` (`HIGH`)
- **What Could Happen:** An attacker can perform high-speed credential stuffing / password brute-forcing against real employee accounts (`adelin`, `cristian`, `silviu`, `diana`, etc.) on `/api/auth/login`, or exhaust server CPU/memory/OCR quotas via `/api/ocr/scan` and `/api/expenses/bulk-upload`, without ever hitting the 5–10 requests/minute rate limit.
- **Supporting Evidence:**
  - `application.yml` sets `server.forward-headers-strategy: framework`, which causes Spring's `ForwardedHeaderFilter` to overwrite `request.remoteAddr` with the first IP in `X-Forwarded-For` before `RateLimitingFilter` runs.
  - Because `TRUSTED_PROXY_ADDRESSES` is empty, `RateLimitingFilter.extractClientIp()` checks `if (remoteAddress !in trustedProxies) return remoteAddress`—which returns the **already-overwritten** `X-Forwarded-For` IP!
  - Verified live: `curl -X POST http://127.0.0.1:3001/api/auth/refresh -H "X-Forwarded-For: 203.0.113.99"` created the Redis key `xpenses:rate-limit:rl:/api/auth/refresh:203.0.113.99:29869762`.
- **Urgency:** **High (P0/P1 — fix immediately after disabling demo users).**

### 4.3 Root Password SSH Access & Permissive Host Firewall (`HIGH`)
- **What Could Happen:** SSH (`0.0.0.0:22`, `[::]:22`) accepts direct `root` logins using passwords (`PermitRootLogin yes`, `PasswordAuthentication yes`), and the host firewall (`INPUT ACCEPT`) neither restricts SSH to Tailscale nor runs `fail2ban`. If any device on the local subnet (`192.168.100.0/24`) or Tailnet is compromised, or if port 22 is ever exposed at the router/NAT layer, the VM is vulnerable to root password brute-forcing or credential reuse.
- **Supporting Evidence:**
  - `sshd -T` confirms `permitrootlogin yes` and `passwordauthentication yes`.
  - `journalctl -u ssh` shows `Failed password for root from 100.88.2.96`, `Invalid user oot from 100.88.2.96`, and multiple `Accepted password for root` sessions from `100.88.2.96`, `100.88.184.11`, and `192.168.100.22`.
- **Urgency:** **High (P1).**

---

## 5. Performance and Reliability Assessment

### 5.1 Actual Resource Usage & VM Sizing
- **CPU (24 vCPUs — Over-provisioned / Ample Headroom):**
  - Load averages (`0.81, 0.48, 0.72`) and PSI CPU pressure (`some avg10=0.00 avg60=0.00 avg300=0.00`) show negligible baseline CPU utilization across 24 vCPUs.
  - Note: Assigning 24 vCPUs (all threads of dual Xeon E5-2699 v4 sockets) to a single guest VM can actually increase hypervisor co-scheduling latency if other VMs contend for CPU on the Proxmox host. **8 to 12 vCPUs** would easily handle the production workload while improving Proxmox host scheduling efficiency.
- **Memory (7.75 GiB RAM — Constrained Due to Non-Production Co-Resident Processes):**
  - **Production containers alone** consume only **~717 MiB RAM total** right now:
    - `xpenses-backend`: `562.7 MiB` (limit `2 GiB`)
    - `xpenses-frontend`: `65.1 MiB` (limit `1 GiB`)
    - `xpenses-db`: `39.5 MiB` (limit `1 GiB`)
    - `wiki-app`: `19.7 MiB` (unlimited)
    - `wiki-db-backup`: `18.4 MiB` (unlimited)
    - `xpenses-redis`: `6.2 MiB` (unlimited)
    - `wiki-db`: `5.8 MiB` (unlimited)
  - **Why is 4.1 GiB RAM used and 515 MiB swapped out?** Because interactive AI agents and IDE language servers running directly on the host (`pi` ~432 MiB, `tsc --noEmit` ~533 MiB, `dockerd` ~413 MiB, `agy` ~264 MiB, three `tsserver.js` instances ~525 MiB combined, `opengrep-cli` ~281 MiB, `ast-grep` ~125 MiB, `marksman` ~113 MiB, `typingsInstaller` ~203 MiB, `chrome-headless`) consume **>2.8 GiB of resident RAM** and spike higher during builds/tests.
- **Historical Instability Evidence:**
  - On `2026-08-24 23:54:56`, `tailscaled` invoked the Linux kernel OOM-killer (`global_oom`), which killed `next-server` (`pid=2930522`, `anon-rss:761112kB`).
  - On `2026-08-25 00:17:24` and `01:06:09`, `systemd-journald.service` suffered two `Watchdog timeout (limit 3min)!` crashes—a classic symptom of severe memory/swap thrashing and disk I/O stall.
  - Current PSI I/O pressure (`full avg10=0.67 avg60=0.30`) and `vmstat` (`si=24..28`, `so=48..60`, `bo=147944`) confirm intermittent swap and block I/O spikes during concurrent agent/typecheck activity.
- **Storage (`100 GB` disk, `58%` used):**
  - `38 GB` is currently available on `/`, and inode usage is healthy (`16%`).
  - However, **24.1 GB** is tied up in Docker images (`14.61 GB`) and BuildKit build cache (`9.51 GB`). Without periodic pruning and container log rotation (`max-size`), repeated `docker compose up -d --build` cycles will steadily consume the remaining `38 GB`.

---

## 6. Container-by-Container Assessment

### 6.1 `xpenses-frontend` (`xpenses-frontend:latest`)
- **Purpose:** Next.js 16.3.5 standalone web frontend for XPenses (`xpenses.nt-automation.cc`) and reverse-proxy rewrite layer for `/api/*` -> `http://backend:8080/api/*`.
- **Current Operational Status:** `Up 27 minutes (healthy)`, `RestartCount=0`, `OOMKilled=false`.
- **Network Exposure:** Published on `0.0.0.0:3001->3000/tcp` (`xpenses-kotlin_xpenses-net`, `172.20.0.2`). Directly reachable over plaintext HTTP from any host on LAN (`192.168.100.0/24`) or Tailnet.
- **Security Observations:** Runs as non-root `uid=1001(nextjs)` (`npm`/`npx` stripped from runner stage). No host mounts. However, lacks `ReadonlyRootfs`, `cap_drop: ALL`, `no-new-privileges`, and omits HSTS / `X-Content-Type-Options` / `Referrer-Policy` headers on frontend routes.
- **Resource Usage & Limits:** `65.14 MiB / 1 GiB` (`6.36%`), CPU limit `4.0` cores.
- **Health-Check Status:** Healthy (`wget -qO- http://127.0.0.1:3000 || exit 1`, 10s interval).
- **Persistence / Restart Behavior:** Stateless; `restart: unless-stopped`. Missing `depends_on: backend` in `docker-compose.yml`.
- **Recommended Improvements:** Restrict port `3001` via firewall to the upstream proxy IP (or run a local TLS proxy/tunnel on `hst-dbn` and bind `127.0.0.1:3001`); add security headers in `frontend/next.config.ts`; add `depends_on: [backend]`, `cap_drop: [ALL]`, `security_opt: [no-new-privileges:true]`, and log rotation.

### 6.2 `xpenses-backend` (`xpenses-backend:latest`)
- **Purpose:** Spring Boot / Kotlin 2.4 (JDK 21) REST API backend for XPenses.
- **Current Operational Status:** `Up 28 minutes (healthy)`, `RestartCount=0`, `OOMKilled=false`.
- **Network Exposure:** Bound to `127.0.0.1:8001->8080/tcp` and internal bridge `xpenses-kotlin_xpenses-net` (`172.20.0.4`). Publicly exposed via Next.js `/api/*` rewrite. Swagger UI (`/swagger-ui/**`, `/v3/api-docs`) is properly disabled (`404`); `/actuator/prometheus` and `/actuator` require authentication (`401`); `/actuator/health` and `/api/health` are public (`200`).
- **Security Observations:**
  - **CRITICAL:** `SEED_DEMO_USERS=true` in `.env` keeps default demo admin `mod1/mod1` active.
  - **HIGH:** `server.forward-headers-strategy: framework` enables `X-Forwarded-For` spoofing to bypass `RateLimitingFilter`.
  - Starts container entrypoint as `uid=0(root)` to run `chown -R appuser:appgroup /app/data` before dropping to `uid=100(appuser)` via `su-exec`. Because `Config.User` is empty, `docker exec` defaults to `root`, and root capabilities remain in the bounding set during startup.
- **Resource Usage & Limits:** `562.7 MiB / 2 GiB` (`27.47%`), CPU limit `8.0` cores.
- **Health-Check Status:** Healthy (`curl -f http://localhost:8080/api/health || exit 1`, 10s interval, 180s start period).
- **Persistence / Restart Behavior:** Mounts named volume `xpenses-kotlin_xpenses-data` at `/app/data` (`rw=true`); `depends_on` `db` and `redis` (`service_healthy`); `restart: unless-stopped`.
- **Recommended Improvements:** Disable `SEED_DEMO_USERS` and remove demo accounts; fix `ForwardedHeaderFilter` / `RateLimitingFilter` client IP resolution; add explicit JVM heap bounds (`-XX:MaxRAMPercentage=75.0`) so non-heap + heap memory stays comfortably below the 2 GiB container limit; add `security_opt: [no-new-privileges:true]` and log rotation.

### 6.3 `xpenses-db` (`postgres:16-alpine@sha256:16bc17...`)
- **Purpose:** Primary PostgreSQL 16.14 database for XPenses.
- **Current Operational Status:** `Up 7 weeks (healthy)`, `RestartCount=0`, `OOMKilled=false`.
- **Network Exposure:** Internal-only (`5432/tcp` on `xpenses-kotlin_xpenses-net`, `172.20.0.5`). Not published to host or LAN.
- **Security Observations:** Pinned by SHA256 digest; runs PostgreSQL worker processes as `uid=70(postgres)`. Note that `docker-compose.yml` falls back to `POSTGRES_PASSWORD: ${DB_PASSWORD:-xpenses}` if `DB_PASSWORD` is unset in `.env` (and `.env` defines `SPRING_DATASOURCE_PASSWORD` rather than `DB_PASSWORD`, meaning internal container-to-container auth on `xpenses-net` uses the default password from `.env`/compose).
- **Resource Usage & Limits:** `39.53 MiB / 1 GiB` (`3.86%`), CPU limit `4.0` cores.
- **Health-Check Status:** Healthy (`pg_isready -U xpenses`, 5s interval).
- **Persistence / Restart Behavior:** Named volume `xpenses-kotlin_pgdata` mounted at `/var/lib/postgresql/data`; `restart: unless-stopped`. Backed up daily at `02:00` via `/root/xpenses-kotlin/scripts/backup-db.sh` to `/backups`.
- **Recommended Improvements:** Add `shm_size: 256mb` to prevent PostgreSQL shared-memory exhaustion on complex queries (default Docker `/dev/shm` is 64 MB); configure log rotation.

### 6.4 `xpenses-redis` (`redis:7.4-alpine`)
- **Purpose:** Redis 7.4 datastore for XPenses rate-limiting buckets (`xpenses:rate-limit:*`).
- **Current Operational Status:** `Up 7 weeks (healthy)`, `RestartCount=0`, `OOMKilled=false`.
- **Network Exposure:** Internal-only (`6379/tcp` on `xpenses-kotlin_xpenses-net`, `172.20.0.3`).
- **Security Observations:** Runs as `uid=999(redis)`. No Redis password (`requirepass`) configured on the internal `xpenses-net` bridge.
- **Resource Usage & Limits:** `6.21 MiB / 7.755 GiB` (`0.08%`), **no memory or CPU limit set (`Memory=0`, `NanoCpus=0`)**. Observed using `6.14%` CPU during snapshot/healthcheck intervals (`5s` `redis-cli ping` healthcheck + hourly RDB background saves + `--appendonly yes`).
- **Health-Check Status:** Healthy (`redis-cli ping`, 5s interval).
- **Persistence / Restart Behavior:** Named volume `xpenses-kotlin_redisdata` mounted at `/data` with `--appendonly yes`; `restart: unless-stopped`.
- **Recommended Improvements:** Add `deploy.resources.limits` (`memory: 256M`, `cpus: '1.0'`) and `--maxmemory 128mb --maxmemory-policy allkeys-lru` in `docker-compose.yml`; increase healthcheck interval from `5s` to `15s`.

### 6.5 `wiki-app` (`requarks/wiki:2.5.314`)
- **Purpose:** Wiki.js documentation application (`/opt/wiki-js/docker-compose.yml`).
- **Current Operational Status:** `Up 7 weeks`, `RestartCount=0`, `OOMKilled=false`.
- **Network Exposure:** Published on `0.0.0.0:3000->3000/tcp` (`wiki-js_wiki-network`, `172.19.0.2`). Note: its configured canonical URL (`https://wiki.nt-automation.eu/`) currently returns `NXDOMAIN` in public DNS (`1.1.1.1`), while port `3000` remains open in plaintext HTTP on `0.0.0.0:3000`.
- **Security Observations:** Runs as `uid=1000(node)`. Pinned to `2.5.314` (released 5+ months ago; check for newer `2.5.x` security patches).
- **Resource Usage & Limits:** `19.7 MiB / 7.755 GiB`, **no memory or CPU limit set**. Largest container log on host (`5.1 MB` without log rotation).
- **Health-Check Status:** **Missing (`none`).**
- **Persistence / Restart Behavior:** Anonymous/named volume `7b485126...` at `/wiki/data/content` + PostgreSQL backend `wiki-db`; `restart: unless-stopped`.
- **Recommended Improvements:** Add a Docker `healthcheck`, set memory limit (`512M`–`1024M`), bind port `3000` to `127.0.0.1` or restrict via firewall if `wiki.nt-automation.eu` is retired/internal-only, and enable Docker log rotation.

### 6.6 `wiki-db` (`postgres:15-alpine`)
- **Purpose:** PostgreSQL 15 database for Wiki.js (`prod_wiki_db`).
- **Current Operational Status:** `Up 7 weeks (healthy)`, `RestartCount=0`, `OOMKilled=false`.
- **Network Exposure:** Internal-only (`5432/tcp` on `wiki-js_wiki-network`, `172.19.0.3`).
- **Security Observations:** Runs as `uid=70(postgres)`. `/opt/wiki-js/.env` has proper `0600` (`-rw-------`) permissions, and bind mount `/opt/wiki-js/db-data` has `0700` (`drwx------ 70:root`) permissions.
- **Resource Usage & Limits:** `5.81 MiB / 7.755 GiB`, **no memory or CPU limit set**.
- **Health-Check Status:** Healthy (`pg_isready`, 10s interval).
- **Persistence / Restart Behavior:** Bind mount `/opt/wiki-js/db-data:/var/lib/postgresql/data`; `restart: unless-stopped`.
- **Recommended Improvements:** Add `deploy.resources.limits` (`memory: 512M`, `cpus: '2.0'`) and log rotation.

### 6.7 `wiki-db-backup` (`prodrigestivill/postgres-backup-local:15`)
- **Purpose:** Automated daily `pg_dump` sidecar for `wiki-db`.
- **Current Operational Status:** `Up 7 weeks (healthy)`, `RestartCount=0`, `OOMKilled=false`.
- **Network Exposure:** Internal-only on `wiki-js_wiki-network` (`172.19.0.4`).
- **Security Observations:** Runs as **`uid=0(root)`** (`go-cron -s @daily -p 8080 -- /backup.sh`) with a bind mount to `/opt/wiki-js/backups` (`0755 root:root`, world-readable `.sql.gz` dumps) and an unused anonymous volume mounted at `/var/lib/postgresql/data`.
- **Resource Usage & Limits:** `18.4 MiB / 7.755 GiB`, **no memory or CPU limit set**.
- **Health-Check Status:** Healthy.
- **Persistence / Restart Behavior:** Writes daily/weekly/monthly compressed SQL dumps to `/opt/wiki-js/backups`; `restart: unless-stopped`.
- **Recommended Improvements:** Restrict permissions on `/opt/wiki-js/backups` (`chmod 700 /opt/wiki-js/backups`), set container User or `POSTGRES_UID`/`POSTGRES_GID` if supported, and add memory limits (`256M`).

### 6.8 Stopped / Orphaned Containers (`xpenses-test-*`, `bookstack`, `bookstack_db`)
- **Status:** `xpenses-test-frontend`, `xpenses-test-backend`, and `xpenses-test-db` have been `Exited` for 3 months (from an old opencode worktree `/root/.local/share/opencode/worktree/...`); `bookstack` (`Exited 137`) and `bookstack_db` (`Exited 0`) have been stopped for 5 months (from an earlier `/opt/wiki-js` setup, with leftover data in `/opt/wiki-js/data/bookstack` and `/opt/wiki-js/data/db`).
- **Recommended Improvements:** Archive `/opt/wiki-js/data` if needed, then `docker rm` these 5 stopped containers and clean up their unused test volumes (`xpenses-test_test-data`, `xpenses-test_test-pgdata`, `shiny-engine_*`).

---

## 7. Prioritized Remediation Plan

### P0 — Immediate Action / Critical Exposure (Execute Today)

1. **Disable Demo User Seeding and Deactivate Live Demo Accounts (`xpenses-backend` / `xpenses-db`)**
   - **Affected Component:** `/root/xpenses-kotlin/.env` and PostgreSQL table `users` in `xpenses-db`.
   - **Intended Change:**
     1. Set `SEED_DEMO_USERS=false` in `/root/xpenses-kotlin/.env`.
     2. In `xpenses-db`, deactivate (or delete, if not referenced by real foreign keys) the demo accounts:
        ```sql
        UPDATE users SET is_active = false, password_hash = 'DISABLED' WHERE username IN ('mod1', 'cfo1', 'manager1', 'tech1', 'tech2');
        ```
     3. Recreate `xpenses-backend` (`docker compose up -d backend`) so `SEED_DEMO_USERS=false` is applied to the running container.
   - **Expected Benefit:** Immediately closes unauthenticated administrative takeover of `https://xpenses.nt-automation.cc`.
   - **Risk & Downtime:** ~10–15 seconds of API restart downtime during `docker compose up -d backend`; zero impact on real employee accounts.
   - **Verification:** Run `curl -i -X POST http://127.0.0.1:8001/api/auth/login -H "Content-Type: application/json" -d '{"username":"mod1","password":"mod1"}'` and confirm it returns `HTTP 401 Unauthorized`.

2. **Fix `X-Forwarded-For` Rate-Limiting Bypass (`xpenses-backend` / `xpenses-frontend`)**
   - **Affected Component:** `backend-kotlin-jpa/src/main/resources/application.yml` and `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/security/RateLimitingFilter.kt`.
   - **Intended Change:**
     - Do not allow `ForwardedHeaderFilter` (`server.forward-headers-strategy: framework`) to blindly overwrite `request.remoteAddr` from untrusted `X-Forwarded-For` headers before `RateLimitingFilter`.
     - Instead, either disable `server.forward-headers-strategy` (handling `X-Forwarded-Proto` via a trusted proxy list) or extract the Cloudflare-verified client IP (`CF-Connecting-IP` or rightmost trusted `X-Forwarded-For` hop) only when the request arrives from the verified upstream proxy + `xpenses-frontend` container IP (`172.20.0.2`).
   - **Expected Benefit:** Prevents brute-force attacks against `/api/auth/login` and resource exhaustion on `/api/ocr/scan`.
   - **Risk & Downtime:** Requires backend rebuild/restart (~30s). Ensure real users behind Cloudflare do not share a single `172.20.0.2` rate-limit bucket by forwarding `CF-Connecting-IP` from Next.js/proxy and trusting only the upstream proxy IP.
   - **Verification:** Send 6 login requests with varying fake `X-Forwarded-For` headers from the same source and verify the 6th request returns `HTTP 429 Too Many Requests`.

### P1 — High-Priority Production Security & Reliability Improvements (Within 24–72 Hours)

3. **Back Up `xpenses-data` Volume (Receipts & Signatures) and Add Off-Host Backup Replication**
   - **Affected Component:** `/root/xpenses-kotlin/scripts/backup-db.sh`, `/var/lib/docker/volumes/xpenses-kotlin_xpenses-data/_data`, `/backups`, `/opt/wiki-js/backups`.
   - **Intended Change:**
     - Add `tar -czf "/backups/xpenses_data_${TIMESTAMP}.tar.gz" -C /var/lib/docker/volumes/xpenses-kotlin_xpenses-data/_data .` to `backup-db.sh` and `chmod 600` all backup files (`chmod 700 /backups /opt/wiki-js/backups`).
     - Configure an encrypted off-host sync (e.g., `restic` or `rclone` over S3/B2/Tailscale NAS) in cron and add failure alerting (e.g., Healthchecks.io / webhook).
   - **Expected Benefit:** Protects 112 MB of legal/accounting receipt images and signatures from volume loss or single-disk failure.
   - **Risk & Downtime:** Zero downtime.
   - **Verification:** Check `/backups/xpenses_data_*.tar.gz` creation and test extracting/restoring a backup into a disposable container.

4. **Harden SSH (`sshd_config`) and Lock Down Host Firewall (`nftables` / `ufw` + `DOCKER-USER`)**
   - **Affected Component:** `/etc/ssh/sshd_config`, host `nftables` / `iptables`.
   - **Intended Change:**
     - Verify SSH public keys in `/root/.ssh/authorized_keys` and `/home/aladdin/.ssh/authorized_keys`, then set `PasswordAuthentication no`, `PermitRootLogin prohibit-password`, and `X11Forwarding no` in `/etc/ssh/sshd_config` (`sshd -t && systemctl reload ssh`).
     - Add host firewall rules (`INPUT` default drop except `lo`, `ESTABLISHED,RELATED`, `tailscale0`, UDP `41641`, and LAN SSH if needed) and add `DOCKER-USER` rules restricting external access to TCP `3000` and `3001` only from the upstream reverse proxy (`100.88.2.96` / LAN proxy IP).
   - **Expected Benefit:** Eliminates SSH password brute-force risk and prevents direct origin bypass to `:3000`/`:3001` on the LAN/Tailnet.
   - **Risk & Downtime:** Zero downtime if active SSH key and upstream proxy IP (`pangolin` / LAN proxy) are whitelisted prior to enabling rules.
   - **Verification:** `sshd -T | grep -E "passwordauthentication|permitrootlogin"` shows `no` / `prohibit-password`; connections to `:3001` from unauthorized LAN peers are dropped while `https://xpenses.nt-automation.cc` remains `200 OK`.

5. **Evict Heavy AI/IDE/LSP/Headless-Browser Workloads from Production or Isolate in a Cgroup Slice**
   - **Affected Component:** Host OS processes (`pi`, `agy`, `tsserver`, `opengrep-cli`, `ast-grep`, `chrome-headless`).
   - **Intended Change:** Move active development, typechecking, and E2E testing off the live production VM (or, if development must occur on this host, run agent/IDE sessions inside a `systemd` slice with `MemoryMax=2G MemoryHigh=1.5G` and set `oom_score_adj=-500` on `xpenses-db` and `dockerd`).
   - **Expected Benefit:** Prevents repeat kernel OOM-kills of `next-server` / `java` / `postgres` and `systemd-journald` watchdog freezes.
   - **Risk & Downtime:** Zero production downtime.
   - **Verification:** `free -h` shows >5.5 GiB available RAM under normal production load; zero OOM events in `journalctl -k`.

### P2 — Medium-Priority Hardening & Optimization (Within 1–2 Weeks)

6. **Fix `.env` File Permissions (`0644` -> `0600`)**
   - **Affected Component:** `/root/xpenses-kotlin/.env`.
   - **Intended Change:** `chmod 600 /root/xpenses-kotlin/.env`.
   - **Expected Benefit:** Prevents non-root processes from reading production secrets.
   - **Risk & Downtime:** Zero risk, zero downtime.
   - **Verification:** `stat -c "%a %n" /root/xpenses-kotlin/.env` outputs `600`.

7. **Configure Docker Daemon Log Rotation & Missing Container Resource Limits**
   - **Affected Component:** `/etc/docker/daemon.json`, `/root/xpenses-kotlin/docker-compose.yml`, `/opt/wiki-js/docker-compose.yml`.
   - **Intended Change:**
     - Create `/etc/docker/daemon.json` with `{"log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "3"}}` (or configure `logging:` per service in Compose to avoid restarting `dockerd`).
     - Add memory/CPU limits to `xpenses-redis` (`256M`), `wiki-app` (`1024M`), `wiki-db` (`512M`), and `wiki-db-backup` (`256M`), plus a `healthcheck` on `wiki-app`.
   - **Expected Benefit:** Prevents container log disk exhaustion and unbounded container memory growth.
   - **Risk & Downtime:** Applying per-service in `docker-compose.yml` recreates only updated containers (~10s).
   - **Verification:** `docker stats --no-stream` shows finite memory limits for all 7 running containers.

8. **Add Frontend HTTP Security Headers (`HSTS`, `nosniff`, `Referrer-Policy`)**
   - **Affected Component:** `/root/xpenses-kotlin/frontend/next.config.ts`.
   - **Intended Change:** Add `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, and `poweredByHeader: false`.
   - **Expected Benefit:** Consistent security header posture across both HTML pages and `/api/*` endpoints.
   - **Risk & Downtime:** Requires `xpenses-frontend` container rebuild (~30s).
   - **Verification:** `curl -sI https://xpenses.nt-automation.cc/login` includes `strict-transport-security` and `x-content-type-options: nosniff`, and omits `x-powered-by`.

### P3 — Optional Improvements & Best Practices

9. **Clean Up 24.1 GB of Reclaimable Docker Images, BuildKit Cache, and Orphaned Containers**
   - **Affected Component:** Stopped containers (`bookstack`, `bookstack_db`, `xpenses-test-*`), unused images (`xpenses-ocr-sidecar`, `wiki-app-wiki-app`, `gradle:8.5-jdk21`, etc.), and 9.5 GB BuildKit cache.
   - **Intended Change:** Run `docker rm bookstack bookstack_db xpenses-test-frontend xpenses-test-backend xpenses-test-db`, `docker image prune -a` (after tagging/keeping current rollback images), and `docker builder prune --keep-storage 2GB`. **Never run `docker volume prune`**, to protect `pgdata`, `redisdata`, and `xpenses-data`.
   - **Expected Benefit:** Frees ~20+ GB on `/dev/sda1` (dropping disk usage from 58% to ~35%).
   - **Risk & Downtime:** Zero downtime.
   - **Verification:** `df -h /` and `docker system df`.

10. **Disable Unintended Tailscale Serve Share & Apply Kernel Sysctl Hardening**
    - **Affected Component:** `tailscale serve` (`/tmp/architecture-review-1788771984.html`), `/etc/sysctl.d/99-hardening.conf`.
    - **Intended Change:** Run `tailscale serve reset` if the architecture review page is no longer needed; set `net.ipv4.conf.all.send_redirects=0` and `kernel.kptr_restrict=1`.
    - **Expected Benefit:** Removes stale internal document exposure on the Tailnet and tightens kernel network defaults.
    - **Risk & Downtime:** Zero downtime.
    - **Verification:** `tailscale serve status` shows no active shares.

---

## 8. Verification Gaps (`NOT VERIFIED`)

Because this audit was strictly confined to read-only inspection from inside the `hst-dbn` guest VM without external scanning or access to upstream hosts, the following items are marked **NOT VERIFIED**:

1. **Proxmox VE Hypervisor Configuration & VM Backup Verification (`NOT VERIFIED`)**
   - *What is known:* `qemu-guest-agent` logs on `hst-dbn` show regular `guest-fsfreeze` / `guest-fsthaw` events at `04:32`, `07:30`, and `18:33` daily, strongly indicating that Proxmox is taking hypervisor snapshots or PBS backups of this VM. Furthermore, `virtio_balloon` is loaded.
   - *What could not be verified from guest:* Physical host RAM/CPU overcommit ratios, whether Proxmox memory ballooning is actively reclaiming pages, underlying ZFS/LVM/Ceph disk SMART health, and whether Proxmox backups are stored on a separate physical machine/PBS datastore and have passed restore verification.
   - *How to close gap (run on Proxmox host `prox` / `100.79.130.1`):*
     ```bash
     qm config <VMID>
     pvesm status
     zpool status -v   # or lvs / ceph status
     cat /etc/pve/jobs.cfg
     ```

2. **Upstream Reverse Proxy / Tunnel Configuration & Direct Origin Bypass (`NOT VERIFIED`)**
   - *What is known:* `xpenses.nt-automation.cc` is proxied by Cloudflare (`188.114.96.3`) and routed to `hst-dbn:3001` via an external tunnel or reverse proxy host (likely `pangolin` at `100.88.2.96` or `aperture` at `100.116.244.121`).
   - *What could not be verified from guest:* Whether the upstream router (`192.168.100.1`) port-forwards TCP `80`, `443`, `22`, `3000`, or `3001` directly from the public WAN IP (which would allow attackers to bypass Cloudflare WAF/TLS and hit `hst-dbn:3001` directly if port-forwarded), or how TLS/headers are configured on the upstream proxy/tunnel.
   - *How to close gap (run from an external network or check router/upstream proxy `pangolin`):*
     ```bash
     # From outside the LAN, against your public WAN IP:
     nmap -Pn -p 22,80,443,3000,3001,8001 <PUBLIC_WAN_IP>
     ```

3. **Container Image CVE Vulnerability Scan (`NOT VERIFIED` in full)**
   - *What is known:* Base images for `xpenses-backend` (`eclipse-temurin:21-jre-alpine`, `apk upgrade --no-cache`) and `xpenses-frontend` (`node:22-alpine`, `apk upgrade --no-cache`) were rebuilt 30 minutes ago, while `wiki-app` (`requarks/wiki:2.5.314`) and `wiki-db` (`postgres:15-alpine`) are 5 months old, and `wiki-db-backup` is 12 months old.
   - *What could not be verified:* A full Trivy CVE database scan was not executed during this audit to respect Critical Rule #3 (avoiding high-load/memory-spike operations on a constrained live host).
   - *How to close gap (run during a maintenance window or on CI):*
     ```bash
     docker run --rm -v /var/run/docker.sock:/var/run/docker.sock aquasec/trivy:0.74.0 image --scanners vuln xpenses-backend:latest
     ```

---

## 9. Final Verdict — Direct Answers

1. **Is the VM currently healthy?**  
   **Partially.** The OS (`Debian 13.6`, kernel `6.12.101`), filesystems (`58%` used, zero filesystem errors), NTP sync, and all 7 running Docker containers are currently up and healthy (`55 days` VM uptime, `0` failed systemd units). However, the VM has active swap usage (`515 MiB`), periodic I/O stall pressure (`full avg10=0.67`), and historical kernel OOM-kills (`next-server`) and `systemd-journald` watchdog timeouts triggered by running heavy AI/IDE/LSP/testing processes alongside production.

2. **Is Docker configured appropriately for production?**  
   **Partially.** The `xpenses-*` stack uses non-root runtime users, SHA-pinned base images, healthchecks, and CPU/memory limits on `frontend`, `backend`, and `db`. However, `/etc/docker/daemon.json` is missing (no log rotation), four containers (`xpenses-redis`, `wiki-app`, `wiki-db`, `wiki-db-backup`) have **no memory or CPU limits**, `wiki-app` has no healthcheck, and `24.1 GB` of disk is consumed by unpruned images, build cache, and 5 stopped containers.

3. **Are there serious known or suspected security risks?**  
   **Yes — confirmed critical and high risks:**
   - **Confirmed Critical:** `SEED_DEMO_USERS=true` in production `.env`, with `mod1/mod1` (full admin), `cfo1/cfo1`, `manager1/manager1`, and `tech1/tech1` active and accepting default passwords in the live production database.
   - **Confirmed High:** Rate-limiting bypass on `/api/auth/login` and all rate-limited endpoints via `X-Forwarded-For` header spoofing due to `server.forward-headers-strategy: framework`.
   - **Confirmed High:** SSH permits root login with password (`PermitRootLogin yes`, `PasswordAuthentication yes`), and `/root/xpenses-kotlin/.env` is world-readable (`0644`).

4. **Are unnecessary services potentially exposed to the internet?**  
   - **To the Public Internet:** `https://xpenses.nt-automation.cc` exposes the frontend and `/api/*` backend routes via Cloudflare. Swagger UI is disabled (`404`) and `/actuator/prometheus` requires auth (`401`).
   - **To the LAN (`192.168.100.0/24`) and Tailnet (`100.64.0.0/10`):** Yes. Because the host `INPUT` firewall policy is `ACCEPT` and Docker binds `xpenses-frontend` (`0.0.0.0:3001`) and `wiki-app` (`0.0.0.0:3000`) to all interfaces, both web apps and `sshd` (`0.0.0.0:22`) are exposed without host firewall restrictions across the LAN and Tailnet, and Tailscale Serve is actively serving `/tmp/architecture-review-1788771984.html` on `https://hst-dbn.tail75a8b2.ts.net`.

5. **Are applications sufficiently isolated from each other?**  
   **Yes, at the Docker network level.** `xpenses-*` runs on `xpenses-kotlin_xpenses-net` (`172.20.0.0/16`) and `wiki-*` runs on `wiki-js_wiki-network` (`172.19.0.0/16`), with `iptables`/`nftables` `DOCKER-INTERNAL` / `DOCKER` chains blocking cross-bridge traffic. No container mounts `/var/run/docker.sock` or runs with `--privileged`. However, because `wiki-*` and `xpenses-redis` lack memory limits, a memory spike in one stack can OOM-impact the other at the host kernel level.

6. **Are resources sufficient for the observed workload?**  
   **Yes for the production containers alone (~717 MiB RAM total out of 7.75 GiB), NO when combined with live development/AI/LSP/Playwright workloads (>2.8 GiB RAM).** Either evict development/testing workloads from this VM or increase VM RAM on Proxmox to 12–16 GiB.

7. **Is backup and recovery readiness verified?**  
   **No.** While daily PostgreSQL dumps run locally for `xpenses-db` (`/backups/xpenses_*.dump`) and `wiki-db` (`/opt/wiki-js/backups/daily/*.sql.gz`) and `qemu-guest-agent` indicates daily hypervisor freeze/thaw snapshots, **112 MB of uploaded receipt images and signatures in `xpenses-kotlin_xpenses-data` have no application-level backup**, no off-host backup replication is configured inside the VM, and no restore test evidence exists.

8. **What are the five most important improvements?**  
   1. **Immediately set `SEED_DEMO_USERS=false`** in `/root/xpenses-kotlin/.env` and disable/remove `mod1`, `cfo1`, `manager1`, and `tech1` in `xpenses-db`.
   2. **Fix the `X-Forwarded-For` rate-limiting bypass** by removing/restricting `server.forward-headers-strategy: framework` and properly configuring `TRUSTED_PROXY_ADDRESSES`.
   3. **Back up the `xpenses-kotlin_xpenses-data` volume** (`receipts/` and `signatures/`) in `backup-db.sh` and replicate encrypted backups off-host.
   4. **Harden SSH and the host firewall:** disable SSH password authentication (`PasswordAuthentication no`, `PermitRootLogin prohibit-password`), `chmod 600 /root/xpenses-kotlin/.env`, and restrict `INPUT` and `DOCKER-USER` chains.
   5. **Stop running heavy IDE/LSP/typecheck/headless-browser workloads on the live production VM**, add memory limits to `xpenses-redis` and `wiki-*` containers, and enable Docker JSON log rotation.

9. **Is it safe to continue exposing these applications publicly based on current evidence?**  
   **No — not until P0 Item #1 (`mod1/mod1` default admin account deactivation) and P0 Item #2 (`X-Forwarded-For` rate-limit bypass fix) are applied.** Leaving `mod1/mod1` active on a live public URL (`https://xpenses.nt-automation.cc`) allows trivial administrative compromise.

10. **What cannot be concluded without further verification?**  
    - Whether Proxmox hypervisor backups (`vzdump` / PBS) are stored off-host and have been tested for full VM restoration.
    - Whether the upstream LAN router (`192.168.100.1`) has any open WAN port-forwards (`22`, `3000`, `3001`) that bypass Cloudflare.
    - Whether the Proxmox physical host has CPU/RAM overcommit or underlying physical disk health warnings.
