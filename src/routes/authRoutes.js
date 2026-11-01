const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const router = express.Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minuta
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message:
        'Zu viele Anmeldeversuche. Bitte versuchen Sie es in 15 Minuten erneut.'
    }
  }
});
const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message:
        'Zu viele Anfragen zum Zurücksetzen des Passworts. Bitte versuchen Sie es in 15 Minuten erneut.'
    }
  }
});

const resendVerificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message:
        'Zu viele Anfragen für eine neue Bestätigungs-E-Mail. Bitte versuchen Sie es in 15 Minuten erneut.'
    }
  }
});

const resetPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message:
        'Zu viele Versuche zum Zurücksetzen des Passworts. Bitte versuchen Sie es in 15 Minuten erneut.'
    }
  }
});

const supabase = require('../config/supabase');
const { generateToken, hashPassword, comparePassword } = require('../utils/auth');
const { registerLimiter } = require('../middlewares/rateLimiters');
const { authenticateJWT } = require('../middlewares/authMiddleware');
const {
  sendTransactionalEmail
} = require('../services/emailService');
// I.C added - welcome email after restaurant registration


function slugify(text) {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-');
}

/**
 * 1. POST /api/auth/register
 * Public onboarding wizard: registers restaurant, owner account, default settings & shifts
 */
