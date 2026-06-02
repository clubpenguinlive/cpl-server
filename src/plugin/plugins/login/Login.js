import Plugin from '@plugin/Plugin'
import EmailManager from '@objects/email/EmailManager'

import { hasProps, isLength, isString } from '@utils/validation'

import bcrypt from 'bcrypt'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import Validator from 'fastest-validator'


export default class Login extends Plugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'login': this.login,
            'token_login': this.tokenLogin,
            'verify_code': this.verifyCode
        }

        this.check = this.createValidator()

        this.responses = {
            notFound: {
                success: false,
                message: 'Penguin not found. Try Again?'
            },
            wrongPassword: {
                success: false,
                message: 'Incorrect password. NOTE: Passwords are CaSe SeNsiTIVE'
            },
            permaBan: {
                success: false,
                message: 'Banned:\nYou are banned forever'
            }
        }

        // Email verification (lightweight MFA on new/untrusted devices)
        this.emailManager = new EmailManager(this.config)

        // userId -> { code, expires, attempts }
        this.loginCodes = new Map()

        let emailConfig = this.config.email || {}
        this.codeTtl = (emailConfig.codeExpiry || 300) * 1000
        this.maxCodeAttempts = emailConfig.maxAttempts || 5

        this.codeResponses = {
            invalid: {
                success: false,
                message: 'That code is incorrect. Please try again'
            },
            expired: {
                success: false,
                message: 'That code has expired.\nPlease log in again'
            },
            tooMany: {
                success: false,
                message: 'Too many incorrect attempts.\nPlease log in again'
            }
        }
    }

    // Events

    async login(args, user) {
        if (user.loginSent) {
            return user.close()
        }

        // Only handle login once
        user.loginSent = true

        let check = this.check({ username: args.username, password: args.password })

        if (check != true) {
            // Invalid data input
            user.send('login', {
                success: false,
                message: check[0].message
            })

        } else {
            // Comparing password and checking for user existence
            user.send('login', await this.comparePasswords(args, user))
        }

        user.close()
    }

    async tokenLogin(args, user) {
        if (user.loginSent) {
            return user.close()
        }

        // Only handle login once
        user.loginSent = true

        user.send('login', await this.compareTokens(args, user))
        user.close()
    }

    async verifyCode(args, user) {
        if (user.loginSent) {
            return user.close()
        }

        // Only handle login once
        user.loginSent = true

        user.send('login', await this.checkCode(args, user))
        user.close()
    }

    // Functions

    createValidator() {
        let validator = new Validator()

        let schema = {
            username: {
                empty: false,
                trim: true,
                type: 'string',
                min: 4,
                max: 254,
                messages: {
                    stringEmpty: 'You must provide your email to enter Club Penguin',
                    stringMin: 'Please enter a valid email. Try again',
                    stringMax: 'That email is too long. Try again',
                }
            },
            password: {
                empty: false,
                trim: true,
                type: 'string',
                min: 3,
                max: 128,
                messages: {
                    stringEmpty: 'You must provide your password to enter Club Penguin',
                    stringMin: 'Your password is too short. Please try again',
                    stringMax: 'Your password is too long. Please try again'
                }
            }
        }

        return validator.compile(schema)
    }

    async comparePasswords(args, user) {
        let load = await user.load(args.username)
        if (!load) {
            return this.responses.notFound
        }

        let match = await bcrypt.compare(args.password, user.password)
        if (!match) {
            return this.responses.wrongPassword
        }

        let banned = this.checkBanned(user)
        if (banned) {
            return banned
        }

        // Password is correct, but a fresh password login means this is a new/untrusted
        // device (trusted devices auto-login via token_login, which skips this step).
        // Require an email code before issuing the login key.
        return await this.startVerification(user)
    }

    async compareTokens(args, user) {
        if (!hasProps(args, 'username', 'token')) {
            return this.responses.wrongPassword
        }

        if (!isLength(args.username, 4, 12) || !isString(args.token)) {
            return this.responses.wrongPassword
        }

        let split = args.token.split(':')
        if (split.length != 2) {
            return this.responses.wrongPassword
        }

        let load = await user.load(args.username, split[0])
        if (!load) {
            return this.responses.notFound
        }

        if (!user.authToken) {
            return this.responses.wrongPassword
        }

        let match = await bcrypt.compare(split[1], user.authToken.validator)
        if (!match) {
            return this.responses.wrongPassword
        }

        let banned = this.checkBanned(user)
        if (banned) {
            return banned
        }

        return await this.onLoginSuccess(user)
    }

    // Email verification (lightweight MFA)

    async startVerification(user) {
        // Only enforce the email code when we can actually deliver it (SMTP configured) or when
        // explicitly forced for testing. Without an email on file, or before Mailgun is wired,
        // log straight in so real users aren't locked out at a code screen they can't complete.
        let force = this.config.email && this.config.email.forceVerification === true

        if (!user.email || !(this.emailManager.enabled || force)) {
            return await this.onLoginSuccess(user)
        }

        // Service/test accounts (e.g. the automated smoke-test login) skip the code, since no
        // human reads their inbox. Real users are unaffected.
        let skipFor = ((this.config.email && this.config.email.skipFor) || []).map(e => String(e).toLowerCase())
        if (skipFor.includes(user.email.toLowerCase())) {
            return await this.onLoginSuccess(user)
        }

        let code = this.generateCode()
        this.loginCodes.set(user.id, { code: code, expires: Date.now() + this.codeTtl, attempts: 0 })

        await this.emailManager.sendLoginCode(user.email, code)

        return {
            success: false,
            verificationRequired: true,
            username: user.username,
            email: this.maskEmail(user.email)
        }
    }

    async checkCode(args, user) {
        if (!hasProps(args, 'username', 'code')) {
            return this.codeResponses.invalid
        }

        if (!isString(args.code) || !isLength(args.code, 6, 6)) {
            return this.codeResponses.invalid
        }

        let load = await user.load(args.username)
        if (!load) {
            return this.responses.notFound
        }

        let entry = this.loginCodes.get(user.id)
        if (!entry || Date.now() > entry.expires) {
            this.loginCodes.delete(user.id)
            return this.codeResponses.expired
        }

        entry.attempts += 1
        if (entry.attempts > this.maxCodeAttempts) {
            this.loginCodes.delete(user.id)
            return this.codeResponses.tooMany
        }

        if (args.code !== entry.code) {
            return this.codeResponses.invalid
        }

        let banned = this.checkBanned(user)
        if (banned) {
            return banned
        }

        // Code is valid, complete the login
        this.loginCodes.delete(user.id)

        return await this.onLoginSuccess(user)
    }

    generateCode() {
        return String(crypto.randomInt(0, 1000000)).padStart(6, '0')
    }

    maskEmail(email) {
        let [name, domain] = email.split('@')
        if (!domain) {
            return email
        }

        let shown = name.slice(0, 2)
        let hidden = '*'.repeat(Math.max(name.length - 2, 1))

        return `${shown}${hidden}@${domain}`
    }

    checkBanned(user) {
        if (user.permaBan) {
            return this.responses.permaBan
        }

        if (!user.ban) {
            return
        }

        let hours = Math.round((user.ban.expires - Date.now()) / 60 / 60 / 1000)
        return {
            success: false,
            message: `Banned:\nYou are banned for the next ${hours} hours`
        }
    }

    async onLoginSuccess(user) {
        // Generate random key, used by client for authentication
        let randomKey = crypto.randomBytes(32).toString('hex')
        // Generate new login key, used to validate user on game server
        let loginKey = await this.genLoginKey(user, randomKey)

        let populations = await this.getWorldPopulations(user.isModerator)

        // All validation passed
        await user.update({ loginKey })

        return {
            success: true,
            username: user.username,
            key: randomKey,
            populations: populations
        }
    }

    async genLoginKey(user, randomKey) {
        let hash = user.createLoginHash(randomKey)

        return jwt.sign({
            hash: hash
        }, this.config.crypto.secret, { expiresIn: this.config.crypto.loginKeyExpiry })
    }

    async getWorldPopulations(isModerator) {
        let pops = await this.db.getWorldPopulations()
        let populations = {}

        for (let world of Object.keys(pops)) {
            let maxUsers = this.config.worlds[world].maxUsers
            let population = pops[world].population

            if (population >= maxUsers) {
                populations[world] = (isModerator) ? 5 : 6
                continue
            }

            let barSize = Math.round(maxUsers / 5)
            let bars = Math.max(Math.ceil(population / barSize), 1) || 1

            populations[world] = bars
        }

        return populations
    }

}
