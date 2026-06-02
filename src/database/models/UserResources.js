import BaseModel from '../BaseModel'

export default class UserResources extends BaseModel {

    static init(sequelize, DataTypes) {
        return super.init(
            {
                userId: {
                    type: DataTypes.INTEGER(11),
                    allowNull: false,
                    primaryKey: true
                },
                itemType: {
                    type: DataTypes.STRING(30),
                    allowNull: false,
                    primaryKey: true
                },
                quantity: {
                    type: DataTypes.INTEGER(11),
                    allowNull: false,
                    defaultValue: 0
                }
            },
            { sequelize, timestamps: false, tableName: 'user_resources' }
        )
    }

}
