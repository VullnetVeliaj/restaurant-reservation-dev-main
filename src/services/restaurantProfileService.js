/**
 * Restaurant business profile and logo.
 *
 * - Profile columns live on `restaurants` (migration 2026-10-09).
 * - Logos are stored in the public Supabase Storage bucket `restaurant-logos`
 *   under `<restaurant_id>/...`; only the public URL is saved in restaurants.logo_url.
 *   Uploads go through the backend (service key never reaches the browser).
 */
const supabase = require('../config/supabase');

const LOGO_BUCKET = 'restaurant-logos';
const MAX_LOGO_BYTES = 2 * 1024 * 1024;
const LOGO_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp'
};

const PROFILE_FIELDS = {
  description: { max: 500 },
  cuisine_type: { max: 80 },
  contact_email: { max: 254, type: 'email' },
  phone: { max: 40, type: 'phone' },
  website: { max: 300, type: 'url' },
  street: { max: 160 },
  postal_code: { max: 20 },
  city: { max: 100 },
  country: { max: 100 }
};

function profileError(message, code, status = 400, field) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  if (field) err.field = field;
  return err;
}

function isPermissionError(dbError) {
  return dbError?.code === '42501' || /row-level security|permission denied/i.test(dbError?.message || '');
}

function hasProfileColumns(restaurantRow) {
  return Boolean(restaurantRow) && 'description' in restaurantRow;
}

function pickProfile(restaurantRow = {}) {
  return Object.fromEntries(Object.keys(PROFILE_FIELDS).map((f) => [f, restaurantRow[f] ?? null]));
}

/**
 * Validates and normalises a profile payload. Only fields present in the input are
 * returned; '' clears a field. Throws INVALID_PROFILE (400) naming the field.
 */
function sanitizeProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw profileError('Profile must be an object.', 'INVALID_PROFILE');
  }

  const values = {};
  for (const [field, rule] of Object.entries(PROFILE_FIELDS)) {
    if (input[field] === undefined) continue;

    if (input[field] !== null && typeof input[field] !== 'string') {
      throw profileError(`${field} must be text.`, 'INVALID_PROFILE', 400, field);
    }

    let value = (input[field] || '').trim();
    if (!value) {
      values[field] = null;
      continue;
    }

    if (rule.type === 'email') {
      value = value.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        throw profileError('Please enter a valid contact email.', 'INVALID_PROFILE', 400, field);
      }
    }

    if (rule.type === 'phone' && !/^[+0-9()/.\-\s]{5,}$/.test(value)) {
      throw profileError('Please enter a valid phone number.', 'INVALID_PROFILE', 400, field);
    }

    if (rule.type === 'url') {
      if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
      let parsed;
      try {
        parsed = new URL(value);
      } catch (e) {
        throw profileError('Please enter a valid website address.', 'INVALID_PROFILE', 400, field);
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname.includes('.')) {
        throw profileError('Please enter a valid website address.', 'INVALID_PROFILE', 400, field);
      }
      value = parsed.toString();
    }

    if (value.length > rule.max) {
      throw profileError(`${field} is too long (max ${rule.max} characters).`, 'INVALID_PROFILE', 400, field);
    }

    values[field] = value;
  }

  return values;
}

async function updateProfile(restaurantId, values) {
  if (!Object.keys(values).length) return null;

  const { data, error } = await supabase
    .from('restaurants')
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq('id', restaurantId)
    .select('*')
    .single();

  if (error || !data) {
    console.error(`[Profile] Update failed for ${restaurantId}:`, error?.code || '', error?.message || 'no row');
    if (error?.code === 'PGRST204') {
      throw profileError('Restaurant profile requires database migration 2026-10-09.', 'SETTINGS_SCHEMA_MISSING', 409);
    }
    throw profileError(
      'The restaurant profile could not be saved.',
      isPermissionError(error) ? 'DB_PERMISSION_DENIED' : 'PROFILE_SAVE_FAILED',
      500
    );
  }

  return data;
}

// ---------------------------------------------------------------------
// Logo storage
// ---------------------------------------------------------------------
// Only a positive result is cached, so the feature turns on as soon as the
// bucket has been created (no waiting for a stale "missing" result to expire)
let bucketConfirmedAt = 0;

async function isLogoStorageAvailable() {
  if (Date.now() - bucketConfirmedAt < 5 * 60 * 1000) return true;
  try {
    const { data, error } = await supabase.storage.getBucket(LOGO_BUCKET);
    if (!error && data) {
      bucketConfirmedAt = Date.now();
      return true;
    }
  } catch (e) {
    // treated as unavailable
  }
  return false;
}

/**
 * Detects the real image type from magic bytes (the declared Content-Type is not trusted).
 */
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

async function listLogoObjects(restaurantId) {
  const { data, error } = await supabase.storage.from(LOGO_BUCKET).list(restaurantId, { limit: 100 });
  if (error) throw error;
  return (data || []).map((obj) => `${restaurantId}/${obj.name}`);
}

