require('dotenv').config(); 
const mongoose = require('mongoose');

async function connectDB() {
  try {
    const mongoURI = `mongodb://${process.env.MONGO_USERNAME}:${encodeURIComponent(process.env.MONGO_PASSWORD)}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/?authSource=${process.env.MONGO_AUTH_SOURCE}`;

    await mongoose.connect(mongoURI, {
      dbName: process.env.MONGO_DB,
      useNewUrlParser: true,
      useUnifiedTopology: true
    }); 

    console.log('MongoDB connection established successfully');
  } catch (error) {
    console.error('MongoDB connection failed:', error);
    process.exit(1); 
  }
}

module.exports = connectDB;