router.post('/register', registerLimiter, async (req, res) => {
  try {
    const {
      restaurant_name,
      slug,
      primary_color = '#0284c7',
      full_name,
      email,
      password,
      max_covers_per_slot = 20,
      slot_interval_minutes = 30
    } = req.body;

    if (!restaurant_name || !full_name || !email || !password) {
      return res.status(400).json({
        success: false,
        error: {
          message:
            'Bitte füllen Sie alle Pflichtfelder aus: Restaurantname, vollständiger Name, E-Mail-Adresse und Passwort.'
        }
      });
    }

    const passwordValid =
      password.length >= 8 &&
      /[A-Za-z]/.test(password) &&
      /\d/.test(password);

    if (!passwordValid) {
      return res.status(400).json({
        success: false,
        error: {
          message:
            'Das Passwort muss mindestens 8 Zeichen lang sein und mindestens einen Buchstaben sowie eine Zahl enthalten.'
        }
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    /* -----------------------------------------
       Check if email is already registered
    ----------------------------------------- */

    let existingUser = null;

    try {
      const { data, error } = await supabase
        .from('restaurant_users')
        .select('id, email')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (!error && data) {
        existingUser = data;
      }
    } catch (e) {
      console.warn(
        '[Register Email Check]',
        e.message
      );
    }

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'EMAIL_ALREADY_EXISTS',
          message:
            'Diese E-Mail-Adresse ist bereits registriert. Bitte melden Sie sich an, um ein weiteres Restaurant hinzuzufügen.'
        }
      });
    }
    const baseSlug =
      slugify(slug || restaurant_name);

    if (!baseSlug) {
      return res.status(400).json({
        success: false,
        error: {
          message:
            'Bitte geben Sie einen gültigen Restaurantnamen oder eine gültige Restaurant-URL ein.'
        }
      });
    }

    let resolvedSlug = baseSlug;
    let suffix = 2;
    let slugExists = true;

    while (slugExists) {

      const { data: existingRestaurant, error } =
        await supabase
          .from('restaurants')
          .select('id')
          .eq('slug', resolvedSlug)
          .maybeSingle();

      if (error) {
        console.error(
          '[Register Slug Check]',
          error
        );

        throw new Error(
          'Die Restaurant-URL konnte nicht überprüft werden.'
        );
      }

      if (!existingRestaurant) {
        slugExists = false;
        break;
      }

      resolvedSlug =
        `${baseSlug}-${suffix}`;

      suffix++;
    }
    const parsedMaxCovers =
      parseInt(max_covers_per_slot, 10);

    const parsedSlotInterval =
      parseInt(slot_interval_minutes, 10);

    if (
      !Number.isInteger(parsedMaxCovers) ||
      parsedMaxCovers < 1 ||
      parsedMaxCovers > 200
    ) {
      return res.status(400).json({
        success: false,
        error: {
          message:
            'Die maximale Gästeanzahl pro Zeitfenster muss zwischen 1 und 200 liegen.'
        }
      });
    }

    const allowedIntervals = [
      15,
      30,
      45,
      60,
      75,
      90,
      105,
      120,
      150,
      180
    ];

    if (
      !allowedIntervals.includes(
        parsedSlotInterval
      )
    ) {
      return res.status(400).json({
        success: false,
        error: {
          message:
            'Das Reservierungsintervall ist ungültig.'
        }
      });
    }

    const restaurantId = `rest-${Date.now().toString(36)}`;
    const hashedPassword = await hashPassword(password);
    const publicWidgetKey =
  `pub_${crypto.randomBytes(16).toString('hex')}`;

    // 1. Create Restaurant record
    const restaurantRecord = {
      id: restaurantId,
      name: restaurant_name.trim(),
      slug: resolvedSlug,
      public_widget_key: publicWidgetKey,
      primary_color: primary_color || '#0284c7',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const {
      error: restaurantInsertError
    } = await supabase
      .from('restaurants')
      .insert([restaurantRecord]);

    if (restaurantInsertError) {
      console.error(
        '[Register DB Restaurant Error]:',
        restaurantInsertError
      );

      throw new Error(
        `Das Restaurant konnte nicht erstellt werden: ${restaurantInsertError.message}`
      );
    }

    // 2. Create Owner User record
    const userRecord = {
      id: crypto.randomUUID(),
      restaurant_id: restaurantId,
      email: cleanEmail,
      password_hash: hashedPassword,
      full_name: full_name.trim(),
      role: 'OWNER',
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const {
      error: userInsertError
    } = await supabase
      .from('restaurant_users')
      .insert([userRecord]);

    if (userInsertError) {
      console.error(
        '[Register DB User Error]:',
        userInsertError
      );

      throw new Error(
        `Das Inhaberkonto konnte nicht erstellt werden: ${userInsertError.message}`
      );
    }

// E-Mail-Verifizierung vorbereiten
const verificationToken =
  crypto
    .randomBytes(32)
    .toString('hex');

const verificationTokenHash =
  crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');

const verificationExpiresAt =
  new Date(
    Date.now() + 24 * 60 * 60 * 1000
  ).toISOString();

const {
  error: verificationTokenInsertError
} = await supabase
  .from('email_verification_tokens')
  .insert([
    {
      user_id: userRecord.id,
      token_hash: verificationTokenHash,
      expires_at: verificationExpiresAt
    }
  ]);

if (verificationTokenInsertError) {
  console.error(
    '[Registration Verification Token Error]:',
    verificationTokenInsertError
  );

  throw new Error(
    'Der Bestätigungslink konnte nicht erstellt werden.'
  );
}

const verificationUrl =
  `${process.env.APP_URL || 'http://localhost:3000'}` +
  `/verify-email.html?token=${encodeURIComponent(
    verificationToken
  )}`;


    // 3. Create Default Settings
    const settingsRecord = {
      restaurant_id: restaurantId,
      timezone: 'Europe/Berlin',
      max_covers_per_slot:
        parsedMaxCovers,

      slot_interval_minutes:
        parsedSlotInterval,
      min_advance_notice_mins: 60,
      max_advance_days: 30,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    try {
      await supabase.from('restaurant_settings').insert([settingsRecord]);
    } catch (e) {
      console.warn('[Register DB Settings Fallback]:', e.message);
    }

    // 4. Create Default Shifts (Mon-Sun: Lunch 11:30-14:30, Dinner 17:00-22:30)
    const shiftsToInsert = [];
    for (let day = 0; day <= 6; day++) {
      shiftsToInsert.push({
        restaurant_id: restaurantId,
        day_of_week: day,
        shift_name: 'Lunch',
        start_time: '11:30',
        end_time: '14:30',
        is_active: true
      });
      shiftsToInsert.push({
        restaurant_id: restaurantId,
        day_of_week: day,
        shift_name: 'Dinner',
        start_time: '17:00',
        end_time: '22:30',
        is_active: true
      });
    }

    const {
      error: shiftsInsertError
    } = await supabase
      .from('restaurant_shifts')
      .insert(shiftsToInsert);

    if (shiftsInsertError) {
      console.error(
        '[Register DB Shifts Error]:',
        shiftsInsertError
      );

      throw new Error(
        `Die Standard-Öffnungszeiten konnten nicht erstellt werden: ${shiftsInsertError.message}`
      );
    }

   

    // 6. I.C added - Send welcome email to restaurant owner
    // 6. Send welcome email to restaurant owner
    try {
      const welcomeEmailHtml = `
    <!DOCTYPE html>
    <html>
      <body style="
        margin:0;
        padding:0;
        background:#f5f0eb;
        font-family:Arial,Helvetica,sans-serif;
        color:#292522;
      ">
        <div style="
          max-width:600px;
          margin:40px auto;
          background:#ffffff;
          border:1px solid #ddd3ca;
          border-radius:16px;
          overflow:hidden;
        ">

          <div style="
            padding:32px;
            text-align:center;
            background:#292522;
            color:#ffffff;
          ">
            <div style="
              font-size:13px;
              text-transform:uppercase;
              letter-spacing:1.5px;
              color:#d4a373;
              margin-bottom:10px;
            ">
              TableAI – Restaurantverwaltung
            </div>

            <h1 style="
              margin:0;
              font-size:26px;
            ">
              Willkommen, ${userRecord.full_name}!
            </h1>
          </div>

          <div style="padding:32px;">

            <p style="
              font-size:16px;
              line-height:1.6;
              margin-top:0;
            ">
              Ihr Restaurantkonto wurde erfolgreich erstellt.

              Bitte bestätigen Sie jetzt Ihre E-Mail-Adresse, um Ihr Konto zu aktivieren.
              Der Bestätigungslink ist 24 Stunden gültig.
            </p>

            <div style="
              background:#faf7f4;
              border:1px solid #e5ddd6;
              border-radius:12px;
              padding:20px;
              margin:24px 0;
            ">

              <div style="
                font-size:12px;
                color:#8a7e75;
                text-transform:uppercase;
                margin-bottom:6px;
              ">
                Restaurant
              </div>

              <div style="
                font-size:20px;
                font-weight:bold;
                margin-bottom:18px;
              ">
                ${restaurantRecord.name}
              </div>

              <div style="
                font-size:12px;
                color:#8a7e75;
                text-transform:uppercase;
                margin-bottom:6px;
              ">
                E-Mail-Adresse
              </div>

              <div style="
                font-size:15px;
                font-weight:600;
              ">
                ${cleanEmail}
              </div>

            </div>

            <p style="
              font-size:15px;
              line-height:1.6;
              color:#71675f;
            ">
              Sie können sich jetzt im Admin-Bereich anmelden,
              Ihre Öffnungszeiten, Kapazitäten, Mitarbeiterkonten
              und das Erscheinungsbild Ihres Restaurants verwalten
              und Reservierungen empfangen.
            </p>

            <div style="
              text-align:center;
              margin-top:30px;
            ">
              <a
                href="${verificationUrl}"
                style="
                  display:inline-block;
                  background:#d4a373;
                  color:#292522;
                  padding:14px 24px;
                  border-radius:8px;
                  text-decoration:none;
                  font-weight:bold;
                "
              >
                E-Mail-Adresse bestätigen
              </a>
            </div>

          </div>

          <div style="
            padding:20px 32px;
            text-align:center;
            border-top:1px solid #eee7e1;
            color:#9a8e84;
            font-size:12px;
          ">
            Ihr TableAI-Restaurantbereich ist jetzt einsatzbereit.
          </div>

        </div>
      </body>
    </html>
  `;

      const emailResult = await sendTransactionalEmail(
        cleanEmail,
        `Willkommen auf Ihrer Plattform für Restaurantreservierungen - ${restaurantRecord.name}`,
        welcomeEmailHtml
      );

      console.log('[Registration Welcome Email]', emailResult);

    } catch (emailError) {
      // Registration must NOT fail just because email failed
      console.error(
        '[Registration Welcome Email Error]',
        emailError.message
      );
    }
    // 7. Return registration success
return res.status(201).json({
  success: true,
  message:
    'Ihr Restaurantkonto wurde erfolgreich erstellt. Bitte bestätigen Sie Ihre E-Mail-Adresse, bevor Sie sich anmelden.',
  user: {
    id: userRecord.id,
    restaurant_id: restaurantId,
    email: cleanEmail,
    full_name: userRecord.full_name,
    role: 'OWNER',
    email_verified: false
  },
  restaurant: restaurantRecord
});
  } catch (err) {
    console.error('[POST /api/auth/register] Error:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Bei der Registrierung ist ein interner Fehler aufgetreten.' }
    });
  }
});

