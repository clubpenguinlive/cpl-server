import Bot from './Bot'

// Preset NPCs (rooms must be valid non-game room ids from data/rooms.json).
const PRESETS = [
    { name: 'Aunt Arctic',  color: 1,  room: 110, role: 'quest_giver', phrases: ['Have you read the latest paper?', "I'm working on a big story!", 'Knowledge is power!'] },
    { name: 'Gary',         color: 12, room: 803, role: 'quest_giver', phrases: ['Fascinating!', 'My latest invention is almost ready!', 'For science!'] },
    { name: 'Cadence',      color: 9,  room: 120, role: 'wanderer',    phrases: ["Let's dance!", 'Feel the beat!', "You've got the moves!"] },
    { name: 'Rockhopper',   color: 6,  room: 800, role: 'shopkeeper',  phrases: ['Arrr!', 'Yarr, welcome aboard!', 'Yo ho ho!'] },
    { name: 'Franky',       color: 4,  room: 100, role: 'wanderer',    phrases: ['Hey there!', 'Nice day for a waddle!', 'Rock on!'] },
    { name: 'G Billy',      color: 2,  room: 230, role: 'wanderer',    phrases: ['Howdy!', 'Sledding is the best!'] },
    { name: 'Petey K',      color: 11, room: 120, role: 'wanderer',    phrases: ['Tune in!', 'Music Jam soon!'] },
    { name: 'Stompin Bob',  color: 8,  room: 300, role: 'wanderer',    phrases: ['Whoa!', 'Plaza party!'] },
    { name: 'Sensei',       color: 14, room: 320, role: 'trainer',     phrases: ['Patience, young one.', 'Card-Jitsu awaits.', 'Hmmm.'] },
    { name: 'Dot',          color: 13, room: 300, role: 'wanderer',    phrases: ['Stay sharp!', 'I blend in anywhere.'] },
    { name: 'Jet Pack Guy', color: 5,  room: 803, role: 'wanderer',    phrases: ['Mission ready.', 'Always alert.'] },
    { name: 'PH',           color: 3,  room: 310, role: 'shopkeeper',  phrases: ['Puffles need love!', 'Adopt a puffle today!'] },
    { name: 'Herbert',      color: 7,  room: 806, role: 'wanderer',    phrases: ["It's so cold!", 'One day this island will be mine!'] },
    { name: 'Rookie',       color: 6,  room: 100, role: 'wanderer',    phrases: ['Hiya!', 'Did I do that right?'] },
    { name: 'Cara',         color: 15, room: 130, role: 'wanderer',    phrases: ['Love the new styles!', 'So many outfits!'] }
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
