/**
 * Run this ONCE to create your first superadmin account.
 * Usage: node create-admin.js
 * 
 * Make sure your .env is configured first.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const db     = require('./db');

const ADMIN = {
  name:     'Administrator',
  email:    'admin@vivofashiongroup.com',
  password: 'Admin@Vivo2024',   // ← Change this after first login
  role:     'superadmin'
};

(async () => {
  try {
    const hash = await bcrypt.hash(ADMIN.password, 10);
    await db.query(
      `INSERT INTO admin_users (name, email, password, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET password = $3, role = $4`,
      [ADMIN.name, ADMIN.email, hash, ADMIN.role]
    );
    console.log('✅ Superadmin created successfully.');
    console.log(`   Email:    ${ADMIN.email}`);
    console.log(`   Password: ${ADMIN.password}`);
    console.log('   Please change the password after first login.');
    process.exit(0);
  } catch (e) {
    console.error('❌ Failed:', e.message);
    process.exit(1);
  }
})();