/**
 * 2. POST /api/auth/login
 * Validates credentials via bcrypt & issues a signed JWT
 */
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: { message: 'Bitte geben Sie Ihre E-Mail-Adresse und Ihr Passwort ein.' }
      });
    }

    const cleanEmail = email.toLowerCase().trim();

    // 1. Benutzer ausschließlich aus Supabase laden
    let user = null;
    try {
      const { data, error } = await supabase
        .from('restaurant_users')
        .select('*')
        .eq('email', cleanEmail)
        .single();

      if (!error && data) user = data;
    } catch (e) {

      console.error(

        '[Login Benutzerabfrage Fehler]:',

        e

      );

    }

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          message:
            'E-Mail-Adresse oder Passwort ist falsch.'
        }
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: { message: 'Ihr Konto wurde deaktiviert. Bitte wenden Sie sich an den Restaurantinhaber.' }
      });
    }
    if (!user.email_verified) {
  return res.status(403).json({
    success: false,
    error: {
      code: 'EMAIL_NOT_VERIFIED',
      message:
        'Bitte bestätigen Sie zuerst Ihre E-Mail-Adresse, bevor Sie sich anmelden.'
    }
  });
}

    // 2. Validate password
    const isMatch =
      await comparePassword(
        password,
        user.password_hash
      );

    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: {
          message:
            'E-Mail-Adresse oder Passwort ist falsch.'
        }
      });
    }

    // 3. Restaurant nur aus Supabase laden
    const {
      data: restaurant,
      error: restaurantError
    } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', user.restaurant_id)
      .maybeSingle();

    if (restaurantError) {

      console.error(
        '[Login Restaurant Lookup Error]:',
        restaurantError
      );

      return res.status(500).json({
        success: false,
        error: {
          message:
            'Das Restaurant konnte derzeit nicht geladen werden.'
        }
      });
    }

    if (!restaurant) {

      return res.status(401).json({
        success: false,
        error: {
          message:
            'Für dieses Benutzerkonto wurde kein Restaurant gefunden.'
        }
      });
    }
    // 4. Generate JWT
    const token = generateToken({
      userId: user.id,
      restaurant_id: user.restaurant_id,
      role: user.role || 'OWNER',
      email: user.email,
      full_name: user.full_name,
      session_version: user.session_version || 0
    });

    return res.status(200).json({
      success: true,
      message: 'Anmeldung erfolgreich.',
      token,
      user: {
        id: user.id,
        restaurant_id: user.restaurant_id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      },
      restaurant
    });
  } catch (err) {
    console.error('[POST /api/auth/login] Error:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Bei der Anmeldung ist ein interner Fehler aufgetreten.' }
    });
  }
});

