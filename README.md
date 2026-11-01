# 🍽️ Multi-Tenant Restaurant Reservation SaaS Platform

A modern, scalable headless restaurant reservation platform built with **Node.js**, **Express**, **Supabase (PostgreSQL)**, **Nodemailer**, and an embeddable **AI Voice Assistant Booking Widget**.

---

## 🚀 Key Features

- **Multi-Tenant Architecture**: Isolated database queues and operations per restaurant (`restaurant_id`).
- **Embeddable White-Label Booking Widget**:
  - Customizable colors, fonts, themes, and titles via `data-*` attributes.
  - Native **Web Speech API** Voice Assistant with NLP parsing (Party Size, Name, Date, Time, Email, Phone, Special Requests).
  - 100% Mobile-first fluid responsive layout.
- **Transactional Email Layer**: Responsive HTML notifications powered by Nodemailer:
  - *Reservation Received* (with UUID Lookup link).
  - *Reservation Status Updated* (`CONFIRMED` / `DECLINED`).
  - *Manual Reservation Booked* (Staff-assisted bookings).
- **Admin Operations Workspace** (`/admin.html`): Split-view dashboard for reviewing pending intake and tracking confirmed/declined reservations by date.
- **Client Self-Service Portal** (`/manage.html`): Lookup reservation metrics and single-click cancellation.

---

## 📁 Directory Structure

```
.
├── .env.example              # Template environment variables
├── .gitignore                # Enterprise-grade secret & credential ignore
├── package.json              # Express, Supabase, Nodemailer, Dotenv dependencies
├── public/                   # Frontend assets & views
│   ├── admin.html            # Staff operations workspace
│   ├── booking-widget.js     # Embeddable widget component & Voice NLP engine
│   ├── css/
│   │   └── style.css         # Modern design styles
│   ├── index.html            # Multi-tenant customizer & demo page
│   ├── js/
│   │   └── main.js           # Client status script
│   └── manage.html           # Client lookup & self-cancellation portal
└── src/                      # Headless backend server logic
    ├── config/
    │   └── supabase.js       # Supabase client initializer
    ├── controllers/
    │   └── reservationController.js
    ├── middlewares/
    │   └── errorHandler.js   # Centralized error handler
    ├── routes/
    │   ├── adminRoutes.js    # Multi-tenant admin routes (/api/admin/...)
    │   ├── index.js          # API route aggregator & /api/health
    │   └── reservationRoutes.js # Public customer routes (/api/reservations/...)
    ├── server.js             # Main Express server entry point
    └── services/
        ├── emailService.js   # Nodemailer transporter & HTML email templates
        └── reservationService.js # Tenant-isolated queries
```

---

## ⚙️ Environment Configuration

Copy `.env.example` to `.env` and fill in your Supabase and SMTP credentials:

```bash
cp .env.example .env
```

```env
PORT=3000

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-supabase-anon-key

# SMTP Email
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-email-password
```

---

## 🛠️ Installation & Local Development

```bash
# 1. Install dependencies
npm install

# 2. Run in development mode (auto-reload)
npm run dev

# 3. Or start production server
npm start
```

Navigate to `http://localhost:3000` to view the live multi-tenant demo.

---

## 🌐 Multi-Tenant REST Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/health` | Service health status check |
| `POST` | `/api/reservations` | Customer booking (Requires `restaurant_id`) |
| `GET` | `/api/reservations/:id` | Single reservation lookup by UUID |
| `PUT` | `/api/reservations/:id/cancel` | Customer self-cancellation |
| `GET` | `/api/admin/:restaurant_id/reservations` | Tenant-isolated master queue |
| `POST` | `/api/admin/:restaurant_id/reservations` | Tenant manual booking insertion |
| `PATCH` | `/api/admin/:restaurant_id/reservations/:id/status` | Switch status (`CONFIRMED`/`DECLINED`) |

---

## 🎨 White-Label Embedding Guide

Embed the widget into any external website with dynamic custom styling:

```html
<script 
  src="https://your-domain.com/booking-widget.js" 
  data-restaurant-id="rest-001"
  data-primary-color="#10b981"
  data-font="Poppins"
  data-theme="dark"
  data-title="Sakura Sushi Reservations">
</script>
```
