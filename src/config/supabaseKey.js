/**
 * Supabase key selection and role detection.
 *
 * The backend reads and writes tenant tables that have Row Level Security
 * enabled, so it must use a service-role/secret key. A public anon/publishable
 * key makes RLS silently hide rows (reads return nothing) and reject writes.
 *
 * Only the key's role is ever reported — never the key itself.
 */
function resolveSupabaseKey() {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    ''
  );
}

/**
 * Returns 'service_role' | 'anon' | 'secret' | 'publishable' | 'missing' | 'unknown'.
 * Legacy keys are JWTs carrying a `role` claim; new keys use sb_secret_/sb_publishable_ prefixes.
 */
function detectSupabaseKeyRole(key = resolveSupabaseKey()) {
  if (!key) return 'missing';
  if (key.startsWith('sb_secret_')) return 'secret';
  if (key.startsWith('sb_publishable_')) return 'publishable';

  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
      return payload.role || 'unknown';
    } catch (e) {
      return 'unknown';
    }
  }

  return 'unknown';
}

function isPrivilegedSupabaseKey(role = detectSupabaseKeyRole()) {
  return role === 'service_role' || role === 'secret';
}

module.exports = {
  resolveSupabaseKey,
  detectSupabaseKeyRole,
  isPrivilegedSupabaseKey
};
