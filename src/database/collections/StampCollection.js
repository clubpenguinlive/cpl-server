import Collection from '../Collection'

import stamps from '@data/stamps.json'


// The user's earned stamps (user_stamps rows, keyed by stamp id). Awarding is ALWAYS server-decided
// (a trigger calls award(id) from a validated event); the client never asks for a stamp. Mirrors
// SkillCollection. Idempotent + id-validated against the definitions (anti-cheat).

export default class StampCollection extends Collection {

    constructor(user, models) {
        super(user, models, 'userStamps', 'stamp')
    }

    has(id) {
        return this.includes(id)
    }

    // Grant a stamp if not already owned and the id is a real definition. Returns true if newly earned.
    async award(id) {
        id = parseInt(id)

        if (this.has(id) || !stamps[id]) {
            return false
        }

        try {
            const record = await this.model.create({ userId: this.user.id, stamp: id, recv: new Date() })
            this.addModel(record)
        } catch (error) {
            this.handler.error(error)
            return false
        }

        this.user.send('stamp_earned', { stamp: id })
        return true
    }

    // Owned stamp ids (the client renders the book from the definitions + this set).
    toClient() {
        return this.keys.map(k => parseInt(k))
    }

}
