import GamePlugin from '@plugin/GamePlugin'


const tourItem = 428
const tourPostcard = 126
const agentItem = 800
const agentPostcard = 127

// Exclusive teal colour (item id 17) reserved for a single account. Gated server-side so a
// hacked client cannot buy or equip it. RESERVED_COLOR_USER is Vivi (user id 5).
const RESERVED_COLOR_ITEM = 17
const RESERVED_COLOR_USER = 5  // Vivi

export default class Item extends GamePlugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'update_player': this.updatePlayer,
            'add_item': this.addItem,
            'remove_item': this.removeItem
        }

        this.items = this.crumbs.items
    }

    updatePlayer(args, user) {
        // Only the reserved owner may equip the exclusive colour.
        if (args.item === RESERVED_COLOR_ITEM && user.id !== RESERVED_COLOR_USER) {
            return
        }

        const item = this.items[args.item]

        if (!item || item.type === 10 || !user.inventory.includes(args.item)) {
            return
        }

        const slot = this.db.slots[item.type - 1]
        if (slot === 'hand') {
            user.stopWalkingPet()
        }

        user.setItem(slot, args.item)
    }

    addItem(args, user) {
        // The reserved colour can't be acquired by anyone but its owner.
        if (args.item === RESERVED_COLOR_ITEM && user.id !== RESERVED_COLOR_USER) {
            return
        }

        const item = user.validatePurchase.item(args.item)

        if (!item) {
            return
        }

        const slot = this.db.slots[item.type - 1]
        user.inventory.add(args.item)

        if (args.item === tourItem) {
            user.addSystemMail(tourPostcard)
        }

        if (args.item === agentItem) {
            user.addSystemMail(agentPostcard)
        }

        user.updateCoins(-item.cost)
        user.send('add_item', { item: args.item, name: item.name, slot: slot, coins: user.coins })
    }

    removeItem(args, user) {
        if (!this.db.slots.includes(args.type)) {
            return
        }

        if (args.type === 'hand') {
            user.stopWalkingPet()
        }

        user.setItem(args.type, 0)
    }

}
