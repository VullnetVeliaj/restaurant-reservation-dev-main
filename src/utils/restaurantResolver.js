/**
 * Resolves the restaurant for public booking requests.
 *
 * - If a public widget key is sent (widget_key), the restaurant is derived from
 *   restaurants.public_widget_key on the server and any browser-supplied
 *   restaurant_id is ignored.
 * - Otherwise an explicit restaurant_id is required and must exist.
 * - There is never a default/fallback restaurant.
 */
const supabase = require('../config/supabase');

function resolverError(message, code, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

function pickParam(req, name) {
  const value = req.body?.[name] ?? req.query?.[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function resolvePublicRestaurantId(req) {
  const widgetKey = pickParam(req, 'widget_key');
  const restaurantId = pickParam(req, 'restaurant_id');

  if (!widgetKey && !restaurantId) {
    throw resolverError('widget_key or restaurant_id is required.', 'RESTAURANT_REQUIRED', 400);
  }

  const query = supabase.from('restaurants').select('id');
  const { data, error } = widgetKey
    ? await query.eq('public_widget_key', widgetKey).maybeSingle()
    : await query.eq('id', restaurantId).maybeSingle();

  if (error) {
    console.error('[Restaurant Resolver] Lookup failed:', error.code || '', error.message);
    throw resolverError('Restaurant could not be loaded.', 'RESTAURANT_LOOKUP_FAILED', 500);
  }

  if (!data) {
    throw resolverError('Dieses Restaurant wurde nicht gefunden.', 'RESTAURANT_NOT_FOUND', 404);
  }

  return data.id;
}

function sendResolverError(res, err) {
  return res.status(err.status || 500).json({
    success: false,
    error: {
      code: err.code || 'RESTAURANT_LOOKUP_FAILED',
      message: err.code ? err.message : 'Restaurant could not be loaded.'
    }
  });
}

module.exports = {
  resolvePublicRestaurantId,
  sendResolverError
};
