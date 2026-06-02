import Collection from '../Collection'


export default class ResourceCollection extends Collection {

    constructor(user, models) {
        super(user, models, 'userResources', 'itemType')
    }

    getQuantity(itemType) {
        let record = this.get(itemType)
        return record ? record.quantity : 0
    }

    // Add (or remove, with a negative amount) a quantity of a resource. Never goes below 0.
    async addQuantity(itemType, amount) {
        if (typeof itemType !== 'string' || !Number.isInteger(amount) || amount === 0) {
            return this.getQuantity(itemType)
        }

        let record = this.get(itemType)
        let newQty = Math.max(0, (record ? record.quantity : 0) + amount)

        try {
            if (record) {
                record.quantity = newQty
                await record.save()
            } else if (newQty > 0) {
                record = await this.model.create({ userId: this.user.id, itemType: itemType, quantity: newQty })
                this.addModel(record)
            }
        } catch (error) {
            this.handler.error(error)
        }

        return newQty
    }

    toClient() {
        let out = {}
        for (let key of this.keys) {
            out[key] = this.collection[key].quantity
        }
        return out
    }

}
