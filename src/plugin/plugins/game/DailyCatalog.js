import GamePlugin from '@plugin/GamePlugin'

import pool from '@data/catalog_pool.json'
import classics from '@data/catalog_classics.json'


const DAILY_COUNT = 30

// Deterministic PRNG (mulberry32) so the daily set is identical for every player on a given day
// and cannot be influenced by the client.
function mulberry32(seed) {
    return function () {
        seed |= 0
        seed = (seed + 0x6D2B79F5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

function dayOfYear(date) {
    const start = Date.UTC(date.getUTCFullYear(), 0, 0)
    return Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000)
}

export default class DailyCatalog extends GamePlugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'get_daily_catalog': this.getDailyCatalog
        }
    }

    getDailyCatalog(args, user) {
        const now = new Date()
        const seed = now.getUTCFullYear() * 1000 + dayOfYear(now)
        const rand = mulberry32(seed)

        // Deterministic Fisher-Yates shuffle of a pool copy, then take the day's selection.
        const shuffled = pool.slice()
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1))
            const tmp = shuffled[i]
            shuffled[i] = shuffled[j]
            shuffled[j] = tmp
        }

        const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1))

        user.send('daily_catalog', {
            date: now.toISOString().slice(0, 10),
            items: shuffled.slice(0, DAILY_COUNT),
            classics: classics,
            secondsUntilNext: Math.floor((next - now) / 1000)
        })
    }

}
