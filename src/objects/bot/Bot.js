// Virtual NPC penguin. Appears to real players through the room's add_player / send_position /
// send_message broadcasts, but has no real socket connection (send() is a no-op so the room's
// broadcast loop can safely iterate it as a recipient).
let nextBotId = 90001

export default class Bot {

    constructor(preset) {
        this.id = nextBotId++
        this.username = preset.name
        this.color = preset.color || 1
        this.head = preset.head || 0
        this.face = preset.face || 0
        this.neck = preset.neck || 0
        this.body = preset.body || 0
        this.hand = preset.hand || 0
        this.feet = preset.feet || 0
        this.photo = 0
        this.flag = preset.flag || 0
        this.joinTime = new Date()
        this.x = 760
        this.y = 480
        this.frame = 1

        this.isBot = true
        this.role = preset.role || 'wanderer'
        this.phrases = preset.phrases || []
        this.homeRoom = preset.room

        // Room.add()/Room.send() key and iterate users by socket.id and check .ignores
        this.socket = { id: `bot-${this.id}` }
        this.ignores = []
        this.buddies = []
        this.room = null
    }

    // No connection: swallow anything the room tries to send this bot.
    send() {}

    toJSON() {
        return {
            id: this.id,
            username: this.username,
            joinTime: this.joinTime,
            head: this.head,
            face: this.face,
            neck: this.neck,
            body: this.body,
            hand: this.hand,
            feet: this.feet,
            color: this.color,
            photo: this.photo,
            flag: this.flag,
            x: this.x,
            y: this.y,
            frame: this.frame
        }
    }

}
