import crypto from 'node:crypto';
import { scryptSync } from 'node:crypto';

if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
  console.error('Run this script in an interactive terminal so the password can be entered without echo.');
  process.exit(1);
}
let password = '';
process.stdout.write('Enter a NEW admin password (minimum 16 characters): ');
process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');
process.stdin.resume();
process.stdin.on('data', (chunk) => {
  for (const char of chunk) {
    if (char === '\u0003') {
      process.stdout.write('\nCancelled.\n');
      process.exit(1);
    }
    if (char === '\r' || char === '\n') {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\n');
      if (password.length < 16 || password.length > 256) {
        console.error('Password must contain between 16 and 256 characters. Run again.');
        process.exit(1);
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = scryptSync(password, salt, 64).toString('hex');
      password = '';
      console.log('\nSet this value as ADMIN_PASSWORD_HASH in Render (copy the full value):');
      console.log(salt + ':' + hash);
      console.log('\nKeep the password in your password manager. Do not commit the hash or password to Git.');
      process.exit(0);
    }
    if (char === '\u007f' || char === '\b') {
      password = password.slice(0, -1);
      continue;
    }
    password += char;
  }
  process.stdout.write('*'.repeat(chunk.replace(/[\r\n\u0003]/g, '').length));
});
