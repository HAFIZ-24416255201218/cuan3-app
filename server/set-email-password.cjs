require('dotenv').config();

const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { StringDecoder } = require('node:string_decoder');
const { promisify } = require('node:util');

const scrypt = promisify(crypto.scrypt);
const User = mongoose.model('AuthUser', new mongoose.Schema({
  emailLogin: { type: String, unique: true, sparse: true },
  emailLoginEnabled: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  passwordHash: { type: String, default: null },
  passwordSalt: { type: String, default: null },
}));

function readHidden(prompt) {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    return Promise.reject(new Error('Run this command from an interactive terminal so the password is not echoed.'));
  }

  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  const decoder = new StringDecoder('utf8');

  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error) => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdin.removeListener('data', onData);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk) => {
      for (const character of decoder.write(chunk)) {
        if (character === '\u0003') return finish(new Error('Password setup cancelled.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') {
          value = Array.from(value).slice(0, -1).join('');
        } else if (character >= ' ' && value.length < 128) {
          value += character;
        }
      }
    };

    process.stdin.on('data', onData);
  });
}

async function setEmailPassword() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage: npm run auth:set-password -- person@example.com');
  }
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');

  const password = await readHidden('New password (12-128 characters): ');
  if (password.length < 12 || password.length > 128) {
    throw new Error('Password must be between 12 and 128 characters.');
  }
  const confirmation = await readHidden('Confirm password: ');
  if (password !== confirmation) throw new Error('Passwords do not match.');

  await mongoose.connect(process.env.MONGODB_URI);
  const user = await User.findOne({
    emailLogin: email,
    emailLoginEnabled: true,
    active: true,
  });
  if (!user) {
    throw new Error('No active email account found. Enable access first with auth:allow-email.');
  }

  const passwordSalt = crypto.randomBytes(16).toString('base64url');
  const passwordHash = (await scrypt(password, passwordSalt, 64)).toString('base64url');
  await User.updateOne({ _id: user._id }, { $set: { passwordHash, passwordSalt } });
  console.log(`Password configured for ${email}.`);
}

setEmailPassword()
  .catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
