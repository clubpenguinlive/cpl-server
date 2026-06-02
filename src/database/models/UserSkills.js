import BaseModel from '../BaseModel'

export default class UserSkills extends BaseModel {

    static init(sequelize, DataTypes) {
        return super.init(
            {
                userId: {
                    type: DataTypes.INTEGER(11),
                    allowNull: false,
                    primaryKey: true
                },
                skill: {
                    type: DataTypes.STRING(20),
                    allowNull: false,
                    primaryKey: true
                },
                xp: {
                    type: DataTypes.INTEGER(11),
                    allowNull: false,
                    defaultValue: 0
                }
            },
            { sequelize, timestamps: false, tableName: 'user_skills' }
        )
    }

}
