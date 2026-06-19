import BaseModel from '../BaseModel'

import Sequelize from 'sequelize'


export default class Clubs extends BaseModel {

    static init(sequelize, DataTypes) {
        return super.init(
            {
                id: {
                    type: DataTypes.INTEGER(11),
                    allowNull: false,
                    primaryKey: true,
                    autoIncrement: true
                },
                name: {
                    type: DataTypes.STRING(32),
                    allowNull: false
                },
                tag: {
                    type: DataTypes.STRING(4),
                    allowNull: false
                },
                leaderId: {
                    type: DataTypes.INTEGER(11),
                    allowNull: false
                },
                xp: {
                    type: DataTypes.INTEGER(11),
                    allowNull: false,
                    defaultValue: 0
                },
                createdAt: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: sequelize.literal('CURRENT_TIMESTAMP')
                }
            },
            { sequelize, timestamps: false, tableName: 'clubs' }
        )
    }

    static associate({ users, clubMembers }) {
        this.belongsTo(users, { foreignKey: 'leaderId', as: 'leader' })
        this.hasMany(clubMembers, { foreignKey: 'clubId', as: 'members' })
    }

}
