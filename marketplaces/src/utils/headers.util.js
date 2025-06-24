const User = require("../models/user");
// const jwt = require("jsonwebtoken")
const { jwtDecode } = require('jwt-decode');

const getDecodedToken = (request) => {

    return new Promise(async function (resolve, reject) {

        if (request.headers.authorization && request.headers.authorization.split(' ')[0] === 'Bearer') {
            let token = request.headers['authorization'].split(' ')[1]

            const decoded = jwtDecode(token);
            return resolve(decoded)
        }else {

            return reject('Invalid token')
        }

    });
    
}

module.exports = { getDecodedToken }