/**
 * Create (or reset) a superadmin account.
 * Usage: node create-admin.js <email> <password> [name]
 *
 * Make sure your .env DATABASE_URL points at the target database first.
 */
require('dotenv').config();
const bcrypt = require('bcrypt');
const db     = require('./db');

const [email, password, name = 'Administrator'] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: node create-admin.js <email> <password> [name]');
  process.exit(1);
}
if (password.length < 10) {
  console.error('❌ Use a password of at least 10 characters.');
  process.exit(1);
}

(async () => {
  try {
    const hash = await bcrypt.hash(password, 10);
    await db.query(
      `INSERT INTO admin_users (name, email, password, role)
       VALUES ($1, $2, $3, 'superadmin')
       ON CONFLICT (email) DO UPDATE
         SET password = $3, role = 'superadmin', is_active = true, status = 'active'`,
      [name, email, hash]
    );
    console.log(`✅ Superadmin ready: ${email}`);
    process.exit(0);
  } catch (e) {
    console.error('❌ Failed:', e.message);
    process.exit(1);
  }
})();
