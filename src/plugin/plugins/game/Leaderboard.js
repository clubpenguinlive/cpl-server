import GamePlugin from '@plugin/GamePlugin'
import { QueryTypes } from 'sequelize'


const CACHE_TTL = 5 * 60 * 1000

const VALID_CATEGORIES = new Set(['stamps', 'total_xp', 'fishing', 'mining', 'surfing', 'hauling', 'sledding'])

export default class Leaderboard extends GamePlugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'get_leaderboard': this.getLeaderboard
        }

        this._cache = {}
    }

    async getLeaderboard(args, user) {
        const category = args.category
        if (!category || !VALID_CATEGORIES.has(category)) return

        const now = Date.now()
        const cached = this._cache[category]
        if (cached && now - cached.time < CACHE_TTL) {
            return user.send('leaderboard', { category, rows: cached.rows })
        }

        try {
            const rows = await this.fetchRows(category)
            this._cache[category] = { time: now, rows }
            user.send('leaderboard', { category, rows })
        } catch (error) {
            this.handler.error(error)
        }
    }

    async fetchRows(category) {
        const seq = this.db.sequelize

        if (category === 'stamps') {
            return seq.query(
                `SELECT u.id, u.username, u.color, COUNT(s.stamp) AS value
                 FROM users u
                 LEFT JOIN user_stamps s ON s.userId = u.id
                 GROUP BY u.id, u.username, u.color
                 ORDER BY value DESC LIMIT 50`,
                { type: QueryTypes.SELECT }
            )
        }

        if (category === 'total_xp') {
            return seq.query(
                `SELECT u.id, u.username, u.color, COALESCE(SUM(s.xp), 0) AS value
                 FROM users u
                 INNER JOIN user_skills s ON s.userId = u.id
                 GROUP BY u.id, u.username, u.color
                 HAVING value > 0
                 ORDER BY value DESC LIMIT 50`,
                { type: QueryTypes.SELECT }
            )
        }

        return seq.query(
            `SELECT u.id, u.username, u.color, s.xp AS value
             FROM users u
             INNER JOIN user_skills s ON s.userId = u.id AND s.skill = :skill
             ORDER BY s.xp DESC LIMIT 50`,
            { type: QueryTypes.SELECT, replacements: { skill: category } }
        )
    }

}
