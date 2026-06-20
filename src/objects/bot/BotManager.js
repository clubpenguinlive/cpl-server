import Bot from './Bot'

// Preset NPCs (rooms must be valid non-game room ids from data/rooms.json).
// Outfits use item ids verified to have worn paper art on disk; slots: head/face/neck/body/hand/feet.
//
// Mascot visits: set MASCOT_VISITS env var (JSON array) to schedule temporary room appearances:
//   [{"mascot":"Rockhopper","room":100,"start":"2026-06-21T18:00:00Z","end":"2026-06-21T20:00:00Z"}]
// The bot moves from its home room to the visit room at start, back at end.
const PRESETS = [
    { name: 'Aunt Arctic',  color: 1,  room: 110, role: 'quest_giver', face: 113, neck: 175, body: 224, feet: 365, phrases: ['Have you read the latest paper?', "I'm working on a big story!", 'Knowledge is power!'] },
    { name: 'Gary',         color: 12, room: 803, role: 'quest_giver', head: 115, neck: 176, body: 769, feet: 352, phrases: ['Fascinating!', 'My latest invention is almost ready!', 'For science!'] },
    { name: 'Cadence',      color: 9,  room: 120, role: 'wanderer',    head: 481, body: 773, hand: 233, feet: 386, phrases: ["Let's dance!", 'Feel the beat!', "You've got the moves!"] },
    { name: 'Rockhopper',   color: 6,  room: 800, role: 'shopkeeper',  face: 110, neck: 162, body: 231, feet: 374, phrases: ['Arrr!', 'Yarr, welcome aboard!', 'Yo ho ho!'] },
    { name: 'Franky',       color: 4,  room: 100, role: 'wanderer',    head: 407, body: 773, hand: 338, feet: 357, phrases: ['Hey there!', 'Nice day for a waddle!', 'Rock on!'] },
    { name: 'G Billy',      color: 2,  room: 230, role: 'wanderer',    head: 405, body: 223, hand: 234, feet: 372, phrases: ['Howdy!', 'Sledding is the best!'] },
    { name: 'Petey K',      color: 11, room: 120, role: 'wanderer',    head: 1069, body: 221, hand: 731, feet: 387, phrases: ['Tune in!', 'Music Jam soon!'] },
    { name: 'Stompin Bob',  color: 8,  room: 300, role: 'wanderer',    head: 402, body: 222, hand: 730, feet: 352, phrases: ['Whoa!', 'Plaza party!'] },
    { name: 'Sensei',       color: 14, room: 320, role: 'trainer',     face: 104, neck: 162, body: 221, feet: 380, phrases: ['Patience, young one.', 'Card-Jitsu awaits.', 'Hmmm.'] },
    { name: 'Dot',          color: 13, room: 300, role: 'wanderer',    face: 101, neck: 303, body: 221, feet: 352, phrases: ['Stay sharp!', 'I blend in anywhere.'] },
    { name: 'Jet Pack Guy', color: 5,  room: 803, role: 'wanderer',    head: 441, face: 125, body: 285, feet: 372, phrases: ['Mission ready.', 'Always alert.'] },
    { name: 'PH',           color: 3,  room: 310, role: 'shopkeeper',  head: 446, neck: 189, body: 265, feet: 373, phrases: ['Puffles need love!', 'Adopt a puffle today!'] },
    { name: 'Herbert',      color: 7,  room: 806, role: 'wanderer',    head: 429, body: 223, feet: 372, phrases: ["It's so cold!", 'One day this island will be mine!'] },
    { name: 'Rookie',       color: 6,  room: 100, role: 'wanderer',    head: 413, face: 112, body: 222, feet: 386, phrases: ['Hiya!', 'Did I do that right?'] },
    { name: 'Cara',         color: 15, room: 130, role: 'wanderer',    head: 410, face: 117, neck: 315, body: 780, feet: 386, phrases: ['Love the new styles!', 'So many outfits!'] }
]

export default class BotManager {

    constructor(handler) {
        this.handler = handler
        this.bots = []
        this.timers = []
    }

