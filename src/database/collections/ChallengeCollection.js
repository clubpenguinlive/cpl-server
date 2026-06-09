import Collection from '../Collection'

import { getDayChallenges, dayKey, secondsUntilNext } from '@utils/dailyChallenges'


// Per-user daily-challenge progress. Loaded with TODAY's rows only (GameUser.load includes
// user_challenges WHERE day = today), keyed by challengeId. The day's SET of challenges is derived
// from the date (getDayChallenges) — server-authoritative, never client-influenced. Progress is
// driven only by the SAME validated economy events the skills/coins use (see track() callers), so
// it can't be faked by a hacked client.

export default class ChallengeCollection extends Collection {

    constructor(user, models) {
        super(user, models, 'userChallenges', 'challengeId')
    }

    // Advance progress for any of today's active challenges whose metric matches. Called from the
    // server-validated economy hooks (MiniGame.gameOver, CardInstance, ...). Fire-and-forget.
    async track(metric, amount) {
        amount = Math.floor(amount)
        if (!amount || amount <= 0) {
            return
        }

        const now = new Date()
        const day = dayKey(now)

        for (const challenge of getDayChallenges(now)) {
            if (challenge.metric !== metric) {
                continue
            }

            let record = this.get(challenge.id)
            const current = record ? record.progress : 0
            if (current >= challenge.target) {
                continue
            }

            const next = Math.min(current + amount, challenge.target)

            try {
                if (record) {
                    record.progress = next
                    await record.save()
                } else {
                    record = await this.model.create({
                        userId: this.user.id, day: day, challengeId: challenge.id, progress: next, claimed: 0
                    })
                    this.addModel(record)
                }
            } catch (error) {
                this.handler.error(error)
            }
        }
    }

    // Today's 3 challenges merged with this user's progress + claim state, plus the rotation countdown.
    getDaily() {
        const now = new Date()

        const challenges = getDayChallenges(now).map(challenge => {
            const record = this.get(challenge.id)
            return {
                id: challenge.id,
                text: challenge.text,
                target: challenge.target,
                reward: challenge.reward,
                progress: record ? Math.min(record.progress, challenge.target) : 0,
                claimed: record ? !!record.claimed : false
            }
        })

        return { challenges, secondsUntilNext: secondsUntilNext(now) }
    }

    // Claim a completed challenge's reward. Server-validated + idempotent: only pays if the stored
    // progress meets the target and it hasn't been claimed yet.
    async claim(challengeId) {
        challengeId = parseInt(challengeId)

        const challenge = getDayChallenges(new Date()).find(c => c.id === challengeId)
        if (!challenge) {
            return null
        }

        const record = this.get(challengeId)
        if (!record || record.progress < challenge.target || record.claimed) {
            return null
        }

        try {
            record.claimed = 1
            await record.save()
        } catch (error) {
            this.handler.error(error)
            return null
        }

        this.user.updateCoins(challenge.reward)

        return { id: challengeId, reward: challenge.reward, coins: this.user.coins }
    }

}
