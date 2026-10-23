# Backup and restore

Back up three things together, and restore them together:

1. **The database** (`cms.db`): posts, pages, users, settings, theme settings, history, audit log.
2. **Media** (`data/media/`): uploaded images. Posts refer to them by id, so a database without its media shows broken images.
3. **Installed themes** (`data/themes/`): theme files. The database records which theme is active and where its files are.

`npm run db:backup` takes all three into one folder.

## Create a backup

```sh
cd /srv/blog/app
npm run db:backup
# Backup written to /srv/blog/data/backups/2026-10-17T09-02-57-509Z (21 files)
```

The folder contains:

```
cms.db            consistent snapshot of the database
media/            uploaded images
themes/           installed theme folders (all versions currently installed)
MANIFEST.json     creation time and a SHA-256 for every file
```

### Why the script does not copy `cms.db` directly

SQLite can be written while it is being copied. A plain `cp` during a write can produce a file that looks valid and is not. The script uses `VACUUM INTO`, which reads one consistent snapshot even while the site is taking requests.

### Scheduling

Run the backup daily from cron, as the `blog` user:

```cron
15 3 * * * cd /srv/blog/app && npm run db:backup >> /srv/blog/data/backups/backup.log 2>&1
```

Copy the backups off the server. A backup on the same disk does not protect against disk loss:

```sh
rsync -a --delete /srv/blog/data/backups/ backup-host:/backups/blog/
```

Keep a retention policy, for example seven daily and four weekly copies. Delete old folders by hand or from cron with `find ... -mtime +14 -exec rm -rf {} +`.

## Verify a backup

```sh
B=/srv/blog/data/backups/<timestamp>
# 1. Every file listed in the manifest is present and unchanged
node -e '
  const fs = require("fs"), crypto = require("crypto"), path = require("path");
  const dir = process.argv[1];
  const m = JSON.parse(fs.readFileSync(path.join(dir, "MANIFEST.json"), "utf8"));
  let bad = 0;
  for (const [file, sum] of Object.entries(m.files)) {
    const got = crypto.createHash("sha256").update(fs.readFileSync(path.join(dir, file))).digest("hex");
    if (got !== sum) { bad++; console.log("MISMATCH", file); }
  }
  console.log(bad ? `${bad} mismatches` : "all files match");
' "$B"

# 2. The database opens and has the expected content
npx prisma db execute --url "file:$B/cms.db" --stdin <<< "SELECT COUNT(*) FROM Post;"
```

Test a restore on a second machine before you need it.

## Restore

Restoring the database replaces all content. Use it for data loss, corruption or a bad migration. Not for theme problems (see below).

```sh
sudo systemctl stop blog                       # stop writes first
B=/srv/blog/data/backups/<timestamp>
cp -p /srv/blog/data/cms.db "/srv/blog/data/cms.db.before-restore-$(date -u +%s)"   # keep the current file
rm -f /srv/blog/data/cms.db-wal /srv/blog/data/cms.db-shm
cp "$B/cms.db" /srv/blog/data/cms.db
rsync -a --delete "$B/media/"  /srv/blog/data/media/
rsync -a --delete "$B/themes/" /srv/blog/data/themes/
cd /srv/blog/app && npm run db:migrate        # no-op if the backup is current
sudo systemctl start blog
```

Then sign in, open **Themes**, and check that the active theme and the content are as expected. Check the audit log for the restore point.

The `rsync --delete` lines make the directories match the backup exactly. Files that were added after the backup are removed. Keep the "before-restore" copy until you are sure.

## Recovering from a failed theme change

Theme changes do not need a database restore. The system protects content on its own:

| Situation                                      | What happens                                                                                                | What to do                                                                                                                             |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Uploaded ZIP fails validation                  | Nothing is installed. The reasons are shown.                                                                | Fix the theme and upload again.                                                                                                        |
| Theme activation fails verification            | The previous theme stays active. The attempt is recorded in history.                                        | Check **Themes → History** for the reason.                                                                                             |
| Active theme files are broken after activation | Visitors get the fallback theme (Webcore unless `CMS_FALLBACK_THEME_ID` says otherwise). The site stays up. | Restore the theme files from `data/backups/themes/` or upload a fixed version, then activate it.                                       |
| The new theme looks wrong to visitors          | Activation is one click.                                                                                    | Click **Roll back**. Nothing else changes.                                                                                             |
| Theme update is wrong                          | The previous version is in `data/backups/themes/<id>-<version>-<timestamp>/`.                               | Upload the old version's files as a ZIP (its `version` must be different from the installed one), or copy the folder back and restart. |

### Deleting theme backups

Every theme update keeps a copy of the outgoing version, so the folder `data/backups/themes/` grows over time. Admins can remove backups in **Admin → Themes** (a Delete button next to each backup) or on a theme's page, where **Delete older, keep the newest** and **Delete all backups** clear a whole theme at once. A deleted backup is gone for good, so it cannot be restored later; the installed theme is not touched. Each deletion is written to the audit log (`theme.backup.delete`). `npm run db:backup` does not copy `data/backups/themes/`, so copy it yourself first if you may want an old version back.

A rollback changes only which theme is active. Use a database restore only if content itself was damaged.

## What the backup does not contain

- `.env` and the preview signing secret. Store these in your secrets manager. Losing `PREVIEW_SECRET` only invalidates existing preview links.
- The application code. Keep it in version control.
- Logs. These are in `journalctl`.
