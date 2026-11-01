const express = require('express');
const router = express.Router();
//I.C added
const availabilityService = require('../services/availabilityService');
const { voiceLimiter } = require('../middlewares/rateLimiters');
const { resolvePublicRestaurantId } = require('../utils/restaurantResolver');

const MAX_TRANSCRIPT_LENGTH = 1000;

let GoogleGenerativeAI = null;
try {
  ({ GoogleGenerativeAI } = require('@google/generative-ai'));
} catch (e) {
  // Graceful fallback ready if package is not present
}

/**
 * Deterministic Regex/NLP fallback extractor
 * Used if GEMINI_API_KEY is missing or the API call fails
 */
function fallbackRegexExtractor(transcript) {
  const rawText = (transcript || '').trim();
  const result = {
    name: null,
    email: null,
    phone: null,
    guests: null,
    date: null,
    time: null,
    special_requests: null
  };

  if (!rawText) return result;
  let text = rawText;

  // 1. Email extraction (handles phonetic "at" / "dot" and standard emails)
  let emailText = text
    .replace(/\s+(?:at sign|at the rate|at|@)\s+/gi, '@')
    .replace(/\s+(?:dot|period|point|\.)\s+/gi, '.')
    .replace(/\s+gmail\b/gi, 'gmail')
    .replace(/\s+yahoo\b/gi, 'yahoo')
    .replace(/\s+hotmail\b/gi, 'hotmail')
    .replace(/\s+outlook\b/gi, 'outlook')
    .replace(/\s+icloud\b/gi, 'icloud')
    .replace(/\s+com\b/gi, 'com')
    .replace(/\s+org\b/gi, 'org')
    .replace(/\s+net\b/gi, 'net');

  const emailMatch = emailText.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  if (emailMatch) {
    result.email = emailMatch[1].toLowerCase();
    text = text.replace(new RegExp(emailMatch[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ');
  }

  // 2. Phone extraction

const digitWords = {
  zero: '0',
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9'
};

// Explicit spoken phone number
const spokenPhoneMatch = text.match(
  /(?:phone(?:\s+number)?\s*(?:is|:)?\s*)((?:(?:zero|one|two|three|four|five|six|seven|eight|nine|\d)[\s,.-]*){4,15})/i
);

if (spokenPhoneMatch) {
  result.phone = spokenPhoneMatch[1]
    .toLowerCase()
    .replace(
      /\b(zero|one|two|three|four|five|six|seven|eight|nine)\b/g,
      word => digitWords[word]
    )
    .replace(/\D/g, '');

  text = text.replace(spokenPhoneMatch[0], ' ');
} else {
  const phonePattern =
    /(?:phone(?:\s*(?:is|number|:))?\s*)?(\+?\d[\d\s().-]{5,}\d)/i;

  const phoneMatch = text.match(phonePattern);

  if (phoneMatch) {
    result.phone = phoneMatch[1].trim();
    text = text.replace(phoneMatch[0], ' ');
  }
}

  // 3. Guests / Party size
  const wordNumbers = {
    'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5,
    'six': 6, 'seven': 7, 'eight': 8, 'nine': 9, 'ten': 10,
    'a': 1, 'an': 1, 'couple': 2, 'pair': 2
  };
  const partyMatch = text.match(/(?:table\s+for|party\s+of|party\s+for|reservation\s+for\s+(?:a\s+)?(?:party\s+of\s+)?)\s*(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\b/i);
  if (partyMatch) {
    const val = wordNumbers[partyMatch[1].toLowerCase()] || parseInt(partyMatch[1], 10);
    if (val >= 1 && val <= 50) result.guests = val;
    text = text.replace(partyMatch[0], ' ');
  } else {
    const guestsMatch = text.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|\d{1,2})\s*(?:guests?|people|persons?|seats?|covers?|pax)\b/i);
    if (guestsMatch) {
      const val = wordNumbers[guestsMatch[1].toLowerCase()] || parseInt(guestsMatch[1], 10);
      if (val >= 1 && val <= 50) result.guests = val;
      text = text.replace(guestsMatch[0], ' ');
    }
  }

  // 4. Time extraction (12-hour or 24-hour)
  const time12Match = text.match(/(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)/i);
  if (time12Match) {
    let hour = parseInt(time12Match[1], 10);
    const minute = time12Match[2] ? parseInt(time12Match[2], 10) : 0;
    const period = time12Match[3].toLowerCase().replace(/\./g, '');
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    result.time = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    text = text.replace(time12Match[0], ' ');
  } else {
    const time24Match = text.match(/(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)/);
    if (time24Match) {
      result.time = `${String(parseInt(time24Match[1], 10)).padStart(2, '0')}:${time24Match[2]}`;
      text = text.replace(time24Match[0], ' ');
    } else {
      const spokenHourMatch = text.match(/(?:at\s+)(\d{1,2})(?:\s*o'?clock)?\b/i);
      if (spokenHourMatch) {
        let hour = parseInt(spokenHourMatch[1], 10);
        if (hour >= 1 && hour <= 11) hour += 12; // Default to PM for dinner/evening
        result.time = `${String(hour).padStart(2, '0')}:00`;
        text = text.replace(spokenHourMatch[0], ' ');
      }
    }
  }

  // 5. Date extraction (dynamic from current server date)
  const refDate = new Date();
  const formatDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  if (/\btoday\b/i.test(text)) {
    result.date = formatDate(refDate);
    text = text.replace(/\btoday\b/i, ' ');
  } else if (/\btomorrow\b/i.test(text)) {
    const tomorrow = new Date(refDate);
    tomorrow.setDate(tomorrow.getDate() + 1);
    result.date = formatDate(tomorrow);
    text = text.replace(/\btomorrow\b/i, ' ');
  } else {
    const dayNames = {
      'sunday': 0, 'sun': 0, 'monday': 1, 'mon': 1, 'tuesday': 2, 'tue': 2,
      'wednesday': 3, 'wed': 3, 'thursday': 4, 'thu': 4, 'friday': 5, 'fri': 5,
      'saturday': 6, 'sat': 6
    };
    for (const [dayName, targetDay] of Object.entries(dayNames)) {
      const regex = new RegExp(`\\b(?:this\\s+|next\\s+)?${dayName}\\b`, 'i');
      if (regex.test(text)) {
        const curDay = refDate.getDay();
        let diff = targetDay - curDay;
        if (diff <= 0) diff += 7;
        const target = new Date(refDate);
        target.setDate(target.getDate() + diff);
        result.date = formatDate(target);
        text = text.replace(regex, ' ');
        break;
      }
    }

    if (!result.date) {
      const months = {
        'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
        'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5, 'july': 6, 'jul': 6,
        'august': 7, 'aug': 7, 'september': 8, 'sept': 8, 'sep': 8,
        'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11
      };
      for (const [monthName, monthIndex] of Object.entries(months)) {
        const monthRegex = new RegExp(`\\b${monthName}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?\\b`, 'i');
        const match = text.match(monthRegex);
        if (match) {
          const day = parseInt(match[1], 10);
          const year = match[2] ? parseInt(match[2], 10) : refDate.getFullYear();
          const target = new Date(year, monthIndex, day);
          result.date = formatDate(target);
          text = text.replace(monthRegex, ' ');
          break;
        }
      }
    }

    if (!result.date) {
      const isoMatch = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if (isoMatch) {
        result.date = isoMatch[0];
        text = text.replace(isoMatch[0], ' ');
      }
    }
  }

  // 6. Name extraction
const nameMatch = text.match(
  /\b(?:my\s+name\s+is|name\s+is|this\s+is|i\s+am)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+){0,3})/i
);

if (nameMatch) {
  let candidate = nameMatch[1]
    .replace(
      /\b(?:email|phone|telephone|and|please|table|reservation|booking|for|at|on)\b.*$/i,
      ''
    )
    .trim();

  const forbiddenNames = new Set([
    'tonight',
    'today',
    'tomorrow',
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
    'table',
    'reservation',
    'booking'
  ]);

  if (
    candidate &&
    !forbiddenNames.has(candidate.toLowerCase())
  ) {
    result.name = candidate
      .split(/\s+/)
      .map(
        word =>
          word.charAt(0).toUpperCase() +
          word.slice(1).toLowerCase()
      )
      .join(' ');
  }
}

 // 7. Special requests

const requestPatterns = [
  /(?:please\s+)?(?:i\s+need\s+)?(?:a\s+)?table\s+outside\b/i,
  /\boutdoor\s+(?:table|seating)\b/i,
  /\boutside\s+(?:table|seating)\b/i,
  /\bwindow\s+(?:table|seat)\b/i,
  /\bquiet\s+table\b/i,
  /\bbooth\b/i,
  /\bhigh\s+chair\b/i,
  /\bgluten\s+free\b/i,
  /\bvegan\b/i,
  /\bbirthday\b/i,
  /\banniversary\b/i
];

for (const pattern of requestPatterns) {
  const match = rawText.match(pattern);

  if (match) {
    let value = match[0]
      .replace(/^please\s+/i, '')
      .replace(/^i\s+need\s+/i, '')
      .trim();

    result.special_requests = value;
    break;
  }
}

  return result;
}

/**
 * AI Voice Intent Parser via Gemini API with multi-model resiliency and safe fallback
 */
async function parseVoiceWithGemini(transcript) {
  const refDate = new Date();
  const currentDate = refDate.toISOString().split('T')[0];
  const dayOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][refDate.getDay()];
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
const prompt = `
You are a deterministic restaurant reservation intent parser.

Your ONLY job is to extract reservation information from the customer transcript.

Today is ${dayOfWeek}, ${currentDate}.

Customer transcript:
"${transcript}"

STRICT RULES:

1. Never invent information.
2. Never check availability.
3. Never choose another time.
4. Never change or round the requested time.
5. If information is missing, return null.

NAME RULES:
- Extract the name ONLY from explicit phrases such as:
  "my name is Ina"
  "name is Ina"
  "this is Ina"
  "I am Ina"
- "tonight", "today", "tomorrow", weekday names, "table", "reservation", "booking"
  can NEVER be a customer name.
- "my name is Ina" => "Ina"
- "my name is Ina Coniku" => "Ina Coniku"

PHONE RULES:
- Extract exactly the digits spoken by the customer.
- "my phone number is 1 2 3 4" => "1234"
- "my phone number is one two three four" => "1234"
- Do not invent missing digits.
- A short phone number is still valid if that is exactly what the customer said.

EMAIL RULES:
- Return a lowercase email.
- "ina at gmail dot com" => "ina@gmail.com"
- "ina@gmail.com" => "ina@gmail.com"

PARTY SIZE RULES:
- "table for two" => 2
- "for three people" => 3
- "party of four" => 4

DATE RULES:
- "today" => "${currentDate}"
- "tonight" => "${currentDate}"
- Calculate "tomorrow", weekdays, and spoken dates as YYYY-MM-DD.

TIME RULES:
- "10 PM" => "22:00"
- "10:30 p.m." => "22:30"
- "7 PM" => "19:00"
- "12 PM" => "12:00"
- "12 AM" => "00:00"
- "noon" => "12:00"
- "midnight" => "00:00"

SPECIAL REQUEST RULES:
- Extract seating preferences, dietary restrictions, occasions, etc.
- "please a table outside" => "table outside"
- "outside seating" => "outside seating"

Return ONLY valid JSON:

{
  "name": string | null,
  "email": string | null,
  "phone": string | null,
  "guests": number | null,
  "date": "YYYY-MM-DD" | null,
  "time": "HH:MM" | null,
  "special_requests": string | null
}
`;

  const CANDIDATE_MODELS = [
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.6-flash'
  ];

  if (apiKey) {
    // 1. Direct fast HTTPS fetch with AbortSignal timeout (fastest & most resilient)
    if (typeof fetch === 'function') {
      for (const modelName of CANDIDATE_MODELS) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
            }),
            signal: AbortSignal.timeout(3000)
          });

          if (res.ok) {
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              const parsed = JSON.parse(text);
              return normalizeResult(parsed);
            }
          }
        } catch (err) {
          continue;
        }
      }
    }

    // 2. Try with @google/generative-ai SDK
    if (GoogleGenerativeAI) {
      const genAI = new GoogleGenerativeAI(apiKey);
      for (const modelName of CANDIDATE_MODELS) {
        try {
          const model = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              responseMimeType: 'application/json'
            }
          });

          const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000));
          const genPromise = model.generateContent(prompt);
          const result = await Promise.race([genPromise, timeoutPromise]);
          const response = await result.response;
          const text = response.text();
          if (text) {
            const parsed = JSON.parse(text);
            return normalizeResult(parsed);
          }
        } catch (err) {
          continue;
        }
      }
    }
  }

  // 3. Fallback regex extractor (guaranteed reliable fallback)
  return fallbackRegexExtractor(transcript);
}

