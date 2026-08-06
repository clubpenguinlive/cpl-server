// Content moderation blocklist for club names, club tags, and chat messages.
//
// Entries are plain words or short phrases, any case, spacing does not
// matter. They are normalized (lowercased, leetspeak-substituted, and
// stripped of everything but letters and digits) at load time by
// contentFilter.js, and matched as substrings against user input that has
// gone through the same normalization. So "Heil", "h3il", and "h e i l"
// all match a blocklist entry of "heil".

const HATE_AND_EXTREMISM = [
    'nazi',
    'nazis',
    'hitler',
    'heil',
    'sieg heil',
    'third reich',
    'kkk',
    'ku klux klan',
    'white power',
    'white pride',
    'aryan brotherhood',
    'aryan nation',
    'swastika',
    '1488',
    'fourteen words',
    'gas the jews',
    'blood and soil',
    'master race',
    'ethnic cleansing',
    'gas chamber',
    'fuehrer',
    'fuhrer',
    'neo nazi',
    'white supremacist',
    'white supremacy'
]

const RACIAL_ETHNIC_SLURS = [
    'nigger',
    'nigga',
    'chink',
    'gook',
    'spic',
    'wetback',
    'beaner',
    'towelhead',
    'raghead',
    'sandnigger',
    'kike',
    'zipperhead',
    'paki',
    'coon',
    'darkie',
    'redskin',
    'injun',
    'wop',
    'dago'
]

const SEXUAL_ORIENTATION_GENDER_SLURS = [
    'fag',
    'faggot',
    'dyke',
    'tranny',
    'shemale'
]

const ABLEIST_SLURS = [
    'retard',
    'retarded',
    'spastic'
]

const PROFANITY = [
    'fuck',
    'shit',
    'bitch',
    'asshole',
    'bastard',
    'cunt',
    'dick',
    'piss',
    'cock',
    'pussy',
    'whore',
    'slut',
    'douche',
    'motherfucker',
    'twat',
    'wanker',
    'bollocks',
    'bullshit',
    'dumbass',
    'jackass'
]

export const BLOCKLIST = [
    ...HATE_AND_EXTREMISM,
    ...RACIAL_ETHNIC_SLURS,
    ...SEXUAL_ORIENTATION_GENDER_SLURS,
    ...ABLEIST_SLURS,
    ...PROFANITY
]
