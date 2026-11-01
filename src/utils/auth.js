const crypto = require('crypto');
require('dotenv').config();

let jwt;
try {
  jwt = require('jsonwebtoken');
} catch (e) {
  // Built-in fallback if jwt is resolving
}

let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch (e) {
  // Built-in fallback
}

const { isProduction } = require('../config/runtime');

const MIN_JWT_SECRET_LENGTH = 32;

// Secrets that are public (old source-code default) or trivially guessable
const KNOWN_WEAK_JWT_SECRETS = new Set([
  'restaurant-reservation-jwt-secret-key-2026',
  'secret',
  'changeme',
  'change-me',
  'jwt-secret',
  'your-jwt-secret',
  'your_jwt_secret'
]);

/**
 * JWT_SECRET comes only from the environment. Production fails fast when it is
 * missing or weak; the value itself is never logged.
 */
function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret || !secret.trim()) {
    if (isProduction) {
      throw new Error(
        '[Config] JWT_SECRET is not set. Refusing to start: configure a random secret of at least ' +
        `${MIN_JWT_SECRET_LENGTH} characters in the environment.`
      );
    }

    // Local development only: a random per-process secret (sessions reset on restart)
    console.warn(
      '[Config] JWT_SECRET is not set. Using a random development-only secret; ' +
      'all sessions are invalidated when the server restarts. Set JWT_SECRET in .env.'
    );
    return crypto.randomBytes(48).toString('hex');
  }

  const isWeak =
    secret.length < MIN_JWT_SECRET_LENGTH ||
    KNOWN_WEAK_JWT_SECRETS.has(secret.trim().toLowerCase()) ||
    new Set(secret).size < 8;

  if (isWeak) {
    throw new Error(
      `[Config] JWT_SECRET is too weak. Use a random value of at least ${MIN_JWT_SECRET_LENGTH} characters ` +
      '(for example: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))").'
    );
  }

  return secret;
}

const JWT_SECRET = resolveJwtSecret();

/**
 * Generate a signed JWT token
 */
function generateToken(payload, expiresIn = '12h') {
  if (jwt) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn });
  }

  // Pure Node.js crypto HMAC fallback
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const exp = now + (12 * 60 * 60);
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp })).toString('base64url');
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${signature}`;
}

/**
 * Verify and decode a JWT token
 */
function verifyToken(token) {
  if (!token) return null;

  if (jwt) {
    try {
      // Pin the algorithm tokens are issued with (jwt.sign defaults to HS256)
      return jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
      return null;
    }
  }

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
    const given = Buffer.from(signature);
    const wanted = Buffer.from(expected);
    if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (err) {
    return null;
  }
}

async function hashPassword(plainPassword) {
  if (bcrypt) {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(plainPassword, salt);
  }

  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(plainPassword, salt, 1000, 64, 'sha512').toString('hex');
  return `pbkdf2$${salt}$${hash}`;
}

/**
 * Compare plain text password against stored hash
 */
async function comparePassword(plainPassword, storedHash) {
  if (!plainPassword || !storedHash) {
    return false;
  }

  if (
    bcrypt &&
    storedHash.startsWith('$2')
  ) {
    return bcrypt.compare(
      plainPassword,
      storedHash
    );
  }

  if (
    storedHash.startsWith('pbkdf2$')
  ) {
    const parts =
      storedHash.split('$');

    if (parts.length !== 3) {
      return false;
    }

    const salt =
      parts[1];

    const originalHash =
      parts[2];

    const hash =
      crypto
        .pbkdf2Sync(
          plainPassword,
          salt,
          1000,
          64,
          'sha512'
        )
        .toString('hex');

    return hash === originalHash;
  }

  return false;
}

module.exports = {
  generateToken,
  verifyToken,
  hashPassword,
  comparePassword
};
