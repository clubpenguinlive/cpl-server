import GamePlugin from '@plugin/GamePlugin'


export default class Skill extends GamePlugin {

    constructor(handler) {
        super(handler)

        this.events = {
            'get_skills': this.getSkills
        }
    }

    getSkills(args, user) {
        user.send('skills', {
            skills: user.skills.toClient(),
            resources: user.resources.toClient(),
            total: user.skills.totalLevel()
        })
    }

}
