import BaseModel from '../BaseModel'

export default class UserChallenges extends BaseModel {

    static init(sequelize, DataTypes) {
        return super.init(
            {
                userId: {
                    type: DataTypes.INTEGER(11),
                    allowNull: false,
                    primaryKey: true
                },
                day: {
                    type: DataTypes.DATEONLY,
                    allowNull: false,
                    primaryKey: true
                },
                challengeId: {
                    type: DataTypes.INTEGER(11),
                    allowNull: false,
                    primaryKey: true
                },
                progress: {
                    type: DataTypes.INTEGER(11),
                    allowNull: false,
                    defaultValue: 0
                },
                claimed: {
                    type: DataTypes.TINYINT(1),
                    allowNull: false,
                    defaultValue: 0
                }
            },
            { sequelize, timestamps: false, tableName: 'user_challenges' }
        )
    }

}
