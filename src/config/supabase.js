const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const { resolveSupabaseKey, detectSupabaseKeyRole, isPrivilegedSupabaseKey } = require('./supabaseKey');

let supabaseUrl = process.env.SUPABASE_URL || '';
// The backend needs the service-role/secret key: tenant tables use Row Level Security
const supabaseKey = resolveSupabaseKey();
const supabaseKeyRole = detectSupabaseKeyRole(supabaseKey);

if (supabaseKey && !isPrivilegedSupabaseKey(supabaseKeyRole)) {
  console.error(
    `[Supabase Config] The configured Supabase key has role "${supabaseKeyRole}", not service_role/secret. ` +
    'Row Level Security will hide rows and reject writes (settings, staff, CRM). ' +
    'Set SUPABASE_SERVICE_ROLE_KEY in the server environment.'
  );
}

// If a dashboard URL is provided, format it to the project API endpoint URL
if (supabaseUrl.includes('supabase.com/dashboard/project/')) {
  const projectId = supabaseUrl.split('/project/')[1]?.replace(/\/$/, '');
  if (projectId) {
    supabaseUrl = `https://${projectId}.supabase.co`;
  }
}

if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('your-project')) {
  console.warn('[Supabase Config] Warning: SUPABASE_URL or SUPABASE_KEY is not properly configured in .env');
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
});

module.exports = supabase;
