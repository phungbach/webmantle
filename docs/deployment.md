# Deployment

Target: a Linux VPS with Node.js 20.9 or newer (22 LTS recommended), a reverse proxy with TLS, and a process manager. The database is a single SQLite file, so run one application process.

## 1. Prepare the server

```sh
sudo adduser --system --group --home /srv/blog blog
sudo mkdir -p /srv/blog/app /srv/blog/data
sudo chown -R blog:blog /srv/blog
```

Copy the project (without `node_modules`, `.next`, `data`, `.env`) to `/srv/blog/app`, or clone it from your repository.

## 2. Configure the environment

Create `/srv/blog/app/.env` with permissions `600`, owned by the `blog` user:

```sh
DATABASE_URL="file:/srv/blog/data/cms.db"
CMS_DATA_DIR="/srv/blog/data"
PREVIEW_SECRET="<output of: openssl rand -base64 48>"
SITE_URL="https://blog.example.com"
SITE_TIMEZONE="UTC"
NODE_ENV="production"
```

Only needed for the first run, so remove them after seeding:

```sh
ADMIN_EMAIL="you@example.com"
ADMIN_PASSWORD="at least twelve characters"
```

Variables:

| Variable                                      | Purpose                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | SQLite file. An absolute path is safest in production. A relative path resolves from `prisma/schema.prisma`.                    |
| `CMS_DATA_DIR`                                | Directory for `themes/`, `media/`, `backups/`. Defaults to `./data`. Keep it outside the web root.                              |
| `PREVIEW_SECRET`                              | Required in production, at least 32 characters. Signs preview links. Changing it invalidates existing preview links.            |
| `SITE_URL`                                    | Public address. Used for canonical links, sitemap, feed and social tags.                                                        |
| `CMS_FALLBACK_THEME_ID`                       | Optional. The installed theme visitors get if the active one breaks, and that cannot be uninstalled. Defaults to `hien-studio`. |
| `SITE_TIMEZONE`                               | Display timezone for dates. Stored values are UTC.                                                                              |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | Only read by `db:seed`, and only while no administrator exists.                                                                 |

The application refuses to start in production without `PREVIEW_SECRET`.

## 3. Install, migrate, seed, build

```sh
cd /srv/blog/app
npm ci
npm run db:migrate            # applies migrations to DATABASE_URL (creates the file)
npm run db:seed               # admin, built-in themes, sample post. Safe to repeat.
npm run build
```

Remove `ADMIN_PASSWORD` from `.env` after the seed completes.

Note: `npm run build` runs `prisma generate` first, which needs no database.

## 4. Run as a service (systemd)

`/etc/systemd/system/blog.service`:

```ini
[Unit]
Description=Blog CMS
After=network.target

[Service]
Type=simple
User=blog
Group=blog
WorkingDirectory=/srv/blog/app
EnvironmentFile=/srv/blog/app/.env
ExecStart=/usr/bin/env npm start -- -p 3000 -H 127.0.0.1
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/srv/blog/data
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now blog
sudo systemctl status blog
journalctl -u blog -f
```

Bind to `127.0.0.1`, so only the reverse proxy can reach the app.

## 5. Reverse proxy and TLS

Example with nginx and Let's Encrypt (`certbot --nginx -d blog.example.com`):

```nginx
server {
    listen 80;
    server_name blog.example.com;

    client_max_body_size 12m;   # theme ZIPs (5 MB) and images (5 MB) plus form overhead

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Keep the proxy in front of the app for TLS. The login rate limit reads the first `X-Forwarded-For` address, so only let the proxy set that header.

## 6. Verify

```sh
curl -sI https://blog.example.com/ | grep -i -E "strict-transport|x-frame|nosniff"
curl -s -o /dev/null -w "%{http_code}\n" https://blog.example.com/admin     # 307 to /login
curl -s -o /dev/null -w "%{http_code}\n" https://blog.example.com/data/cms.db  # 404
curl -s -o /dev/null -w "%{http_code}\n" https://blog.example.com/theme-assets/hien-studio/1.10.0/theme.json  # 404
```

Sign in, open **Themes**, and confirm the built-in themes (Webcore, Hiên Studio and the English centre theme) are listed.

## Upgrades

1. Take a backup (see [backup-and-restore.md](backup-and-restore.md)).
2. Deploy the new code to a new directory, or `git pull` in place.
3. `npm ci && npm run db:migrate && npm run build`
4. `sudo systemctl restart blog`
5. Check the logs and the homepage.

Migrations are forward-only. Restore from backup if a migration must be reverted.

## Dependency notes

`npm audit` reports advisories against the current major versions of Next.js 15, Prisma 6, PostCSS and Tailwind CSS 3. The suggested fixes are breaking upgrades (Next 16, Prisma 7). Plan these upgrades separately, run the full test suite (`npm test`, `npm run test:e2e`), and keep the lockfile committed.

## Other platforms

- **Node hosts with a persistent disk (Render, Railway, Fly.io with a volume):** the same steps. Mount the volume at `CMS_DATA_DIR`. A stateless container without a volume loses posts, media and themes on redeploy.
- **cPanel-style shared hosting:** only works if Node.js 20.9+ is available as an application and the process can keep a writable directory. SQLite needs a writable file, not only a writable folder. Check with the host first.
- **Serverless platforms:** not supported. SQLite and the in-memory rate limit need a long-running process.
