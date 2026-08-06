import { BLOCKLIST } from './blocklist'


// Basic leetspeak substitutions applied before matching, so trivial
// evasions like "h1tler" or "n4zi" still get caught.
const LEET_MAP = {
    '1': 'i',
    '4': 'a',
    '3': 'e',
    '0': 'o',
    '@': 'a',
    '$': 's'
}

const LEET_REGEX = /[1430@$]/g
const NON_ALPHANUMERIC_REGEX = /[^a-z0-9]/g

function normalize(text) {
    let result = String(text).toLowerCase()

    result = result.replace(LEET_REGEX, char => LEET_MAP[char])

    // Strip spaces, punctuation, and any other separators so spaced-out
    // or punctuated evasions ("h i t l e r", "h.i.t.l.e.r") still match.
    result = result.replace(NON_ALPHANUMERIC_REGEX, '')

    return result
}

const NORMALIZED_BLOCKLIST = BLOCKLIST
    .map(normalize)
    .filter(term => term.length > 0)

export function containsBlockedContent(text) {
    if (!text) {
        return false
    }

    const normalized = normalize(text)

    if (!normalized) {
        return false
    }

    return NORMALIZED_BLOCKLIST.some(term => normalized.includes(term))
}