/**
 * 3. GET /api/auth/me
 * Returns current authenticated user and restaurant profile
 */
router.get('/me', authenticateJWT, async (req, res) => {
  try {
    const { userId } = req.user;

    const {
      data: user,
      error: userError
    } = await supabase
      .from('restaurant_users')
      .select(
        'id, restaurant_id, email, full_name, role, is_active, created_at'
      )
      .eq('id', userId)
      .maybeSingle();

    if (userError) {

      console.error(
        '[GET /api/auth/me User Error]:',
        userError
      );

      return res.status(500).json({
        success: false,
        error: {
          message:
            'Das Benutzerkonto konnte nicht überprüft werden.'
        }
      });
    }

    if (!user || !user.is_active) {

      return res.status(401).json({
        success: false,
        error: {
          message: 'Ihre Sitzung ist nicht mehr gültig. Bitte melden Sie sich erneut an.'
        }
      });
    }
    const {
      data: restaurant,
      error: restaurantError
    } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', user.restaurant_id)
      .maybeSingle();

    if (restaurantError) {
      console.error(
        '[GET /api/auth/me Restaurant Error]:',
        restaurantError
      );

      return res.status(500).json({
        success: false,
        error: {
          message:
            'Das Restaurant konnte nicht geladen werden.'
        }
      });
    }

    if (!restaurant) {

      return res.status(401).json({
        success: false,
        error: {
          message:
            'Für dieses Benutzerkonto wurde kein Restaurant gefunden.'
        }
      });
    }

    return res.status(200).json({
      success: true,
      user: user ? {
        id: user.id,
        restaurant_id: user.restaurant_id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      } : req.user,
      restaurant: restaurant
    });






  } catch (err) {
    console.error('[GET /api/auth/me] Error:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Beim Laden des Benutzerprofils ist ein interner Fehler aufgetreten.' }
    });
  }
});

