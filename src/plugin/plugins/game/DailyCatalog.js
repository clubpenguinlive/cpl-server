import GamePlugin from '@plugin/GamePlugin'

import pool from '@data/catalog_pool.json'
import classics from '@data/catalog_classics.json'
import sportPool from '@data/catalog_sport_pool.json'


// Penguin Style monthly catalog: 40 items rotate on the 1st of each month.
// Seed: year * 12 + month -- deterministic per calendar month, reproducible across servers.
// Selection is rarity-weighted (cheaper items appear more often; expensive items are the monthly
// chase). 3 secret items per month are picked from the remaining pool after the main selection
// and shown as mystery cards in the catalog -- revealed by clicking.

const MONTHLY_COUNT = 40
const SECRETS_COUNT = 3
const SPORT_COUNT = 15

function mulberry32(seed) {
    return function () {
        seed |= 0
        seed = (seed + 0x6D2B79F5) | 0
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

export default class DailyCatalog extends GamePlugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'get_daily_catalog': this.getCatalog
        }
    }

    weightFor(id) {
        const item = this.crumbs.items[id]
        const cost = (item && item.cost) || 100
        return 1 / Math.sqrt(Math.max(cost, 50))
    }

    // Weighted selection without replacement. Returns picked items and the leftover pool.
    pick(seedValue, count, source = pool) {
        const rand = mulberry32(seedValue)
        const remaining = source.slice()
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
        return { picked, remaining }
    }

    // Uniform Fisher-Yates shuffle of the leftover pool, returns first N as secrets.
    pickSecrets(remaining, seedValue, count) {
        const rand = mulberry32(seedValue ^ 0xA5A5A5A5)
        const arr = remaining.slice()
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(rand() * (i + 1))
            ;[arr[i], arr[j]] = [arr[j], arr[i]]
        }
        return arr.slice(0, count)
    }

    getCatalog(args, user) {
        const now = new Date()
        const year = now.getUTCFullYear()
        const month = now.getUTCMonth() + 1
        const seed = year * 12 + month
        const nextMonth = new Date(Date.UTC(year, now.getUTCMonth() + 1, 1))
        const secondsUntilNext = Math.floor((nextMonth - now) / 1000)

        if (args.shop === 'sport') {
            const { picked: items } = this.pick(seed ^ 0xB00B, SPORT_COUNT, sportPool)
            user.send('daily_catalog', {
                shop: 'sport',
                cadence: 'monthly',
                date: now.toISOString().slice(0, 10),
                month,
                year,
                items,
                secrets: [],
                classics: [],
                rotatedOut: [],
                secondsUntilNext
            })
            return
        }

        const { picked: items, remaining } = this.pick(seed, MONTHLY_COUNT)
        const secrets = this.pickSecrets(remaining, seed, SECRETS_COUNT)

        const prevMonth = month === 1 ? 12 : month - 1
        const prevYear = month === 1 ? year - 1 : year
        const { picked: prevItems } = this.pick(prevYear * 12 + prevMonth, MONTHLY_COUNT)
        const currentSet = new Set(items)
        const rotatedOut = prevItems.filter(id => !currentSet.has(id)).slice(0, 12)

        user.send('daily_catalog', {
            shop: 'clothing',
            cadence: 'monthly',
            date: now.toISOString().slice(0, 10),
            month,
            year,
            items,
            secrets,
            classics,
            rotatedOut,
            secondsUntilNext
        })
    }

}
