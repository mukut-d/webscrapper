// app.js
const express = require('express');
const QueueManager = require('./queueManager');
const app = express();
const { apiCallLog } = require('./helper/apiCallLog');

app.use(express.json({
    limit: '50mb'
}));

app.post('/queueManager', async (req, res) => {
    const { data, action, queueName } = req.body;
    console.log(req.body)
    if (!data && !action) {
        res.status(400).send('Data is required');
        return;
    }

    if (action == "add") {
        try {
            await QueueManager.addToQueue(queueName, data);
            res.status(200).send('Added job to scrapeQueue');
        } catch (error) {
            res.status(500).send(`Failed to add job: ${error.message}`);
            await apiCallLog(
                "ebay",
                "addToQueue",
                "QueueManager",
                data,
                {},
                error,
                "error"
            );
        }
    } else if (action == "connect") {
        try {
            const queue = await QueueManager.processQueue(queueName);
            res.status(200).json({
                message: 'Connected to queue',
                queueName: queueName,
                queue: queue
            });
        } catch (error) {
            res.status(500).send(`Failed to add job: ${error.message}`);
            await apiCallLog(
                "ebay",
                "processQueue",
                "QueueManager",
                data,
                {},
                error,
                "error"
            );
        }
    }
});

const PORT = 8000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
