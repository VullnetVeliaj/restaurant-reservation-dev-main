require 'webrick'
require 'json'
require 'securerandom'
require 'time'
require 'base64'

port = 3000
public_dir = File.expand_path('public', __dir__)

server = WEBrick::HTTPServer.new(
  Port: port,
  DocumentRoot: public_dir,
  AccessLog: [],
  Logger: WEBrick::Log.new($stdout, WEBrick::Log::INFO)
)

today = Time.now.strftime('%Y-%m-%d')
tomorrow = (Time.now + 86400).strftime('%Y-%m-%d')

# Multi-Tenant Restaurants Store
$restaurants = {
  'rest-001' => { "id" => "rest-001", "name" => "Grand Bistro", "slug" => "grand-bistro", "primary_color" => "#0284c7" },
  'rest-002' => { "id" => "rest-002", "name" => "Sakura Sushi Lounge", "slug" => "sakura-sushi", "primary_color" => "#ec4899" },
  'rest-003' => { "id" => "rest-003", "name" => "Trattoria Bella", "slug" => "trattoria-bella", "primary_color" => "#f59e0b" }
}

# Multi-Tenant Staff Accounts Store
$restaurant_users = [
  { "id" => "usr-001", "restaurant_id" => "rest-001", "email" => "admin@grandbistro.com", "full_name" => "Chef Alexandre (Owner)", "role" => "OWNER", "is_active" => true },
  { "id" => "usr-002", "restaurant_id" => "rest-002", "email" => "admin@sakurasushi.com", "full_name" => "Kenji Sato (Manager)", "role" => "MANAGER", "is_active" => true },
  { "id" => "usr-003", "restaurant_id" => "rest-003", "email" => "admin@trattoria.com", "full_name" => "Marco Rossi (Staff)", "role" => "STAFF", "is_active" => true }
]

# Multi-Tenant Settings Store
$tenant_settings = {
  'rest-001' => { "restaurant_id" => "rest-001", "timezone" => "America/New_York", "max_covers_per_slot" => 20, "slot_interval_minutes" => 15, "min_advance_notice_mins" => 60, "max_advance_days" => 30 },
  'rest-002' => { "restaurant_id" => "rest-002", "timezone" => "America/New_York", "max_covers_per_slot" => 16, "slot_interval_minutes" => 15, "min_advance_notice_mins" => 60, "max_advance_days" => 30 },
  'rest-003' => { "restaurant_id" => "rest-003", "timezone" => "America/New_York", "max_covers_per_slot" => 24, "slot_interval_minutes" => 15, "min_advance_notice_mins" => 60, "max_advance_days" => 30 }
}

# Multi-Tenant Customer CRM Store
$customers_crm = {
  'rest-001' => [
    { "id" => "cust-001", "restaurant_id" => "rest-001", "name" => "Sarah Connor", "email" => "sarah@skynet.com", "phone" => "+1 (555) 234-5678", "visit_count" => 4, "no_show_count" => 0, "tags" => "VIP, High Spender", "notes" => "Prefers quiet booth 4, sparkling water with lime.", "created_at" => (Time.now - 30 * 86400).utc.iso8601, "updated_at" => Time.now.utc.iso8601 },
    { "id" => "cust-002", "restaurant_id" => "rest-001", "name" => "Marcus Aurelius", "email" => "marcus@rome.org", "phone" => "+1 (555) 876-5432", "visit_count" => 2, "no_show_count" => 0, "tags" => "Regular", "notes" => "Always orders house red wine.", "created_at" => (Time.now - 15 * 86400).utc.iso8601, "updated_at" => Time.now.utc.iso8601 }
  ]
}

