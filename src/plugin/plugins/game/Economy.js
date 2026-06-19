import GamePlugin from '@plugin/GamePlugin'


// NPC shopkeeper resource economy: players sell resources gathered from skill minigames for
// coins (the sink that balances the gameOver coin/resource source). Prices are rarity-scaled and
// fixed SERVER-SIDE; quantity is validated against actual holdings so a client can't sell what it
// doesn't have or set its own price. (Which NPC buys what is a client-side affordance; the
// server simply trusts nothing and converts owned resources -> coins.)

const RESOURCE_PRICES = {
    cargo: 6,    // Hauling (Bean Counters)
    fish: 8,     // Fishing (Ice Fishing)
    ore: 10,     // Mining (Cart Surfer)
    shell: 12,   // Surfing (Catchin' Waves) - rarer
    pizza: 8     // Cooking (Pizzatron 3000)
}

// Recycling (Recycle Plant, room 816): a low-effort passive earn, so it pays a small flat amount per
// recycled eco-item, at/below the cheapest discrete payout in the game (Card-Jitsu's 5/loss), and is
// hard-capped per session SERVER-SIDE. The cap is the anti-cheat: a hacked client spamming `recycle`
// can mint at most RECYCLE_SESSION_CAP coins/session (well under a single minigame session ~800), so
// recycling can never out-earn the games. Amounts are interim/tunable.
const RECYCLE_REWARD = 3
const RECYCLE_SESSION_CAP = 150

export default class Economy extends GamePlugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'sell_resource': this.sellResource,
            'get_resources': this.getResources,
            'recycle': this.recycle
        }
    }

    recycle(args, user) {
        // Count every recycle (even past the coin cap) for recycling stamps (server-decided).
        user.recycleCount = (user.recycleCount || 0) + 1
        if (user.stamps) {
            if (user.recycleCount >= 10) user.stamps.award(20).catch(error => this.handler.error(error))
            if (user.recycleCount >= 25) user.stamps.award(29).catch(error => this.handler.error(error))
            if (user.recycleCount >= 50) user.stamps.award(32).catch(error => this.handler.error(error))
        }

        const earned = user.recycleEarned || 0
        if (earned >= RECYCLE_SESSION_CAP) {
            return
        }

        const reward = Math.min(RECYCLE_REWARD, RECYCLE_SESSION_CAP - earned)
        user.recycleEarned = earned + reward
        user.updateCoins(reward)

        user.send('recycle_reward', {
            coins: reward,
            total: user.coins,
            capped: user.recycleEarned >= RECYCLE_SESSION_CAP
        })
    }

    getResources(args, user) {
        user.send('resources', { resources: user.resources.toClient(), prices: RESOURCE_PRICES })
    }

    async sellResource(args, user) {
        const resource = args.resource
        const price = RESOURCE_PRICES[resource]

        let quantity = parseInt(args.quantity)
        if (!price || isNaN(quantity) || quantity <= 0) {
            return
        }

        // Server-validated: never sell more than the player actually holds.
        const have = user.resources.getQuantity(resource)
        quantity = Math.min(quantity, have)
        if (quantity <= 0) {
            return
        }

        await user.resources.addQuantity(resource, -quantity)
        const coins = quantity * price
        user.updateCoins(coins)

        if (user.stamps) {
            user.sellCount = (user.sellCount || 0) + 1
            if (user.sellCount >= 1)  user.stamps.award(33).catch(error => this.handler.error(error))
            if (user.sellCount >= 10) user.stamps.award(34).catch(error => this.handler.error(error))
        }

        user.send('resource_sold', {
            resource: resource,
            quantity: quantity,
            coins: coins,
            total: user.coins,
            remaining: user.resources.getQuantity(resource)
        })
    }

}
