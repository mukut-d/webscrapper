// Step 1: Import required packages
const Bull = require('bull');
const Arena = require('bull-arena');
const express = require('express');

// Step 3: Configure Bull-Arena
const arenaConfig = Arena(
  {
    Bull,
    queues: [
      {
        type: 'bull',
        name: 'bulkFileUploadQueue',
        hostId: 'Queue 1',
        redis: { host: '127.0.0.1', port: 6379 }
      },
      {
        type: 'bull',
        name: 'scrapeQueue',
        hostId: 'Queue 2',
        redis: { host: '127.0.0.1', port: 6379 }
      },
      {
        type: 'bull',
        name: 'quantityStatusUpdateQueue',
        hostId: 'Queue 3',
        redis: { host: '127.0.0.1', port: 6379 }
      }
      // Add more queue configurations as needed
    ]
  },
  {
    // basePath: '/arena', // Optional: Base path for the Arena GUI
    disableListen: true // We are embedding it into our Express app
  }
);

// Step 4: Create Express server
const app = express();

// Mount Bull-Arena at a specific route
app.use('/arena', arenaConfig);

// Step 5: Start the server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Bull-Arena is running at http://localhost:${PORT}/arena`);
});