router.post(
  '/forgot-password',
  forgotPasswordLimiter,
  async (req, res) => {
    try {
      const email =
        (req.body.email || '')
          .toLowerCase()
          .trim();

      if (!email) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              'Bitte geben Sie Ihre E-Mail-Adresse ein.'
          }
        });
      }

      const genericSuccessMessage =
        'Wenn ein Konto mit dieser E-Mail-Adresse existiert, wurde ein Link zum Zurücksetzen des Passworts gesendet.';

      const { data: user, error: userError } =
        await supabase
          .from('restaurant_users')
          .select('id, email, full_name')
          .eq('email', email)
          .maybeSingle();

      if (userError) {
        console.error(
          '[Forgot Password User Lookup Error]:',
          userError
        );

        return res.status(500).json({
          success: false,
          error: {
            message:
              'Die Anfrage konnte derzeit nicht verarbeitet werden.'
          }
        });
      }

      /*
        Wichtig:
        Auch wenn kein Benutzer gefunden wurde,
        geben wir dieselbe Antwort zurück.
        Dadurch kann niemand prüfen,
        welche E-Mail-Adressen registriert sind.
      */
      if (!user) {
        return res.status(200).json({
          success: true,
          message: genericSuccessMessage
        });
      }


      const {
        error: deleteTokenError
      } = await supabase
        .from('password_reset_tokens')
        .delete()
        .eq('user_id', user.id)
        .is('used_at', null);

      if (deleteTokenError) {
        console.error(
          '[Forgot Password Old Token Delete Error]:',
          deleteTokenError
        );

        return res.status(500).json({
          success: false,
          error: {
            message:
              'Die Anfrage konnte derzeit nicht verarbeitet werden.'
          }
        });
      }


      /* Sicheren Reset-Token erzeugen */
      const resetToken =
        crypto
          .randomBytes(32)
          .toString('hex');


      /* Nur den Hash in der Datenbank speichern */
      const tokenHash =
        crypto
          .createHash('sha256')
          .update(resetToken)
          .digest('hex');


      /* Token läuft nach 30 Minuten ab */
      const expiresAt =
        new Date(
          Date.now() + 30 * 60 * 1000
        ).toISOString();

      const resetUrl =
        `${process.env.APP_URL || 'http://localhost:3000'}` +
        `/reset-password.html?token=${encodeURIComponent(resetToken)}`;

      const {
        error: tokenInsertError
      } = await supabase
        .from('password_reset_tokens')
        .insert([
          {
            user_id: user.id,
            token_hash: tokenHash,
            expires_at: expiresAt
          }
        ]);

      if (tokenInsertError) {
        console.error(
          '[Forgot Password Token Insert Error]:',
          tokenInsertError
        );

        return res.status(500).json({
          success: false,
          error: {
            message:
              'Die Anfrage konnte derzeit nicht verarbeitet werden.'
          }
        });
      }

      try {

        const resetEmailHtml = `
    <!DOCTYPE html>
    <html lang="de">
      <body style="
        margin:0;
        padding:0;
        background:#f5f0eb;
        font-family:Arial,Helvetica,sans-serif;
        color:#292522;
      ">

        <div style="
          max-width:600px;
          margin:40px auto;
          background:#ffffff;
          border:1px solid #ddd3ca;
          border-radius:16px;
          overflow:hidden;
        ">

          <div style="
            padding:32px;
            text-align:center;
            background:#292522;
            color:#ffffff;
          ">

            <div style="
              font-size:13px;
              text-transform:uppercase;
              letter-spacing:1.5px;
              color:#d4a373;
              margin-bottom:10px;
            ">
              TableAI
            </div>

            <h1 style="
              margin:0;
              font-size:26px;
            ">
              Passwort zurücksetzen
            </h1>

          </div>

          <div style="padding:32px;">

            <p style="
              font-size:16px;
              line-height:1.6;
              margin-top:0;
            ">
              Hallo ${user.full_name || ''},
            </p>

            <p style="
              font-size:15px;
              line-height:1.6;
              color:#71675f;
            ">
              wir haben eine Anfrage zum Zurücksetzen Ihres Passworts erhalten.
            </p>

            <p style="
              font-size:15px;
              line-height:1.6;
              color:#71675f;
            ">
              Über den folgenden Button können Sie ein neues Passwort festlegen.
              Der Link ist 30 Minuten gültig.
            </p>

            <div style="
              text-align:center;
              margin:30px 0;
            ">

              <a
                href="${resetUrl}"
                style="
                  display:inline-block;
                  background:#d4a373;
                  color:#292522;
                  padding:14px 24px;
                  border-radius:8px;
                  text-decoration:none;
                  font-weight:bold;
                "
              >
                Neues Passwort festlegen
              </a>

            </div>

            <p style="
              font-size:13px;
              line-height:1.6;
              color:#91877f;
            ">
              Wenn Sie diese Anfrage nicht gestellt haben,
              können Sie diese E-Mail ignorieren.
              Ihr bisheriges Passwort bleibt unverändert.
            </p>

          </div>

          <div style="
            padding:20px 32px;
            text-align:center;
            border-top:1px solid #eee7e1;
            color:#9a8e84;
            font-size:12px;
          ">
            TableAI – Restaurantverwaltung
          </div>

        </div>

      </body>
    </html>
  `;

        await sendTransactionalEmail(
          user.email,
          'TableAI – Passwort zurücksetzen',
          resetEmailHtml
        );

      } catch (emailError) {

        console.error(
          '[Forgot Password Email Error]:',
          emailError.message
        );

      }

      /*
        Der echte resetToken wird NICHT
        in der Datenbank gespeichert.
        Er wird im nächsten Schritt nur
        im Reset-Link per E-Mail versendet.
      */

      return res.status(200).json({
        success: true,
        message: genericSuccessMessage
      });

    } catch (err) {
      console.error(
        '[POST /api/auth/forgot-password] Error:',
        err
      );

      return res.status(500).json({
        success: false,
        error: {
          message:
            'Beim Zurücksetzen des Passworts ist ein Fehler aufgetreten.'
        }
      });
    }
  });



