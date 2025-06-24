const axios = require('axios');

async function getAccessToken(clientId, clientSecret, refreshToken) {
    try {
        const response = await axios.post(`https://api.amazon.com/auth/o2/token?grant_type=refresh_token&client_id=${clientId}&client_secret=${clientSecret}&refresh_token=${refreshToken}`);
        return response.data.access_token;
    } catch (error) {
        console.error(error.message);
        throw error;
    }
}

module.exports = {
    getAccessToken
};