async function setLogoUrl(restaurantId, logoUrl) {
  const { data, error } = await supabase
    .from('restaurants')
    .update({ logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq('id', restaurantId)
    .select('id, logo_url')
    .single();

  if (error || !data) {
    console.error(`[Logo] logo_url update failed for ${restaurantId}:`, error?.code || '', error?.message || 'no row');
    throw profileError(
      'The logo could not be saved.',
      isPermissionError(error) ? 'DB_PERMISSION_DENIED' : 'LOGO_SAVE_FAILED',
      500
    );
  }
  return data.logo_url;
}

async function uploadLogo(restaurantId, buffer, declaredType) {
  if (!(await isLogoStorageAvailable())) {
    throw profileError('Logo storage is not configured (run migration 2026-10-09).', 'LOGO_STORAGE_NOT_CONFIGURED', 409);
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw profileError('Please choose a PNG, JPEG or WebP image.', 'UNSUPPORTED_LOGO_TYPE', 415);
  }

  if (buffer.length > MAX_LOGO_BYTES) {
    throw profileError('The logo must be 2 MB or smaller.', 'LOGO_TOO_LARGE', 413);
  }

  const detected = detectImageType(buffer);
  if (!detected || !LOGO_TYPES[detected] || (declaredType && declaredType !== detected)) {
    throw profileError('Please choose a PNG, JPEG or WebP image.', 'UNSUPPORTED_LOGO_TYPE', 415);
  }

  const objectPath = `${restaurantId}/logo-${Date.now()}.${LOGO_TYPES[detected]}`;
  const storage = supabase.storage.from(LOGO_BUCKET);

  const { error: uploadError } = await storage.upload(objectPath, buffer, {
    contentType: detected,
    cacheControl: '31536000',
    upsert: false
  });

  if (uploadError) {
    console.error(`[Logo] Upload failed for ${restaurantId}:`, uploadError.message);
    throw profileError('The logo could not be uploaded.', 'LOGO_UPLOAD_FAILED', 500);
  }

  const { data: urlData } = storage.getPublicUrl(objectPath);
  const publicUrl = urlData?.publicUrl;

  try {
    await setLogoUrl(restaurantId, publicUrl);
  } catch (err) {
    // Do not leave an orphaned file behind when the database write failed
    await storage.remove([objectPath]).catch(() => {});
    throw err;
  }

  // Remove previous logo files of this restaurant (best effort)
  try {
    const stale = (await listLogoObjects(restaurantId)).filter((p) => p !== objectPath);
    if (stale.length) await storage.remove(stale);
  } catch (e) {
    console.warn(`[Logo] Old logo cleanup failed for ${restaurantId}:`, e.message);
  }

  return publicUrl;
}

async function removeLogo(restaurantId) {
  await setLogoUrl(restaurantId, null);

  if (await isLogoStorageAvailable()) {
    try {
      const objects = await listLogoObjects(restaurantId);
      if (objects.length) await supabase.storage.from(LOGO_BUCKET).remove(objects);
    } catch (e) {
      console.warn(`[Logo] File cleanup failed for ${restaurantId}:`, e.message);
    }
  }
}

// =====================================================================
// Cover photo (public homepage card)
//
// Files are up to 5 MB, above Vercel's request body limit, so the browser
// uploads straight to Supabase Storage through a signed upload URL issued
// here for a path inside its own restaurant folder. The backend then
// downloads the file and validates the real content before saving the URL.
// =====================================================================
const COVER_BUCKET = 'restaurant-images';
const MAX_COVER_BYTES = 5 * 1024 * 1024;
const COVER_PATH_RE = /^cover-\d+-[a-f0-9]{8}\.(png|jpg|webp)$/;

let coverBucketConfirmedAt = 0;

async function isCoverStorageAvailable() {
  if (Date.now() - coverBucketConfirmedAt < 5 * 60 * 1000) return true;
  try {
    const { data, error } = await supabase.storage.getBucket(COVER_BUCKET);
    if (!error && data) {
      coverBucketConfirmedAt = Date.now();
      return true;
    }
  } catch (e) {
    // treated as unavailable
  }
  return false;
}

function coverNotConfigured() {
  return profileError(
    'Cover photo storage is not configured (run migration 2026-10-10).',
    'COVER_STORAGE_NOT_CONFIGURED',
    409
  );
}

async function listCoverObjects(restaurantId) {
  const { data, error } = await supabase.storage.from(COVER_BUCKET).list(restaurantId, { limit: 100 });
  if (error) throw error;
  return (data || [])
    .filter((obj) => obj.name.startsWith('cover-'))
    .map((obj) => `${restaurantId}/${obj.name}`);
}

async function setCoverUrl(restaurantId, coverUrl) {
  const { data, error } = await supabase
    .from('restaurants')
    .update({ cover_image_url: coverUrl, updated_at: new Date().toISOString() })
    .eq('id', restaurantId)
    .select('id, cover_image_url')
    .single();

  if (error || !data) {
    console.error(`[Cover] cover_image_url update failed for ${restaurantId}:`, error?.code || '', error?.message || 'no row');
    // Column missing: migration 2026-10-10 has not been run
    if (error && (error.code === '42703' || error.code === 'PGRST204')) throw coverNotConfigured();
    throw profileError(
      'The cover photo could not be saved.',
      isPermissionError(error) ? 'DB_PERMISSION_DENIED' : 'COVER_SAVE_FAILED',
      500
    );
  }
  return data.cover_image_url;
}

/**
 * Step 1: signed upload URL for a new file in the restaurant's own folder.
 * The declared type/size are only a pre-check; step 2 validates the bytes.
 */
async function createCoverUpload(restaurantId, declaredType, declaredSize) {
  if (!(await isCoverStorageAvailable())) throw coverNotConfigured();

  if (!LOGO_TYPES[declaredType]) {
    throw profileError('Please choose a PNG, JPEG or WebP image.', 'UNSUPPORTED_COVER_TYPE', 415);
  }
  const size = Number(declaredSize);
  if (!Number.isFinite(size) || size <= 0) {
    throw profileError('Please choose a PNG, JPEG or WebP image.', 'UNSUPPORTED_COVER_TYPE', 415);
  }
  if (size > MAX_COVER_BYTES) {
    throw profileError('The cover photo must be 5 MB or smaller.', 'COVER_TOO_LARGE', 413);
  }

  const random = require('crypto').randomBytes(4).toString('hex');
  const objectPath = `${restaurantId}/cover-${Date.now()}-${random}.${LOGO_TYPES[declaredType]}`;
  const { data, error } = await supabase.storage.from(COVER_BUCKET).createSignedUploadUrl(objectPath);

  if (error || !data?.signedUrl) {
    console.error(`[Cover] Signed upload URL failed for ${restaurantId}:`, error?.message || 'no url');
    throw profileError('The cover photo could not be uploaded.', 'COVER_UPLOAD_FAILED', 500);
  }

  return { upload_url: data.signedUrl, path: objectPath };
}

/**
 * Step 2: validate the uploaded file and make it the restaurant's cover photo.
 * Only paths inside the authenticated restaurant's folder are accepted.
 */
async function confirmCoverUpload(restaurantId, objectPath) {
  if (!(await isCoverStorageAvailable())) throw coverNotConfigured();

  const prefix = `${restaurantId}/`;
  if (
    typeof objectPath !== 'string' ||
    !objectPath.startsWith(prefix) ||
    !COVER_PATH_RE.test(objectPath.slice(prefix.length))
  ) {
    throw profileError('Invalid upload.', 'INVALID_COVER_UPLOAD', 400);
  }

  const storage = supabase.storage.from(COVER_BUCKET);
  const { data: blob, error: downloadError } = await storage.download(objectPath);
  if (downloadError || !blob) {
    throw profileError('The uploaded file was not found. Please try again.', 'INVALID_COVER_UPLOAD', 400);
  }

  const buffer = Buffer.from(await blob.arrayBuffer());
  const detected = detectImageType(buffer);
  const extension = objectPath.split('.').pop();
  let rejection = null;

  if (buffer.length > MAX_COVER_BYTES) {
    rejection = profileError('The cover photo must be 5 MB or smaller.', 'COVER_TOO_LARGE', 413);
  } else if (!detected || LOGO_TYPES[detected] !== extension) {
    rejection = profileError('Please choose a PNG, JPEG or WebP image.', 'UNSUPPORTED_COVER_TYPE', 415);
  }

  if (rejection) {
    await storage.remove([objectPath]).catch(() => {});
    throw rejection;
  }

  const { data: urlData } = storage.getPublicUrl(objectPath);
  const publicUrl = urlData?.publicUrl;

  try {
    await setCoverUrl(restaurantId, publicUrl);
  } catch (err) {
    await storage.remove([objectPath]).catch(() => {});
    throw err;
  }

  // Remove previous (and abandoned) cover files of this restaurant (best effort)
  try {
    const stale = (await listCoverObjects(restaurantId)).filter((p) => p !== objectPath);
    if (stale.length) await storage.remove(stale);
  } catch (e) {
    console.warn(`[Cover] Old cover cleanup failed for ${restaurantId}:`, e.message);
  }

  return publicUrl;
}

async function removeCover(restaurantId) {
  await setCoverUrl(restaurantId, null);

  if (await isCoverStorageAvailable()) {
    try {
      const objects = await listCoverObjects(restaurantId);
      if (objects.length) await supabase.storage.from(COVER_BUCKET).remove(objects);
    } catch (e) {
      console.warn(`[Cover] File cleanup failed for ${restaurantId}:`, e.message);
    }
  }
}

module.exports = {
  COVER_BUCKET,
  MAX_COVER_BYTES,
  isCoverStorageAvailable,
  createCoverUpload,
  confirmCoverUpload,
  removeCover,
  LOGO_BUCKET,
  MAX_LOGO_BYTES,
  LOGO_TYPES,
  PROFILE_FIELDS,
  hasProfileColumns,
  pickProfile,
  sanitizeProfile,
  updateProfile,
  isLogoStorageAvailable,
  detectImageType,
  uploadLogo,
  removeLogo
};