router.post(
  '/reset-password',
  resetPasswordLimiter,
  async (req, res) => {
    try {
      const {
        token,
        new_password
      } = req.body;

      if (!token || !new_password) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              'Token und neues Passwort sind erforderlich.'
          }
        });
      }

      const passwordValid =
        new_password.length >= 8 &&
        /[A-Za-z]/.test(new_password) &&
        /\d/.test(new_password);

      if (!passwordValid) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              'Das neue Passwort muss mindestens 8 Zeichen lang sein und mindestens einen Buchstaben sowie eine Zahl enthalten.'
          }
        });
      }

      const tokenHash =
        crypto
          .createHash('sha256')
          .update(token)
          .digest('hex');

      const {
        data: resetTokenRecord,
        error: tokenLookupError
      } = await supabase
        .from('password_reset_tokens')
        .select(
          'id, user_id, expires_at, used_at'
        )
        .eq('token_hash', tokenHash)
        .maybeSingle();

      if (tokenLookupError) {
        console.error(
          '[Reset Password Token Lookup Error]:',
          tokenLookupError
        );

        return res.status(500).json({
          success: false,
          error: {
            message:
              'Die Anfrage konnte derzeit nicht verarbeitet werden.'
          }
        });
      }

      if (!resetTokenRecord) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              'Der Link zum Zurücksetzen des Passworts ist ungültig.'
          }
        });
      }

      if (resetTokenRecord.used_at) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              'Dieser Link wurde bereits verwendet.'
          }
        });
      }

      if (
        new Date(resetTokenRecord.expires_at) <
        new Date()
      ) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              'Der Link zum Zurücksetzen des Passworts ist abgelaufen.'
          }
        });
      }

      const {
        data: currentUser,
        error: currentUserError
      } = await supabase
        .from('restaurant_users')
        .select('id, password_hash, session_version')
        .eq(
          'id',
          resetTokenRecord.user_id
        )
        .maybeSingle();

      if (currentUserError) {
        console.error(
          '[Reset Password Current User Lookup Error]:',
          currentUserError
        );

        return res.status(500).json({
          success: false,
          error: {
            message:
              'Das Benutzerkonto konnte nicht überprüft werden.'
          }
        });
      }

      if (!currentUser) {
        return res.status(404).json({
          success: false,
          error: {
            message:
              'Benutzerkonto nicht gefunden.'
          }
        });
      }

      const sameAsOldPassword =
        await comparePassword(
          new_password,
          currentUser.password_hash
        );

      if (sameAsOldPassword) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              'Das neue Passwort darf nicht mit dem bisherigen Passwort übereinstimmen.'
          }
        });
      }

      const newHashedPassword =
        await hashPassword(
          new_password
        );



      const nextSessionVersion = Number(currentUser.session_version ?? 0) + 1;

      const {
        error: passwordUpdateError
      } = await supabase
        .from('restaurant_users')
        .update({
          password_hash: newHashedPassword,
          session_version: nextSessionVersion,
          updated_at: new Date().toISOString()
        })
        .eq(
          'id',
          resetTokenRecord.user_id
        );

      if (passwordUpdateError) {
        console.error(
          '[Reset Password User Update Error]:',
          passwordUpdateError
        );

        return res.status(500).json({
          success: false,
          error: {
            message:
              'Das Passwort konnte nicht aktualisiert werden.'
          }
        });
      }

      const {
        error: tokenUpdateError
      } = await supabase
        .from('password_reset_tokens')
        .update({
          used_at:
            new Date().toISOString()
        })
        .eq(
          'id',
          resetTokenRecord.id
        );

      if (tokenUpdateError) {
        console.error(
          '[Reset Password Token Update Error]:',
          tokenUpdateError
        );

        return res.status(500).json({
          success: false,
          error: {
            message:
              'Der Reset-Link konnte nicht abgeschlossen werden.'
          }
        });
      }

      return res.status(200).json({
        success: true,
        message:
          'Ihr Passwort wurde erfolgreich geändert. Sie können sich jetzt anmelden.'
      });

    } catch (err) {
      console.error(
        '[POST /api/auth/reset-password] Error:',
        err
      );

      return res.status(500).json({
        success: false,
        error: {
          message:
            'Beim Zurücksetzen des Passworts ist ein Fehler aufgetreten.'
        }
      });
    }
  });






/**
 * 4. PATCH /api/auth/password
 * Allows authenticated user to update their password
 */
router.patch('/password', authenticateJWT, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;

    const newPasswordValid =
      typeof new_password === 'string' &&
      new_password.length >= 8 &&
      /[A-Za-z]/.test(new_password) &&
      /\d/.test(new_password);

    if (!newPasswordValid) {
      return res.status(400).json({
        success: false,
        error: {
          message:
            'Das neue Passwort muss mindestens 8 Zeichen lang sein und mindestens einen Buchstaben sowie eine Zahl enthalten.'
        }
      });
    }

    const { userId, email } = req.user;
    let currentUser = null;

    const { data: dbUser, error: userFetchError } =
      await supabase
        .from('restaurant_users')
        .select('id, email, password_hash, session_version')
        .eq('id', userId)
        .maybeSingle();

    if (userFetchError) {
      console.error(
        '[Password Change User Fetch Error]:',
        userFetchError
      );

      return res.status(500).json({
        success: false,
        error: {
          message:
            'Das Benutzerkonto konnte nicht überprüft werden.'
        }
      });
    }

    currentUser = dbUser;

    if (!currentUser) {
      return res.status(404).json({
        success: false,
        error: {
          message:
            'Benutzerkonto nicht gefunden.'
        }
      });
    }

    const currentPasswordValid =
      await comparePassword(
        current_password,
        currentUser.password_hash
      );

    if (!currentPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          message:
            'Das aktuelle Passwort ist nicht korrekt.'
        }
      });
    }

    const sameAsCurrentPassword =
      await comparePassword(
        new_password,
        currentUser.password_hash
      );

    if (sameAsCurrentPassword) {
      return res.status(400).json({
        success: false,
        error: {
          message:
            'Das neue Passwort darf nicht mit dem aktuellen Passwort übereinstimmen.'
        }
      });
    }

    const newHashed = await hashPassword(new_password);

    const nextSessionVersion =
      Number(
        currentUser.session_version ?? 0
      ) + 1;

    const {
      error: passwordUpdateError
    } = await supabase
      .from('restaurant_users')
      .update({
        password_hash: newHashed,
        session_version: nextSessionVersion,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);
    if (passwordUpdateError) {
      console.error(
        '[Password Update Error]:',
        passwordUpdateError
      );

      return res.status(500).json({
        success: false,
        error: {
          message:
            'Das Passwort konnte nicht aktualisiert werden.'
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Das Passwort wurde erfolgreich aktualisiert. Bitte verwenden Sie ab jetzt Ihr neues Passwort.'
    });
  } catch (err) {
    console.error('[PATCH /api/auth/password] Error:', err);
    return res.status(500).json({
      success: false,
      error: { message: 'Beim Aktualisieren des Passworts ist ein interner Fehler aufgetreten.' }
    });
  }
});

