const config = require('../config');
const { checkSubcription } = require('../credit-service/credit-management');
const { getRedisClient } = require('../helper/redis-client');

const checkFreeTrial = async (req) => {
    const trialId = req.trialId;

    if (!trialId) {
        throw new Error('Trial ID should be present');
    }


    const redisClient = await getRedisClient();

    if (!redisClient) {
        throw new Error('Redis client not available');
    }

    const redisKey = `trial:${trialId}`;

    const trialCount = await redisClient.get(redisKey);
    if (!trialCount) {
        await redisClient.set(redisKey, 1, 'EX', config.trial_cool_off_time);
        return;
    }

    if (Number(trialCount) > config.max_trials_allowed) {
        throw new Error('Trial limit exceeded');
    }

    await redisClient.incr(redisKey);
};

const checkApiUsage = async (req, res, next) => {
    if (!req.user && !req.trialId) {
        res.status(500).json({
            status: false,
            message: 'Internal Server Error',
        });
        return;
    }
    try {
        if (req.user) {
            await checkSubcription(req);
        } else {
            await checkFreeTrial(req);
        }
    } catch (error) {
        res.status(error.status || 500).json({
            status: false,
            message: error.message || 'Internal Server Error',
        });
        return;
    }

    next();
};

module.exports = {
    checkApiUsage,
}
