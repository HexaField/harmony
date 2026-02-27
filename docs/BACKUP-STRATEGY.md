# Backup Strategy

## Self-Hosted Server

### Data to Back Up

| Data               | Location                       | Format       |
| ------------------ | ------------------------------ | ------------ |
| Community database | `$HARMONY_DATA_DIR/harmony.db` | SQLite       |
| Media files        | `$HARMONY_DATA_DIR/media/`     | Binary files |
| Server config      | `harmony.config.yaml`          | YAML         |
| TLS certificates   | Configured path                | PEM          |

### Backup Methods

#### 1. SQLite Online Backup (Recommended)

Use SQLite's `.backup` command for a consistent snapshot without stopping the server:

```bash
#!/bin/bash
# backup.sh — run via cron
BACKUP_DIR="/backups/harmony"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DB_PATH="${HARMONY_DATA_DIR:-./data}/harmony.db"

mkdir -p "$BACKUP_DIR"

# SQLite online backup (safe while server is running)
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/harmony_$TIMESTAMP.db'"

# Compress
gzip "$BACKUP_DIR/harmony_$TIMESTAMP.db"

# Copy media directory
tar czf "$BACKUP_DIR/media_$TIMESTAMP.tar.gz" "${HARMONY_DATA_DIR:-./data}/media/"

# Retain last 30 daily backups
find "$BACKUP_DIR" -name "harmony_*.db.gz" -mtime +30 -delete
find "$BACKUP_DIR" -name "media_*.tar.gz" -mtime +30 -delete

echo "Backup complete: $BACKUP_DIR/*_$TIMESTAMP.*"
```

#### 2. Docker Volume Backup

If running via Docker:

```bash
# Stop for consistent backup (brief downtime)
docker compose stop harmony
tar czf harmony-backup-$(date +%Y%m%d).tar.gz /var/lib/docker/volumes/harmony_data/
docker compose start harmony

# Or use the SQLite online backup method above (no downtime)
docker exec harmony sqlite3 /data/harmony.db ".backup /data/backup.db"
docker cp harmony:/data/backup.db ./harmony-backup.db
```

#### 3. Cron Schedule

```cron
# Daily SQLite backup at 3 AM
0 3 * * * /opt/harmony/backup.sh >> /var/log/harmony-backup.log 2>&1

# Weekly full media backup on Sunday
0 4 * * 0 tar czf /backups/harmony/media-weekly-$(date +\%Y\%m\%d).tar.gz /data/media/
```

### Restore

```bash
# Stop server
docker compose stop harmony  # or kill the process

# Restore database
gunzip harmony_YYYYMMDD_HHMMSS.db.gz
cp harmony_YYYYMMDD_HHMMSS.db "$HARMONY_DATA_DIR/harmony.db"

# Restore media
tar xzf media_YYYYMMDD_HHMMSS.tar.gz -C "$HARMONY_DATA_DIR/"

# Start server
docker compose start harmony
```

---

## Cloud (Cloudflare Workers)

### Data Locations

| Data              | Service                     | Backup Method                                   |
| ----------------- | --------------------------- | ----------------------------------------------- |
| Instance registry | D1                          | `wrangler d1 export`                            |
| Community data    | Durable Objects (DO SQLite) | DO `sqlDump()` via admin endpoint               |
| Media files       | R2                          | `wrangler r2 object get` or S3-compatible tools |
| Sessions          | KV                          | `wrangler kv key list` + `kv key get`           |

### D1 Backup

```bash
# Export D1 database
wrangler d1 export harmony-instances --output harmony-d1-backup.sql --env production

# Schedule via GitHub Actions
# .github/workflows/backup.yml — runs on cron
```

### Durable Object SQLite

Each CommunityDurableObject stores its data in DO SQLite. To back up:

1. **Admin endpoint** (recommended): Add a `backup.export` message handler to CommunityDO that calls `this.ctx.storage.sql.exec('SELECT * FROM ...')` and returns the data.

2. **Periodic export**: Schedule a Worker cron trigger that iterates known communities (from D1 registry) and calls the backup endpoint for each.

```typescript
// In CommunityDurableObject — add backup handler
case 'backup.export': {
  // Only allow from admin connections
  if (!this.isAdmin(conn)) return
  const tables = this.sql.exec('SELECT name FROM sqlite_master WHERE type="table"').toArray()
  const dump: Record<string, any[]> = {}
  for (const { name } of tables) {
    dump[name as string] = this.sql.exec(`SELECT * FROM "${name}"`).toArray()
  }
  this.send(conn, { type: 'backup.data', payload: dump })
  break
}
```

### R2 Media Backup

```bash
# Use rclone with S3-compatible R2 endpoint
rclone sync r2:harmony-media /backups/r2-media/ --config rclone.conf

# rclone.conf
[r2]
type = s3
provider = Cloudflare
access_key_id = <R2_ACCESS_KEY>
secret_access_key = <R2_SECRET_KEY>
endpoint = https://<ACCOUNT_ID>.r2.cloudflarestorage.com
```

### Cloud Backup Schedule

| What              | Frequency  | Method                                       |
| ----------------- | ---------- | -------------------------------------------- |
| D1 registry       | Daily      | `wrangler d1 export` via GitHub Actions cron |
| DO community data | Daily      | Worker cron → admin backup endpoint          |
| R2 media          | Weekly     | rclone sync to offsite storage               |
| KV sessions       | Not needed | Sessions are ephemeral                       |

---

## Disaster Recovery

### Self-Hosted

- **RPO** (Recovery Point Objective): 24 hours (daily backups)
- **RTO** (Recovery Time Objective): ~15 minutes (restore DB + media, restart Docker)
- **Test quarterly**: Restore from backup to a fresh server, verify data integrity

### Cloud

- **RPO**: 24 hours (D1 + DO daily), 7 days (R2 weekly)
- **RTO**: ~1 hour (recreate CF resources, import D1, redeploy workers)
- Cloudflare has built-in redundancy — backup is for catastrophic account loss or data corruption
- D1 and DO have automatic replicas within Cloudflare's infrastructure
