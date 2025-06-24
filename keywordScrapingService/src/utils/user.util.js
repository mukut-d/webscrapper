const User = require("../models/user");
const jwt = require("jsonwebtoken")

const getUser = (request) => {

    return new Promise(async function (resolve, reject) {

        if (request.headers.authorization && request.headers.authorization.split(' ')[0] === 'Bearer') {
            let token = request.headers['authorization'].split(' ')[1]

            console.log('before user data')

            const user = await User.findOne({ attributes: ['id', 'email'], where: { jwt_token: token } });

            console.log('user data')
            console.log(user)
            return resolve(user)
        }
        
        /* jwt.verify(token, process.env.JWT_SECRET, async function(err, decoded) {
            if(decoded) {

                const user = await User.findOne({ where: { jwt_token: token } });

                return resolve(user)
            }
            if(err) {
                console.log('*****decodedToken err*****')
                console.log(err)

                return resolve(false)
            }
        }); */

    });
    
}

const removeUser = async (request) => {

    return new Promise(function (resolve, reject) {

        let token = request.headers['x-access-token']

        jwt.verify(token, process.env.JWT_SECRET, async function(err, decoded) {
            if(decoded) {

                let table = 'users'
                if(decoded.role == 'super_admin') {
                    table = 'admin'
                }

                let upData = [
                    { key: 'session_token', value: null }
                ]
        
                const upCondtions = {
                    table,
                    where: [
                        { key: 'id', value: decoded.id }
                    ],
                    upData
                }
        
                await DB.update(upCondtions);

                return resolve(true)
            }
            if(err) {

                return resolve(false)
            }
        });
        
    });

}

module.exports = { getUser, removeUser }