const Queue = require('bull');
const cron = require('node-cron');

// Create a Bull queue
async function cleaner() {
  try {
    const queues = ['productQueue', 'scrapeQueue', 'bulkUpdateQueue'];

    for (const queue of queues) {
      const myQueue = new Queue(queue, {
        redis: {
          host: '127.0.0.1',
          port: 6379,
        }
      });
      // Get the count of completed jobs
      const completedCount = await myQueue.getCompletedCount();
      console.log(`Number of completed jobs: ${completedCount}`);

      // Clear all completed jobs
      const clearedJobs = await myQueue.clean(0, 'completed'); // The '0' means to clean all completed jobs immediately
      console.log(`Cleared ${clearedJobs.length} completed jobs`);

      // Optionally, close the queue after the operations
      await myQueue.close();
    }
  } catch (err) {
    console.error('Error:', err);
  }
};

cron.schedule('0 */4 * * *', cleaner);