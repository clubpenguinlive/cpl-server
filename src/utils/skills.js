// Skill / profession definitions + XP curve.
// XP per level step: 100 (levels 1-10), 500 (10-30), 2000 (30-50), 10000 (50-99).
export const SKILLS = ['fishing', 'cooking', 'mining', 'surfing', 'hauling', 'performing', 'agent']
export const MAX_LEVEL = 99

function stepForLevel(level) {
    if (level < 10) return 100
    if (level < 30) return 500
    if (level < 50) return 2000
    return 10000
}

// CUM[L] = total xp required to REACH level L (level 1 = 0 xp).
const CUM = [0, 0]
for (let L = 1; L <= MAX_LEVEL; L++) {
    CUM[L + 1] = (CUM[L] || 0) + stepForLevel(L)
}

export const MAX_XP = CUM[MAX_LEVEL]

export function levelForXp(xp) {
    let lvl = 1
    while (lvl < MAX_LEVEL && CUM[lvl + 1] <= xp) lvl++
    return lvl
}

export function xpForLevel(level) {
    return CUM[Math.max(1, Math.min(MAX_LEVEL, level))] || 0
}

// xp needed to reach the next level from the current xp (0 if maxed).
export function xpToNext(xp) {
    let lvl = levelForXp(xp)
    if (lvl >= MAX_LEVEL) return 0
    return CUM[lvl + 1] - xp
}
