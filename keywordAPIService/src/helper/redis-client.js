const { Redis } = require('ioredis');
const config = require('../config');

let redisClient = null;

const getRedisClient = (app) => {
    if (redisClient) {
        return redisClient;
    }
    redisClient = new Redis({
        ...config.redis_options,
        retryStrategy: (times) => {
            const delay = Math.min(times * 100, 5000);
            return delay;
        }
    });

    redisClient.on('connect', () => console.log('Redis connected'));
    redisClient.on('ready', () => console.log('Redis ready'));
    redisClient.on('error', (err) => console.error('Redis error', err));
    redisClient.on('close', () => console.log('Redis connection closed'));
    redisClient.on('reconnecting', () => console.log('Redis reconnecting'));

    return redisClient;
};

module.exports = {
    getRedisClient,
}