router.get('/verify-email', async (req, res) => {
  try {
    const token = (req.query.token || '').trim();

    if (!token) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Der Bestätigungslink ist ungültig.'
        }
      });
    }

    const tokenHash =
      crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

    const {
      data: verificationRecord,
      error: verificationLookupError
    } = await supabase
      .from('email_verification_tokens')
      .select('id, user_id, expires_at, used_at')
      .eq('token_hash', tokenHash)
      .maybeSingle();

    if (verificationLookupError) {
      console.error(
        '[Email Verification Token Lookup Error]:',
        verificationLookupError
      );

      return res.status(500).json({
        success: false,
        error: {
          message:
            'Die E-Mail-Adresse konnte derzeit nicht bestätigt werden.'
        }
      });
    }

    if (!verificationRecord) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Der Bestätigungslink ist ungültig.'
        }
      });
    }

    if (verificationRecord.used_at) {
      return res.status(400).json({
        success: false,
        error: {
          message:
            'Dieser Bestätigungslink wurde bereits verwendet.'
        }
      });
    }

    if (
      new Date(verificationRecord.expires_at) <
      new Date()
    ) {
      return res.status(400).json({
        success: false,
        error: {
          message:
            'Der Bestätigungslink ist abgelaufen.'
        }
      });
    }

    const verifiedAt = new Date().toISOString();

    const {
      error: userUpdateError
    } = await supabase
      .from('restaurant_users')
      .update({
        email_verified: true,
        email_verified_at: verifiedAt,
        updated_at: verifiedAt
      })
      .eq('id', verificationRecord.user_id);

    if (userUpdateError) {
      console.error(
        '[Email Verification User Update Error]:',
        userUpdateError
      );

      return res.status(500).json({
        success: false,
        error: {
          message:
            'Die E-Mail-Adresse konnte derzeit nicht bestätigt werden.'
        }
      });
    }

    const {
      error: tokenUpdateError
    } = await supabase
      .from('email_verification_tokens')
      .update({
        used_at: verifiedAt
      })
      .eq('id', verificationRecord.id);

    if (tokenUpdateError) {
      console.error(
        '[Email Verification Token Update Error]:',
        tokenUpdateError
      );

      return res.status(500).json({
        success: false,
        error: {
          message:
            'Die E-Mail-Bestätigung konnte nicht abgeschlossen werden.'
        }
      });
    }

    return res.status(200).json({
      success: true,
      message:
        'Ihre E-Mail-Adresse wurde erfolgreich bestätigt.'
    });

  } catch (err) {
    console.error(
      '[GET /api/auth/verify-email] Error:',
      err
    );

    return res.status(500).json({
      success: false,
      error: {
        message:
          'Bei der E-Mail-Bestätigung ist ein interner Fehler aufgetreten.'
      }
    });
  }
});



