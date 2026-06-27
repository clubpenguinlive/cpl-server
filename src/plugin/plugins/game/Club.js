import GamePlugin from '@plugin/GamePlugin'

import { hasProps, isNumber } from '@utils/validation'


const CREATE_COST = 500
const MAX_MEMBERS = 30
const TAG_REGEX = /^[A-Z0-9]{2,4}$/
const NAME_REGEX = /^[a-zA-Z0-9 ]{2,32}$/


export default class Club extends GamePlugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'create_club': this.createClub,
            'join_club': this.joinClub,
            'leave_club': this.leaveClub,
            'club_info': this.clubInfo
        }
    }

    async createClub(args, user) {
        if (!hasProps(args, 'name', 'tag')) return
        if (user.club) {
            return user.send('error', { error: 'You are already in a club. Leave it first.' })
        }

        const name = String(args.name).trim()
        const tag = String(args.tag).trim().toUpperCase()

        if (!NAME_REGEX.test(name)) {
            return user.send('error', { error: 'Club name must be 2-32 letters, numbers, or spaces.' })
        }
        if (!TAG_REGEX.test(tag)) {
            return user.send('error', { error: 'Club tag must be 2-4 uppercase letters or numbers.' })
        }
        if (user.coins < CREATE_COST) {
            return user.send('error', { error: `Creating a club costs ${CREATE_COST} coins.` })
        }

        try {
            const club = await this.db.clubs.create({ name, tag, leaderId: user.id, xp: 0 })
            await this.db.clubMembers.create({ clubId: club.id, userId: user.id, role: 'leader' })

            user.updateCoins(-CREATE_COST)
            user.club = { id: club.id, name: club.name, tag: club.tag, xp: 0, role: 'leader' }

            user.send('club_created', { club: user.club, coins: user.coins })
            this.broadcastClubUpdate(user)

        } catch (err) {
            if (err.name === 'SequelizeUniqueConstraintError') {
                user.send('error', { error: 'That club name or tag is already taken.' })
            } else {
                this.handler.error(err)
            }
        }
    }

    async joinClub(args, user) {
        if (!hasProps(args, 'clubId')) return
        if (!isNumber(args.clubId)) return
        if (user.club) {
            return user.send('error', { error: 'You are already in a club. Leave it first.' })
        }

        const club = await this.db.getClubInfo(args.clubId)
        if (!club) return user.send('error', { error: 'Club not found.' })
        if (club.members.length >= MAX_MEMBERS) {
            return user.send('error', { error: 'This club is full.' })
        }

        await this.db.clubMembers.create({ clubId: club.id, userId: user.id, role: 'member' })
        user.club = { id: club.id, name: club.name, tag: club.tag, xp: club.xp, role: 'member' }

        user.send('club_joined', { club: user.club })
        this.broadcastClubUpdate(user)
    }

    async leaveClub(args, user) {
        if (!user.club) return

        const clubId = user.club.id

        await this.db.clubMembers.destroy({ where: { clubId, userId: user.id } })

        if (user.club.role === 'leader') {
            // Promote next member or disband
            const next = await this.db.clubMembers.findOne({
                where: { clubId },
                order: [['role', 'ASC'], ['joinedAt', 'ASC']]
            })
            if (next) {
                await this.db.clubMembers.update({ role: 'leader' }, { where: { clubId, userId: next.userId } })
                await this.db.clubs.update({ leaderId: next.userId }, { where: { id: clubId } })
            } else {
                await this.db.clubs.destroy({ where: { id: clubId } })
            }
        }

        user.club = null
        user.send('club_left', {})
        this.broadcastClubUpdate(user)
    }

    async clubInfo(args, user) {
        if (!hasProps(args, 'clubId')) return
        if (!isNumber(args.clubId)) return

        const club = await this.db.getClubInfo(args.clubId)
        if (!club) return

        user.send('club_info', {
            id: club.id,
            name: club.name,
            tag: club.tag,
            xp: club.xp,
            memberCount: club.members.length,
            members: club.members.map(m => ({ userId: m.userId, role: m.role }))
        })
    }

    broadcastClubUpdate(user) {
        if (user.room) {
            user.room.send(user, 'club_update', { id: user.id, club: user.club ? { tag: user.club.tag, name: user.club.name } : null })
        }
    }

}