# Multi-Tenant Reservations Store
$reservations = [
  { "id" => "d4b2e8a1-6387-410a-8bf8-d3f3f50819a1", "restaurant_id" => "rest-001", "name" => "Sarah Connor", "customer_name" => "Sarah Connor", "email" => "sarah@skynet.com", "customer_email" => "sarah@skynet.com", "phone" => "+1 (555) 234-5678", "customer_phone" => "+1 (555) 234-5678", "guests" => 4, "party_size" => 4, "date" => today, "reservation_date" => today, "time" => "19:30", "reservation_time" => "19:30", "duration_minutes" => 90, "special_requests" => "Booth preferred, celebrating a birthday", "status" => "PENDING", "source" => "WEB", "created_at" => Time.now.utc.iso8601 },
  { "id" => "e8f1c3a2-7498-421b-9ca9-e4a4a61920b2", "restaurant_id" => "rest-001", "name" => "Marcus Aurelius", "customer_name" => "Marcus Aurelius", "email" => "marcus@rome.org", "customer_email" => "marcus@rome.org", "phone" => "+1 (555) 876-5432", "customer_phone" => "+1 (555) 876-5432", "guests" => 2, "party_size" => 2, "date" => today, "reservation_date" => today, "time" => "20:00", "reservation_time" => "20:00", "duration_minutes" => 90, "special_requests" => "Quiet corner table", "status" => "CONFIRMED", "source" => "MANUAL", "created_at" => Time.now.utc.iso8601 }
]

def format_display_time(time_str)
  parts = time_str.split(':').map(&:to_i)
  h = parts[0]
  m = parts[1] || 0
  meridiem = h >= 12 ? 'PM' : 'AM'
  disp_h = h % 12 == 0 ? 12 : h % 12
  sprintf("%d:%02d %s", disp_h, m, meridiem)
end

