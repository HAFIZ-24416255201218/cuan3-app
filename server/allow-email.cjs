require('dotenv').config();

const mongoose = require('mongoose');

const User = mongoose.model('AuthUser', new mongoose.Schema({
  email: { type: String, default: null },
  emailLogin: { type: String, unique: true, sparse: true },
  emailLoginEnabled: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  name: { type: String, default: null },
}));

async function allowEmail() {
  const address = process.argv[2]?.trim().toLowerCase();
  if (!address || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    throw new Error('Usage: npm run auth:allow-email -- person@example.com');
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOneAndUpdate(
    { emailLogin: address },
    { $set: { email: address, emailLogin: address, emailLoginEnabled: true, active: true } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  console.log(`Email access enabled for ${user.emailLogin}.`);
  await mongoose.disconnect();
}

allowEmail().catch(async error => {
  console.error(error.message);
  if (mongoose.connection.readyState) await mongoose.disconnect();
  process.exitCode = 1;
});
