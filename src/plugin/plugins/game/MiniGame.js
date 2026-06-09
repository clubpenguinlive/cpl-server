import GamePlugin from '@plugin/GamePlugin'


// Per-game economy. maxCoins CAPS the client-reported payout server-side (anti-cheat: a hacked
// client can no longer mint arbitrary coins). skill = profession that gains XP from this game;
// resource = what's gathered. Caps are generous (well above legit scores) but block the exploit.
const GAME_ECONOMY = {
    901: { skill: 'hauling', maxCoins: 800,  resource: 'cargo' },   // Bean Counters
    904: { skill: 'fishing', maxCoins: 800,  resource: 'fish'  },   // Ice Fishing
    905: { skill: 'mining',  maxCoins: 800,  resource: 'ore'   },   // Cart Surfer / Mine
    912: { skill: 'surfing', maxCoins: 1200, resource: 'shell' },   // Catchin' Waves
    999: { skill: 'sledding', maxCoins: 800 },   // Sled Racing (html5 single-player, placement payout)
    900: { skill: null, maxCoins: 800 },    // Astro Barrier
    902: { skill: null, maxCoins: 800 },    // Bits and Bolts
    903: { skill: null, maxCoins: 800 },    // Hydro Hopper
    906: { skill: null, maxCoins: 1500 },   // Jet Pack Adventure
    909: { skill: null, maxCoins: 800 }     // Thin Ice
}
const DEFAULT_MAX_COINS = 800
const XP_PER_COIN = 2
const COINS_PER_RESOURCE = 20


export default class Minigame extends GamePlugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'get_game': this.getGame,
            'join_game': this.joinGame,
            'send_move': this.sendMove,
            'game_over': this.gameOver
        }
    }

    getGame(args, user) {
        if (user.minigameRoom) {
            user.minigameRoom.getGame(args, user)
        }
    }

    joinGame(args, user) {
        if (user.minigameRoom) {
            user.minigameRoom.joinGame(args, user)
        }
    }

    sendMove(args, user) {
        if (user.minigameRoom) {
            user.minigameRoom.sendMove(args, user)
        }
    }

    gameOver(args, user) {
        let inGame = (user.room && user.room.game) || user.minigameRoom
        if (!inGame) {
            return
        }

        // Which game? Single-player room games carry the id on user.room; table games on minigameRoom.
        let gameId = (user.room && user.room.game) ? user.room.id : (user.minigameRoom ? user.minigameRoom.id : null)
        let cfg = GAME_ECONOMY[gameId] || { skill: null, maxCoins: DEFAULT_MAX_COINS }

        // SERVER-SIDE COIN VALIDATION — clamp the client-reported amount to the per-game cap.
        let reported = parseInt(args.coins)
        if (isNaN(reported) || reported < 0) {
            reported = 0
        }
        let baseCoins = Math.min(reported, cfg.maxCoins)

        // Skill buff: higher skill level grants a coin multiplier, computed from server-side state.
        let multiplier = 1
        if (cfg.skill) {
            let level = user.skills.getLevel(cfg.skill)
            multiplier = 1 + Math.min(level, 99) * 0.01   // up to ~1.98x at level 99
        }
        let coins = Math.floor(baseCoins * multiplier)

        user.updateCoins(coins, true)

        // Daily-challenge progress hooks the SAME server-validated points (a play, the awarded
        // coins), so challenge progress is as un-fakeable as the coin payout itself.
        if (user.challenges) {
            user.challenges.track(`game:${gameId}:plays`, 1).catch(error => this.handler.error(error))
            if (coins > 0) {
                user.challenges.track('coins:earned', coins).catch(error => this.handler.error(error))
            }
        }

        // Skill XP + resource drops scale off the validated (pre-multiplier) coins.
        if (cfg.skill && baseCoins > 0) {
            let xp = Math.floor(baseCoins * XP_PER_COIN)
            user.skills.addXp(cfg.skill, xp)
                .then(result => this.onSkillXp(user, result))
                .catch(error => this.handler.error(error))

            if (user.challenges) {
                user.challenges.track(`skill:${cfg.skill}:xp`, xp).catch(error => this.handler.error(error))
            }

            if (cfg.resource) {
                // Level-gated gathering buff: higher skill = more resources per game (+2%/level), server-side.
                const level = user.skills.getLevel(cfg.skill)
                const dropBonus = 1 + Math.min(level, 99) * 0.02
                let quantity = Math.max(1, Math.floor((baseCoins / COINS_PER_RESOURCE) * dropBonus))
                user.resources.addQuantity(cfg.resource, quantity)

                if (user.challenges) {
                    user.challenges.track(`resource:${cfg.resource}:gathered`, quantity).catch(error => this.handler.error(error))
                }
            }
        }
    }

    onSkillXp(user, result) {
        if (!result || !result.leveledUp || !user.room) {
            return
        }

        let skillName = result.skill.charAt(0).toUpperCase() + result.skill.slice(1)

        // Room-wide level-up shout (filter [] = include the player too).
        user.room.send(user, 'send_message',
            { id: user.id, message: `reached ${skillName} level ${result.level}!` }, [], false)
    }

}