server.mount_proc '/api' do |req, res|
  res['Access-Control-Allow-Origin'] = '*'
  res['Access-Control-Allow-Methods'] = 'GET, POST, PUT, PATCH, DELETE, OPTIONS'
  res['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'

  if req.request_method == 'OPTIONS'
    res.status = 204
    next
  end

  path = req.path

  # 1. Health check
  if path == '/api/health'
    res.status = 200
    res['Content-Type'] = 'application/json'
    res.body = { status: 'ok', timestamp: Time.now.utc.iso8601, service: 'restaurant-reservation-api', auth: 'jwt-enabled' }.to_json
    next
  end

  # 2. Onboarding Wizard: POST /api/auth/register
  if path == '/api/auth/register' && req.request_method == 'POST'
    body = JSON.parse(req.body || '{}')
    name = body['restaurant_name'] || 'New Restaurant'
    full_name = body['full_name'] || 'Owner'
    email = (body['email'] || '').downcase.strip
    rest_id = "rest-#{Time.now.to_i.to_s(36)}"

    rest_obj = { "id" => rest_id, "name" => name, "slug" => body['slug'] || rest_id, "primary_color" => body['primary_color'] || '#0284c7' }
    $restaurants[rest_id] = rest_obj

    user_obj = { "id" => "usr-#{SecureRandom.hex(4)}", "restaurant_id" => rest_id, "email" => email, "full_name" => full_name, "role" => "OWNER", "is_active" => true }
    $restaurant_users << user_obj

    $tenant_settings[rest_id] = {
      "restaurant_id" => rest_id,
      "timezone" => "America/New_York",
      "max_covers_per_slot" => (body['max_covers_per_slot'] || 20).to_i,
      "slot_interval_minutes" => (body['slot_interval_minutes'] || 15).to_i,
      "min_advance_notice_mins" => 60,
      "max_advance_days" => 30
    }

    token = "jwt_#{Base64.strict_encode64("#{user_obj['id']}:#{rest_id}:OWNER:#{email}")}"
    res.status = 201
    res['Content-Type'] = 'application/json'
    res.body = { success: true, message: 'Onboarded successfully', token: token, user: user_obj, restaurant: rest_obj }.to_json
    next
  end

  # 3. Auth Login: POST /api/auth/login
  if path == '/api/auth/login' && req.request_method == 'POST'
    body = JSON.parse(req.body || '{}')
    email = (body['email'] || '').downcase.strip
    password = body['password'] || ''

    if email.empty? || password.empty?
      res.status = 400
      res['Content-Type'] = 'application/json'
      res.body = { success: false, error: { message: 'Email and password required' } }.to_json
      next
    end

    user = $restaurant_users.find { |u| u['email'] == email }
    if !user
      rest_id = email.include?('sushi') ? 'rest-002' : (email.include?('trattoria') ? 'rest-003' : 'rest-001')
      role = email.include?('sushi') ? 'MANAGER' : (email.include?('trattoria') ? 'STAFF' : 'OWNER')
      user = { "id" => "usr-#{SecureRandom.hex(3)}", "restaurant_id" => rest_id, "email" => email, "full_name" => "Staff Member", "role" => role, "is_active" => true }
      $restaurant_users << user
    end

    rest = $restaurants[user['restaurant_id']] || { "id" => user['restaurant_id'], "name" => "Grand Bistro", "primary_color" => "#0284c7" }
    token = "jwt_#{Base64.strict_encode64("#{user['id']}:#{user['restaurant_id']}:#{user['role']}:#{email}")}"

    res.status = 200
    res['Content-Type'] = 'application/json'
    res.body = { success: true, token: token, user: user, restaurant: rest }.to_json
    next
  end

  # 4. Auth Me: GET /api/auth/me
  if path == '/api/auth/me' && req.request_method == 'GET'
    user = $restaurant_users.first
    rest = $restaurants[user['restaurant_id']]
    res.status = 200
    res['Content-Type'] = 'application/json'
    res.body = { success: true, user: user, restaurant: rest }.to_json
    next
  end

  # 5. Password update: PATCH /api/auth/password
  if path == '/api/auth/password' && req.request_method == 'PATCH'
    res.status = 200
    res['Content-Type'] = 'application/json'
    res.body = { success: true, message: 'Password updated successfully.' }.to_json
    next
  end

  # 6. Settings: GET & PUT /api/settings/:restaurant_id
  if path =~ %r{^/api/settings/([^/]+)$}
    restaurant_id = $1
    if req.request_method == 'GET'
      rest = $restaurants[restaurant_id] || { "id" => restaurant_id, "name" => "Grand Bistro", "primary_color" => "#0284c7" }
      settings = $tenant_settings[restaurant_id] || $tenant_settings['rest-001']
      res.status = 200
      res['Content-Type'] = 'application/json'
      res.body = { success: true, restaurant_id: restaurant_id, restaurant: rest, settings: settings }.to_json
      next
    elsif req.request_method == 'PUT'
      body = JSON.parse(req.body || '{}')
      if $restaurants[restaurant_id]
        $restaurants[restaurant_id]['name'] = body['name'] if body['name']
        $restaurants[restaurant_id]['primary_color'] = body['primary_color'] if body['primary_color']
      end
      if $tenant_settings[restaurant_id]
        $tenant_settings[restaurant_id]['max_covers_per_slot'] = body['max_covers_per_slot'].to_i if body['max_covers_per_slot']
        $tenant_settings[restaurant_id]['slot_interval_minutes'] = body['slot_interval_minutes'].to_i if body['slot_interval_minutes']
        $tenant_settings[restaurant_id]['min_advance_notice_mins'] = body['min_advance_notice_mins'].to_i if body['min_advance_notice_mins']
      end
      res.status = 200
      res['Content-Type'] = 'application/json'
      res.body = { success: true, message: 'Settings saved', restaurant: $restaurants[restaurant_id], settings: $tenant_settings[restaurant_id] }.to_json
      next
    end
  end

  # 7. Staff Management: GET, POST, DELETE /api/settings/:restaurant_id/staff
  if path =~ %r{^/api/settings/([^/]+)/staff$} && req.request_method == 'GET'
    restaurant_id = $1
    staff_list = $restaurant_users.select { |u| u['restaurant_id'] == restaurant_id }
    res.status = 200
    res['Content-Type'] = 'application/json'
    res.body = { success: true, restaurant_id: restaurant_id, count: staff_list.length, data: staff_list }.to_json
    next
  end

  if path =~ %r{^/api/settings/([^/]+)/staff$} && req.request_method == 'POST'
    restaurant_id = $1
    body = JSON.parse(req.body || '{}')
    new_staff = {
      "id" => "usr-#{SecureRandom.hex(4)}",
      "restaurant_id" => restaurant_id,
      "email" => (body['email'] || '').downcase.strip,
      "full_name" => body['full_name'] || 'Staff Member',
      "role" => body['role'] || 'STAFF',
      "is_active" => true
    }
    $restaurant_users << new_staff
    res.status = 201
    res['Content-Type'] = 'application/json'
    res.body = { success: true, message: "Staff member #{new_staff['full_name']} added", data: new_staff }.to_json
    next
  end

  if path =~ %r{^/api/settings/([^/]+)/staff/([^/]+)$} && req.request_method == 'DELETE'
    restaurant_id = $1
    staff_id = $2
    $restaurant_users.reject! { |u| u['id'] == staff_id && u['restaurant_id'] == restaurant_id }
    res.status = 200
    res['Content-Type'] = 'application/json'
    res.body = { success: true, message: 'Staff access revoked' }.to_json
    next
  end

  # 8. Availability Engine: GET /api/reservations/availability
  if path == '/api/reservations/availability' && req.request_method == 'GET'
    query = WEBrick::HTTPUtils.parse_query(req.query_string || '')
    restaurant_id = query['restaurant_id'] || 'rest-001'
    date_str = query['date'] || Time.now.strftime('%Y-%m-%d')
    party_size = (query['party_size'] || 2).to_i

    settings = $tenant_settings[restaurant_id] || $tenant_settings['rest-001']
    interval = settings['slot_interval_minutes'] || 15
    max_covers = settings['max_covers_per_slot'] || 20

    shifts = [
      { 'shift_name' => 'Lunch', 'start' => 11 * 60 + 30, 'end' => 14 * 60 + 30 },
      { 'shift_name' => 'Dinner', 'start' => 17 * 60, 'end' => 22 * 60 + 30 }
    ]

    active_bookings = $reservations.select { |r| r['restaurant_id'] == restaurant_id && r['date'] == date_str && ['CONFIRMED', 'SEATED', 'PENDING'].include?(r['status']) }
    slots = []

    shifts.each do |shift|
      slot_min = shift['start']
      while slot_min < shift['end']
        h = slot_min / 60
        m = slot_min % 60
        time_str = sprintf("%02d:%02d", h, m)

        booked_covers = 0
        active_bookings.each do |b|
          b_parts = b['time'].split(':').map(&:to_i)
          b_start = b_parts[0] * 60 + (b_parts[1] || 0)
          b_duration = b['duration_minutes'] || 90
          if slot_min >= b_start && slot_min < (b_start + b_duration)
            booked_covers += (b['guests'] || b['party_size'] || 2).to_i
          end
        end

        rem_covers = [0, max_covers - booked_covers].max
        is_avail = rem_covers >= party_size

        slots << {
          "time" => time_str,
          "display_time" => format_display_time(time_str),
          "shift_name" => shift['shift_name'],
          "available" => is_avail,
          "remaining_covers" => rem_covers,
          "max_covers" => max_covers,
          "booked_covers" => booked_covers
        }

        slot_min += interval
      end
    end

    res.status = 200
    res['Content-Type'] = 'application/json'
    res.body = { success: true, restaurant_id: restaurant_id, date: date_str, party_size: party_size, settings: settings, slots: slots }.to_json
    next
  end

  # 9. Guest CRM: GET /api/admin/:restaurant_id/customers
  if path =~ %r{^/api/admin/([^/]+)/customers$} && req.request_method == 'GET'
    restaurant_id = $1
    crm_list = $customers_crm[restaurant_id] || []
    res.status = 200
    res['Content-Type'] = 'application/json'
    res.body = { success: true, restaurant_id: restaurant_id, count: crm_list.length, data: crm_list }.to_json
    next
  end

  # 10. Multi-Tenant Route: GET /api/admin/:restaurant_id/reservations
  if path =~ %r{^/api/admin/([^/]+)/reservations$} && req.request_method == 'GET'
    restaurant_id = $1
    tenant_records = $reservations.select { |r| r['restaurant_id'] == restaurant_id }
    res.status = 200
    res['Content-Type'] = 'application/json'
    res.body = { success: true, restaurant_id: restaurant_id, count: tenant_records.length, data: tenant_records }.to_json
    next
  end

  # 11. Front-of-House Status Transition: PATCH /api/admin/:restaurant_id/reservations/:id/status
  if path =~ %r{^/api/admin/([^/]+)/reservations/([^/]+)/status$} && req.request_method == 'PATCH'
    restaurant_id = $1
    id = $2
    body = JSON.parse(req.body || '{}')
    new_status = (body['status'] || 'CONFIRMED').upcase
    record = $reservations.find { |r| r['id'] == id }
    if record
      record['status'] = new_status
      record['seated_at'] = Time.now.utc.iso8601 if new_status == 'SEATED'
      record['completed_at'] = Time.now.utc.iso8601 if new_status == 'COMPLETED'
      record['updated_at'] = Time.now.utc.iso8601
      res.status = 200
      res['Content-Type'] = 'application/json'
      res.body = { success: true, message: "Status transitioned to #{new_status}", data: record }.to_json
    else
      res.status = 404
      res['Content-Type'] = 'application/json'
      res.body = { success: false, error: { message: "Reservation with ID '#{id}' not found." } }.to_json
    end
    next
  end

  # 12. Customer Web Booking: POST /api/reservations
  if path == '/api/reservations' && req.request_method == 'POST'
    body = JSON.parse(req.body || '{}')
    restaurant_id = body['restaurant_id'] || 'rest-001'
    party_size = (body['guests'] || body['party_size'] || 2).to_i
    res_date = (body['date'] || body['reservation_date'] || today).to_s.strip
    res_time = (body['time'] || body['reservation_time'] || '19:00').to_s.strip
    name = (body['name'] || body['customer_name'] || 'Guest').to_s.strip
    email = (body['email'] || body['customer_email']).to_s.strip
    phone = (body['phone'] || body['customer_phone']).to_s.strip

    new_record = {
      "id" => SecureRandom.uuid,
      "restaurant_id" => restaurant_id,
      "name" => name,
      "customer_name" => name,
      "email" => email.empty? ? nil : email,
      "customer_email" => email.empty? ? nil : email,
      "phone" => phone.empty? ? nil : phone,
      "customer_phone" => phone.empty? ? nil : phone,
      "guests" => party_size,
      "party_size" => party_size,
      "date" => res_date,
      "reservation_date" => res_date,
      "time" => res_time,
      "reservation_time" => res_time,
      "duration_minutes" => 90,
      "special_requests" => body['special_requests'],
      "status" => "PENDING",
      "source" => "WEB",
      "created_at" => Time.now.utc.iso8601
    }
    $reservations.unshift(new_record)
    res.status = 201
    res['Content-Type'] = 'application/json'
    res.body = { success: true, message: "Reservation created successfully", data: new_record }.to_json
    next
  end

  # 13. Customer Lookup & Cancel
  if path =~ %r{^/api/reservations/([^/]+)$} && req.request_method == 'GET'
    id = $1
    record = $reservations.find { |r| r['id'] == id }
    if record
      res.status = 200
      res['Content-Type'] = 'application/json'
      res.body = { success: true, data: record }.to_json
    else
      res.status = 404
      res['Content-Type'] = 'application/json'
      res.body = { success: false, error: { message: "Reservation not found" } }.to_json
    end
    next
  end

  if path =~ %r{^/api/reservations/([^/]+)/cancel$} && req.request_method == 'PUT'
    id = $1
    record = $reservations.find { |r| r['id'] == id }
    if record
      record['status'] = 'CANCELLED'
      res.status = 200
      res['Content-Type'] = 'application/json'
      res.body = { success: true, message: 'Reservation cancelled', data: record }.to_json
    else
      res.status = 404
      res['Content-Type'] = 'application/json'
      res.body = { success: false, error: { message: "Reservation not found" } }.to_json
    end
    next
  end

  # 14. Voice Intent Parser: POST /api/voice/parse & POST /api/voice/parse-intent
  if (path == '/api/voice/parse' || path == '/api/voice/parse-intent' || path == '/api/voice' || path == '/voice/parse') && req.request_method == 'POST'
    body = JSON.parse(req.body || '{}')
    transcript = (body['transcript'] || '').strip
    remaining = transcript.dup
    
    parsed = {
      "name" => nil,
      "email" => nil,
      "guests" => nil,
      "party_size" => nil,
      "date" => nil,
      "time" => nil,
      "phone" => nil,
      "special_requests" => nil
    }

    # 1. Email Extraction & Normalization
    if em = remaining.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i)
      parsed["email"] = em[1].downcase.strip
      remaining = remaining.sub(em[0], ' ')
    else
      cand_match = remaining.match(/(?:(?:my\s+)?(?:the\s+)?email(?:\s+address)?(?:\s+is)?(?:\s*[:=])?\s+)([a-zA-Z0-9\s._\-@]+(?:\s*(?:at|@|add)\s*[a-zA-Z0-9\s._\-]+(?:\s*(?:dot|point|period)\s*[a-zA-Z]{2,6}))+)/i)
      if cand_match
        norm = cand_match[1].gsub(/\s+(?:at|@|add)\s+/i, '@')
                            .gsub(/\s+(?:dot|point|period)\s+/i, '.')
                            .gsub(/\s+(?:underscore)\s+/i, '_')
                            .gsub(/\s+(?:dash|hyphen|minus)\s+/i, '-')
        if sm = norm.match(/([a-zA-Z0-9._\-]+(?:\s+[a-zA-Z0-9._\-]+)*)@([a-zA-Z0-9.\-]+(?:\s+[a-zA-Z0-9.\-]+)*)\.([a-zA-Z]{2,6})\b/i)
          u = sm[1].gsub(/\s+/, '')
          d = sm[2].gsub(/\s+/, '')
          t = sm[3].gsub(/\s+/, '')
          c_email = "#{u}@#{d}.#{t}".downcase
          if c_email =~ /^[^\s@]+@[^\s@]+\.[^\s@]+$/
            parsed["email"] = c_email
            remaining = remaining.sub(cand_match[0], ' ')
          end
        end
      end
    end

    # 2. Special Requests Extraction
    req_match = remaining.match(/(?:(?:as\s+a\s+)?special\s+requests?(?:\s*(?:is|are|to|for|like|:|of))?\s+|dietary\s+requirements?\s*[:\s]\s*|seating\s+preferences?\s*[:\s]\s*|notes?\s*[:\s]\s*)([^\n,;]+)/i)
    if req_match
      cleaned_req = req_match[1].gsub(/\b(?:voice\s+assistant\s+stop|stop\s+listening|stop\s+recording|stop|please|thank\s+you|thanks|as\s+a\s+special\s+request|special\s+request|special\s+requests)\b/i, ' ')
                                .gsub(/\s+/, ' ').strip
      if cleaned_req.length >= 2
        parsed["special_requests"] = cleaned_req
        remaining = remaining.sub(req_match[0], ' ')
      end
    else
      if d_req = remaining.match(/\b(near\s+the\s+window|window\s+table|window\s+seat|quiet\s+booth|booth\s+preferred|by\s+the\s+patio|outdoor\s+seating|high\s+chair|birthday\s+celebration|anniversary\s+celebration)\b/i)
        parsed["special_requests"] = d_req[1].strip
        remaining = remaining.sub(d_req[0], ' ')
      end
    end

    # 3. Party Size Extraction
    if pm = remaining.match(/(?:table\s+for|party\s+of|seats?\s+for|group\s+of|reservation\s+for|booking\s+for)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)/i)
      val = pm[1].downcase
      num_map = { "one" => 1, "two" => 2, "three" => 3, "four" => 4, "five" => 5, "six" => 6, "seven" => 7, "eight" => 8, "nine" => 9, "ten" => 10, "eleven" => 11, "twelve" => 12 }
      parsed["party_size"] = num_map[val] || val.to_i
      remaining = remaining.sub(pm[0], ' ')
    elsif pm = remaining.match(/(?:for\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:people|persons|guests|seats|adults|diners)/i)
      val = pm[1].downcase
      num_map = { "one" => 1, "two" => 2, "three" => 3, "four" => 4, "five" => 5, "six" => 6, "seven" => 7, "eight" => 8, "nine" => 9, "ten" => 10, "eleven" => 11, "twelve" => 12 }
      parsed["party_size"] = num_map[val] || val.to_i
      remaining = remaining.sub(pm[0], ' ')
    elsif lm = remaining.match(/\b(?:my\s+)?(\d{1,2})(?:\s+(?:or\s+)?(\d{1,2}))?\b(?!\s*(?:pm|am|oClock|st|nd|rd|th|\/|-|:))/i)
      val = lm[1].to_i
      if val >= 1 && val <= 50
        parsed["party_size"] = val
        remaining = remaining.sub(lm[0], ' ')
      end
    end

    # 4. Natural Time Parsing
    if remaining =~ /\b(?:noon|midday)\b/i
      parsed["time"] = "12:00"
      remaining = remaining.gsub(/\b(?:noon|midday)\b/i, ' ')
    elsif remaining =~ /\bmidnight\b/i
      parsed["time"] = "00:00"
      remaining = remaining.gsub(/\bmidnight\b/i, ' ')
    elsif rel_m = remaining.match(/\b(half|quarter)\s+(past|to)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+(?:in\s+the\s+evening|in\s+the\s+afternoon|at\s+night|tonight|pm|am))?\b/i)
      rel = rel_m[1].downcase
      dir = rel_m[2].downcase
      hr_raw = rel_m[3].downcase
      num_map = { "one" => 1, "two" => 2, "three" => 3, "four" => 4, "five" => 5, "six" => 6, "seven" => 7, "eight" => 8, "nine" => 9, "ten" => 10, "eleven" => 11, "twelve" => 12 }
      hour = num_map[hr_raw] || hr_raw.to_i
      minutes = rel == "half" ? 30 : 15
      if dir == "to"
        hour = (hour - 1 + 24) % 24
        minutes = 45
      end
      if remaining =~ /\b(?:in\s+the\s+evening|at\s+night|tonight|pm)\b/i || (hour >= 5 && hour <= 11)
        hour += 12 if hour < 12
      elsif remaining =~ /\b(?:in\s+the\s+afternoon)\b/i
        hour += 12 if hour < 12 && hour != 12
      elsif remaining =~ /\b(?:am|in\s+the\s+morning)\b/i
        hour = 0 if hour == 12
      end
      parsed["time"] = sprintf("%02d:%02d", hour, minutes)
      remaining = remaining.sub(rel_m[0], ' ')
    elsif tm = remaining.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2})|\s+(\d{2}))?\s*(am|pm|o'?clock)?(?:\s+(in\s+the\s+evening|in\s+the\s+afternoon|in\s+the\s+morning|at\s+night|tonight))?\b/i)
      hr = tm[1].to_i
      min = (tm[2] || tm[3] || 0).to_i
      mer = tm[4] ? tm[4].downcase.gsub(/['\s]/, '') : nil
      period = tm[5] ? tm[5].downcase : nil
      if hr >= 1 && hr <= 24 && min >= 0 && min <= 59
        is_pm = mer == "pm" || (!period.nil? && (period.include?("evening") || period.include?("night") || period.include?("tonight") || period.include?("afternoon")))
        is_am = mer == "am" || (!period.nil? && period.include?("morning"))
        if hr >= 1 && hr <= 12
          if is_pm
            hr += 12 if hr < 12
          elsif is_am
            hr = 0 if hr == 12
          elsif hr >= 5 && hr <= 11
            hr += 12
          elsif hr >= 1 && hr <= 4
            hr += 12
          end
        end
        parsed["time"] = sprintf("%02d:%02d", hr, min)
        remaining = remaining.sub(tm[0], ' ')
      end
    end

    # 5. Name Extraction
    if nm = remaining.match(/(?:under\s+the\s+name\s+(?:of\s+)?|under\s+name\s+|my\s+name\s+is\s+|name\s+is\s+|i\s+am\s+|this\s+is\s+|name\s*[:\s]\s*)([A-Za-z]+(?:\s+[A-Za-z]+)?)/i)
      c_name = nm[1].gsub(/\b(?:book\s+it|book|reserve|for|please|table)\b/i, '').strip
      if c_name.length >= 2
        parsed["name"] = c_name.capitalize
        remaining = remaining.sub(nm[0], ' ')
      end
    elsif lm = remaining.match(/^\s*([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:book\s+it|book\s+a\s+table|reserve|book|please|wants?\s+to\s+book)\b/i)
      parsed["name"] = lm[1].strip.capitalize
      remaining = remaining.sub(lm[0], ' ')
    end

    parsed["guests"] = parsed["party_size"]

    res.status = 200
    res['Content-Type'] = 'application/json'
    res.body = { success: true, transcript: transcript, parsed: parsed, data: parsed }.to_json
    next
  end

  res.status = 404
  res['Content-Type'] = 'application/json'
  res.body = { success: false, error: { message: "Route #{path} not found" } }.to_json
end

puts "[Server] Enterprise SaaS Server running on http://localhost:#{port}"
trap('INT') { server.shutdown }
server.start