function normalizeResult(parsed) {
  return {
    name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : null,
    email: typeof parsed.email === 'string' && parsed.email.trim() ? parsed.email.trim().toLowerCase() : null,
    phone: typeof parsed.phone === 'string' && parsed.phone.trim() ? parsed.phone.trim() : null,
    guests: typeof parsed.guests === 'number' ? parsed.guests : (parseInt(parsed.guests || parsed.party_size, 10) || null),
    date: typeof parsed.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date) ? parsed.date : null,
    time: typeof parsed.time === 'string' && /^\d{1,2}:\d{2}$/.test(parsed.time) ? parsed.time : null,
    special_requests: typeof parsed.special_requests === 'string' && parsed.special_requests.trim() ? parsed.special_requests.trim() : null
  };
}

/**
 * POST /api/voice/parse & POST /voice/parse
 */
/**async function handleVoiceParse(req, res) {
  try {
    const { transcript } = req.body || {};

    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return res.status(400).json({
        success: false,
        error: { message: 'The transcript string is required.' }
      });
    }

    const data = await parseVoiceWithGemini(transcript.trim());

    return res.status(200).json({
      success: true,
      transcript: transcript.trim(),
      data,
      ...data
    });
  } catch (error) {
    console.error('[Voice Route Error]:', error);
    const fallback = fallbackRegexExtractor(req.body?.transcript || '');
    return res.status(200).json({
      success: true,
      transcript: req.body?.transcript || '',
      data: fallback,
      ...fallback
    });
  }
}*/

