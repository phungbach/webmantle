# Hosting with Docker

The project ships a `Dockerfile` and a `docker-compose.yml`. The container runs one Node process; the database (SQLite), uploaded images, installed themes and backups live in a volume, so the container itself can be replaced at any time.

## What you need

- Docker 24 or newer with the Compose plugin (`docker compose version`).
- A server or computer with about 2 GB of free memory for the image build and 1 GB of disk for the image.

## Quick start

```bash
git clone https://github.com/YOUR-ACCOUNT/webmantle.git
cd webmantle
cp .env.example .env
```

Edit `.env` (it is never committed or copied into the image):

```
SITE_URL="https://your-domain.com"
PREVIEW_SECRET="<a long random value, 32+ characters>"
ADMIN_EMAIL="you@your-domain.com"
ADMIN_PASSWORD="<12+ characters>"
ADMIN_NAME="Administrator"
TRUST_PROXY="true"
```

Generate `PREVIEW_SECRET` with `openssl rand -base64 48`. `DATABASE_URL` and `CMS_DATA_DIR` are set by `docker-compose.yml`, so leave them out of `.env`.

Then:

```bash
docker compose up -d --build
docker compose logs -f web
```

On start, the container applies the database migrations, installs the built-in themes and creates the first administrator (all safe to repeat). When the log shows `Ready`, open `http://SERVER:3000/login`.

## Without Compose

```bash
docker build -t webmantle:1.0.0 .
docker run -d --name webmantle --restart unless-stopped \
  -p 3000:3000 \
  --env-file .env \
  -e CMS_DATA_DIR=/app/data -e DATABASE_URL=file:/app/data/cms.db \
  -v webmantle-data:/app/data \
  webmantle:1.0.0
```

`docker run --env-file` keeps quotes as part of the value, so in a file used this way write `KEY=value` without quotes.

## HTTPS and a domain

Put a reverse proxy in front and leave `TRUST_PROXY="true"` only when that proxy overwrites `X-Forwarded-For`. Example with Caddy (automatic certificates):

```
your-domain.com {
  reverse_proxy 127.0.0.1:3000
}
```

Example with nginx:

```
location / {
  proxy_pass http://127.0.0.1:3000;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $remote_addr;
  proxy_set_header X-Forwarded-Proto $scheme;
  client_max_body_size 12m;
}
```

The 12 MB limit matches the largest upload the CMS accepts (theme ZIPs and images).

## Upgrading

```bash
git pull            # or unpack the new release
docker compose up -d --build
```

The volume keeps your data. The container runs `prisma migrate deploy` and the seed again on start, which also updates the built-in themes (a backup of the previous theme version is kept).

## Backups

```bash
docker compose exec web npm run db:backup
docker cp webmantle:/app/data/backups ./backups
```

To back up the whole volume: `docker run --rm -v webmantle_webmantle-data:/data -v "$PWD":/out alpine tar czf /out/webmantle-data.tgz -C /data .` (the volume name is prefixed with the Compose project name). See [backup-and-restore.md](backup-and-restore.md) for restoring.

## Settings you may want

| Variable                      | Meaning                                                                                                                                                                   |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SKIP_SEED=true`              | Do not run the seed on start (it still runs migrations).                                                                                                                  |
| `DEMO_EMAIL`, `DEMO_PASSWORD` | Creates a read-only demo account at the first seed.                                                                                                                       |
| `DEMO_PUBLIC_LOGIN=true`      | Enables the `/demo` link that signs visitors in to the demo account. Only enable it on a site with sample data: the demo account can see everything the admin area shows. |
| `TRUST_PROXY=true`            | Read the visitor's address from `X-Forwarded-For` (only behind a proxy you control).                                                                                      |

## Troubleshooting

| Symptom                            | Likely cause and fix                                                                                                                               |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Container restarts at once         | `docker compose logs web`. Usually `ADMIN_EMAIL` or `ADMIN_PASSWORD` is missing at the first start, or the password is shorter than 12 characters. |
| "Unable to open the database file" | The volume is not writable by the `node` user. Recreate the volume, or run `docker compose down` and remove a volume that was created by `root`.   |
| Prisma cannot load its engine      | The image uses Debian with OpenSSL (installed in the Dockerfile). Do not switch the base image to Alpine without adding `binaryTargets` for musl.  |
| Build killed or very slow          | Give Docker at least 2 GB of memory.                                                                                                               |
| Login limit applies to everyone    | Set `TRUST_PROXY=true` behind your proxy.                                                                                                          |
