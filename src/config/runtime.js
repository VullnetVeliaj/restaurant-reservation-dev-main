/**
 * Runtime environment flags shared across the backend.
 *
 * Any Vercel deployment (production or preview) counts as production: it serves
 * real tenants, runs on ephemeral/read-only disks, and must use Supabase as the
 * only source of truth.
 */
const isProduction =
  process.env.NODE_ENV === 'production' ||
  Boolean(process.env.VERCEL);

/**
 * Local JSON/in-memory fallback stores (data/*.json, demo tenants) are a
 * development convenience only. They are never used in production, and can be
 * switched off locally with DISABLE_LOCAL_FALLBACK=true.
 */
const allowLocalFallback =
  !isProduction &&
  process.env.DISABLE_LOCAL_FALLBACK !== 'true';

module.exports = {
  isProduction,
  allowLocalFallback
};
