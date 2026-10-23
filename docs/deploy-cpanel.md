# Hosting on cPanel

Webmantle runs on cPanel as a **Node.js application** (the "Setup Node.js App" tool, which uses CloudLinux and Passenger). The site is one Node process with a SQLite file as its database, so there is no MySQL to set up.

> Not every cPanel plan has "Setup Node.js App". If you do not see it in cPanel, ask your host to enable it, or use a VPS with Docker instead ([deploy-docker.md](deploy-docker.md)).

## What you need

- cPanel with **Setup Node.js App**, Node.js **20.9 or newer** (choose 22 if offered).
- Terminal access (the cPanel **Terminal**, or SSH). Without it you cannot apply the database migrations.
- About 1 GB of disk and 1 GB of memory for the install. The prebuilt package skips `next build`, which is the part that often runs out of memory on shared hosting.
- A domain or subdomain pointed at the account, with an SSL certificate (AutoSSL is enough).

## 1. Get the package

Download `webmantle-v1.0.0.zip` from the GitHub Releases page of the project. This is the **prebuilt** package: the site is already built, and it contains no `.env`, no database and no uploads.

To build it yourself instead, run `npm run release` on your computer (see [release.md](release.md)); it creates the same zip in `release/`.

## 2. Upload and extract

1. In **File Manager**, create a folder for the app **outside** `public_html`, for example `/home/USER/webmantle`.
2. Upload the zip into it and **Extract**. Move the files out of the extracted `webmantle-v1.0.0` folder so that `package.json` and `app.js` sit directly in `/home/USER/webmantle`.
3. Create a second folder for your data, for example `/home/USER/webmantle-data`. The database, uploaded images, installed themes and backups live there, so upgrading the app never touches them.

## 3. Create the Node.js application

Open **Setup Node.js App → Create Application**:

| Field                    | Value                                |
| ------------------------ | ------------------------------------ |
| Node.js version          | 22 (or the newest 20.9+)             |
| Application mode         | Production                           |
| Application root         | `webmantle` (the folder from step 2) |
| Application URL          | your domain or subdomain             |
| Application startup file | `app.js`                             |

Click **Create**. Do not upload a `node_modules` folder: cPanel manages it for you.

## 4. Settings file

Create a file named `.env` in the application root (File Manager → New File → `.env`, then Edit). Copy the content of `.env.example` and fill it in:

```
DATABASE_URL="file:/home/USER/webmantle-data/cms.db"
CMS_DATA_DIR="/home/USER/webmantle-data"
SITE_URL="https://your-domain.com"
PREVIEW_SECRET="<a long random value, 32+ characters>"
ADMIN_EMAIL="you@your-domain.com"
ADMIN_PASSWORD="<12+ characters>"
ADMIN_NAME="Administrator"
TRUST_PROXY="true"
```

- Generate `PREVIEW_SECRET` in the Terminal with `openssl rand -base64 48`.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` are used once, to create the first administrator. You can remove `ADMIN_PASSWORD` from the file afterwards.
- Set `TRUST_PROXY="true"` only because cPanel puts a proxy in front of the app. It makes the login limit use the visitor's real address.
- Keep the file private: set its permissions to `600` (File Manager → Permissions). Never commit it or send it to anyone.

(The environment variables in the Node.js App screen also work, but they are not visible to the Terminal, so the migration commands below would not see them. The `.env` file is read by both.)

## 5. Install and prepare the database

In **Setup Node.js App**, open your application and click **Run NPM Install**. Or, in the Terminal, copy the line at the top of the app screen (it starts with `source /home/USER/nodevenv/...`), run it, then:

```bash
cd ~/webmantle
npm ci
npx prisma migrate deploy
npm run db:seed
```

- `npm ci` installs the exact versions from `package-lock.json` (it also generates the Prisma client for the server).
- `npx prisma migrate deploy` creates the database tables.
- `npm run db:seed` creates the first administrator and installs the built-in themes. It is safe to run again.

## 6. Start

Click **Restart** on the Node.js App screen, then open your domain. The public site loads at `/`, and the admin at `/admin` (sign in with the email and password from `.env`).

Check these three things:

1. `https://your-domain.com/login` loads.
2. You can sign in and see the Dashboard.
3. **Settings → General** shows the site address you expect.

## Upgrading

1. Take a backup (see below).
2. Upload and extract the new zip over the app folder. **Keep** `.env` and the data folder (the zip does not contain them, so extracting over the app is safe).
3. In the Terminal: `npm ci`, `npx prisma migrate deploy`, `npm run db:seed`.
4. **Restart** the app.

## Backups

```bash
cd ~/webmantle
npm run db:backup
```

This writes a consistent copy of the database, media and themes into `webmantle-data/backups`. Add it as a **Cron Job** (for example daily at 03:00) and copy the backups off the server now and then. See [backup-and-restore.md](backup-and-restore.md).

## Building on the server instead (optional)

If you prefer to build on the host: upload the **source** zip (`webmantle-v1.0.0-source.zip`) or clone the repository, then run `npm ci && npm run build`, and continue from step 5. The build needs about 1.5 GB of memory; if it is killed, use the prebuilt package.

## Troubleshooting

| Symptom                                               | Likely cause and fix                                                                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| "Incomplete response" or a Passenger error page       | Open the app folder's `stderr.log` (or **Setup Node.js App → Open log**). Usually a missing `.env` value or a skipped `npm ci`. |
| Error mentioning `@prisma/client` or the query engine | Run `npm ci` again in the app's virtual environment; make sure the Node.js version matches the one selected in the app.         |
| `Error: Could not find a production build`            | The `.next` folder is missing. Use the prebuilt zip, or run `npm run build`.                                                    |
| "Unable to open the database file"                    | `DATABASE_URL` points to a folder that does not exist or is not writable. Create it and check the permissions.                  |
| Everyone shares one login limit                       | `TRUST_PROXY` is not `true`, so all visitors look like one address.                                                             |
| Out of memory during `npm ci` or the build            | Use the prebuilt package; ask the host to raise the memory limit.                                                               |
| Images are not shown after an upgrade                 | `CMS_DATA_DIR` changed. It must stay the same between upgrades.                                                                 |
