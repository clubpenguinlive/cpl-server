# Database migrations

Ordered, idempotent schema changes applied by `utils/migrate.js`. The Yukon schema is raw SQL and
the models only `init()` against existing tables (no `sequelize.sync()`), so every new table or
column ships as a migration here instead of being applied by hand on the box.

## Run

```
npm run migrate            # apply all pending migrations
npm run migrate -- --status   # show applied / pending, change nothing
```

The runner reads the same `config/config.json` `database` block the server uses, creates a
`schema_migrations` tracking table on first run, and applies any `*.sql` file in this directory not
already recorded, in filename order.

## Adding a migration

- Name files `NNNN_short_description.sql`, zero-padded and strictly increasing (`0002_...`).
- One logical change per file. MySQL auto-commits DDL, so a file can't be rolled back mid-way; a
  file is only recorded after it runs clean, so a failed one is retried on the next run once fixed.
- Use `CREATE TABLE IF NOT EXISTS` / guarded `ALTER`s so re-running against a hand-patched prod DB
  (where the table may already exist from earlier manual work) is safe.

## Deploy order

Run `npm run migrate` on prod **before** restarting the server when a release adds a table the new
code reads. The runner is safe to run every deploy; it no-ops when there's nothing pending.
