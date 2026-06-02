import Collection from '../Collection'

import { SKILLS, MAX_XP, levelForXp, xpToNext, progressForXp } from '@utils/skills'


export default class SkillCollection extends Collection {

    constructor(user, models) {
        super(user, models, 'userSkills', 'skill')
    }

    getXp(skill) {
        let record = this.get(skill)
        return record ? record.xp : 0
    }

    getLevel(skill) {
        return levelForXp(this.getXp(skill))
    }

    totalLevel() {
        return SKILLS.reduce((sum, skill) => sum + this.getLevel(skill), 0)
    }

    // Add xp to a skill (creating the row if needed). Returns a result describing any level-up.
    async addXp(skill, amount) {
        if (!SKILLS.includes(skill) || !amount || amount <= 0) {
            return null
        }

        let record = this.get(skill)
        let oldXp = record ? record.xp : 0
        let oldLevel = levelForXp(oldXp)
        let newXp = Math.min(oldXp + Math.floor(amount), MAX_XP)

        try {
            if (record) {
                record.xp = newXp
                await record.save()
            } else {
                record = await this.model.create({ userId: this.user.id, skill: skill, xp: newXp })
                this.addModel(record)
            }
        } catch (error) {
            this.handler.error(error)
            return null
        }

        let newLevel = levelForXp(newXp)

        return { skill, xp: newXp, level: newLevel, oldLevel, leveledUp: newLevel > oldLevel, gained: newXp - oldXp }
    }

    // Shape sent to the client (every skill, even at 0).
    toClient() {
        let out = {}
        for (let skill of SKILLS) {
            let xp = this.getXp(skill)
            out[skill] = { xp, level: levelForXp(xp), toNext: xpToNext(xp), progress: progressForXp(xp) }
        }
        return out
    }

}
