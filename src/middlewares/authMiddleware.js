const { verifyToken } = require('../utils/auth');
const supabase = require('../config/supabase');
/**
 * Middleware to authenticate requests via JWT Bearer Token
 */
async function authenticateJWT(req, res, next) {

  try {
 await supabase
          .from('restaurants')
          .insert
    const authHeader =
      req.headers.authorization ||
      req.headers.Authorization;

    let token = null;

    if (
      authHeader &&
      authHeader.startsWith('Bearer ')
    ) {

      token =
        authHeader
          .substring(7)
          .trim();

    } else if (
      req.headers['x-access-token']
    ) {

      token =
        req.headers['x-access-token'];

    }


    if (!token) {

      return res.status(401).json({
        success: false,
        error: {
          message:
            'Für diese Anfrage ist eine Anmeldung erforderlich.'
        }
      });

    }


    const decoded =
      verifyToken(token);


    if (!decoded) {

      return res.status(401).json({
        success: false,
        error: {
          message:
            'Deine Sitzung ist ungültig oder abgelaufen. Bitte melde dich erneut an.'
        }
      });

    }


    if (!decoded.userId) {

      return res.status(401).json({
        success: false,
        error: {
          message:
            'Die Sitzung konnte nicht überprüft werden. Bitte melde dich erneut an.'
        }
      });

    }


    const {
      data: user,
      error: userError
    } = await supabase
      .from('restaurant_users')
      .select(
  'id, restaurant_id, role, email, full_name, is_active, email_verified, session_version'
)
      .eq(
        'id',
        decoded.userId
      )
      .maybeSingle();


    if (userError) {

      console.error(
        '[Auth Middleware User Lookup Error]:',
        userError
      );

      return res.status(500).json({
        success: false,
        error: {
          message:
            'Die Sitzung konnte derzeit nicht überprüft werden.'
        }
      });

    }


    if (
      !user ||
      !user.is_active
    ) {

      return res.status(401).json({
        success: false,
        error: {
          message:
            'Die Sitzung ist nicht mehr gültig. Bitte melde dich erneut an.'
        }
      });

    }


    const tokenSessionVersion =
      Number(
        decoded.session_version ?? 0
      );

    const databaseSessionVersion =
      Number(
        user.session_version ?? 0
      );


    if (
      tokenSessionVersion !==
      databaseSessionVersion
    ) {

      return res.status(401).json({
        success: false,
        error: {
          message:
            'Deine Sitzung ist nicht mehr gültig. Bitte melde dich erneut an.'
        }
      });

    }


    req.user = {
  ...decoded,
  userId: user.id,
  restaurant_id: user.restaurant_id,
  role: user.role,
  email: user.email,
  full_name: user.full_name
};

    next();

  } catch (err) {

    console.error(
      '[Auth Middleware Error]:',
      err
    );

    return res.status(500).json({
      success: false,
      error: {
        message:
          'Bei der Überprüfung der Sitzung ist ein Fehler aufgetreten.'
      }
    });

  }

}

/**
 * Middleware to ensure the authenticated user belongs to the requested restaurant_id
 */
function requireTenantMatch(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: { message: 'Authentication required.' }
    });
  }

  // An authenticated user without a restaurant can never pass a tenant check
  if (!req.user.restaurant_id) {
    return res.status(403).json({
      success: false,
      error: { message: 'Forbidden: No restaurant is associated with this account.' }
    });
  }

  // Every tenant id the client supplies (path, body, query) must match the session's restaurant
  const suppliedTenants = [
    req.params?.restaurant_id,
    req.body?.restaurant_id,
    req.query?.restaurant_id
  ].filter((value) => value !== undefined && value !== null && value !== '');

  const mismatch = suppliedTenants.find((value) => String(value) !== String(req.user.restaurant_id));

  if (mismatch !== undefined) {
    return res.status(403).json({
      success: false,
      error: {
        message: 'Forbidden: You do not have permission to access or manage this restaurant.'
      }
    });
  }

  next();
}

/**
 * Middleware to restrict route access to specific RBAC roles ('OWNER', 'MANAGER', 'STAFF')
 */
function requireRoles(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { message: 'Authentication required.' }
      });
    }

    const userRole = (req.user.role || 'STAFF').toUpperCase();
    const normalizedAllowed = allowedRoles.map((r) => r.toUpperCase());

    if (!normalizedAllowed.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: {
          message: `Forbidden: Insufficient privileges. Required role(s): [${allowedRoles.join(', ')}]. Current role: [${userRole}].`
        }
      });
    }

    next();
  };
}

module.exports = {
  authenticateJWT,
  requireTenantMatch,
  requireRoles
};