//I.C added
async function handleVoiceParse(req, res) {
  try {
    const { transcript } = req.body || {};

    if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'The transcript string is required.'
        }
      });
    }

    // A spoken booking request is short; cap input to bound Gemini cost and prompt size
    if (transcript.length > MAX_TRANSCRIPT_LENGTH) {
      return res.status(413).json({
        success: false,
        error: {
          message: `The transcript is too long (max ${MAX_TRANSCRIPT_LENGTH} characters).`
        }
      });
    }

    //const data = await parseVoiceWithGemini(transcript.trim());
const aiData =
  await parseVoiceWithGemini(transcript.trim());

const fallbackData =
  fallbackRegexExtractor(transcript.trim());

const data = {
  name:
    aiData.name ||
    fallbackData.name,

  email:
    aiData.email ||
    fallbackData.email,

  phone:
    aiData.phone ||
    fallbackData.phone,

  guests:
    aiData.guests ||
    fallbackData.guests,

  date:
    aiData.date ||
    fallbackData.date,

  time:
    aiData.time ||
    fallbackData.time,

  special_requests:
    aiData.special_requests ||
    fallbackData.special_requests
};

if (
  data.guests &&
  (
    data.guests < 1 ||
    data.guests > 50
  )
) {
  data.guests = null;
}

