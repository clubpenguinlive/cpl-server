import GamePlugin from '@plugin/GamePlugin'


// Daily challenges: 3 date-derived goals/day that drive the "return daily" loop. The day's SET is
// deterministic from the UTC date (see @utils/dailyChallenges) — no DB for definitions; only
// per-user PROGRESS is stored. Progress is advanced by the same server-validated economy events the
// coins/skills use (user.challenges.track in MiniGame.gameOver / CardInstance), so it can't be faked.
// This plugin is just the network surface; the logic lives in ChallengeCollection (user.challenges).

export default class DailyChallenge extends GamePlugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'get_daily_challenges': this.getDailyChallenges,
            'claim_challenge': this.claimChallenge
        }
    }

    getDailyChallenges(args, user) {
        if (!user.challenges) {
            return
        }

        user.send('daily_challenges', user.challenges.getDaily())
    }

    async claimChallenge(args, user) {
        if (!user.challenges) {
            return
        }

        const result = await user.challenges.claim(args.id)
        if (result) {
            user.send('challenge_claimed', result)
        }
    }

}
