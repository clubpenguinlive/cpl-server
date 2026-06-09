import pool from '@data/challenge_pool.json'


// Daily challenges are derived deterministically from the UTC date (same approach as DailyCatalog's
// weekly rotation, but per-DAY). No DB stores the day's SET — only per-user PROGRESS is persisted.
// Rotation boundary = 00:00 UTC.

const DAILY_COUNT = 3

function mulberry32(seed) {
    return function () {
        seed |= 0
        seed = (seed + 0x6D2B79F5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// Day-of-year (UTC), 1-365/366.
function dayOfYear(date) {
    const start = Date.UTC(date.getUTCFullYear(), 0, 1)
    const today = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
    return Math.floor((today - start) / 86400000) + 1
}

// Seed = year*1000 + dayOfYear -> a unique, stable seed per calendar day.
function daySeed(date) {
    return date.getUTCFullYear() * 1000 + dayOfYear(date)
}

// The deterministic set of DAILY_COUNT challenge templates for the given date. Same date -> same
// set for every player and every call (server-derived; the client cannot influence it).
export function getDayChallenges(date) {
    const rand = mulberry32(daySeed(date))
    const remaining = pool.slice()
    const picked = []
    while (picked.length < DAILY_COUNT && remaining.length > 0) {
        const idx = Math.floor(rand() * remaining.length)
        picked.push(remaining[idx])
        remaining.splice(idx, 1)
    }
    return picked
}

// YYYY-MM-DD (UTC) — the `day` key for per-user progress rows.
export function dayKey(date) {
    return date.toISOString().slice(0, 10)
}

// Seconds until the next 00:00 UTC (next rotation) — lets the client show a countdown.
export function secondsUntilNext(date) {
    const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
    return Math.floor((next - date.getTime()) / 1000)
}
