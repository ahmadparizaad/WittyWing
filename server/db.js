const mongoose = require('mongoose');

let cachedConnection = null;

async function connectDB() {
  if (cachedConnection && mongoose.connection.readyState === 1) {
    return cachedConnection;
  }

  const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/twitter-automation';
  
  if (!cachedConnection) {
    console.log('Creating new MongoDB connection');
  }
  
  mongoose.set('strictQuery', false);
  
  try {
    cachedConnection = await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log('MongoDB connected successfully');
    return cachedConnection;
  } catch (err) {
    console.error('MongoDB connection failed:', err);
    throw err;
  }
}

module.exports = connectDB;
