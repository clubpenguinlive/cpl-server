// Schema migration runner.
//
// Applies the ordered .sql files in ../migrations that haven't run yet, tracked in a
// `schema_migrations` table. The Yukon schema is raw SQL (models only init() against existing
// tables, there is no sequelize.sync()), so new tables were previously added by hand on prod with
// no record of what ran. This makes those changes ordered, idempotent, and reproducible.
//
//   node ./utils/migrate.js            apply all pending migrations
//   node ./utils/migrate.js --status   list applied / pending, change nothing
//
// MySQL auto-commits DDL, so a migration file that fails partway can't be rolled back. Keep each
// file to a single logical change and it stays re-runnable: a file is only recorded after it runs
// clean, so a failed one is retried (after you fix it) on the next invocation.

const fs = require('fs')
const path = require('path')
const mysql = require('mysql2/promise')

const config = require(path.resolve(__dirname, '../config/config.json'))
const migrationsDir = path.resolve(__dirname, '../migrations')

const TRACKING_TABLE = 'schema_migrations'

async function main() {
    const statusOnly = process.argv.includes('--status')

    const files = fs.existsSync(migrationsDir)
        ? fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()
        : []

    const db = config.database
    const connection = await mysql.createConnection({
        host: db.host,
        user: db.user,
        password: db.password,
        database: db.database,
        multipleStatements: true
    })

    try {
        await connection.query(
            `CREATE TABLE IF NOT EXISTS \`${TRACKING_TABLE}\` (` +
            '`name` VARCHAR(191) NOT NULL PRIMARY KEY, ' +
            '`applied_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP' +
            ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
        )

        const [rows] = await connection.query(`SELECT name FROM \`${TRACKING_TABLE}\``)
        const applied = new Set(rows.map(r => r.name))
        const pending = files.filter(f => !applied.has(f))

        if (statusOnly) {
            console.log(`Applied (${applied.size}):`)
            files.filter(f => applied.has(f)).forEach(f => console.log(`  ok  ${f}`))
            console.log(`Pending (${pending.length}):`)
            pending.forEach(f => console.log(`  --  ${f}`))
            return
        }

        if (pending.length === 0) {
            console.log('Database is up to date, no pending migrations.')
            return
        }

        for (const file of pending) {
            const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8').trim()
            if (!sql) {
                console.log(`Skipping empty migration ${file}`)
            } else {
                process.stdout.write(`Applying ${file} ... `)
                await connection.query(sql)
                process.stdout.write('ok\n')
            }
            await connection.query(`INSERT INTO \`${TRACKING_TABLE}\` (name) VALUES (?)`, [file])
        }

        console.log(`Done. Applied ${pending.length} migration(s).`)

    } finally {
        await connection.end()
    }
}

main().catch(err => {
    console.error('\nMigration failed:', err.message)
    process.exit(1)
})
