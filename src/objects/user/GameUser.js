import User from './User'

import pick from '@utils/pick'
import { isInRange } from '@utils/validation'

import BuddyCollection from '@database/collections/BuddyCollection'
import CardCollection from '@database/collections/CardCollection'
import FurnitureCollection from '@database/collections/FurnitureCollection'
import IglooCollection from '@database/collections/IglooCollection'
import IgnoreCollection from '@database/collections/IgnoreCollection'
import InventoryCollection from '@database/collections/InventoryCollection'
import PetCollection from '@database/collections/PetCollection'
import PostcardCollection from '@database/collections/PostcardCollection'
import SkillCollection from '@database/collections/SkillCollection'
import ResourceCollection from '@database/collections/ResourceCollection'
import ChallengeCollection from '@database/collections/ChallengeCollection'
import StampCollection from '@database/collections/StampCollection'

import PurchaseValidator from './purchase/PurchaseValidator'

import EventEmitter from 'events'
import { Op } from 'sequelize'


export default class GameUser extends User {

    constructor(server, socket) {
        super(server, socket)

        this.crumbs = this.handler.crumbs

        this.gameAuthSent = false
        this.authenticated = false
        this.joinedServer = false
        this.token = {}

        this.room
        this.waddle
        this.minigameRoom

        this.x
        this.y
        this.frame

        this.buddyRequests = []

        this.walkingPet = null

        // Club membership: { id, name, tag, xp, role } or null (set in load())
        this.club = null

        // Per-session recycling counters (Recycle Plant): earned coins (capped) + recycle count (stamp).
        this.recycleEarned = 0
        this.recycleCount = 0

        this.validatePurchase = new PurchaseValidator(this)

        // Used for dynamic/temporary events
        this.events = new EventEmitter({ captureRejections: true })

        this.events.on('error', (error) => {
            this.handler.error(error)
        })
    }

    inOwnIgloo() {
        return this.room?.isIgloo && this.room?.userId === this.id
    }

    setItem(slot, item) {
        if (this[slot] == item) {
            return
        }

        this.update({ [slot]: item })
        this.sendUpdatePlayer(slot, item)
    }

    sendUpdatePlayer(slot, item) {
        this.room.send(this, 'update_player', { id: this.id, item: item, slot: slot }, [])
    }

    joinRoom(room, x = 0, y = 0) {
        if (!room || room === this.room || this.minigameRoom || this.waddle) {
            return
        }

        if (room.isFull && !this.isModerator) {
            return this.send('error', { error: 'Sorry this room is currently full' })
        }

        if (!isInRange(x, 0, 1520)) {
            x = 0
        }

        if (!isInRange(y, 0, 960)) {
            y = 0
        }

        if (this.room) {
            this.room.remove(this)
        }

        this.room = room
        this.x = x
        this.y = y
        this.frame = 1

        this.room.add(this)

        // First-visit discovery stamps (server-decided, idempotent).
        const ROOM_STAMPS = {
            100: 35, 110: 36, 111: 37, 120: 38, 121: 39, 130: 40,
            200: 41, 210: 42, 220: 43, 221: 44, 230: 45,
            300: 46, 310: 47, 320: 48, 321: 49, 330: 50, 340: 51,
            400: 52, 410: 53, 420: 54, 421: 55, 422: 56, 430: 57,
            800: 58, 801: 59, 802: 60, 803: 61, 805: 62, 806: 63,
            807: 64, 809: 65, 810: 66, 811: 67, 812: 68,
            814: 30, 815: 31, 816: 69, 850: 70
        }
        if (this.stamps && ROOM_STAMPS[room.id]) {
            this.stamps.award(ROOM_STAMPS[room.id]).catch(error => this.handler.error(error))
        }

        // Session: track unique rooms visited for multi-room stamps.
        if (this.stamps) {
            if (!this._visitedRooms) this._visitedRooms = new Set()
            this._visitedRooms.add(room.id)
            const count = this._visitedRooms.size
            if (count >= 10) this.stamps.award(71).catch(error => this.handler.error(error))
            if (count >= 20) this.stamps.award(72).catch(error => this.handler.error(error))
        }

        // Mascot encounter stamps: entering a room with a named mascot bot awards the meet stamp.
        if (this.stamps) {
            const MASCOT_STAMPS = {
                'Aunt Arctic': 101, 'Gary': 102, 'Cadence': 103, 'Rockhopper': 104,
                'Franky': 105, 'G Billy': 106, 'Petey K': 107, 'Stompin Bob': 108,
                'Sensei': 109, 'Dot': 110, 'Jet Pack Guy': 111, 'PH': 112,
                'Herbert': 113, 'Rookie': 114, 'Cara': 115
            }
            for (const u of Object.values(room.users)) {
                if (u.isBot && MASCOT_STAMPS[u.username]) {
                    this.stamps.award(MASCOT_STAMPS[u.username]).catch(error => this.handler.error(error))
                }
            }
        }
    }

    joinTable(table) {
        if (table && !this.minigameRoom) {
            this.minigameRoom = table

            this.minigameRoom.add(this)
        }
    }

    addBuddy(id, username, requester = false) {
        this.buddies.add(id)

        let online = id in this.handler.usersById

        this.send('buddy_accept', { id: id, username: username, requester: requester, online: online })
    }

