import GamePlugin from '@plugin/GamePlugin'


const XP_PER_ACT = 15
const MAX_ACTS_PER_SESSION = 20
const ACT_COOLDOWN_MS = 8000

export default class Performing extends GamePlugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'perform_act': this.performAct
        }
    }

    async performAct(args, user) {
        const now = Date.now()

        // Per-session act count cap (prevents infinite XP from repeated clicks).
        const acts = (user._performActs || 0)
        if (acts >= MAX_ACTS_PER_SESSION) return

        // Per-act cooldown (prevents burst-clicking a single switchbox).
        const lastAct = user._lastPerformAct || 0
        if (now - lastAct < ACT_COOLDOWN_MS) return

        user._performActs = acts + 1
        user._lastPerformAct = now

        try {
            const result = await user.skills.addXp('performing', XP_PER_ACT)
            if (result && result.leveledUp) {
                user.room && user.room.send(user, 'send_message',
                    { id: user.id, message: `reached Performing level ${result.level}!` }, [], false)
            }
            user.send('perform_act_result', {
                xp: XP_PER_ACT,
                performing: { xp: result.xp, level: result.level }
            })
            if (user.challenges) {
                user.challenges.track('skill:performing:xp', XP_PER_ACT).catch(error => this.handler.error(error))
            }
        } catch (error) {
            this.handler.error(error)
        }
    }

}