router.post(
  '/resend-verification',
  resendVerificationLimiter,
  async (req, res) => {
    try {
      const email =
        (req.body.email || '')
          .toLowerCase()
          .trim();

      if (!email) {
        return res.status(400).json({
          success: false,
          error: {
            message:
              'Bitte geben Sie Ihre E-Mail-Adresse ein.'
          }
        });
      }

      const genericSuccessMessage =
        'Wenn ein noch nicht bestätigtes Konto mit dieser E-Mail-Adresse existiert, wurde eine neue Bestätigungs-E-Mail gesendet.';

      const {
        data: user,
        error: userError
      } = await supabase
        .from('restaurant_users')
        .select(
          'id, email, full_name, email_verified'
        )
        .eq('email', email)
        .maybeSingle();

      if (userError) {
        console.error(
          '[Resend Verification User Lookup Error]:',
          userError
        );

        return res.status(500).json({
          success: false,
          error: {
            message:
              'Die Anfrage konnte derzeit nicht verarbeitet werden.'
          }
        });
      }

      /*
        Absichtlich immer dieselbe Antwort,
        damit niemand feststellen kann,
        welche E-Mail-Adressen registriert sind.
      */
      if (
        !user ||
        user.email_verified
      ) {
        return res.status(200).json({
          success: true,
          message: genericSuccessMessage
        });
      }

      const {
        error: deleteTokenError
      } = await supabase
        .from('email_verification_tokens')
        .delete()
        .eq('user_id', user.id)
        .is('used_at', null);

      if (deleteTokenError) {
        console.error(
          '[Resend Verification Old Token Delete Error]:',
          deleteTokenError
        );

        return res.status(500).json({
          success: false,
          error: {
            message:
              'Die Anfrage konnte derzeit nicht verarbeitet werden.'
          }
        });
      }

      const verificationToken =
        crypto
          .randomBytes(32)
          .toString('hex');

      const verificationTokenHash =
        crypto
          .createHash('sha256')
          .update(verificationToken)
          .digest('hex');

      const verificationExpiresAt =
        new Date(
          Date.now() + 24 * 60 * 60 * 1000
        ).toISOString();

      const {
        error: tokenInsertError
      } = await supabase
        .from('email_verification_tokens')
        .insert([
          {
            user_id: user.id,
            token_hash: verificationTokenHash,
            expires_at: verificationExpiresAt
          }
        ]);

      if (tokenInsertError) {
        console.error(
          '[Resend Verification Token Insert Error]:',
          tokenInsertError
        );

        return res.status(500).json({
          success: false,
          error: {
            message:
              'Die Anfrage konnte derzeit nicht verarbeitet werden.'
          }
        });
      }

      const verificationUrl =
        `${process.env.APP_URL || 'http://localhost:3000'}` +
        `/verify-email.html?token=${encodeURIComponent(
          verificationToken
        )}`;

      const verificationEmailHtml = `
        <!DOCTYPE html>
        <html lang="de">
          <body style="
            margin:0;
            padding:0;
            background:#f5f0eb;
            font-family:Arial,Helvetica,sans-serif;
            color:#292522;
          ">
            <div style="
              max-width:600px;
              margin:40px auto;
              background:#ffffff;
              border:1px solid #ddd3ca;
              border-radius:16px;
              overflow:hidden;
            ">

              <div style="
                padding:32px;
                text-align:center;
                background:#292522;
                color:#ffffff;
              ">
                <div style="
                  font-size:13px;
                  text-transform:uppercase;
                  letter-spacing:1.5px;
                  color:#d4a373;
                  margin-bottom:10px;
                ">
                  TableAI – Restaurantverwaltung
                </div>

                <h1 style="
                  margin:0;
                  font-size:26px;
                ">
                  E-Mail-Adresse bestätigen
                </h1>
              </div>

              <div style="padding:32px;">

                <p style="
                  font-size:16px;
                  line-height:1.6;
                  margin-top:0;
                ">
                  Hallo ${user.full_name || ''},
                </p>

                <p style="
                  font-size:15px;
                  line-height:1.6;
                  color:#71675f;
                ">
                  bitte bestätigen Sie Ihre E-Mail-Adresse,
                  um Ihr TableAI-Konto zu aktivieren.
                </p>

                <p style="
                  font-size:15px;
                  line-height:1.6;
                  color:#71675f;
                ">
                  Der Bestätigungslink ist 24 Stunden gültig.
                </p>

                <div style="
                  text-align:center;
                  margin:30px 0;
                ">
                  <a
                    href="${verificationUrl}"
                    style="
                      display:inline-block;
                      background:#d4a373;
                      color:#292522;
                      padding:14px 24px;
                      border-radius:8px;
                      text-decoration:none;
                      font-weight:bold;
                    "
                  >
                    E-Mail-Adresse bestätigen
                  </a>
                </div>

                <p style="
                  font-size:13px;
                  line-height:1.6;
                  color:#91877f;
                ">
                  Wenn Sie diese Anfrage nicht gestellt haben,
                  können Sie diese E-Mail ignorieren.
                </p>

              </div>

              <div style="
                padding:20px 32px;
                text-align:center;
                border-top:1px solid #eee7e1;
                color:#9a8e84;
                font-size:12px;
              ">
                TableAI – Restaurantverwaltung
              </div>

            </div>
          </body>
        </html>
      `;

      try {
       const emailResult =
  await sendTransactionalEmail(
    user.email,
    'TableAI – E-Mail-Adresse bestätigen',
    verificationEmailHtml
  );

if (!emailResult?.success) {
  throw new Error(
    emailResult?.error ||
    'Die Bestätigungs-E-Mail konnte nicht gesendet werden.'
  );
}
      } catch (emailError) {
        console.error(
          '[Resend Verification Email Error]:',
          emailError.message
        );

        return res.status(500).json({
          success: false,
          error: {
            message:
              'Die Bestätigungs-E-Mail konnte derzeit nicht gesendet werden.'
          }
        });
      }

      return res.status(200).json({
        success: true,
        message: genericSuccessMessage
      });

    } catch (err) {
      console.error(
        '[POST /api/auth/resend-verification] Error:',
        err
      );

      return res.status(500).json({
        success: false,
        error: {
          message:
            'Beim erneuten Senden der Bestätigungs-E-Mail ist ein interner Fehler aufgetreten.'
        }
      });
    }
  }
);



module.exports = router;