    start() {
        let count = (this.handler.config.bots && this.handler.config.bots.count) || PRESETS.length

        for (let preset of PRESETS.slice(0, count)) {
            try {
                let room = this.handler.rooms[preset.room]
                if (!room || room.game) {
                    continue
                }

                let bot = new Bot(preset)
                bot.x = this.randX()
                bot.y = this.randY()
                bot.room = room
                room.add(bot)

                this.bots.push(bot)
                this.scheduleBehavior(bot)
            } catch (error) {
                console.log(`[BotManager] spawn failed for ${preset.name}: ${error}`)
            }
        }

        console.log(`[BotManager] spawned ${this.bots.length} NPCs`)
        this.scheduleVisits()
    }

    scheduleVisits() {
        const visits = (this.handler.config.mascotVisits) || []
        if (!visits.length) return

        const now = Date.now()

        for (const visit of visits) {
            const bot = this.bots.find(b => b.username === visit.mascot)
            if (!bot) {
                console.log(`[BotManager] visit skipped: no bot named "${visit.mascot}"`)
                continue
            }

            const visitRoom = this.handler.rooms[visit.room]
            if (!visitRoom || visitRoom.game) {
                console.log(`[BotManager] visit skipped: invalid room ${visit.room} for ${visit.mascot}`)
                continue
            }

            const startMs = new Date(visit.start).getTime()
            const endMs   = new Date(visit.end).getTime()

            if (endMs <= now) {
                continue
            }

            if (startMs > now) {
                const delay = startMs - now
                console.log(`[BotManager] ${visit.mascot} visit to room ${visit.room} in ${Math.round(delay / 60000)}m`)
                this.timers.push(setTimeout(() => this.beginVisit(bot, visitRoom), delay))
            } else {
                // Visit already started but hasn't ended — move in immediately.
                this.beginVisit(bot, visitRoom)
            }

            const returnDelay = endMs - now
            this.timers.push(setTimeout(() => this.endVisit(bot), returnDelay))
        }
    }

    beginVisit(bot, visitRoom) {
        if (bot.room) {
            bot.room.remove(bot)
        }
        bot.x = this.randX()
        bot.y = this.randY()
        bot.room = visitRoom
        visitRoom.add(bot)
        visitRoom.send(bot, 'send_message', { id: bot.id, message: `${bot.username} has arrived!` })
        console.log(`[BotManager] ${bot.username} visiting room ${visitRoom.id}`)
    }

    endVisit(bot) {
        if (bot.room) {
            bot.room.remove(bot)
        }
        const homeRoom = this.handler.rooms[bot.homeRoom]
        if (homeRoom && !homeRoom.game) {
            bot.x = this.randX()
            bot.y = this.randY()
            bot.room = homeRoom
            homeRoom.add(bot)
        } else {
            bot.room = null
        }
        console.log(`[BotManager] ${bot.username} returned home`)
    }

    scheduleBehavior(bot) {
        let loop = () => {
            try {
                this.act(bot)
            } catch (error) {
                // A bot must never crash the world loop.
            }
            this.timers.push(setTimeout(loop, 20000 + Math.floor(Math.random() * 80000)))
        }
        this.timers.push(setTimeout(loop, 4000 + Math.floor(Math.random() * 20000)))
    }

    act(bot) {
        let room = bot.room
        if (!room) {
            return
        }

        if (Math.random() < 0.55) {
            // wander to a new spot in the room
            bot.x = this.randX()
            bot.y = this.randY()
            bot.frame = 1
            room.send(bot, 'send_position', { id: bot.id, x: bot.x, y: bot.y })
        } else if (bot.phrases.length) {
            // say something from the phrase pool
            let message = bot.phrases[Math.floor(Math.random() * bot.phrases.length)]
            room.send(bot, 'send_message', { id: bot.id, message: message })
        }
    }

    // Central walkable band that is safe across most rooms (1520x960 stage).
    randX() { return 470 + Math.floor(Math.random() * 580) }
    randY() { return 430 + Math.floor(Math.random() * 300) }

}
