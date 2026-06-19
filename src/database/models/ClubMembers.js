import BaseModel from '../BaseModel'

import Sequelize from 'sequelize'


export default class ClubMembers extends BaseModel {

    static init(sequelize, DataTypes) {
        return super.init(
            {
                clubId: {
                    type: DataTypes.INTEGER(11),
                    allowNull: false,
                    primaryKey: true
                },
                userId: {
                    type: DataTypes.INTEGER(11),
                    allowNull: false,
                    primaryKey: true,
                    unique: true
                },
                role: {
                    type: DataTypes.ENUM('leader', 'officer', 'member'),
                    allowNull: false,
                    defaultValue: 'member'
                },
                joinedAt: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
                }
            },
            { sequelize, timestamps: false, tableName: 'club_members' }
        )
    }

    static associate({ clubs, users }) {
        this.belongsTo(clubs, { foreignKey: 'clubId', as: 'club' })
        this.belongsTo(users, { foreignKey: 'userId', as: 'user' })
    }

}
