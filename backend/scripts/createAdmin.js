
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const readline = require('readline');
require('dotenv').config();

const User = require('../models/User');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('\nConnected to CivicPulse MongoDB.');

    const name = (await ask('Administrator name: ')).trim();
    const email = (await ask('Administrator email: ')).trim().toLowerCase();
    const password = await ask('Administrator password (minimum 8 characters): ');

    if (!name || name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      throw new Error('Invalid name, email or password.');
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      throw new Error(
        'An account with this email already exists. No changes were made.'
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const admin = await User.create({
      name,
      email,
      password: hashedPassword,
      role: 'admin',
    });

    console.log('\nAdministrator created successfully!');
    console.log('Name:', admin.name);
    console.log('Email:', admin.email);
    console.log('Role:', admin.role);

  } catch (error) {
    console.error('\nAdministrator setup failed:', error.message);
    process.exitCode = 1;
  } finally {
    rl.close();
    await mongoose.disconnect();
  }
}

createAdmin();
