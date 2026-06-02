import nodemailer from 'nodemailer'

// Sends transactional email (currently just login verification codes).
//
// To go live, drop the SMTP password into config.email.smtp. The host/port/user are pre-filled
// for Resend (host: 'smtp.resend.com', port: 465, secure: true, user: 'resend'); set
// pass: '<your Resend API key, re_...>'. The sending domain in `from` (clubpenguinlive.net) must
// be verified in Resend first. Until host + user + pass are all set this runs in scaffold mode
// and logs codes to the console instead of sending, so the flow is testable without SMTP.
export default class EmailManager {

    constructor(config) {
        this.config = (config && config.email) || {}
        this.from = this.config.from || 'Club Penguin Live <no-reply@clubpenguinlive.net>'
        this.transport = null

        let smtp = this.config.smtp
        if (smtp && smtp.host && smtp.user && smtp.pass) {
            this.transport = nodemailer.createTransport({
                host: smtp.host,
                port: smtp.port || 587,
                secure: smtp.secure === true,
                auth: { user: smtp.user, pass: smtp.pass }
            })
        }
    }

    get enabled() {
        return this.transport !== null
    }

    async sendLoginCode(to, code) {
        let subject = 'Your Club Penguin Live login code'
        let text = `Your Club Penguin Live login code is ${code}\n\n`
            + 'It expires in 5 minutes. If you did not try to log in, you can safely ignore this email.'

        if (!this.transport) {
            // Scaffold mode: no SMTP configured yet.
            console.log(`[EmailManager] SMTP not configured - login code for ${to}: ${code}`)
            return true
        }

        try {
            await this.transport.sendMail({ from: this.from, to: to, subject: subject, text: text })
            return true
        } catch (error) {
            console.error('[EmailManager] Failed to send login code:', error.message)
            return false
        }
    }

}
