import GamePlugin from '@plugin/GamePlugin'

import stamps from '@data/stamps.json'


// Stamps network surface. Awarding is server-decided and lives on user.stamps.award(id), called from
// validated game/room triggers (MiniGame.gameOver, CardInstance, Economy.recycle, GameUser.joinRoom);
// the client never asks for a stamp. This plugin just serves the stamp book (definitions + the user's
// owned set) on request.

export default class Stamp extends GamePlugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'get_stamps': this.getStamps
        }
    }

    getStamps(args, user) {
        if (!user.stamps) {
            return
        }

        user.send('stamps', { definitions: stamps, owned: user.stamps.toClient() })
    }

}
