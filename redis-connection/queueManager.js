// queueManager.js
const Bull = require('bull');

// We initialize queues in module scope so they persist across imports.
const queues = {
    scrapeQueue: new Bull('scrapeQueue', {
        redis: {
            host: '127.0.0.1',
            port: 6379
        }
    }),
    bulkUpdateQueue: new Bull('bulkUpdateQueue', {
        redis: {
            host: '127.0.0.1',
            port: 6379
        }
    }),
    productQueue: new Bull('productQueue', {
        redis: {
            host: '127.0.0.1',
            port: 6379
        }
    }),
    updateConfigQueue: new Bull("updateConfigQueue", {
        redis: {
            host: "127.0.0.1",
            port: 6379,
        },
    })
};

class QueueManager {
    static async getQueue(name) {
        if (!queues[name]) {
            throw new Error(`Queue ${name} not found`);
        }
        return queues[name];
    }

    static async addToQueue(name, data) {
        const queue = await this.getQueue(name);
        return queue.add(data);
    }

    static async processQueue(name, callback) {
        const queue = await this.getQueue(name);
        console.log("Processing queue", name);
        await this.processFunction(name, queue);
    }

    static async processFunction(queueName, queue) {
        console.log("Processing queue in function", queueName);
        if (queueName == "bulkUpdateQueue") {
            // Add your code here
        } else if (queueName == "productQueue") {
            // Add your code here
        }
    }
}

module.exports = QueueManager;
