const { getUser } = require('../utils/user.util');
const Token = require("../models/tokens")

const isAuthenticated = async (req, res, next) => {
    try {

        let user = await getUser(req)
        
        if (user) {
            res.user = user;
            res.locals = { user };
            return next();
        } else {

            return res.status(401).json({
                status: false,
                message: 'Unauthorized'
            });
        } 
    } catch (error) {

        return res.status(400).json({
            status: false,
            message: error
        });
    }
}

const checkRole = roles => async (req, res, next) =>{

    let user = await getUser(req)
    
    if(roles.includes(user.role)) {
        
        return next();
    }else {
        
        return res.status(403).json({
            status: false,
            message: 'Forbidden'
        });
    }
}

const isApiKeyValid = (req, res, next) => {
    
    if ( req.headers['api-key'] == process.env.BACKEND_API_KEY ) {
        
        return next();
    }
    else { 
        
        return res.status(403).json({
            status: false,
            message: 'Forbidden'
        }); 
    }
    
}

module.exports = { isAuthenticated, checkRole, isApiKeyValid }