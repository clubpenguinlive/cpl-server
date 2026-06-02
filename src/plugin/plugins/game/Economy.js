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
    shell: 12    // Surfing (Catchin' Waves) - rarer
}

export default class Economy extends GamePlugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'sell_resource': this.sellResource,
            'get_resources': this.getResources
        }
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

        user.send('resource_sold', {
            resource: resource,
            quantity: quantity,
            coins: coins,
            total: user.coins,
            remaining: user.resources.getQuantity(resource)
        })
    }

}
