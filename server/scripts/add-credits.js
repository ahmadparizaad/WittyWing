#!/usr/bin/env node
// Usage: node scripts/add-credits.js <email> <amount>
// Example: node scripts/add-credits.js user@gmail.com 100

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const [,, email, amountArg] = process.argv;
const amount = parseInt(amountArg, 10);

if (!email || !amount || amount <= 0) {
  console.error('Usage: node scripts/add-credits.js <email> <amount>');
  process.exit(1);
}

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const user = await User.findOne({ email });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    process.exit(1);
  }

  const before = user.credits || 0;
  user.credits = before + amount;
  user.plan = 'credits';
  await user.save();

  console.log(`✓ ${user.displayName} (${user.email})`);
  console.log(`  Credits: ${before} → ${user.credits}`);
  console.log(`  Plan: ${user.plan}`);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