    removeBuddy(id) {
        this.buddies.remove(id)

        this.send('buddy_remove', { id: id })
    }

    clearBuddyRequest(id) {
        this.buddyRequests = this.buddyRequests.filter(request => request != id)
    }

    updateCoins(delta, gameOver = false) {
        const earned = parseInt(delta)

        if (!isNaN(earned)) {
            const newTotal = Math.max(Math.min(1000000000, this.coins + earned), 0)
            this.update({ coins: newTotal })

            // Contribute 1% of positive earnings to club XP (passive, no drain on personal coins)
            if (earned > 0 && this.club) {
                const xpGain = Math.max(1, Math.floor(earned * 0.01))
                this.db.clubs.increment('xp', { by: xpGain, where: { id: this.club.id } })
                this.club.xp += xpGain
            }
        }

        if (gameOver) {
            this.send('game_over', { coins: this.coins })
        }
    }

    async addSystemMail(postcardId, details = null) {
        const postcard = await this.postcards.add(null, postcardId, details)

        if (postcard) this.send('receive_mail', postcard)

        return postcard
    }

    async startWalkingPet(petId) {
        if (!this.pets.includes(petId)) return
        if (this.walkingPet) this.stopWalkingPet()

        const pet = this.pets.get(petId)

        if (pet.rest < 20 || pet.energy < 40) return

        pet.walking = true
        this.walkingPet = pet

        this.room.send(this, 'pet_start_walk', { userId: this.id, petId: pet.id }, [])

        // Remove current hand item
        await this.update({ hand: 0 })

        // Set hand item to pet without updating database
        const petItemId = pet.typeId + 750

        this.hand = petItemId
        this.sendUpdatePlayer('hand', petItemId)
    }

    stopWalkingPet() {
        if (this.walkingPet) {
            this.room.send(this, 'pet_stop_walk', { userId: this.id, petId: this.walkingPet.id }, [])

            this.walkingPet.walking = false
            this.walkingPet = null
        }
    }

    async load(username) {
        try {
            const user = await this.db.users.findOne({
                where: {
                    username
                },

                include: [
                    {
                        model: this.db.bans,
                        as: 'ban',
                        where: {
                            expires: {
                                [Op.gt]: Date.now()
                            }
                        },
                        required: false
                    },
                    {
                        model: this.db.buddies,
                        as: 'buddies',
                        include: {
                            model: this.db.users,
                            as: 'user',
                            attributes: ['username']
                        },
                        separate: true
                    },
                    {
                        model: this.db.ignores,
                        as: 'ignores',
                        include: {
                            model: this.db.users,
                            as: 'user',
                            attributes: ['username']
                        },
                        separate: true
                    },
                    {
                        model: this.db.inventories,
                        as: 'inventory',
                        attributes: ['itemId'],
                        separate: true
                    },
                    {
                        model: this.db.iglooInventories,
                        as: 'igloos',
                        attributes: ['iglooId'],
                        separate: true
                    },
                    {
                        model: this.db.furnitureInventories,
                        as: 'furniture',
                        separate: true
                    },
                    {
                        model: this.db.cards,
                        as: 'cards',
                        separate: true
                    },
                    {
                        model: this.db.postcards,
                        as: 'postcards',
                        include: {
                            model: this.db.users,
                            as: 'user',
                            attributes: ['username']
                        },
                        separate: true
                    },
                    {
                        model: this.db.pets,
                        as: 'pets',
                        separate: true
                    },
                    {
                        model: this.db.userSkills,
                        as: 'userSkills',
                        separate: true
                    },
                    {
                        model: this.db.userResources,
                        as: 'userResources',
                        separate: true
                    },
                    {
                        // Only TODAY's daily-challenge progress (the day's SET is date-derived, not stored).
                        model: this.db.userChallenges,
                        as: 'userChallenges',
                        where: { day: new Date().toISOString().slice(0, 10) },
                        required: false,
                        separate: true
                    },
                    {
                        model: this.db.userStamps,
                        as: 'userStamps',
                        separate: true
                    }
                ]
            })

            if (!user) {
                return false
            }

            Object.assign(this, user.get({ plain: true }))

            this.buddies = new BuddyCollection(this, user.buddies)
            this.ignores = new IgnoreCollection(this, user.ignores)
            this.inventory = new InventoryCollection(this, user.inventory)
            this.igloos = new IglooCollection(this, user.igloos)
            this.furniture = new FurnitureCollection(this, user.furniture)
            this.cards = new CardCollection(this, user.cards)
            this.postcards = new PostcardCollection(this, user.postcards)
            this.pets = new PetCollection(this, user.pets)
            this.skills = new SkillCollection(this, user.userSkills)
            this.resources = new ResourceCollection(this, user.userResources)
            this.challenges = new ChallengeCollection(this, user.userChallenges || [])
            this.stamps = new StampCollection(this, user.userStamps || [])

            this.club = await this.db.getUserClub(this.id)

            this.setPermissions()

            return true

        } catch (error) {
            this.handler.error(error)

            return false
        }
    }

    toJSON() {
        return {
            ...pick(this,
                'id',
                'username',
                'joinTime',
                'head',
                'face',
                'neck',
                'body',
                'hand',
                'feet',
                'color',
                'photo',
                'flag',
                'x',
                'y',
                'frame'
            ),
            club: this.club ? { tag: this.club.tag, name: this.club.name } : null
        }
    }

}