if (
  data.time &&
  !/^([01]\d|2[0-3]):[0-5]\d$/.test(
    data.time
  )
) {
  data.time = null;
}

if (
  data.date &&
  !/^\d{4}-\d{2}-\d{2}$/.test(
    data.date
  )
) {
  data.date = null;
}

if (
  data.email &&
  !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    data.email
  )
) {
  data.email = null;
}

    let availability = null;

    // Only check availability when we have enough information and a real restaurant
    // (from the widget key or an existing restaurant_id; never a default)
    let restaurant_id = null;
    try {
      restaurant_id = await resolvePublicRestaurantId(req);
    } catch (resolveErr) {
      restaurant_id = null;
    }

    if (restaurant_id && data.date && data.time && data.guests) {
      try {
        const availabilityResult =
          await availabilityService.getAvailableSlots(
            restaurant_id,
            data.date,
            data.guests
          );

        const requestedSlot = availabilityResult.slots.find(
          slot => slot.time === data.time
        );

        const requestedMinutes = (() => {
          const [h, m] = data.time.split(':').map(Number);
          return h * 60 + m;
        })();

        const alternatives = availabilityResult.slots
          .filter(slot => slot.available)
          .map(slot => {
            const [h, m] = slot.time.split(':').map(Number);

            return {
              ...slot,
              distance:
                Math.abs((h * 60 + m) - requestedMinutes)
            };
          })
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 3)
          .map(slot => ({
            time: slot.time,
            display_time: slot.display_time,
            remaining_covers: slot.remaining_covers
          }));

        availability = {
          requested_time: data.time,

          available:
            Boolean(requestedSlot && requestedSlot.available),

          reason:
            requestedSlot
              ? requestedSlot.reason
              : 'Requested time is outside the restaurant operating hours.',

          alternatives
        };

      } catch (availabilityError) {
        console.warn(
          '[Voice Availability Check]',
          availabilityError.message
        );
      }
    }

    return res.status(200).json({
      success: true,
      transcript: transcript.trim(),
      data,
      availability
    });

  } catch (error) {
    console.error('[Voice Route Error]:', error);

    const fallback =
      fallbackRegexExtractor(req.body?.transcript || '');

    return res.status(200).json({
      success: true,
      transcript: req.body?.transcript || '',
      data: fallback,
      availability: null
    });
  }
}



router.post('/parse', voiceLimiter, handleVoiceParse);
router.post('/', voiceLimiter, handleVoiceParse);

module.exports = router;
module.exports.fallbackRegexExtractor = fallbackRegexExtractor;
module.exports.parseVoiceWithGemini = parseVoiceWithGemini;
