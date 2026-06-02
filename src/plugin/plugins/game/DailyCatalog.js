import GamePlugin from '@plugin/GamePlugin'

import pool from '@data/catalog_pool.json'
import classics from '@data/catalog_classics.json'


// Penguin Style = the one shop with a pool large enough to rotate (2,872 renderable clothing
// items). Per Addendum 2 cadence rule (large pool -> weekly), it drops ~35 items/week
// (~1.6 yr to cycle). Selection is deterministic per ISO week, rarity-weighted (cheaper items
// appear more often so expensive items are the weekly chase), with a permanent Classics set and
// a "recently rotated out" list (last week's items that just left). Everything is server-derived
// and cannot be influenced by the client.

const WEEKLY_COUNT = 35

function mulberry32(seed) {
    return function () {
        seed |= 0
        seed = (seed + 0x6D2B79F5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

// ISO-8601 week number (UTC). Weeks start Monday; rotation boundary = Monday 00:00 UTC.
function isoWeek(date) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    const dayNum = (d.getUTCDay() + 6) % 7
    d.setUTCDate(d.getUTCDate() - dayNum + 3)
    const firstThursday = d.getTime()
    d.setUTCMonth(0, 1)
    if (d.getUTCDay() !== 4) {
        d.setUTCMonth(0, 1 + ((4 - d.getUTCDay()) + 7) % 7)
    }
    return 1 + Math.round((firstThursday - d.getTime()) / (7 * 86400000))
}

export default class DailyCatalog extends GamePlugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'get_daily_catalog': this.getCatalog
        }
    }

    // Rarity weight: cheaper items are common (higher weight), expensive items rare (the chase).
    weightFor(id) {
        const item = this.crumbs.items[id]
        const cost = (item && item.cost) || 100
        return 1 / Math.sqrt(Math.max(cost, 50))
    }

    // Deterministic weighted selection of `count` distinct ids from the pool for a given seed.
    weeklySelection(seed, count) {
        const rand = mulberry32(seed)
        const remaining = pool.slice()
        const picked = []

        while (picked.length < count && remaining.length > 0) {
            let total = 0
            for (const id of remaining) total += this.weightFor(id)
            let r = rand() * total
            let idx = 0
            for (; idx < remaining.length; idx++) {
                r -= this.weightFor(remaining[idx])
                if (r <= 0) break
            }
            if (idx >= remaining.length) idx = remaining.length - 1
            picked.push(remaining[idx])
            remaining.splice(idx, 1)
        }
        return picked
    }

    getCatalog(args, user) {
        const now = new Date()
        const week = isoWeek(now)
        const seed = now.getUTCFullYear() * 100 + week

        const items = this.weeklySelection(seed, WEEKLY_COUNT)

        // Last week's selection -> the items that just rotated out (not in this week's set).
        const prevSeed = now.getUTCFullYear() * 100 + (week - 1)
        const prevItems = this.weeklySelection(prevSeed, WEEKLY_COUNT)
        const current = new Set(items)
        const rotatedOut = prevItems.filter(id => !current.has(id)).slice(0, 12)

        // Seconds until next Monday 00:00 UTC (next rotation).
        const day = now.getUTCDay()
        const daysUntilMon = ((8 - day) % 7) || 7
        const nextMon = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilMon))

        user.send('daily_catalog', {
            shop: 'clothing',
            cadence: 'weekly',
            date: now.toISOString().slice(0, 10),
            week: week,
            items: items,
            classics: classics,
            rotatedOut: rotatedOut,
            secondsUntilNext: Math.floor((nextMon - now) / 1000)
        })
    }

}
