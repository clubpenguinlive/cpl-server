'use strict'
// Smoke test: full login + getUserClub path.
// PASS = user enters world (receives join_room); FAIL = anything before that.
//
// Protocol note: all messages are wrapped  { action, args }  on the 'message' socket.io event.
// Flow: login -> game_auth -> join_server -> join_room (means load + getUserClub completed).
// The Login world sends 'io server disconnect' after auth; don't manually disconnect there.
//
// Run via SSH tunnel (bypasses CF):
//   ssh -L 18081:172.18.0.5:80 -N -f cpl-prod
//   node smoke_login.js
const { io } = require('socket.io-client')

const HOST     = process.env.SMOKE_HOST || 'http://localhost:18081'   // SSH tunnel to cpl-web nginx
const EMAIL    = 'claude@grubwire.io'       // in EMAIL_SKIP_FOR, bypasses MFA
const PASS     = 'Test1234!'
const WORLD_PATH = '/world/blizzard'
const TIMEOUT_MS = 20000

function send(sock, action, args = {}) {
    sock.emit('message', { action, args })
}

function connectSio(path) {
    return io(HOST, { path, transports: ['polling'], reconnection: false })
}

async function run() {
    console.log(`CPL login smoke test -> ${HOST}`)

    // 1. Authenticate via Login server
    // Server sends 'io server disconnect' after auth; let it handle the close.
    process.stdout.write('  login ... ')
    const { username, key } = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('login timeout')), TIMEOUT_MS)
        const sock = connectSio('/world/login')
        let settled = false
        sock.on('connect', () => send(sock, 'login', { username: EMAIL, password: PASS }))
        sock.on('message', d => {
            if (d.action !== 'login') return
            clearTimeout(t)
            settled = true
            if (!d.args.success) return reject(new Error('auth failed: ' + d.args.message))
            resolve({ username: d.args.username, key: d.args.key })
        })
        sock.on('connect_error', e => { if (!settled) { clearTimeout(t); reject(e) } })
        sock.on('disconnect', r => { if (!settled) { clearTimeout(t); reject(new Error('early disconnect: ' + r)) } })
    })
    console.log('PASS (got key for ' + username + ')')

    // 2. Enter game world: game_auth -> join_server -> join_room (exercises GameUser.load + getUserClub)
    process.stdout.write('  game_auth + join_server + join_room ... ')
    const room = await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('world join timeout')), TIMEOUT_MS)
        const sock = connectSio(WORLD_PATH)
        sock.on('connect', () => send(sock, 'game_auth', { username, key, createToken: false, token: '' }))
        sock.on('message', d => {
            if (d.action === 'game_auth' && d.args.success) send(sock, 'join_server')
            if (d.action === 'join_room') {
                clearTimeout(t)
                sock.disconnect()
                resolve(d.args.room)
            }
        })
        sock.on('connect_error', e => { clearTimeout(t); reject(e) })
        sock.on('disconnect', r => { if (r !== 'io client disconnect') { clearTimeout(t); reject(new Error('disconnected before join_room: ' + r)) } })
    })
    console.log('PASS (room ' + room + ')')

    console.log('\nPASS  Login recovery confirmed. getUserClub path is working.')
}

run().catch(e => {
    console.log('\nFAIL  ' + e.message)
    process.exit(1)
})
