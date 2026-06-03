import BaseInstance from '../BaseInstance'

import { hasProps, isInRange } from '@utils/validation'


export default class SledInstance extends BaseInstance {

    constructor(waddle) {
        super(waddle)

        this.id = 999

        // Placement payout (coins) routed through the Sledding economy below. Mirrors
        // GAME_ECONOMY[999] (skill 'sledding', maxCoins 800). Solo = always 1st = 120.
        this.payouts = [120, 90, 60, 40]
    }

    addListeners(user) {
        super.addListeners(user)
    }

    removeListeners(user) {
        super.removeListeners(user)
    }

    start() {
        const users = this.users.map(user => {
            return {
                username: user.username,
                color: user.color,
                hand: user.hand
            }
        })

        this.send('start_game', { users: users })

        super.start()
    }

    sendMove(args, user) {
        if (!hasProps(args, 'move')) {
            return
        }

        if (!isInRange(args.move, 1, 5)) {
            return
        }

        if (args.move === 5) {
            return this.sendGameOver(user)
        }

        this.send('send_move', { id: this.getSeat(user), move: args.move }, user)
    }

    sendGameOver(user) {
        this.remove(user)

        // SERVER-AUTHORITATIVE Sledding payout: placement coins, capped + level-multiplied, with
        // Sledding XP. (Sledding has no gathered resource.) Keeps the native Sled Racing on the same
        // economy as the other minigames; never trusts a client-reported amount.
        const payout = this.payouts.length ? this.payouts.shift() : 40
        const maxCoins = 800
        const base = Math.min(payout, maxCoins)

        const level = user.skills.getLevel('sledding')
        const coins = Math.floor(base * (1 + Math.min(level, 99) * 0.01))

        user.updateCoins(coins, true)

        if (base > 0) {
            user.skills.addXp('sledding', base * 2)
                .then(result => {
                    if (result && result.leveledUp && user.room) {
                        user.room.send(user, 'send_message',
                            { id: user.id, message: `reached Sledding level ${result.level}!` }, [], false)
                    }
                })
                .catch(() => {})
        }
    }

}
