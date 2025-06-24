const { getUser } = require('../utils/user.util');
const { get } = require('lodash');
const { v4: uuid } = require('uuid');

const isAuthenticated = async (req, res, next) => {
    try {

        let user = await getUser(req)

        if (user) {
            res.user = user;
            req.user = user;
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

const checkRole = roles => async (req, res, next) => {

    let user = await getUser(req)

    if (roles.includes(user.role)) {

        return next();
    } else {

        return res.status(403).json({
            status: false,
            message: 'Forbidden'
        });
    }
}

const isApiKeyValid = (req, res, next) => {

    if (req.headers['api-key'] == process.env.BACKEND_API_KEY) {

        return next();
    }
    else {

        return res.status(403).json({
            status: false,
            message: 'Forbidden'
        });
    }

}


// This middleware is designed to be used
// only for scraping, this should not be used to other purposes
const webAuthMiddleware = async (req, res, next) => {
    let trialId = get(req, 'cookies.trial_id');
    const authorization = get(req, 'headers.authorization') || '';
    const token = authorization.split(' ')[0] === 'Bearer';

    try {
        if (token) {
            const user = await getUser(req);
            if (user) {
                req.user = user;
                res.locals = { user };
            } else {
                return res.status(401).json({
                    status: false,
                    message: 'Unauthorized',
                });
            }
        } else if (!trialId) {
            trialId = uuid();
            req.trialId = trialId;
            res.cookie('trial_id', trialId, {
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
                httpOnly: true,
                secure: true,
            });
        } else {
            req.trialId = trialId;
        }
        next();
    } catch (err) {
        console.error("Error in webAuthMiddleware:", err);
        return res.status(500).json({
            status: false,
            message: "Internal Server Error",
        });
    }
};

module.exports = { isAuthenticated, checkRole, isApiKeyValid, webAuthMiddleware };
