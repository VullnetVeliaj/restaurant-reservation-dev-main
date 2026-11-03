/**
 * Universal Embeddable Multi-Tenant Restaurant Booking Widget
 * Enterprise OpenTable & SevenRooms Edition
 *
 * Features:
 * - Real-time Capacity & Slot Availability
 * - AI Voice Assistant
 * - Web Speech API
 * - Gemini structured voice parsing through /api/voice/parse
 * - Exact requested-time validation
 * - Reservation creation
 * - Reservation lookup and cancellation
 */

(function () {
  'use strict';

  // ============================================================
  // SCRIPT CONFIG
  // ============================================================

  const currentScript =
    document.currentScript ||
    document.querySelector('script[src*="booking-widget.js"][data-widget-key], script[src*="booking-widget.js"]');

 const scriptConfig = currentScript
  ? {
      restaurantId:
        currentScript.getAttribute('data-restaurant-id'),

      widgetKey:
        currentScript.getAttribute('data-widget-key'),

      primaryColor:
        currentScript.getAttribute('data-primary-color'),

      accentColor:
        currentScript.getAttribute('data-accent-color'),

      font:
        currentScript.getAttribute('data-font') ||
        currentScript.getAttribute('data-font-family'),

      bgColor:
        currentScript.getAttribute('data-bg-color'),

      textColor:
        currentScript.getAttribute('data-text-color'),

      theme:
        currentScript.getAttribute('data-theme'),

      apiEndpoint:
        currentScript.getAttribute('data-api-endpoint'),

      title:
        currentScript.getAttribute('data-title'),

      // "popup" = floating reservation drawer; absent / "inline" = normal widget
      mode:
        currentScript.getAttribute('data-mode')
    }
  : {};

  // ============================================================
  // API ORIGIN
  // ============================================================

  // The widget is embedded on external sites (e.g. WordPress), so every API
  // call must go to the TableAI backend, never to the host page's origin.
  const DEFAULT_API_ORIGIN = 'https://restaurant-reservation-dev-main.vercel.app';

  function detectApiOrigin() {
    const script =
      currentScript ||
      document.querySelector('script[src*="booking-widget.js"]');

    if (script && script.src) {
      try {
        return new URL(script.src, window.location.href).origin;
      } catch (e) {
        // fall through to the default backend origin
      }
    }

    return DEFAULT_API_ORIGIN;
  }

  const SCRIPT_API_ORIGIN = detectApiOrigin();

  // Absolute backend origin; an absolute data-api-endpoint wins over the script origin
  function resolveApiOrigin(apiEndpoint) {
    if (apiEndpoint && /^https?:\/\//i.test(apiEndpoint)) {
      try {
        return new URL(apiEndpoint).origin;
      } catch (e) {
        // ignore malformed endpoint and use the script origin
      }
    }

    return SCRIPT_API_ORIGIN;
  }

  // ============================================================
  // FONT
  // ============================================================

  function loadGoogleFont(fontName) {
    if (
      !fontName ||
      ['system-ui', 'sans-serif', 'Arial', 'Helvetica'].includes(fontName)
    ) {
      return;
    }

    const fontId = `rbw-font-${fontName
      .replace(/\s+/g, '-')
      .toLowerCase()}`;

    if (!document.getElementById(fontId)) {
      const link = document.createElement('link');

      link.id = fontId;
      link.rel = 'stylesheet';
      link.href =
        `https://fonts.googleapis.com/css2?family=` +
        `${encodeURIComponent(fontName)}:wght@400;500;600;700&display=swap`;

      document.head.appendChild(link);
    }
  }

  // ============================================================
  // BRAND COLORS
  // ============================================================

// I.C added - Accent changes ONLY interactive accent colors
function applyBrandColors(container, primaryColor, bgColor, accentColor) {
  const el =
    typeof container === 'string'
      ? document.querySelector(container)
      : container;

  if (!el) return;

  const widget =
    el.classList?.contains('rbw-widget-container')
      ? el
      : el.querySelector?.('.rbw-widget-container');

  if (!widget) return;

  // Background changes ONLY when a bgColor is explicitly provided
  if (bgColor) {
    widget.style.setProperty('--widget-bg', bgColor);
    widget.style.setProperty('--rbw-bg', bgColor);
  }

  // Primary color is kept separately
  if (primaryColor) {
    widget.style.setProperty('--widget-primary', primaryColor);
  }

  // Accent changes ONLY accent / interactive elements
  if (accentColor) {
    widget.style.setProperty('--widget-accent', accentColor);
    widget.style.setProperty('--rbw-accent', accentColor);
    widget.style.setProperty('--rbw-border-focus', accentColor);
    widget.style.setProperty('--widget-glow', `${accentColor}45`);
    widget.style.setProperty('--rbw-accent-glow', `${accentColor}45`);
  }
}

  // ============================================================
  // CSS
  // ============================================================

  const WIDGET_STYLE = `

    :root,
    .rbw-widget-container,
    .booking-widget-container {

      --widget-bg: #A88B74;
      --widget-card-bg: #987B64;
      --widget-card-hover: #8A6E57;

      --widget-btn-bg: #FFFFFF;
      --widget-btn-text: #23211F;
      --widget-btn-hover: #F8F5F2;

      --widget-text: #FFFFFF;
      --widget-text-muted: #E6DCD3;

      --widget-accent: #D4A373;
      --widget-indicator: #4E9F5B;

      --widget-radius: 14px;
      --widget-radius-sm: 10px;

      --widget-border: rgba(255,255,255,0.18);
      --widget-divider: rgba(255,255,255,0.12);

      --widget-input-bg: #FFFFFF;
      --widget-input-text: #23211F;
      --widget-input-border: #DCD2C9;
      --widget-input-placeholder: #8C827A;

      --widget-glow: rgba(212,163,115,0.35);

      --widget-font:
        'Plus Jakarta Sans',
        'Inter',
        system-ui,
        -apple-system,
        sans-serif;

      --rbw-bg: var(--widget-bg);
      --rbw-card-bg: var(--widget-card-bg);
      --rbw-card-hover: var(--widget-card-hover);
      --rbw-input-bg: var(--widget-input-bg);

      --rbw-border: var(--widget-border);
      --rbw-border-focus: var(--widget-accent);

      --rbw-text-main: var(--widget-text);
      --rbw-text-muted: var(--widget-text-muted);

      --rbw-accent: var(--widget-accent);
      --rbw-accent-glow: var(--widget-glow);

      --rbw-mic-active: #E57373;
      --rbw-mic-glow: rgba(229,115,115,0.45);

      --rbw-success: var(--widget-indicator);
      --rbw-font: var(--widget-font);
    }


    .rbw-widget-container {
      font-family: var(--widget-font);

      background:
        linear-gradient(
          165deg,
          var(--widget-bg) 0%,
          var(--widget-card-bg) 100%
        );

      color: var(--widget-text);

      border:
        1px solid
        var(--widget-border);

      border-radius:
        var(--widget-radius);

      padding:
        clamp(18px,4vw,26px);

      max-width: 580px;
      width: 100%;

      margin: 0 auto;

      box-shadow:
        0 16px 36px -8px rgba(35,33,31,0.35),
        0 6px 16px -4px rgba(35,33,31,0.2);

      position: relative;

      box-sizing: border-box;

      transition:
        background 0.3s ease,
        border-color 0.3s ease,
        box-shadow 0.3s ease;
    }


    .rbw-widget-container * {
      box-sizing: border-box;
    }
/* I.C added - DARK THEME */
.rbw-widget-container.theme-dark {
  --widget-bg: #A88B74;
  --widget-card-bg: #987B64;
  --widget-card-hover: #8A6E57;

  --widget-text: #FFFFFF;
  --widget-text-muted: #E6DCD3;

  --widget-border: rgba(255, 255, 255, 0.18);
  --widget-divider: rgba(255, 255, 255, 0.12);

  --widget-input-bg: #FFFFFF;
  --widget-input-text: #23211F;
  --widget-input-border: #DCD2C9;
  --widget-input-placeholder: #8C827A;
}


/* I.C added - LIGHT THEME */
.rbw-widget-container.theme-light {
  --widget-bg: #F7F4F1;
  --widget-card-bg: #FFFFFF;
  --widget-card-hover: #F0EBE6;

  --widget-text: #292522;
  --widget-text-muted: #746A63;

  --widget-border: #DDD5CE;
  --widget-divider: rgba(41, 37, 34, 0.10);

  --widget-input-bg: #FFFFFF;
  --widget-input-text: #292522;
  --widget-input-border: #D6CEC7;
  --widget-input-placeholder: #948A82;

  background: linear-gradient(
    165deg,
    #F9F7F5 0%,
    #EEE9E4 100%
  );

  color: #292522;

  box-shadow:
    0 16px 36px -8px rgba(60, 45, 35, 0.14),
    0 4px 12px rgba(60, 45, 35, 0.08);
}


/* I.C added - light voice box */
.rbw-widget-container.theme-light .rbw-voice-bar {
  background: #FFFFFF;
  border-color: #DDD5CE;
}


/* I.C added */
.rbw-widget-container.theme-light .rbw-voice-title {
  color: #292522;
}


/* I.C added */
.rbw-widget-container.theme-light .rbw-voice-hint {
  color: #746A63;
}


/* I.C added */
.rbw-widget-container.theme-light .rbw-form-header h3,
.rbw-widget-container.theme-light .rbw-field label,
.rbw-widget-container.theme-light .rbw-slots-title {
  color: #292522;
}


/* I.C added */
.rbw-widget-container.theme-light .rbw-form-header p,
.rbw-widget-container.theme-light .rbw-slots-status-text {
  color: #746A63;
}


/* I.C added */
.rbw-widget-container.theme-light .rbw-slots-section {
  background: #F1ECE7;
  border-color: #DDD5CE;
}


/* I.C added */
.rbw-widget-container.theme-light .rbw-slot-pill {
  background: #FFFFFF;
  color: #292522;
  border-color: #D8D0C9;
}


/* I.C added */
.rbw-widget-container.theme-light .rbw-slot-covers {
  color: #746A63;
}


    /* I.C added - clean professional Light Theme */
.rbw-widget-container.theme-light {
  --widget-bg: #F8F7F5;
  --widget-card-bg: #FFFFFF;
  --widget-card-hover: #F3F1EE;

  --widget-text: #24211F;
  --widget-text-muted: #756E68;

  --widget-border: #DED9D4;
  --widget-divider: #E7E2DE;

  --widget-input-bg: #FFFFFF;
  --widget-input-text: #24211F;
  --widget-input-border: #D7D2CD;

  --widget-btn-bg: #24211F;
  --widget-btn-text: #FFFFFF;
  --widget-btn-hover: #393431;

  background: #F8F7F5;

  color: var(--widget-text);

  border: 1px solid #DED9D4;

  box-shadow:
    0 12px 35px rgba(40, 35, 30, 0.08);
}

/* I.C added - Light Theme internal surfaces */

.rbw-widget-container.theme-light .rbw-voice-bar {
  background: #FFFFFF;
  border-color: #DED9D4;
}

.rbw-widget-container.theme-light .rbw-voice-title {
  color: #24211F;
}

.rbw-widget-container.theme-light .rbw-voice-hint {
  color: #756E68;
}

.rbw-widget-container.theme-light .rbw-transcript-box {
  background: #F3F1EE;
  color: #24211F;
  border-left-color: var(--widget-accent);
}

.rbw-widget-container.theme-light .rbw-form-header h3 {
  color: #24211F;
}

.rbw-widget-container.theme-light .rbw-form-header p {
  color: #756E68;
}

.rbw-widget-container.theme-light .rbw-field label {
  color: #24211F;
}

.rbw-widget-container.theme-light .rbw-slots-section {
  background: #F3F1EE;
  border-color: #DED9D4;
}

.rbw-widget-container.theme-light .rbw-slots-title {
  color: #24211F;
}

.rbw-widget-container.theme-light .rbw-slots-status-text {
  color: #756E68;
}

.rbw-widget-container.theme-light .rbw-slot-pill {
  background: #FFFFFF;
  border-color: #D8D3CE;
  color: #24211F;
}

.rbw-widget-container.theme-light .rbw-slot-pill:hover:not(:disabled) {
  border-color: var(--widget-accent);
  background: #FAF9F7;
}

.rbw-widget-container.theme-light .rbw-slot-pill.selected {
  background: var(--widget-accent) !important;
  border-color: var(--widget-accent) !important;
  color: #FFFFFF !important;
}

.rbw-widget-container.theme-light .rbw-slot-pill.selected .rbw-slot-covers {
  color: rgba(255,255,255,0.85);
}

.rbw-widget-container.theme-light .rbw-slot-covers {
  color: #756E68;
}

.rbw-widget-container.theme-light .rbw-footer-lookup {
  border-color: #DED9D4;
}

.rbw-widget-container.theme-light .rbw-lookup-btn-link {
  color: #625C57;
}

.rbw-widget-container.theme-light .rbw-lookup-btn-link:hover {
  color: var(--widget-accent);
}


    /* ========================================================
       VOICE
       ======================================================== */

    .rbw-voice-bar {

      background:
        rgba(255,255,255,0.08);

      border:
        1px solid
        var(--widget-divider);

      backdrop-filter:
        blur(8px);

      border-radius:
        var(--widget-radius-sm);

      padding:
        clamp(12px,3vw,16px);

      margin-bottom: 20px;

      display: flex;
      flex-direction: column;

      gap: 10px;

      transition:
        all 0.3s ease;
    }


    .rbw-voice-bar.listening {

      background:
        rgba(229,115,115,0.15);

      border-color:
        rgba(229,115,115,0.5);

      box-shadow:
        0 0 16px
        var(--rbw-mic-glow);
    }


    .rbw-voice-header-row {

      display: flex;

      align-items: center;

      justify-content:
        space-between;

      gap: 12px;
    }


    .rbw-voice-mic-wrap {

      display: flex;

      align-items: center;

      gap: 12px;

      flex: 1;

      min-width: 0;
    }


    .rbw-mic-btn {
 border: 1px solid var(--widget-accent);

      width:
        clamp(42px,9vw,46px);

      height:
        clamp(42px,9vw,46px);

      border-radius: 50%;

      border:
        1px solid
        rgba(255,255,255,0.25);

      background:
        #FFFFFF;

      color:
        var(--widget-btn-text);

      cursor: pointer;

      display: flex;

      align-items: center;

      justify-content: center;

      flex-shrink: 0;

      box-shadow:
        0 4px 12px
        rgba(0,0,0,0.12);

      transition:
        all 0.2s ease;
    }


    .rbw-mic-btn svg {

      stroke:
        var(--widget-btn-text);
    }

    /* I.C added - microphone visibility in light theme */
.rbw-widget-container.theme-light .rbw-mic-btn {
  background: #ffffff;
  color: #23211F;
  border: 1px solid #DDD4CC;
  box-shadow: 0 4px 12px rgba(35, 33, 31, 0.10);
}

.rbw-widget-container.theme-light .rbw-mic-btn svg {
  stroke: #23211F !important;
}

/* I.C added - active mic stays visible in light theme */
.rbw-widget-container.theme-light .rbw-mic-btn.active {
  background: #E57373;
  border-color: #EF5350;
}

.rbw-widget-container.theme-light .rbw-mic-btn.active svg {
  stroke: #FFFFFF !important;
}

    .rbw-mic-btn:hover {

      transform:
        scale(1.05);

      background:
        #F8F5F2;
    }


    .rbw-mic-btn.active {

      background:
        #E57373;

      border-color:
        #EF5350;

      animation:
        rbw-pulse 1.5s infinite;

      box-shadow:
        0 0 18px
        var(--rbw-mic-glow);
    }


    .rbw-mic-btn.active svg {

      stroke:
        #FFFFFF;
    }


    @keyframes rbw-pulse {

      0% {

        box-shadow:
          0 0 0 0
          rgba(229,115,115,0.7);

      }

      70% {

        box-shadow:
          0 0 0 10px
          rgba(229,115,115,0);

      }

      100% {

        box-shadow:
          0 0 0 0
          rgba(229,115,115,0);

      }

    }


    .rbw-voice-info {

      flex: 1;

      min-width: 0;
    }


    .rbw-voice-title {

      font-size:
        clamp(
          0.85rem,
          2.5vw,
          0.95rem
        );

      font-weight: 700;

      color: #FFFFFF;

      margin-bottom: 2px;
    }


    .rbw-voice-hint {

      font-size:
        clamp(
          0.72rem,
          2vw,
          0.8rem
        );

      color:
        var(--widget-text-muted);

      line-height: 1.4;
    }


    .rbw-stop-record-btn {

      background:
        rgba(229,115,115,0.2);

      color:
        #FFCDD2;

      border:
        1px solid
        rgba(229,115,115,0.5);

      border-radius:
        var(--widget-radius-sm);

      padding:
        7px 12px;

      font-size:
        0.8rem;

      font-weight:
        600;

      cursor:
        pointer;

      display:
        none;
    }


    .rbw-voice-bar.listening
    .rbw-stop-record-btn {

      display:
        inline-flex;
    }


    .rbw-transcript-box {

      font-size:
        0.84rem;

      color:
        #FFFFFF;

      font-style:
        italic;

      background:
        rgba(0,0,0,0.2);

      padding:
        10px 12px;

      border-radius:
        8px;

      display:
        none;

      word-break:
        break-word;

      border-left:
        3px solid
        var(--widget-accent);
    }


    /* ========================================================
       I.C added - BIG AVAILABILITY RESULT
       ======================================================== */

    .rbw-voice-result-message {

      display: none;

      margin-top:
        6px;

      padding:
        18px;

      border-radius:
        12px;

      line-height:
        1.45;

      animation:
        rbw-result-in
        0.25s ease;
    }


    @keyframes rbw-result-in {

      from {

        opacity: 0;

        transform:
          translateY(-5px);

      }

      to {

        opacity: 1;

        transform:
          translateY(0);

      }

    }


    .rbw-voice-result-message.unavailable {

      display: block;

      background:
        rgba(185,28,28,0.35);

      border:
        3px solid
        #ef4444;

      box-shadow:
        0 0 0 4px
        rgba(239,68,68,0.12);

      color:
        #FFFFFF;
    }


    .rbw-voice-result-message.available {

      display: block;

      background:
        rgba(22,101,52,0.32);

      border:
        2px solid
        #22c55e;

      box-shadow:
        0 0 0 3px
        rgba(34,197,94,0.10);

      color:
        #FFFFFF;
    }


    .rbw-voice-result-title {

      display:
        block;

      font-size:
        1.05rem;

      line-height:
        1.3;

      font-weight:
        800;

      margin-bottom:
        7px;
    }


    .rbw-voice-result-subtitle {

      display:
        block;

      font-size:
        0.88rem;

      line-height:
        1.45;

      font-weight:
        500;

      color:
        rgba(255,255,255,0.95);
    }


    /* ========================================================
       FORM
       ======================================================== */

    .rbw-form-header {

      margin-bottom:
        18px;

      border-bottom:
        1px solid
        var(--widget-divider);

      padding-bottom:
        12px;
    }


    .rbw-form-header h3 {

      font-size:
        clamp(
          1.2rem,
          4vw,
          1.45rem
        );

      font-weight:
        700;

      margin:
        0 0 4px 0;

      color:
        var(--widget-text);
    }


    .rbw-form-header p {

      margin: 0;

      font-size:
        0.88rem;

      color:
        var(--widget-text-muted);
    }


    .rbw-form {

      display: flex;

      flex-direction:
        column;

      gap: 14px;
    }


    .rbw-grid-2 {

      display: grid;

      grid-template-columns:
        1fr 1fr;

      gap: 12px;
    }


    @media
    (max-width:580px) {

      .rbw-grid-2 {

        grid-template-columns:
          1fr;

      }

    }


    .rbw-field {

      display: flex;

      flex-direction:
        column;

      gap: 6px;
    }


    .rbw-field label {

      font-size:
        0.82rem;

      font-weight:
        600;

      color:
        var(--widget-text);

      display:
        flex;

      align-items:
        center;

      justify-content:
        space-between;
    }


    .auto-badge {

      font-size:
        0.68rem;

      font-weight:
        600;

      background:
        rgba(78,159,91,0.22);

      color:
        #79D688;

      border:
        1px solid
        rgba(78,159,91,0.45);

      padding:
        2px 7px;

      border-radius:
        6px;

      display:
        none;
    }


    /* ========================================================
       SLOTS
       ======================================================== */

    .rbw-slots-section {

      display: flex;

      flex-direction:
        column;

      gap: 8px;

      background:
        rgba(0,0,0,0.12);

      padding:
        12px;

      border-radius:
        var(--widget-radius-sm);

      border:
        1px solid
        var(--widget-divider);
    }


    .rbw-slots-header {

      display:
        flex;

      justify-content:
        space-between;

      align-items:
        center;

      gap: 10px;
    }


    .rbw-slots-title {

      font-size:
        0.82rem;

      font-weight:
        700;

      color:
        var(--widget-text);
    }


    .rbw-slots-status-text {

      font-size:
        0.75rem;

      color:
        var(--widget-text-muted);

      display:
        flex;

      align-items:
        center;

      gap: 5px;
    }


    .rbw-slots-status-text::before {

      content: '';

      width:
        7px;

      height:
        7px;

      border-radius:
        50%;

      background:
        var(--widget-indicator);

      box-shadow:
        0 0 6px
        var(--widget-indicator);
    }


    .rbw-slots-grid {

      display:
        grid;

      grid-template-columns:
        repeat(
          auto-fill,
          minmax(84px,1fr)
        );

      gap:
        8px;

      max-height:
        180px;

      overflow-y:
        auto;

      padding:
        4px 2px;
    }


    .rbw-slot-pill {

      background:
        var(--widget-card-bg);

      border:
        1px solid
        rgba(255,255,255,0.18);

      color:
        var(--widget-text);

      border-radius:
        var(--widget-radius-sm);

      padding:
        9px 6px;

      font-size:
        0.84rem;

      font-weight:
        600;

      font-family:
        inherit;

      cursor:
        pointer;

      text-align:
        center;

      transition:
        all 0.2s ease;

      display:
        flex;

      flex-direction:
        column;

      align-items:
        center;

      gap:
        3px;
    }


    .rbw-slot-pill:hover:not(:disabled) {

      border-color:
        var(--widget-accent);

      background:
        var(--widget-card-hover);

      transform:
        translateY(-1px);
    }


    .rbw-slot-pill.selected {

      background: var(--widget-accent) !important;

  border-color: var(--widget-accent) !important;

  color: #ffffff !important;

  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.22);

}


    .rbw-slot-pill:disabled {

      opacity:
        0.35;

      background:
        rgba(0,0,0,0.2);

      cursor:
        not-allowed;

      text-decoration:
        line-through;
    }


    .rbw-slot-covers {

      font-size:
        0.65rem;

      font-weight:
        500;

      color:
        var(--widget-text-muted);
    }


    .rbw-slot-pill.selected
    .rbw-slot-covers {

      color:
        #6B5B4E;

      font-weight:
        600;
    }


    /* ========================================================
       INPUTS
       ======================================================== */

    .rbw-input-wrap {

      position:
        relative;

      display:
        flex;

      align-items:
        center;

      width:
        100%;
    }


    .rbw-input-icon {

      position:
        absolute;

      left:
        12px;

      color:
        #8C827A;

      pointer-events:
        none;

      z-index:
        2;
    }


    .rbw-input,
    .rbw-textarea {

      width:
        100%;

      background:
        var(--widget-input-bg);

      border:
        1px solid
        var(--widget-input-border);

      border-radius:
        var(--widget-radius-sm);

      color:
        var(--widget-input-text);

      padding:
        11px 12px;

      font-size:
        0.94rem;

      font-weight:
        500;

      font-family:
        inherit;

      outline:
        none;

      min-height:
        46px;

      transition:
        border-color 0.2s,
        box-shadow 0.2s;
    }


    .rbw-input.has-icon {

      padding-left:
        38px;
    }


    .rbw-input::placeholder,
    .rbw-textarea::placeholder {

      color:
        var(--widget-input-placeholder);
    }


    .rbw-input:focus,
    rbw-textarea:focus {

  border-color: var(--widget-accent);

  box-shadow: 0 0 0 3px var(--widget-glow);

}


    .rbw-input.highlight-fill,
    .rbw-textarea.highlight-fill {

      border-color:
        var(--widget-indicator);

      box-shadow:
        0 0 0 3px
        rgba(78,159,91,0.35);
    }


    .rbw-textarea {

      min-height:
        82px;

      resize:
        vertical;
    }


    /* ========================================================
       BUTTON
       ======================================================== */

    .rbw-submit-btn {

      background:
        var(--widget-btn-bg);

      color:
        var(--widget-btn-text);

      border:
        none;

      border-radius:
        var(--widget-radius-sm);

      padding:
        14px 20px;

      font-size:
        1rem;

      font-weight:
        700;

      font-family:
        inherit;

      cursor:
        pointer;

      display:
        flex;

      align-items:
        center;

      justify-content:
        center;

      margin-top:
        6px;

      min-height:
        48px;

      box-shadow:
        0 4px 14px
        rgba(0,0,0,0.15);
    }


    .rbw-submit-btn:hover:not(:disabled) {

      transform:
        translateY(-1px);

      background:
        var(--widget-btn-hover);
    }


    .rbw-submit-btn:disabled {

      opacity:
        0.6;

      cursor:
        not-allowed;
    }


    /* ========================================================
       ALERT
       ======================================================== */

    .rbw-alert {

      padding:
        13px 14px;

      border-radius:
        var(--widget-radius-sm);

      font-size:
        0.85rem;

      display:
        none;

      margin-top:
        12px;
    }


    .rbw-alert.error {

      background:
        rgba(229,115,115,0.2);

      border:
        1px solid
        rgba(229,115,115,0.5);

      color:
        #FFCDD2;
    }


    /* ========================================================
       FOOTER
       ======================================================== */

    .rbw-footer-lookup {

      margin-top:
        14px;

      text-align:
        center;

      padding-top:
        12px;

      border-top:
        1px solid
        var(--widget-divider);
    }


    .rbw-lookup-btn-link {

      background:
        none;

      border:
        none;

      color:
        var(--widget-text-muted);

      font-size:
        0.82rem;

      cursor:
        pointer;

      text-decoration:
        underline;

      font-family:
        inherit;
    }


    /* ========================================================
       SUCCESS
       ======================================================== */

    .rbw-success-card {

      text-align:
        center;

      padding:
        24px 12px;

      display:
        none;
    }


    .rbw-success-icon {

      width:
        58px;

      height:
        58px;

      background:
        rgba(78,159,91,0.25);

      border:
        2px solid
        var(--widget-indicator);

      color:
        #79D688;

      border-radius:
        50%;

      display:
        flex;

      align-items:
        center;

      justify-content:
        center;

      margin:
        0 auto 16px;

      font-size:
        28px;
    }


    .rbw-id-box {

      background:
        rgba(0,0,0,0.2);

      border:
        1px solid
        var(--widget-border);

      border-radius:
        var(--widget-radius-sm);

      padding:
        12px;

      word-break:
        break-all;

      margin-bottom:
        18px;
    }


    .rbw-reset-btn {

      background:
        var(--widget-btn-bg);

      border:
        none;

      color:
        var(--widget-btn-text);

      padding:
        11px 20px;

      border-radius:
        var(--widget-radius-sm);

      font-weight:
        700;

      cursor:
        pointer;
    }


    /* ========================================================
       MODAL
       ======================================================== */

    .rbw-modal-overlay {

      position:
        absolute;

      inset:
        0;

      background:
        rgba(35,33,31,0.9);

      backdrop-filter:
        blur(8px);

      border-radius:
        var(--widget-radius);

      display:
        none;

      justify-content:
        center;

      align-items:
        center;

      z-index:
        100;

      padding:
        16px;
    }


    .rbw-modal-box {

      background:
        var(--widget-card-bg);

      border:
        1px solid
        var(--widget-border);

      border-radius:
        var(--widget-radius);

      width:
        100%;

      max-width:
        440px;

      padding:
        22px;

      color:
        var(--widget-text);
    }


    .rbw-modal-header {

      display:
        flex;

      justify-content:
        space-between;

      align-items:
        center;

      margin-bottom:
        14px;
    }


    .rbw-modal-close {

      background:
        none;

      border:
        none;

      color:
        var(--widget-text);

      font-size:
        1.5rem;

      cursor:
        pointer;
    }


    .rbw-lookup-result-card {

      background:
        rgba(0,0,0,0.18);

      border:
        1px solid
        var(--widget-divider);

      border-radius:
        var(--widget-radius-sm);

      padding:
        14px;

      margin-top:
        14px;

      display:
        none;
    }

  `;

  // ============================================================
  // HTML
  // ============================================================

  function createWidgetHTML(config = {}) {
    const today =
      new Date()
        .toISOString()
        .split('T')[0];

    const headerTitle =
      config.title ||
      'Tisch reservieren';

    return `

      <div
        class="rbw-widget-container"
        id="rbw-main-container"
      >

        <!-- VOICE -->
        <div
          class="rbw-voice-bar"
          id="rbw-voice-bar"
        >

          <div
            class="rbw-voice-header-row"
          >

            <div
              class="rbw-voice-mic-wrap"
            >

              <button
                type="button"
                class="rbw-mic-btn"
                id="rbw-mic-button"
              >

                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"
                  ></path>

                  <path
                    d="M19 10v2a7 7 0 0 1-14 0v-2"
                  ></path>

                  <line
                    x1="12"
                    y1="19"
                    x2="12"
                    y2="22"
                  ></line>

                </svg>

              </button>

              <div
                class="rbw-voice-info"
              >

                <div
                  class="rbw-voice-title"
                  id="rbw-voice-title"
                >
                  KI-Sprachassistent
                </div>

                <div
                  class="rbw-voice-hint"
                  id="rbw-voice-hint"
                >
                  Tippen Sie auf das Mikrofon und beschreiben Sie Ihre Reservierung.
                </div>

              </div>

            </div>

            <button
              type="button"
              class="rbw-stop-record-btn"
              id="rbw-stop-record-btn"
            >
              ■ Aufnahme stoppen
            </button>

          </div>


          <div
            class="rbw-transcript-box"
            id="rbw-transcript-box"
          ></div>


          <!-- I.C added -->
          <div
            class="rbw-voice-result-message"
            id="rbw-voice-result-message"
          ></div>

        </div>


        <!-- FORM -->
        <div
          id="rbw-form-view"
        >

          <div
            class="rbw-form-header"
          >

            <h3>
              ${headerTitle}
            </h3>

            <p>
              Wählen Sie Datum und Personenzahl, um verfügbare Zeiten in Echtzeit anzuzeigen.
            </p>

          </div>


          <form
            class="rbw-form"
            id="rbw-booking-form"
          >


            <div
              class="rbw-grid-2"
            >


              <div
                class="rbw-field"
              >

                <label
                  for="rbw-date"
                >
                  Datum

                  <span
                    class="auto-badge"
                    id="badge-date"
                  >
                     Automatisch ausgefüllt
                  </span>

                </label>

                <div
                  class="rbw-input-wrap"
                >

                  <span
                    class="rbw-input-icon"
                  >
                    📅
                  </span>

                  <input
                    type="date"
                    class="rbw-input has-icon"
                    id="rbw-date"
                    name="date"
                    value="${today}"
                    min="${today}"
                    required
                  />

                </div>

              </div>


              <div
                class="rbw-field"
              >

                <label
                  for="rbw-party-size"
                >
                  Personenzahl

                  <span
                    class="auto-badge"
                    id="badge-party"
                  >
                    Automatisch ausgefüllt
                  </span>

                </label>

                <input
                  type="number"
                  class="rbw-input"
                  id="rbw-party-size"
                  name="guests"
                  min="1"
                  max="50"
                  value="2"
                  required
                />

              </div>

            </div>


            <!-- TIME SLOTS -->
            <div
              class="rbw-slots-section"
            >

              <div
                class="rbw-slots-header"
              >

                <span
                  class="rbw-slots-title"
                >
                  Uhrzeit auswählen

                  <span
                    class="auto-badge"
                    id="badge-time"
                  >
                    Automatisch ausgewählt
                  </span>

                </span>

                <span
                  class="rbw-slots-status-text"
                  id="rbw-slots-status"
                >
                  Verfügbarkeit wird geprüft...
                </span>

              </div>


              <div
                class="rbw-slots-grid"
                id="rbw-slots-grid"
              ></div>


              <input
                type="hidden"
                id="rbw-time"
                name="time"
                required
              />

            </div>


            <div
              class="rbw-grid-2"
            >


              <div
                class="rbw-field"
              >

                <label
                  for="rbw-name"
                >
                  Vollständiger Name

                  <span
                    class="auto-badge"
                    id="badge-name"
                  >
                    Automatisch ausgefüllt
                  </span>

                </label>

                <input
                  type="text"
                  class="rbw-input"
                  id="rbw-name"
                  name="name"
                  placeholder="Max Mustermann"
                  required
                />

              </div>


              <div
                class="rbw-field"
              >

                <label
                  for="rbw-email"
                >
                  E-Mail-Adresse

                  <span
                    class="auto-badge"
                    id="badge-email"
                  >
                    Automatisch ausgefüllt
                  </span>

                </label>

                <input
                  type="email"
                  class="rbw-input"
                  id="rbw-email"
                  name="email"
                  placeholder="max@beispiel.de"
                  required
                />

              </div>

            </div>


            <div
              class="rbw-field"
            >

              <label
                for="rbw-phone"
              >
                Telefonnummer

                <span
                  class="auto-badge"
                  id="badge-phone"
                >
                  Automatisch ausgefüllt
                </span>

              </label>

              <input
                type="tel"
                class="rbw-input"
                id="rbw-phone"
                name="phone"
                placeholder="+49 170 1234567"
              />

            </div>


            <div
              class="rbw-field"
            >

              <label
                for="rbw-requests"
              >
                Besondere Wünsche

                <span
                  class="auto-badge"
                  id="badge-requests"
                >
                  Automatisch ausgefüllt
                </span>

              </label>

              <textarea
                class="rbw-textarea"
                id="rbw-requests"
                name="special_requests"
                placeholder="Sitzplatzwünsche, Allergien, Unverträglichkeiten oder besondere Anlässe..."
              ></textarea>

            </div>


            <button
              type="submit"
              class="rbw-submit-btn"
              id="rbw-submit-btn"
            >
              Reservierung anfragen
            </button>

          </form>


          <div
            class="rbw-footer-lookup"
          >

            <button
              type="button"
              class="rbw-lookup-btn-link"
              id="rbw-open-lookup-modal"
            >
               Sie haben bereits reserviert? Reservierung anzeigen oder stornieren
            </button>

          </div>


          <div
            class="rbw-alert error"
            id="rbw-alert-error"
          ></div>

        </div>


        <!-- SUCCESS -->
        <div
          class="rbw-success-card"
          id="rbw-success-view"
        >

          <div
            class="rbw-success-icon"
          >
            ✓
          </div>

          <h4>
            Reservierungsanfrage erhalten!
          </h4>

          <p>
            Ihre Reservierungsanfrage wurde erfolgreich übermittelt.
          </p>


          <div
            class="rbw-id-box"
          >
            <span
              id="rbw-uuid-text"
            ></span>
          </div>


          <div
            style="
              display:flex;
              gap:10px;
              justify-content:center;
              flex-wrap:wrap;
            "
          >

            <button
              type="button"
              class="rbw-reset-btn"
              id="rbw-view-details-btn"
            >
              Reservierung anzeigen / verwalten
            </button>

            <button
              type="button"
              class="rbw-reset-btn"
              id="rbw-book-another"
            >
              Weitere Reservierung
            </button>

          </div>

        </div>


        <!-- LOOKUP MODAL -->
        <div
          class="rbw-modal-overlay"
          id="rbw-lookup-modal"
        >

          <div
            class="rbw-modal-box"
          >

            <div
              class="rbw-modal-header"
            >

              <h4>
                Reservierung verwalten
              </h4>

              <button
                type="button"
                class="rbw-modal-close"
                id="rbw-close-lookup-modal"
              >
                ×
              </button>

            </div>


            <div
              class="rbw-field"
            >

              <label
                for="rbw-modal-lookup-id"
              >
                  Reservierungs-ID / Code
              </label>

              <input
                type="text"
                class="rbw-input"
                id="rbw-modal-lookup-id"
                placeholder="z. B. E92212AD"
              />

            </div>


            <button
              type="button"
              class="rbw-submit-btn"
              id="rbw-modal-search-btn"
            >
              Reservierung suchen
            </button>


            <div
              class="rbw-alert error"
              id="rbw-modal-error"
            ></div>


            <div
              class="rbw-lookup-result-card"
              id="rbw-modal-result-card"
            >

              <strong
                id="rbw-res-name"
              ></strong>

              <div>
                Status:
                <span
                  id="rbw-res-status"
                ></span>
              </div>

              <div>
                Datum & Uhrzeit:
                <span
                  id="rbw-res-datetime"
                ></span>
              </div>

              <div>
                Personen:
                <span
                  id="rbw-res-party"
                ></span>
              </div>

              <div>
                Besondere Wünsche:
                <span
                  id="rbw-res-notes"
                ></span>
              </div>


              <button
                type="button"
                id="rbw-modal-cancel-btn"
                style="
                  width:100%;
                  margin-top:12px;
                  padding:10px;
                  border-radius:8px;
                  border:1px solid #ef4444;
                  background:rgba(239,68,68,0.2);
                  color:#ffffff;
                  cursor:pointer;
                "
              >
                Reservierung stornieren
              </button>

            </div>

          </div>

        </div>

      </div>
    `;
  }

  // ============================================================
  // CONTROLLER
  // ============================================================

  class BookingWidgetController {

    constructor(
      containerElement,
      userOptions = {}
    ) {

      this.container =
        containerElement;

      const ds =
        containerElement.dataset || {};

this.options = {
widgetKey:

  userOptions.widgetKey ||

  ds.widgetKey ||

  scriptConfig.widgetKey ||

  null,
  // I.C added - runtime options must override the static data-* values
  restaurantId:
  userOptions.restaurantId ||
  ds.restaurantId ||
  scriptConfig.restaurantId ||
  null,

  primaryColor:
    userOptions.primaryColor ||
    ds.primaryColor ||
    scriptConfig.primaryColor ||
    null,

  accentColor:
    userOptions.accentColor ||
    ds.accentColor ||
    scriptConfig.accentColor ||
    null,

  font:
    userOptions.font ||
    ds.font ||
    ds.fontFamily ||
    scriptConfig.font ||
    null,

  bgColor:
    userOptions.bgColor ||
    ds.bgColor ||
    scriptConfig.bgColor ||
    null,

  textColor:
    userOptions.textColor ||
    ds.textColor ||
    scriptConfig.textColor ||
    null,

  theme:
    userOptions.theme ||
    ds.theme ||
    scriptConfig.theme ||
    'dark',

  apiEndpoint:
    userOptions.apiEndpoint ||
    ds.apiEndpoint ||
    scriptConfig.apiEndpoint ||
    null,

  title:
  userOptions.title ||
  ds.title ||
  scriptConfig.title ||
  'Tisch reservieren'

};

      // All API calls resolve against the TableAI backend (see apiUrl)
      this.apiOrigin =
        resolveApiOrigin(this.options.apiEndpoint);


      this.recognition =
        null;

      this.isListening =
        false;

      this.currentTranscript =
        '';

      this.isProcessingVoice =
        false;

      this.currentLookupData =
        null;

      this.availableSlots =
        [];

      this.selectedTime =
        '';
      
      // I.C added - prevents automatic time selection while voice data is being applied
      this.isApplyingVoiceData = false;

      this.silenceTimer =
        null;

      this.init().catch((err) => {

  console.error(

    '[RestaurantBookingWidget Init Error]',

    err

  );

  this.container.innerHTML = `

    <div style="

      padding:20px;

      border:1px solid #ef4444;

      border-radius:10px;

      color:#991b1b;

      background:#fef2f2;

      font-family:Arial,sans-serif;

    ">

      Das Buchungswidget konnte nicht geladen werden.

    </div>

  `;

});
    }


// Absolute URL on the TableAI backend for an API path like '/api/reservations'
apiUrl(path) {
  return `${this.apiOrigin}${path}`;
}

// Shared by the inline widget and the popup drawer
availabilityUrl(date, partySize) {
  return this.apiUrl('/api/reservations/availability') +
    `?restaurant_id=${encodeURIComponent(this.options.restaurantId || '')}` +
    // The server derives the restaurant from the public widget key when present
    (this.options.widgetKey ? `&widget_key=${encodeURIComponent(this.options.widgetKey)}` : '') +
    `&date=${encodeURIComponent(date)}` +
    `&party_size=${partySize}`;
}

async postReservation(payload) {
  const response =
    await fetch(
      this.apiUrl('/api/reservations'),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

  const data =
    await response.json();

  return { response, data };
}

async resolveRestaurantFromWidgetKey() {

  // The public widget key is the tenant identifier for embeds. Without it, only
  // an explicit restaurantId (internal TableAI pages) is accepted; no default.
  if (!this.options.widgetKey) {
    if (!this.options.restaurantId) {
      throw new Error(
        'data-widget-key fehlt.'
      );
    }
    return;
  }

  // The key decides the restaurant; never keep a previously supplied ID
  this.options.restaurantId =
    null;

  const url =
    this.apiUrl('/api/public/widget/') +
    encodeURIComponent(
      this.options.widgetKey
    );

  const response =
    await fetch(url);

  const data =
    await response.json().catch(() => null);

  if (
    !response.ok ||
    !data?.success ||
    !data.restaurant?.id
  ) {
    throw new Error(
      data?.error?.message ||
      'Restaurant konnte nicht geladen werden.'
    );
  }

  this.options.restaurantId =
    data.restaurant.id;

  this.restaurant =
    data.restaurant;

  // Use restaurant branding only when
  // it was not explicitly supplied by embed config.
  if (
    !this.options.primaryColor &&
    data.restaurant.primary_color
  ) {
    this.options.primaryColor =
      data.restaurant.primary_color;

    this.options.accentColor =
      data.restaurant.primary_color;
  }

  // Use restaurant name when no custom title was supplied.
  if (
    !scriptConfig.title &&
    !this.container.dataset.title
  ) {
    this.options.title =
      `${data.restaurant.name} – Tisch reservieren`;
  }
}

    // ============================================================
    // INIT
    // ============================================================

    async init() {
      await this.resolveRestaurantFromWidgetKey();
      if (
        !document.getElementById(
          'rbw-widget-styles'
        )
      ) {

        const style =
          document.createElement(
            'style'
          );

        style.id =
          'rbw-widget-styles';

        style.textContent =
          WIDGET_STYLE;

        document.head.appendChild(
          style
        );
      }


      this.container.innerHTML =
        createWidgetHTML(
          this.options
        );


      this.applyCustomStyles();


      this.form =
        this.container.querySelector(
          '#rbw-booking-form'
        );

      this.micButton =
        this.container.querySelector(
          '#rbw-mic-button'
        );

      this.stopRecordBtn =
        this.container.querySelector(
          '#rbw-stop-record-btn'
        );

      this.voiceBar =
        this.container.querySelector(
          '#rbw-voice-bar'
        );

      this.voiceTitle =
        this.container.querySelector(
          '#rbw-voice-title'
        );

      this.voiceHint =
        this.container.querySelector(
          '#rbw-voice-hint'
        );

      this.transcriptBox =
        this.container.querySelector(
          '#rbw-transcript-box'
        );


      // I.C added
      this.voiceResultMessage =
        this.container.querySelector(
          '#rbw-voice-result-message'
        );


      this.submitBtn =
        this.container.querySelector(
          '#rbw-submit-btn'
        );

      this.errorAlert =
        this.container.querySelector(
          '#rbw-alert-error'
        );


      this.dateInput =
        this.container.querySelector(
          '#rbw-date'
        );

      this.partyInput =
        this.container.querySelector(
          '#rbw-party-size'
        );

      this.timeInput =
        this.container.querySelector(
          '#rbw-time'
        );

      this.slotsGrid =
        this.container.querySelector(
          '#rbw-slots-grid'
        );

      this.slotsStatus =
        this.container.querySelector(
          '#rbw-slots-status'
        );


      this.nameInput =
        this.container.querySelector(
          '#rbw-name'
        );

      this.emailInput =
        this.container.querySelector(
          '#rbw-email'
        );

      this.phoneInput =
        this.container.querySelector(
          '#rbw-phone'
        );

      this.requestsInput =
        this.container.querySelector(
          '#rbw-requests'
        );


      this.formView =
        this.container.querySelector(
          '#rbw-form-view'
        );

      this.successView =
        this.container.querySelector(
          '#rbw-success-view'
        );

      this.uuidText =
        this.container.querySelector(
          '#rbw-uuid-text'
        );


      this.viewDetailsBtn =
        this.container.querySelector(
          '#rbw-view-details-btn'
        );

      this.bookAnotherBtn =
        this.container.querySelector(
          '#rbw-book-another'
        );


      this.openLookupBtn =
        this.container.querySelector(
          '#rbw-open-lookup-modal'
        );

      this.lookupModal =
        this.container.querySelector(
          '#rbw-lookup-modal'
        );

      this.closeLookupBtn =
        this.container.querySelector(
          '#rbw-close-lookup-modal'
        );

      this.modalInputId =
        this.container.querySelector(
          '#rbw-modal-lookup-id'
        );

      this.modalSearchBtn =
        this.container.querySelector(
          '#rbw-modal-search-btn'
        );

      this.modalError =
        this.container.querySelector(
          '#rbw-modal-error'
        );

      this.modalResultCard =
        this.container.querySelector(
          '#rbw-modal-result-card'
        );

      this.modalCancelBtn =
        this.container.querySelector(
          '#rbw-modal-cancel-btn'
        );


      this.setupSpeechRecognition();

      this.setupEventListeners();


      this.container._rbwController =
        this;


      window.RestaurantBookingWidget.activeInstance =
        this;


      this.fetchAvailability();
    }


    // ============================================================
    // STYLE
    // ============================================================

    applyBrandColors(
      primaryColor,
      bgColor,
      accentColor
    ) {

      applyBrandColors(
        this.container,
        primaryColor,
        bgColor,
        accentColor
      );
    }


    // ============================================================
    // BOOKING POLICY (from the availability API)
    // Mirrors the server-enforced limits in the inputs. Returns true when a
    // value had to be adjusted into the allowed range.
    // ============================================================

    applyBookingPolicy(policy) {

      if (!policy) {
        return false;
      }

      let adjusted = false;

      if (this.partyInput) {
        const min = parseInt(policy.min_party_size, 10);
        const max = parseInt(policy.max_party_size, 10);
        const current = parseInt(this.partyInput.value, 10);

        if (Number.isFinite(min)) this.partyInput.min = String(min);
        if (Number.isFinite(max)) this.partyInput.max = String(max);

        if (Number.isFinite(min) && (!Number.isFinite(current) || current < min)) {
          this.partyInput.value = String(min);
          adjusted = true;
        } else if (Number.isFinite(max) && current > max) {
          this.partyInput.value = String(max);
          adjusted = true;
        }
      }

      if (this.dateInput) {
        if (policy.first_bookable_date) this.dateInput.min = policy.first_bookable_date;
        if (policy.last_bookable_date) this.dateInput.max = policy.last_bookable_date;

        const value = this.dateInput.value;
        if (policy.first_bookable_date && (!value || value < policy.first_bookable_date)) {
          this.dateInput.value = policy.first_bookable_date;
          adjusted = true;
        } else if (policy.last_bookable_date && value > policy.last_bookable_date) {
          this.dateInput.value = policy.last_bookable_date;
          adjusted = true;
        }
      }

      return adjusted;
    }

      // I.C added - clean dark/light theme switching
applyCustomStyles() {
  const widget =
    this.container.querySelector('#rbw-main-container');

  if (!widget) return;

  const {
    primaryColor,
    accentColor,
    font,
    bgColor,
    textColor,
    theme
  } = this.options;

  // I.C added
  // Always remove previous theme first
  widget.classList.remove(
    'theme-light',
    'theme-dark'
  );

  // I.C added
  // Apply selected theme
  if (theme === 'light') {
    widget.classList.add('theme-light');
  } else {
    widget.classList.add('theme-dark');
  }

  // I.C added
  // In LIGHT mode do NOT inject the tenant brown background
  this.applyBrandColors(
    primaryColor,
    theme === 'light'
      ? null
      : bgColor,
    accentColor || primaryColor
  );

  const activeFont =
    font || 'Plus Jakarta Sans';

  loadGoogleFont(activeFont);

  widget.style.setProperty(
    '--widget-font',
    `"${activeFont}", Arial, sans-serif`
  );

  // Dark mode may use custom text color
  if (
    textColor &&
    theme !== 'light'
  ) {
    widget.style.setProperty(
      '--widget-text',
      textColor
    );
  }

  // I.C added
  // Remove old inline text color when switching to light
  if (theme === 'light') {
    widget.style.removeProperty(
      '--widget-text'
    );
  }
}



    // ============================================================
    // I.C added
    // TIME FORMATTER
    // ============================================================

    formatVoiceTime(time) {

      if (!time) return '';

      const parts =
        String(time).split(':');

      let hour =
        parseInt(
          parts[0],
          10
        );

      const minute =
        parts[1] || '00';


      if (Number.isNaN(hour)) {

        return time;
      }


      const period =
        hour >= 12
          ? 'PM'
          : 'AM';


      hour =
        hour % 12;


      if (hour === 0) {

        hour = 12;
      }


      return `${hour}:${minute} ${period}`;
    }


    // ============================================================
    // AVAILABILITY
    // ============================================================

    async fetchAvailability(
      preferredTime = null,
      autoSelectFirst = true
    ) {

      const date =
        this.dateInput.value;


      const partySize =
        parseInt(
          this.partyInput.value,
          10
        ) || 2;


      this.slotsStatus.textContent =
        'Verfügbarkeit wird geprüft...';


      try {

const url =
  this.availabilityUrl(date, partySize);


        const res =
          await fetch(url);


        const data =
          await res.json();


        if (!res.ok) {

          throw new Error(
            data?.error?.message ||
            'Die Verfügbarkeit konnte nicht geladen werden.'
          );
        }


        const branding =
          data.branding ||
          data.settings?.branding;


        if (branding) {

          this.applyBrandColors(
            branding.primary_color,
            branding.bg_color
          );
        }


        // Restaurant booking policy (party size, bookable dates). If the current
        // inputs are outside the allowed range, adjust them once and reload.
        if (
          this.applyBookingPolicy(data.booking_policy) &&
          !this._policyAdjusted
        ) {
          this._policyAdjusted = true;
          return this.fetchAvailability(preferredTime, autoSelectFirst);
        }


        if (
          data.is_open === false
        ) {

          this.slotsStatus.textContent =
            data.policy_blocked
              ? 'Nicht verfügbar'
              : 'Geschlossen';


          // Server policy messages are inserted as text, never as HTML
          const closedMessage =
            data.policy_blocked && data.message
              ? String(data.message)
              : '🚪 Das Restaurant ist an diesem Tag geschlossen.';

          this.slotsGrid.innerHTML = `

            <div
              class="rbw-closed-message"
              style="
                grid-column:1/-1;
                padding:18px;
                text-align:center;
                background:rgba(239,68,68,0.18);
                border:1px solid rgba(239,68,68,0.5);
                border-radius:10px;
                color:#ffffff;
                font-weight:700;
              "
            ></div>

          `;

          this.slotsGrid
            .querySelector('.rbw-closed-message')
            .textContent = closedMessage;


          this.selectedTime =
            '';

          this.timeInput.value =
            '';

          this.submitBtn.disabled =
            true;


          return {
            success: true,
            closed: true,
            data
          };
        }


        this.submitBtn.disabled =
          false;


        this.availableSlots =
          data.slots || [];


        this.renderSlotPills(
          preferredTime,
          autoSelectFirst
        );


        return {
          success: true,
          closed: false,
          data
        };

      } catch (err) {

        console.error(
          '[Availability Error]',
          err
        );


        this.slotsStatus.textContent =
          'Verfügbarkeit derzeit nicht verfügbar';


        this.selectedTime =
          '';

        this.timeInput.value =
          '';


        // I.C added
        // Do NOT invent available times when real API fails.
        this.slotsGrid.innerHTML = `

          <div
            style="
              grid-column:1/-1;
              padding:16px;
              text-align:center;
              border-radius:10px;
              background:rgba(239,68,68,0.16);
              border:1px solid rgba(239,68,68,0.45);
              color:#ffffff;
            "
          >
            Die aktuelle Verfügbarkeit konnte nicht geprüft werden.
            Bitte versuchen Sie es erneut.
          </div>

        `;


        return {
          success: false,
          error: err
        };
      }
    }


    // ============================================================
    // SLOT RENDERING
    // ============================================================

    renderSlotPills(
      preferredTime = null,
      autoSelectFirst = true
    ) {

      this.slotsGrid.innerHTML =
        '';


      let availableCount =
        0;


      this.availableSlots.forEach(
        (slot) => {

          const isAvailable =
            Boolean(
              slot.available
            );


          if (isAvailable) {

            availableCount++;
          }


          const button =
            document.createElement(
              'button'
            );


          button.type =
            'button';


          button.className =
            'rbw-slot-pill';


          button.dataset.time =
            slot.time;


          const timeSpan =
            document.createElement(
              'span'
            );


          timeSpan.textContent =
            slot.display_time ||
            slot.time;


          button.appendChild(
            timeSpan
          );


          const covers =
            document.createElement(
              'span'
            );


          covers.className =
            'rbw-slot-covers';


          covers.textContent =
            isAvailable
              ? `${slot.remaining_covers} frei`
              : 'Ausgebucht';


          button.appendChild(
            covers
          );


          if (!isAvailable) {

            button.disabled =
              true;


            button.title =
              slot.reason ||
              'Nicht verfügbar';
          }


          this.slotsGrid.appendChild(
            button
          );
        }
      );


this.slotsStatus.textContent =
  availableCount === 1
    ? '1 freie Uhrzeit'
    : `${availableCount} freie Uhrzeiten`;


      // I.C added
      // Voice request: ONLY exact requested time.
      if (preferredTime) {

        const exactMatch =
          Array.from(
            this.slotsGrid.querySelectorAll(
              '.rbw-slot-pill:not([disabled])'
            )
          ).find(
            (button) =>
              button.dataset.time ===
              preferredTime
          );


        if (exactMatch) {

          this.selectTimeSlot(
            preferredTime,
            exactMatch
          );


          this.highlightField(
            null,
            'badge-time'
          );


          return;
        }
      }


      // Manual browsing may select first available.
      if (
        autoSelectFirst &&
        !this.selectedTime
      ) {

        const firstAvailable =
          Array.from(
            this.slotsGrid.querySelectorAll(
              '.rbw-slot-pill:not([disabled])'
            )
          )[0];


        if (firstAvailable) {

          this.selectTimeSlot(
            firstAvailable.dataset.time,
            firstAvailable
          );
        }
      }
    }


    // ============================================================
    // SELECT TIME
    // ============================================================

    selectTimeSlot(
      time,
      buttonElement
    ) {

      this.selectedTime =
        time;


      this.timeInput.value =
        time;


      this.timeInput.dispatchEvent(
        new Event(
          'input',
          {
            bubbles: true
          }
        )
      );


      this.timeInput.dispatchEvent(
        new Event(
          'change',
          {
            bubbles: true
          }
        )
      );


      this.slotsGrid
        .querySelectorAll(
          '.rbw-slot-pill'
        )
        .forEach(
          (pill) => {

            pill.classList.remove(
              'selected'
            );
          }
        );


      if (buttonElement) {

        buttonElement.classList.add(
          'selected'
        );
      }
    }


    // ============================================================
    // VOICE RESULT RESET
    // ============================================================

    resetVoiceResult() {

      // I.C added

      if (
        this.voiceResultMessage
      ) {

        this.voiceResultMessage.className =
          'rbw-voice-result-message';


        this.voiceResultMessage.innerHTML =
          '';
      }


      this.errorAlert.style.display =
        'none';


      this.errorAlert.textContent =
        '';
    }


    // ============================================================
    // SPEECH RECOGNITION
    // ============================================================

    setupSpeechRecognition() {

      const SpeechRecognition =
        window.SpeechRecognition ||
        window.webkitSpeechRecognition;


      if (!SpeechRecognition) {

        this.voiceHint.textContent =
          'Der Sprachassistent wird von diesem Browser nicht unterstützt.';


        this.micButton.style.opacity =
          '0.5';


        return;
      }


      this.recognition =
        new SpeechRecognition();


      this.recognition.continuous =
        true;


      this.recognition.interimResults =
        true;


      this.recognition.maxAlternatives =
        1;


      this.recognition.lang =
         'de-DE';


      const SILENCE_TIMEOUT_MS =
        2500;


      const resetSilenceTimer =
        () => {

          if (this.silenceTimer) {

            clearTimeout(
              this.silenceTimer
            );
          }


          if (this.isListening) {

            this.silenceTimer =
              setTimeout(
                () => {

                  this.stopListening();

                },
                SILENCE_TIMEOUT_MS
              );
          }
        };


      this.recognition.onstart =
        () => {

          // I.C added
          this.resetVoiceResult();


          this.isListening =
            true;


          this.currentTranscript =
            '';


          this.micButton.classList.add(
            'active'
          );


          this.voiceBar.classList.add(
            'listening'
          );


          this.voiceTitle.textContent =
            '🔴 Ich höre zu...';


          this.voiceHint.textContent =
            'Beschreiben Sie Ihre Reservierung. Ihre Angaben werden verarbeitet, sobald Sie aufhören zu sprechen.';


          this.transcriptBox.style.display =
            'block';


          this.transcriptBox.textContent =
            '🎙️ Aufnahme läuft...';


          resetSilenceTimer();
        };


      this.recognition.onresult =
        (event) => {

          let finalText =
            '';


          let interimText =
            '';


          for (
            let index = 0;
            index < event.results.length;
            index++
          ) {

            const result =
              event.results[index];


            if (
              !result ||
              !result[0]
            ) {

              continue;
            }


            if (result.isFinal) {

              finalText +=
                result[0].transcript +
                ' ';

            } else {

              interimText +=
                result[0].transcript +
                ' ';
            }
          }


          const combined =
            (
              finalText +
              interimText
            ).trim();


          if (combined) {

            this.currentTranscript =
              combined;


            this.transcriptBox.textContent =
              `🗣️ "${combined}"`;
          }


          resetSilenceTimer();
        };


      this.recognition.onerror =
        (event) => {

          console.warn(
            '[Speech Recognition]',
            event.error
          );


          if (
            event.error !== 'no-speech'
          ) {

            this.voiceTitle.textContent =
              'AI Voice Assistant';


            this.voiceHint.textContent =
              `Mikrofonfehler: ${event.error}`;
          }


          this.stopListening();
        };


      this.recognition.onend =
        () => {

          if (this.silenceTimer) {

            clearTimeout(
              this.silenceTimer
            );


            this.silenceTimer =
              null;
          }


          this.isListening =
            false;


          this.micButton.classList.remove(
            'active'
          );


          this.voiceBar.classList.remove(
            'listening'
          );


          const transcript =
            (
              this.currentTranscript ||
              ''
            ).trim();


          this.currentTranscript =
            '';


          if (
            transcript &&
            !this.isProcessingVoice
          ) {

            this.parseAndApplyVoiceIntent(
              transcript
            );

          } else if (
            !this.isProcessingVoice
          ) {

            this.voiceTitle.textContent =
              'KI-Sprachassistent';


            this.voiceHint.textContent =
              'Es wurde keine Sprache erkannt. Tippen Sie auf das Mikrofon und versuchen Sie es erneut.';
          }
        };
    }


    toggleVoiceRecognition() {

      if (!this.recognition) {

        return;
      }


      if (this.isListening) {

        this.stopListening();

      } else {

        try {

          this.currentTranscript =
            '';


          this.recognition.start();

        } catch (err) {

          console.warn(
            '[Speech Start]',
            err
          );
        }
      }
    }


    stopListening() {

      if (this.silenceTimer) {

        clearTimeout(
          this.silenceTimer
        );


        this.silenceTimer =
          null;
      }


      this.isListening =
        false;


      this.micButton.classList.remove(
        'active'
      );


      this.voiceBar.classList.remove(
        'listening'
      );


      if (this.recognition) {

        try {

          this.recognition.stop();

        } catch (err) {}
      }
    }


    // ============================================================
    // AUTO-FILL HIGHLIGHT
    // ============================================================

    highlightField(
      inputElement,
      badgeId
    ) {

      if (inputElement) {

        inputElement.classList.remove(
          'highlight-fill'
        );


        void inputElement.offsetWidth;


        inputElement.classList.add(
          'highlight-fill'
        );
      }


      const badge =
        this.container.querySelector(
          `#${badgeId}`
        );


      if (badge) {

        badge.style.display =
          'inline-flex';
      }
    }


    // ============================================================
    // I.C added
    // VOICE PARSER + AVAILABILITY
    // ============================================================

    async parseAndApplyVoiceIntent(
      transcript
    ) {

      if (
        !transcript ||
        this.isProcessingVoice
      ) {

        return;
      }


      this.isProcessingVoice =
        true;
      // I.C added
      this.isApplyingVoiceData = true;

      this.resetVoiceResult();


      this.voiceTitle.textContent =
        '⚡ Anfrage wird verarbeitet...';


      this.voiceHint.textContent =
        'Ihre Reservierungsangaben werden ausgewertet und die Verfügbarkeit wird geprüft...';


      try {

        // --------------------------------------------------------
        // GEMINI / BACKEND PARSER
        // --------------------------------------------------------

        const response =
          await fetch(
            this.apiUrl('/api/voice/parse'),
            {

              method:
                'POST',

              headers: {

                'Content-Type':
                  'application/json'
              },

              body:
                JSON.stringify({

                  transcript,

                  restaurant_id:
                    this.options.restaurantId,
                  widget_key:
                    this.options.widgetKey || undefined
                })
            }
          );


        const data =
          await response.json();


        if (!response.ok) {

          throw new Error(
            data?.error?.message ||
            'Die Sprachanfrage konnte nicht verarbeitet werden.'
          );
        }


        const parsed =
          data?.data ||
          data?.parsed ||
          data;


        if (!parsed) {

          throw new Error(
            'Es konnten keine Reservierungsdaten aus Ihrer Anfrage ermittelt werden.'
          );
        }


        console.log(
          '[Voice Parsed]',
          parsed
        );


        const triggerChange =
          (element) => {

            if (!element) return;


            element.dispatchEvent(
              new Event(
                'input',
                {
                  bubbles: true
                }
              )
            );


            element.dispatchEvent(
              new Event(
                'change',
                {
                  bubbles: true
                }
              )
            );
          };


        // --------------------------------------------------------
        // NAME
        // --------------------------------------------------------

        if (
          parsed.name &&
          this.nameInput
        ) {

          this.nameInput.value =
            parsed.name;


          triggerChange(
            this.nameInput
          );


          this.highlightField(
            this.nameInput,
            'badge-name'
          );
        }


        // --------------------------------------------------------
        // GUESTS
        // --------------------------------------------------------

        const guests =
          parsed.guests ||
          parsed.party_size ||
          parsed.partySize;


        if (
  guests &&
  this.partyInput
) {

  this.partyInput.value =
    guests;

  this.highlightField(
    this.partyInput,
    'badge-party'
  );
}


        // --------------------------------------------------------
        // DATE
        // --------------------------------------------------------

        if (
  parsed.date &&
  this.dateInput
) {

  this.dateInput.value =
    parsed.date;

  this.highlightField(
    this.dateInput,
    'badge-date'
  );
}


        // --------------------------------------------------------
        // EMAIL
        // --------------------------------------------------------

        if (
          parsed.email &&
          this.emailInput
        ) {

          this.emailInput.value =
            parsed.email;


          triggerChange(
            this.emailInput
          );


          this.highlightField(
            this.emailInput,
            'badge-email'
          );
        }


        // --------------------------------------------------------
        // PHONE
        // --------------------------------------------------------

        if (
          parsed.phone &&
          this.phoneInput
        ) {

          this.phoneInput.value =
            parsed.phone;


          triggerChange(
            this.phoneInput
          );


          this.highlightField(
            this.phoneInput,
            'badge-phone'
          );
        }


        // --------------------------------------------------------
        // SPECIAL REQUEST
        // --------------------------------------------------------

        const specialRequests =
          parsed.special_requests ||
          parsed.specialRequests;


        if (
          specialRequests &&
          this.requestsInput
        ) {

          this.requestsInput.value =
            specialRequests;


          triggerChange(
            this.requestsInput
          );


          this.highlightField(
            this.requestsInput,
            'badge-requests'
          );
        }


        // --------------------------------------------------------
        // I.C added
        // EXACT TIME VALIDATION
        // --------------------------------------------------------

        if (parsed.time) {

          this.selectedTime =
            '';


          this.timeInput.value =
            '';


          this.slotsGrid
            .querySelectorAll(
              '.rbw-slot-pill'
            )
            .forEach(
              (pill) => {

                pill.classList.remove(
                  'selected'
                );
              }
            );


          const availabilityResult =
            await this.fetchAvailability(
              parsed.time,
              false
            );


          // Technical availability failure is different
          // from normal "time unavailable".
          if (
            !availabilityResult ||
            availabilityResult.success === false
          ) {

            throw new Error(
              'The booking details were understood, but live table availability could not be checked.'
            );
          }


          if (
            availabilityResult.closed
          ) {

            const formattedTime =
              this.formatVoiceTime(
                parsed.time
              );


            this.voiceTitle.textContent =
              '⚠️ Restaurant geschlossen';


            this.voiceHint.textContent =
              'Bitte wählen Sie ein anderes Datum.';


            this.voiceResultMessage.className =
              'rbw-voice-result-message unavailable';


            this.voiceResultMessage.innerHTML = `

              <span
                class="rbw-voice-result-title"
              >
                ⚠️ Um ${formattedTime} ist kein Tisch verfügbar
              </span>

              <span
                class="rbw-voice-result-subtitle"
              >
                Das Restaurant ist am gewünschten Datum geschlossen.
                Bitte wählen Sie ein anderes Datum.
              </span>

            `;


            return;
          }


          const exactSlot =
            Array.from(
              this.slotsGrid.querySelectorAll(
                '.rbw-slot-pill:not([disabled])'
              )
            ).find(
              (button) =>
                button.dataset.time ===
                parsed.time
            );


          // ------------------------------------------------------
          // REQUESTED TIME AVAILABLE
          // ------------------------------------------------------

          if (exactSlot) {

            this.selectTimeSlot(
              parsed.time,
              exactSlot
            );


            this.highlightField(
              null,
              'badge-time'
            );


            const formattedTime =
              this.formatVoiceTime(
                parsed.time
              );


            this.voiceTitle.textContent =
              '✅ Uhrzeit verfügbar';


            this.voiceHint.textContent =
              'Die gewünschte Uhrzeit ist verfügbar. Bitte prüfen Sie Ihre Angaben.';


            // I.C added
            this.voiceResultMessage.className =
              'rbw-voice-result-message available';


            this.voiceResultMessage.innerHTML = `

              <span
                class="rbw-voice-result-title"
              >
                ✅ ${formattedTime} ist verfügbar
              </span>

              <span
                class="rbw-voice-result-subtitle"
              >
                Die gewünschte Uhrzeit wurde automatisch ausgewählt.
                Bitte prüfen Sie Ihre Reservierungsdaten.
              </span>

            `;


            this.errorAlert.style.display =
              'none';


            return;
          }


          // ------------------------------------------------------
          // I.C added
          // REQUESTED TIME NOT AVAILABLE
          // ------------------------------------------------------

          this.selectedTime =
            '';


          this.timeInput.value =
            '';


          const availableButtons =
            Array.from(
              this.slotsGrid.querySelectorAll(
                '.rbw-slot-pill:not([disabled])'
              )
            );


          const alternatives =
            availableButtons
              .slice(0, 3)
              .map(
                (button) => {

                  const label =
                    button.querySelector(
                      'span'
                    );


                  return (
                    label?.textContent?.trim() ||
                    this.formatVoiceTime(
                      button.dataset.time
                    )
                  );
                }
              )
              .filter(Boolean);


          const formattedRequestedTime =
            this.formatVoiceTime(
              parsed.time
            );


          let alternativeText =
            'Bitte wählen Sie unten eine andere verfügbare Uhrzeit.';


          if (
            alternatives.length > 0
          ) {

            alternativeText =
              `Verfügbare Alternativen sind: ${alternatives.join(', ')}.`;
          }


          // I.C added
          // VERY CLEAR USER MESSAGE

          this.voiceTitle.textContent =
            '⚠️ Gewünschte Uhrzeit nicht verfügbar';


          this.voiceHint.textContent =
            'Ihre Anfrage wurde verstanden, für diese Uhrzeit ist jedoch kein Tisch verfügbar.';


          this.voiceResultMessage.className =
            'rbw-voice-result-message unavailable';


          this.voiceResultMessage.innerHTML = `

            <span
              class="rbw-voice-result-title"
            >
              ⚠️ ${formattedRequestedTime} ist nicht verfügbar
            </span>

            <span
              class="rbw-voice-result-subtitle"
            >
              ${alternativeText}
              Bitte wählen Sie eine der unten angezeigten verfügbaren Uhrzeiten.
            </span>

          `;


          this.showError(
            `${formattedRequestedTime} ist nicht verfügbar. ${alternativeText}`
          );


          // Important:
          // this is NOT an error.
          // Gemini and availability worked correctly.
          return;
        }


        // --------------------------------------------------------
        // NO TIME SPOKEN
        // --------------------------------------------------------

        const availabilityResult =
          await this.fetchAvailability(
            null,
            false
          );


        if (
          availabilityResult &&
          availabilityResult.success === false
        ) {

          throw new Error(
            'Booking details were understood, but live availability could not be checked.'
          );
        }
        this.voiceTitle.textContent =
          '✅ Angaben übernommen';


        this.voiceHint.textContent =
          'Ihre Reservierungsangaben wurden übernommen. Bitte wählen Sie unten eine verfügbare Uhrzeit.';


        this.voiceResultMessage.className =
          'rbw-voice-result-message available';


        this.voiceResultMessage.innerHTML = `

          <span
            class="rbw-voice-result-title"
          >
            ✅ Reservierungsangaben erkannt
          </span>

          <span
            class="rbw-voice-result-subtitle"
          >
            Bitte wählen Sie unten eine der verfügbaren Uhrzeiten.
          </span>

        `;

      } catch (err) {

        console.error(
          '[Voice Parsing Error]',
          err
        );


        this.voiceTitle.textContent =
          'KI-Sprachassistent';


        this.voiceHint.textContent =
          'Die Anfrage konnte nicht automatisch verarbeitet werden. Bitte versuchen Sie es erneut oder füllen Sie die Felder manuell aus.';


        this.voiceResultMessage.className =
          'rbw-voice-result-message unavailable';


        this.voiceResultMessage.innerHTML = `

          <span
            class="rbw-voice-result-title"
          >
            ⚠️ Anfrage konnte nicht verarbeitet werden
          </span>

          <span
            class="rbw-voice-result-subtitle"
          >
            ${err.message || 'Bitte versuchen Sie es erneut.'}
          </span>

        `;

      } finally {
        // I.C added
        this.isApplyingVoiceData = false;
        this.isProcessingVoice =
          false;
      }
    }


    // ============================================================
    // EVENTS
    // ============================================================

    setupEventListeners() {

      this.micButton.addEventListener(
        'click',
        () => {

          this.toggleVoiceRecognition();
        }
      );


      if (this.stopRecordBtn) {

        this.stopRecordBtn.addEventListener(
          'click',
          () => {

            this.stopListening();
          }
        );
      }


      let debounce =
        null;


      // I.C added - do not auto-select time while AI is filling Date/Guests
const refreshAvailability = () => {

  if (debounce) {
    clearTimeout(debounce);
  }

  debounce = setTimeout(() => {

    this.selectedTime = '';
    this.timeInput.value = '';

    // If fields are changing because of Voice AI,
    // show slots but DO NOT choose one automatically.
    if (this.isApplyingVoiceData) {

      this.fetchAvailability(
        null,
        false
      );

      return;
    }

    // Manual user change:
    // existing behavior can remain.
    this.fetchAvailability(
      null,
      true
    );

  }, 150);

};


      this.dateInput.addEventListener(
        'change',
        refreshAvailability
      );


      this.partyInput.addEventListener(
        'change',
        refreshAvailability
      );


      this.slotsGrid.addEventListener(
        'click',
        (event) => {

          const button =
            event.target.closest(
              '.rbw-slot-pill'
            );


          if (
            button &&
            !button.disabled &&
            button.dataset.time
          ) {

            this.selectTimeSlot(
              button.dataset.time,
              button
            );


            // User fixed the unavailable time manually.
            if (
              this.voiceResultMessage &&
              this.voiceResultMessage.classList.contains(
                'unavailable'
              )
            ) {

              this.voiceResultMessage.className =
                'rbw-voice-result-message available';


              this.voiceResultMessage.innerHTML = `

                <span
                  class="rbw-voice-result-title"
                >
                  ✅ ${this.formatVoiceTime(button.dataset.time)} ausgewählt
                </span>

                <span
                  class="rbw-voice-result-subtitle"
                >
                 Diese verfügbare Uhrzeit wird für Ihre Reservierung verwendet.
                </span>

              `;


              this.voiceTitle.textContent =
                '✅ Verfügbare Uhrzeit ausgewählt';


              this.voiceHint.textContent =
                'Bitte prüfen Sie die übrigen Reservierungsangaben.';


              this.errorAlert.style.display =
                'none';
            }
          }
        }
      );


      this.form.addEventListener(
        'submit',
        async (event) => {

          event.preventDefault();


          await this.handleFormSubmit();
        }
      );


      this.bookAnotherBtn.addEventListener(
        'click',
        () => {

          this.resetWidget();
        }
      );


      this.openLookupBtn.addEventListener(
        'click',
        () => {

          this.openLookupModal();
        }
      );


      this.viewDetailsBtn.addEventListener(
        'click',
        () => {

          this.openLookupModal(
            this.uuidText.textContent
          );
        }
      );


      this.closeLookupBtn.addEventListener(
        'click',
        () => {

          this.lookupModal.style.display =
            'none';
        }
      );


      this.lookupModal.addEventListener(
        'click',
        (event) => {

          if (
            event.target ===
            this.lookupModal
          ) {

            this.lookupModal.style.display =
              'none';
          }
        }
      );


      this.modalSearchBtn.addEventListener(
        'click',
        async () => {

          await this.searchReservationById();
        }
      );


      this.modalCancelBtn.addEventListener(
        'click',
        async () => {

          await this.cancelCurrentReservation();
        }
      );
    }


    // ============================================================
    // LOOKUP
    // ============================================================

    openLookupModal(
      prefillId = ''
    ) {

      this.modalError.style.display =
        'none';


      this.modalResultCard.style.display =
        'none';


      this.modalInputId.value =
        prefillId;


      this.lookupModal.style.display =
        'flex';


      if (prefillId) {

        this.searchReservationById();
      }
    }


    async searchReservationById() {

      const id =
        this.modalInputId.value.trim();


      this.modalError.style.display =
        'none';


      this.modalResultCard.style.display =
        'none';


      if (!id) {

        this.modalError.textContent =
          'Bitte geben Sie Ihre Reservierungs-ID ein.'


        this.modalError.style.display =
          'block';


        return;
      }


      try {
        const params = new URLSearchParams();
        if (this.options.widgetKey) params.set('widget_key', this.options.widgetKey);
        if (this.options.restaurantId) params.set('restaurant_id', this.options.restaurantId);
        const queryString = params.toString() ? `?${params.toString()}` : '';

        const response =
          await fetch(
            this.apiUrl(`/api/reservations/lookup/${encodeURIComponent(id)}${queryString}`)
          );


        const data =
          await response.json();


        if (
          !response.ok ||
          !data.success ||
          !data.data
        ) {

          throw new Error(
            data?.error?.message ||
            'Die Reservierung wurde nicht gefunden.'
          );
        }


        this.currentLookupData =
          data.data;


        this.renderModalResult(
          data.data
        );

      } catch (err) {

        this.modalError.textContent =
          err.message ||
          'Die Reservierung konnte nicht geladen werden.'


        this.modalError.style.display =
          'block';
      }
    }


    renderModalResult(data) {

      this.container.querySelector(
        '#rbw-res-name'
      ).textContent =
        data.name ||
        'Gast';


      this.container.querySelector(
        '#rbw-res-status'
      ).textContent =
        data.status ||
        'PENDING';


      this.container.querySelector(
        '#rbw-res-datetime'
      ).textContent =
        `${data.date || ''} um ${data.time || ''} Uhr`;


      const guestCount =
  Number(data.guests || 1);

this.container.querySelector(
  '#rbw-res-party'
).textContent =
  guestCount === 1
    ? '1 Person'
    : `${guestCount} Personen`;


      this.container.querySelector(
        '#rbw-res-notes'
      ).textContent =
        data.special_requests ||
        'Keine';

      if (this.modalCancelBtn) {
        const st = String(data.status || 'PENDING').toUpperCase();
        this.modalCancelBtn.style.display =
          st === 'CANCELLED' || st === 'DECLINED' ? 'none' : 'block';
      }

      this.modalResultCard.style.display =
        'block';
    }


    async cancelCurrentReservation() {

      if (
        !this.currentLookupData ||
        !this.currentLookupData.id
      ) {

        return;
      }


      if (
        !confirm(
          'Möchten Sie diese Reservierung wirklich stornieren?'
        )
      ) {

        return;
      }


      try {

        const response =
          await fetch(
            this.apiUrl(`/api/reservations/${encodeURIComponent(
              this.currentLookupData.id
            )}/cancel`),
            {
              method:
                'PUT',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                code: this.currentLookupData.booking_code || this.currentLookupData.id,
                widget_key: this.options.widgetKey || undefined,
                restaurant_id: this.options.restaurantId || undefined
              })
            }
          );


        const data =
          await response.json();


        if (
          !response.ok ||
          !data.success
        ) {

          throw new Error(
            data?.error?.message ||
            'Die Reservierung konnte nicht storniert werden.'
          );
        }


        this.currentLookupData.status =
          'CANCELLED';


        this.renderModalResult(
          this.currentLookupData
        );


        alert(
          'Die Reservierung wurde erfolgreich storniert.'
        );

      } catch (err) {

        alert(
          err.message ||
          'Die Reservierung konnte nicht storniert werden.'
        );
      }
    }


    // ============================================================
    // SUBMIT
    // ============================================================

    async handleFormSubmit() {

      this.errorAlert.style.display =
        'none';


      if (this.isListening) {

        this.stopListening();
      }


      if (!this.timeInput.value) {

        this.showError(
          'Bitte wählen Sie eine der verfügbaren Uhrzeiten aus.'
        );


        return;
      }


      const payload = {

        restaurant_id:
          this.options.restaurantId,
        // Server resolves restaurants.id from the public widget key when present
        widget_key:
          this.options.widgetKey || undefined,

        name:
          this.nameInput.value.trim(),

        guests:
          parseInt(
            this.partyInput.value,
            10
          ),

        date:
          this.dateInput.value,

        time:
          this.timeInput.value,

        email:
          this.emailInput.value.trim(),

        phone:
          this.phoneInput.value.trim() ||
          null,

        special_requests:
          this.requestsInput.value.trim() ||
          null
      };


      if (
        !payload.name ||
        !payload.guests ||
        !payload.date ||
        !payload.time ||
        !payload.email
      ) {

        this.showError(
          'Bitte füllen Sie alle Pflichtfelder aus: Datum, Uhrzeit, Personenzahl, vollständiger Name und E-Mail-Adresse.'
        );


        return;
      }


      this.submitBtn.disabled =
        true;


      this.submitBtn.textContent =
         'Reservierung wird verarbeitet...';


      try {

        const { response, data } =
          await this.postReservation(
            payload
          );


        if (
          response.status === 409
        ) {

          throw new Error(
            data?.error?.message ||
            'Diese Uhrzeit ist inzwischen nicht mehr verfügbar. Bitte wählen Sie eine andere Uhrzeit.'
          );
        }


        if (
          !response.ok ||
          !data.success
        ) {

          throw new Error(
            data?.error?.message ||
            'Die Reservierung konnte nicht erstellt werden.'
          );
        }


        this.showSuccess(
          data.data
        );

      } catch (err) {

        this.showError(
          err.message ||
          'Reservierung anfragen.'
        );

      } finally {

        this.submitBtn.disabled =
          false;


        this.submitBtn.textContent =
          'Confirm & Book Reservation';
      }
    }


    showError(message) {

      this.errorAlert.textContent =
        message;


      this.errorAlert.style.display =
        'block';
    }


    showSuccess(
      reservationData
    ) {

      this.formView.style.display =
        'none';


      this.successView.style.display =
        'block';

      const shortCode =
        reservationData?.booking_code ||
        (reservationData?.id ? String(reservationData.id).split('-')[0].toUpperCase() : '');

      this.uuidText.textContent =
        shortCode ||
        reservationData?.id ||
        'Bestätigt';
    }


    // ============================================================
    // RESET
    // ============================================================

    resetWidget() {

      this.form.reset();


      this.selectedTime =
        '';


      this.timeInput.value =
        '';


      this.currentLookupData =
        null;


      this.container
        .querySelectorAll(
          '.auto-badge'
        )
        .forEach(
          (badge) => {

            badge.style.display =
              'none';
          }
        );


      this.container
        .querySelectorAll(
          '.highlight-fill'
        )
        .forEach(
          (element) => {

            element.classList.remove(
              'highlight-fill'
            );
          }
        );


      this.transcriptBox.style.display =
        'none';


      this.transcriptBox.textContent =
        '';


      this.resetVoiceResult();


      this.voiceTitle.textContent =
        'KI-Sprachassistent';


      this.voiceHint.textContent =
        'Tippen Sie auf das Mikrofon und beschreiben Sie Ihre Reservierung.';


      this.formView.style.display =
        'block';


      this.successView.style.display =
        'none';


      this.fetchAvailability(
        null,
        true
      );
    }
  }


  // ============================================================
  // POPUP MODE (data-mode="popup")
  // Floating "Einen Tisch reservieren" drawer. Extends the controller above, so
  // the widget-key resolution, API origin, availability request and reservation
  // POST are the same ones the inline widget uses.
  // ============================================================

  const POPUP_STYLE = `
    .rbwp-root {
      --rbwp-bg: #FFFFFF;
      --rbwp-surface: #F8F7F5;
      --rbwp-surface-hover: #F0EDE9;
      --rbwp-text: #24211F;
      --rbwp-muted: #756E68;
      --rbwp-border: #DED9D4;
      --rbwp-divider: #ECE8E4;
      --rbwp-cta-bg: #24211F;
      --rbwp-cta-text: #FFFFFF;
      --rbwp-cta-hover: #393431;
      --rbwp-accent: #A27658;
      --rbwp-accent-text: #FFFFFF;
      --rbwp-input-bg: #FFFFFF;
      --rbwp-error: #B42318;
      --rbwp-error-bg: #FEF3F2;
      --rbwp-success: #2E7D4F;
      --rbwp-shadow: 0 18px 50px rgba(40, 32, 26, 0.18), 0 4px 14px rgba(40, 32, 26, 0.08);
      --rbwp-font: 'Plus Jakarta Sans', 'Inter', system-ui, -apple-system, sans-serif;

      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 2147483000;
      font-family: var(--rbwp-font);
      font-size: 15px;
      line-height: 1.4;
      color: var(--rbwp-text);
      text-align: left;
      -webkit-font-smoothing: antialiased;
    }

    .rbwp-root.theme-dark {
      --rbwp-bg: #A88B74;
      --rbwp-surface: #987B64;
      --rbwp-surface-hover: #8A6E57;
      --rbwp-text: #FFFFFF;
      --rbwp-muted: #EDE4DC;
      --rbwp-border: rgba(255, 255, 255, 0.22);
      --rbwp-divider: rgba(255, 255, 255, 0.16);
      --rbwp-cta-bg: #FFFFFF;
      --rbwp-cta-text: #23211F;
      --rbwp-cta-hover: #F8F5F2;
      --rbwp-input-bg: #FFFFFF;
      --rbwp-error: #FFFFFF;
      --rbwp-error-bg: rgba(185, 28, 28, 0.35);
      --rbwp-success: #FFFFFF;
    }

    /* Isolation from host-page (e.g. WordPress theme) styles */
    .rbwp-root *,
    .rbwp-root *::before,
    .rbwp-root *::after {
      box-sizing: border-box;
    }

    .rbwp-root [hidden] {
      display: none !important;
    }

    .rbwp-root button,
    .rbwp-root input,
    .rbwp-root textarea {
      font: inherit;
      color: inherit;
      letter-spacing: normal;
      text-transform: none;
      text-shadow: none;
      margin: 0;
      min-width: 0;
      max-width: 100%;
    }

    .rbwp-root button {
      -webkit-appearance: none;
      appearance: none;
      cursor: pointer;
      line-height: 1.2;
      width: auto;
      height: auto;
    }

    .rbwp-root button:disabled {
      cursor: not-allowed;
    }

    .rbwp-root p,
    .rbwp-root h2 {
      margin: 0;
      padding: 0;
    }

    .rbwp-root svg {
      display: block;
      flex-shrink: 0;
    }

    .rbwp-root button:focus-visible,
    .rbwp-root input:focus-visible,
    .rbwp-root textarea:focus-visible {
      outline: 2px solid var(--rbwp-accent);
      outline-offset: 2px;
    }

    /* ---------- Launcher ---------- */

    .rbwp-root .rbwp-launcher {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      min-height: 52px;
      padding: 0 16px 0 20px;
      border: 1px solid var(--rbwp-cta-bg);
      border-radius: 14px;
      background: var(--rbwp-cta-bg);
      color: var(--rbwp-cta-text);
      font-size: 15px;
      font-weight: 600;
      box-shadow: var(--rbwp-shadow);
      transition: transform 0.2s ease, background 0.2s ease, opacity 0.2s ease;
    }

    .rbwp-root .rbwp-launcher:hover {
      background: var(--rbwp-cta-hover);
      transform: translateY(-1px);
    }

    .rbwp-launcher-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.14);
    }

    .rbwp-root.theme-dark .rbwp-launcher-icon {
      background: rgba(35, 33, 31, 0.08);
    }

    .rbwp-root.is-open .rbwp-launcher {
      display: none;
    }

    /* ---------- Panel ---------- */

    .rbwp-panel {
      display: flex;
      flex-direction: column;
      width: 360px;
      max-width: calc(100vw - 48px);
      max-height: calc(100vh - 48px);
      max-height: calc(100dvh - 48px);
      background: var(--rbwp-bg);
      border: 1px solid var(--rbwp-border);
      border-radius: 18px;
      box-shadow: var(--rbwp-shadow);
      overflow: hidden;
      opacity: 0;
      transform: translateY(12px) scale(0.98);
      transform-origin: bottom right;
      transition: opacity 0.22s ease, transform 0.22s ease;
    }

    .rbwp-panel.is-visible {
      opacity: 1;
      transform: none;
    }

    .rbwp-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
      padding: 18px 18px 14px 20px;
      border-bottom: 1px solid var(--rbwp-divider);
    }

    .rbwp-eyebrow {
      display: block;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: var(--rbwp-muted);
      margin-bottom: 3px;
    }

    .rbwp-root .rbwp-title {
      font-size: 18px;
      font-weight: 700;
      line-height: 1.25;
      color: var(--rbwp-text);
      overflow-wrap: anywhere;
    }

    .rbwp-root .rbwp-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 36px;
      height: 36px;
      margin: -4px -6px 0 0;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--rbwp-text);
    }

    .rbwp-root .rbwp-close:hover {
      background: var(--rbwp-surface);
    }

    .rbwp-form {
      display: flex;
      flex-direction: column;
      min-height: 0;
      flex: 1 1 auto;
      margin: 0;
    }

    .rbwp-body {
      flex: 1 1 auto;
      min-height: 0;
      overflow-y: auto;
      overscroll-behavior: contain;
      -webkit-overflow-scrolling: touch;
    }

    /* ---------- Accordion sections ---------- */

    .rbwp-section {
      border-bottom: 1px solid var(--rbwp-divider);
    }

    .rbwp-root .rbwp-section-head {
      display: flex;
      align-items: center;
      gap: 12px;
      width: 100%;
      min-height: 56px;
      padding: 12px 18px 12px 20px;
      border: none;
      border-radius: 0;
      background: transparent;
      color: var(--rbwp-text);
      text-align: left;
    }

    .rbwp-root .rbwp-section-head:hover {
      background: var(--rbwp-surface);
    }

    .rbwp-root .rbwp-section-head:focus-visible {
      outline-offset: -2px;
    }

    .rbwp-section-icon {
      color: var(--rbwp-muted);
      display: inline-flex;
    }

    .rbwp-section-text {
      display: flex;
      flex-direction: column;
      gap: 1px;
      flex: 1 1 auto;
      min-width: 0;
    }

    .rbwp-section-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rbwp-muted);
    }

    .rbwp-section-value {
      font-size: 15px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .rbwp-section-value.is-placeholder {
      color: var(--rbwp-muted);
      font-weight: 500;
    }

    .rbwp-chevron {
      color: var(--rbwp-muted);
      display: inline-flex;
      transition: transform 0.2s ease;
    }

    .rbwp-section-head[aria-expanded="true"] .rbwp-chevron {
      transform: rotate(180deg);
    }

    .rbwp-section-body {
      padding: 2px 20px 16px;
      animation: rbwp-reveal 0.2s ease;
    }

    @keyframes rbwp-reveal {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: none; }
    }

    /* ---------- Chips ---------- */

    .rbwp-chips {
      display: grid;
      gap: 8px;
    }

    .rbwp-chips.cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .rbwp-chips.cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .rbwp-chips.slots { grid-template-columns: repeat(auto-fill, minmax(72px, 1fr)); }

    .rbwp-root .rbwp-chip {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      min-height: 44px;
      padding: 8px 6px;
      border: 1px solid var(--rbwp-border);
      border-radius: 10px;
      background: var(--rbwp-surface);
      color: var(--rbwp-text);
      font-size: 14px;
      font-weight: 600;
      text-align: center;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
    }

    .rbwp-root .rbwp-chip:hover:not(:disabled) {
      border-color: var(--rbwp-accent);
      background: var(--rbwp-surface-hover);
    }

    .rbwp-root .rbwp-chip[aria-pressed="true"] {
      background: var(--rbwp-accent);
      border-color: var(--rbwp-accent);
      color: var(--rbwp-accent-text);
    }

    .rbwp-root .rbwp-chip:disabled {
      opacity: 0.4;
    }

    .rbwp-chip small {
      font-size: 11px;
      font-weight: 500;
      opacity: 0.8;
    }

    .rbwp-stepper {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px dashed var(--rbwp-divider);
      font-size: 13px;
      color: var(--rbwp-muted);
    }

    .rbwp-stepper-controls {
      display: inline-flex;
      align-items: center;
      gap: 10px;
    }

    .rbwp-stepper-value {
      min-width: 28px;
      text-align: center;
      font-size: 15px;
      font-weight: 700;
      color: var(--rbwp-text);
    }

    .rbwp-root .rbwp-step-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      border: 1px solid var(--rbwp-border);
      border-radius: 50%;
      background: var(--rbwp-surface);
      color: var(--rbwp-text);
      font-size: 18px;
      font-weight: 600;
    }

    .rbwp-root .rbwp-step-btn:disabled {
      opacity: 0.4;
    }

    .rbwp-root .rbwp-hint,
    .rbwp-root .rbwp-status {
      margin-top: 10px;
      font-size: 12.5px;
      color: var(--rbwp-muted);
    }

    .rbwp-root .rbwp-status {
      margin: 0 0 10px;
    }

    .rbwp-shift-label {
      margin: 12px 0 6px;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rbwp-muted);
    }

    .rbwp-shift-label:first-child {
      margin-top: 0;
    }

    .rbwp-notice {
      padding: 12px 14px;
      border-radius: 10px;
      background: var(--rbwp-surface);
      border: 1px solid var(--rbwp-divider);
      font-size: 13.5px;
    }

    .rbwp-notice.is-error {
      background: var(--rbwp-error-bg);
      border-color: transparent;
      color: var(--rbwp-error);
    }

    .rbwp-root .rbwp-link-btn {
      display: inline-block;
      margin-top: 8px;
      padding: 4px 0;
      border: none;
      background: none;
      color: var(--rbwp-text);
      font-size: 13.5px;
      font-weight: 600;
      text-decoration: underline;
      text-underline-offset: 3px;
    }

    .rbwp-skeleton {
      height: 44px;
      border-radius: 10px;
      background: linear-gradient(90deg, var(--rbwp-surface) 0%, var(--rbwp-surface-hover) 50%, var(--rbwp-surface) 100%);
      background-size: 200% 100%;
      animation: rbwp-shimmer 1.2s linear infinite;
    }

    @keyframes rbwp-shimmer {
      from { background-position: 200% 0; }
      to { background-position: -200% 0; }
    }

    /* ---------- Fields ---------- */

    .rbwp-details {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 20px 18px;
      animation: rbwp-reveal 0.2s ease;
    }

    .rbwp-details-title {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--rbwp-muted);
    }

    .rbwp-field {
      display: flex;
      flex-direction: column;
      gap: 5px;
    }

    .rbwp-field label {
      font-size: 13px;
      font-weight: 600;
      color: var(--rbwp-text);
    }

    .rbwp-optional {
      font-weight: 400;
      color: var(--rbwp-muted);
    }

    .rbwp-root .rbwp-input {
      display: block;
      width: 100%;
      min-height: 44px;
      padding: 10px 12px;
      border: 1px solid var(--rbwp-border);
      border-radius: 10px;
      background: var(--rbwp-input-bg);
      color: #24211F;
      font-size: 15px;
      box-shadow: none;
      outline: none;
    }

    .rbwp-root textarea.rbwp-input {
      min-height: 64px;
      resize: vertical;
    }

    .rbwp-root .rbwp-input:focus,
    .rbwp-root .rbwp-input:focus-visible {
      border-color: var(--rbwp-accent);
      outline: none;
      box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.08);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--rbwp-accent) 22%, transparent);
    }

    .rbwp-root .rbwp-input[aria-invalid="true"] {
      border-color: #D92D20;
    }

    .rbwp-field-error {
      font-size: 12px;
      color: var(--rbwp-error);
    }

    /* ---------- Footer ---------- */

    .rbwp-footer {
      flex: 0 0 auto;
      padding: 14px 20px 18px;
      border-top: 1px solid var(--rbwp-divider);
      background: var(--rbwp-bg);
    }

    .rbwp-summary {
      margin-bottom: 10px;
      font-size: 13px;
      color: var(--rbwp-muted);
      text-align: center;
    }

    .rbwp-alert {
      margin-bottom: 10px;
      padding: 10px 12px;
      border-radius: 10px;
      background: var(--rbwp-error-bg);
      color: var(--rbwp-error);
      font-size: 13px;
    }

    .rbwp-root .rbwp-submit {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      width: 100%;
      min-height: 50px;
      padding: 12px 18px;
      border: none;
      border-radius: 12px;
      background: var(--rbwp-cta-bg);
      color: var(--rbwp-cta-text);
      font-size: 15px;
      font-weight: 700;
      transition: background 0.2s ease, opacity 0.2s ease;
    }

    .rbwp-root .rbwp-submit:hover:not(:disabled) {
      background: var(--rbwp-cta-hover);
    }

    .rbwp-root .rbwp-submit:disabled {
      opacity: 0.45;
    }

    .rbwp-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: rbwp-spin 0.7s linear infinite;
    }

    @keyframes rbwp-spin {
      to { transform: rotate(360deg); }
    }

    .rbwp-footer-hint {
      margin-top: 8px;
      font-size: 12px;
      color: var(--rbwp-muted);
      text-align: center;
    }

    /* ---------- Success ---------- */

    .rbwp-success {
      padding: 26px 22px 22px;
      text-align: center;
      overflow-y: auto;
      outline: none;
    }

    .rbwp-success-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 52px;
      height: 52px;
      margin-bottom: 14px;
      border-radius: 50%;
      background: rgba(46, 125, 79, 0.12);
      color: var(--rbwp-success);
    }

    .rbwp-root .rbwp-success-title {
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 6px;
    }

    .rbwp-root .rbwp-success-text {
      font-size: 14px;
      color: var(--rbwp-muted);
      margin-bottom: 14px;
    }

    .rbwp-success-id {
      padding: 10px 12px;
      margin-bottom: 18px;
      border-radius: 10px;
      background: var(--rbwp-surface);
      font-size: 12px;
      color: var(--rbwp-muted);
      word-break: break-all;
    }

    .rbwp-success-actions {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .rbwp-root .rbwp-secondary {
      min-height: 46px;
      padding: 10px 16px;
      border: 1px solid var(--rbwp-border);
      border-radius: 12px;
      background: transparent;
      color: var(--rbwp-text);
      font-size: 14px;
      font-weight: 600;
    }

    .rbwp-sr-only {
      position: absolute !important;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    /* ---------- Mobile ---------- */

    @media (max-width: 480px) {
      .rbwp-root {
        right: 12px;
        bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      }

      .rbwp-root.is-open {
        left: 12px;
      }

      .rbwp-panel {
        width: 100%;
        max-width: none;
        max-height: calc(100vh - 24px - env(safe-area-inset-bottom, 0px));
        max-height: calc(100dvh - 24px - env(safe-area-inset-bottom, 0px));
      }

      .rbwp-root .rbwp-launcher {
        min-height: 48px;
        padding: 0 12px 0 16px;
        font-size: 14px;
      }

      .rbwp-root .rbwp-input {
        font-size: 16px;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .rbwp-root *,
      .rbwp-panel {
        transition: none !important;
        animation: none !important;
      }
    }
  `;

  const POPUP_ICONS = {
    chevronUp:
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m18 15-6-6-6 6"/></svg>',
    chevronDown:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m6 9 6 6 6-6"/></svg>',
    close:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    guests:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    date:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    time:
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
    check:
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M20 6 9 17l-5-5"/></svg>'
  };

  // Party sizes offered as one-tap chips; larger groups use the stepper
  const POPUP_GUEST_CHIPS = 8;

  const POPUP_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let popupInstanceCount = 0;

  function popupAddDays(dateStr, days) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  // Browser-local date, used only until the restaurant's own "today" is known
  function popupLocalToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function popupFormatDate(dateStr) {
    try {
      return new Intl.DateTimeFormat('de-DE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC'
      }).format(new Date(`${dateStr}T12:00:00Z`));
    } catch (e) {
      return dateStr;
    }
  }

  function popupGuestsLabel(count) {
    return count === 1 ? '1 Gast' : `${count} Gäste`;
  }

  function popupNoticeLabel(minutes) {
    if (!minutes) return '';
    if (minutes < 60) return `${minutes} Min.`;
    const hours = Math.round(minutes / 60);
    return hours === 1 ? '1 Std.' : `${hours} Std.`;
  }

  function injectPopupStyles() {
    if (document.getElementById('rbw-popup-styles')) return;

    const style = document.createElement('style');
    style.id = 'rbw-popup-styles';
    style.textContent = POPUP_STYLE;
    document.head.appendChild(style);
  }

  class PopupBookingController extends BookingWidgetController {

    // Called from the base constructor; must handle its own errors so the base
    // class never writes an error box into the host page.
    async init() {
      this.uid = `rbwp-${++popupInstanceCount}`;
      this.requestSeq = 0;
      this.loadTimer = null;
      this.policyKey = '';
      this.policyAdjusted = false;

      this.state = {
        open: false,
        loaded: false,
        guests: 2,
        date: null,
        time: '',
        policy: null,
        slots: [],
        slotStatus: 'idle', // idle | loading | ready | closed | error
        slotMessage: '',
        showOtherDate: false,
        submitting: false
      };

      try {
        await this.resolveRestaurantFromWidgetKey();
      } catch (err) {
        // Invalid or missing key: show nothing rather than a control that cannot book
        console.error('[RestaurantBookingWidget] Reservation popup not loaded:', err.message || err);
        return;
      }

      injectPopupStyles();
      loadGoogleFont(this.options.font || 'Plus Jakarta Sans');

      this.renderShell();
      this.bindPopupEvents();

      this.container._rbwController = this;
    }

    // ------------------------------------------------------------
    // RENDER
    // ------------------------------------------------------------

    renderShell() {
      const uid = this.uid;
      const root = document.createElement('div');

      root.className =
        `rbwp-root theme-${this.options.theme === 'light' ? 'light' : 'dark'}`;

      const accent = this.options.accentColor || this.options.primaryColor;
      if (accent) root.style.setProperty('--rbwp-accent', accent);

      if (this.options.font) {
        root.style.setProperty('--rbwp-font', `"${this.options.font}", Arial, sans-serif`);
      }

      const section = (name, label) => `
        <div class="rbwp-section" data-section="${name}">
          <button
            type="button"
            class="rbwp-section-head"
            id="${uid}-${name}-head"
            aria-expanded="false"
            aria-controls="${uid}-${name}-body"
            data-action="toggle-section"
            data-section="${name}"
          >
            <span class="rbwp-section-icon">${POPUP_ICONS[name]}</span>
            <span class="rbwp-section-text">
              <span class="rbwp-section-label">${label}</span>
              <span class="rbwp-section-value" data-value="${name}"></span>
            </span>
            <span class="rbwp-chevron">${POPUP_ICONS.chevronDown}</span>
          </button>
          <div
            class="rbwp-section-body"
            id="${uid}-${name}-body"
            role="region"
            aria-labelledby="${uid}-${name}-head"
            hidden
          ></div>
        </div>
      `;

      root.innerHTML = `
        <button
          type="button"
          class="rbwp-launcher"
          aria-expanded="false"
          aria-controls="${uid}-panel"
          aria-haspopup="dialog"
        >
          <span>Einen Tisch reservieren</span>
          <span class="rbwp-launcher-icon">${POPUP_ICONS.chevronUp}</span>
        </button>

        <div
          class="rbwp-panel"
          id="${uid}-panel"
          role="dialog"
          aria-modal="false"
          aria-labelledby="${uid}-title"
          hidden
        >
          <div class="rbwp-header">
            <div>
              <span class="rbwp-eyebrow">Tisch reservieren</span>
              <h2 class="rbwp-title" id="${uid}-title"></h2>
            </div>
            <button
              type="button"
              class="rbwp-close"
              aria-label="Reservierung schließen"
              data-action="close"
            >${POPUP_ICONS.close}</button>
          </div>

          <form class="rbwp-form" novalidate>
            <div class="rbwp-body">
              ${section('guests', 'Personen')}
              ${section('date', 'Datum')}
              ${section('time', 'Uhrzeit')}

              <div class="rbwp-details" hidden>
                <div class="rbwp-details-title">Ihre Angaben</div>

                <div class="rbwp-field">
                  <label for="${uid}-name">Vollständiger Name</label>
                  <input class="rbwp-input" id="${uid}-name" name="name" type="text"
                    autocomplete="name" placeholder="Max Mustermann" required>
                </div>

                <div class="rbwp-field">
                  <label for="${uid}-email">E-Mail-Adresse</label>
                  <input class="rbwp-input" id="${uid}-email" name="email" type="email"
                    autocomplete="email" inputmode="email" placeholder="max@beispiel.de"
                    aria-describedby="${uid}-email-error" required>
                  <span class="rbwp-field-error" id="${uid}-email-error" hidden>
                    Bitte geben Sie eine gültige E-Mail-Adresse ein.
                  </span>
                </div>

                <div class="rbwp-field">
                  <label for="${uid}-phone">Telefonnummer <span class="rbwp-optional">(optional)</span></label>
                  <input class="rbwp-input" id="${uid}-phone" name="phone" type="tel"
                    autocomplete="tel" placeholder="+49 170 1234567">
                </div>

                <div class="rbwp-field">
                  <label for="${uid}-requests">Besondere Wünsche <span class="rbwp-optional">(optional)</span></label>
                  <textarea class="rbwp-input" id="${uid}-requests" name="special_requests" rows="2"
                    placeholder="Allergien, Anlass, Sitzplatzwunsch …"></textarea>
                </div>
              </div>
            </div>

            <div class="rbwp-footer">
              <div class="rbwp-summary" data-summary hidden></div>
              <div class="rbwp-alert" role="alert" hidden></div>
              <button type="submit" class="rbwp-submit" disabled>Reservieren</button>
              <div class="rbwp-footer-hint" aria-live="polite"></div>
            </div>
          </form>

          <div class="rbwp-success" tabindex="-1" hidden></div>
        </div>
      `;

      document.body.appendChild(root);

      this.root = root;
      this.launcher = root.querySelector('.rbwp-launcher');
      this.panel = root.querySelector('.rbwp-panel');
      this.popupForm = root.querySelector('.rbwp-form');
      this.closeBtn = root.querySelector('.rbwp-close');
      this.details = root.querySelector('.rbwp-details');
      this.popupSubmit = root.querySelector('.rbwp-submit');
      this.popupAlert = root.querySelector('.rbwp-alert');
      this.footerHint = root.querySelector('.rbwp-footer-hint');
      this.summary = root.querySelector('[data-summary]');
      this.successView = root.querySelector('.rbwp-success');

      this.fields = {
        name: root.querySelector(`#${uid}-name`),
        email: root.querySelector(`#${uid}-email`),
        phone: root.querySelector(`#${uid}-phone`),
        requests: root.querySelector(`#${uid}-requests`)
      };
      this.emailError = root.querySelector(`#${uid}-email-error`);

      root.querySelector('.rbwp-title').textContent =
        (this.restaurant && this.restaurant.name) || 'Tisch reservieren';

      this.sections = {};
      ['guests', 'date', 'time'].forEach((name) => {
        this.sections[name] = {
          head: root.querySelector(`#${uid}-${name}-head`),
          body: root.querySelector(`#${uid}-${name}-body`),
          value: root.querySelector(`[data-value="${name}"]`)
        };
      });

      this.renderGuestsBody();
      this.renderDateBody();
      this.renderTimeBody();
      this.syncPopup();
    }

    renderGuestsBody() {
      const body = this.sections.guests.body;
      const policy = this.state.policy;

      if (!policy) {
        body.innerHTML = '<div class="rbwp-skeleton"></div>';
        return;
      }

      const min = Math.max(1, parseInt(policy.min_party_size, 10) || 1);
      const max = Math.max(min, parseInt(policy.max_party_size, 10) || min);
      const lastChip = Math.min(max, min + POPUP_GUEST_CHIPS - 1);

      let chips = '';
      for (let n = min; n <= lastChip; n++) {
        chips += `
          <button type="button" class="rbwp-chip" data-action="guests" data-value="${n}"
            aria-pressed="false" aria-label="${popupGuestsLabel(n)}">${n}</button>`;
      }

      // Groups beyond the chips (still within the restaurant's max) use the stepper
      const stepper = max > lastChip
        ? `
          <div class="rbwp-stepper">
            <span>Größere Gruppe (bis ${max})</span>
            <span class="rbwp-stepper-controls">
              <button type="button" class="rbwp-step-btn" data-action="guests-step" data-step="-1"
                aria-label="Eine Person weniger">−</button>
              <span class="rbwp-stepper-value" data-stepper-value aria-live="polite"></span>
              <button type="button" class="rbwp-step-btn" data-action="guests-step" data-step="1"
                aria-label="Eine Person mehr">+</button>
            </span>
          </div>`
        : '';

      body.innerHTML = `
        <div class="rbwp-chips cols-4" role="group" aria-label="Personenzahl wählen">${chips}</div>
        ${stepper}
        <p class="rbwp-hint">Online buchbar für ${min === max ? max : `${min}–${max}`} ${max === 1 ? 'Person' : 'Personen'}.</p>
      `;
    }

    renderDateBody() {
      const body = this.sections.date.body;
      const policy = this.state.policy;

      if (!policy) {
        body.innerHTML = '<div class="rbwp-skeleton"></div>';
        return;
      }

      const today = policy.today || popupLocalToday();
      const tomorrow = popupAddDays(today, 1);

      const hints = [];
      if (policy.same_day_booking === false) {
        hints.push('Reservierungen für heute sind online nicht möglich');
      }
      const notice = popupNoticeLabel(parseInt(policy.min_advance_notice_mins, 10) || 0);
      if (notice) hints.push(`Mindestens ${notice} Vorlauf`);
      if (policy.last_bookable_date) {
        hints.push(`buchbar bis ${popupFormatDate(policy.last_bookable_date)}`);
      }

      body.innerHTML = `
        <div class="rbwp-chips cols-3" role="group" aria-label="Datum wählen">
          <button type="button" class="rbwp-chip" data-action="date" data-choice="today" aria-pressed="false">
            Heute<small>${popupFormatDate(today)}</small>
          </button>
          <button type="button" class="rbwp-chip" data-action="date" data-choice="tomorrow" aria-pressed="false">
            Morgen<small>${popupFormatDate(tomorrow)}</small>
          </button>
          <button type="button" class="rbwp-chip" data-action="date" data-choice="other" aria-pressed="false">
            Andere<small>Kalender</small>
          </button>
        </div>
        <div class="rbwp-field" data-other-date hidden style="margin-top:12px">
          <label for="${this.uid}-date">Datum wählen</label>
          <input class="rbwp-input" id="${this.uid}-date" type="date"
            min="${policy.first_bookable_date || today}"
            ${policy.last_bookable_date ? `max="${policy.last_bookable_date}"` : ''}>
        </div>
        <p class="rbwp-hint">${hints.join(' · ')}</p>
      `;

      this.dateField = body.querySelector(`#${this.uid}-date`);
      this.dateField.addEventListener('change', () => this.onOtherDateChange());
    }

    renderTimeBody() {
      const body = this.sections.time.body;
      const { slotStatus, slots, slotMessage, policy, date } = this.state;

      if (slotStatus === 'idle' || slotStatus === 'loading') {
        body.innerHTML = `
          <p class="rbwp-status" role="status">Verfügbare Zeiten werden geladen …</p>
          <div class="rbwp-chips slots" aria-hidden="true">
            <div class="rbwp-skeleton"></div><div class="rbwp-skeleton"></div>
            <div class="rbwp-skeleton"></div><div class="rbwp-skeleton"></div>
          </div>`;
        return;
      }

      if (slotStatus === 'error') {
        body.innerHTML = `
          <div class="rbwp-notice is-error" role="alert">
            Die Verfügbarkeit konnte nicht geladen werden.
          </div>
          <button type="button" class="rbwp-link-btn" data-action="retry">Erneut versuchen</button>`;
        return;
      }

      const nextDay = date ? popupAddDays(date, 1) : null;
      const canTryNextDay =
        nextDay && policy && (!policy.last_bookable_date || nextDay <= policy.last_bookable_date);
      const nextDayButton = canTryNextDay
        ? `<button type="button" class="rbwp-link-btn" data-action="next-day">Nächsten Tag anzeigen (${popupFormatDate(nextDay)})</button>`
        : '';

      if (slotStatus === 'closed' || !slots.length) {
        body.innerHTML = `
          <div class="rbwp-notice" role="status"></div>
          ${nextDayButton}`;
        body.querySelector('.rbwp-notice').textContent =
          slotStatus === 'closed'
            ? slotMessage
            : 'Für dieses Datum sind keine freien Zeiten mehr verfügbar.';
        return;
      }

      // Group by shift (e.g. Mittag / Abend) only when there is more than one
      const groups = [];
      slots.forEach((slot) => {
        const name = slot.shift_name || '';
        let group = groups.find((g) => g.name === name);
        if (!group) {
          group = { name, slots: [] };
          groups.push(group);
        }
        group.slots.push(slot);
      });

      const showGroupNames = groups.length > 1;

      body.innerHTML = `
        <p class="rbwp-status" role="status">${slots.length === 1 ? '1 freie Uhrzeit' : `${slots.length} freie Uhrzeiten`}</p>
        ${groups.map((group) => `
          ${showGroupNames && group.name ? '<div class="rbwp-shift-label"></div>' : ''}
          <div class="rbwp-chips slots" role="group" aria-label="Uhrzeit wählen">
            ${group.slots.map((slot) => `
              <button type="button" class="rbwp-chip" data-action="slot" data-time="${slot.time}"
                aria-pressed="false">${slot.time}</button>`).join('')}
          </div>`).join('')}
      `;

      // Shift names come from restaurant settings: insert as text
      if (showGroupNames) {
        const labels = body.querySelectorAll('.rbwp-shift-label');
        groups.filter((g) => g.name).forEach((group, index) => {
          if (labels[index]) labels[index].textContent = group.name;
        });
      }
    }

    // Updates labels / selection state without rebuilding the section bodies
    syncPopup() {
      const { guests, date, time, policy, slotStatus } = this.state;

      // Guests
      this.sections.guests.value.textContent = popupGuestsLabel(guests);
      this.sections.guests.body.querySelectorAll('[data-action="guests"]').forEach((chip) => {
        chip.setAttribute('aria-pressed', String(parseInt(chip.dataset.value, 10) === guests));
      });
      const stepperValue = this.sections.guests.body.querySelector('[data-stepper-value]');
      if (stepperValue && policy) {
        stepperValue.textContent = String(guests);
        const [less, more] = this.sections.guests.body.querySelectorAll('[data-action="guests-step"]');
        less.disabled = guests <= policy.min_party_size;
        more.disabled = guests >= policy.max_party_size;
      }

      // Date
      const dateValue = this.sections.date.value;
      if (date) {
        const today = (policy && policy.today) || popupLocalToday();
        const prefix =
          date === today ? 'Heute, ' : date === popupAddDays(today, 1) ? 'Morgen, ' : '';
        dateValue.textContent = prefix + popupFormatDate(date);
        dateValue.classList.remove('is-placeholder');
      } else {
        dateValue.textContent = 'Wird geladen …';
        dateValue.classList.add('is-placeholder');
      }

      if (policy) {
        const today = policy.today || popupLocalToday();
        const tomorrow = popupAddDays(today, 1);
        const inRange = (d) =>
          (!policy.first_bookable_date || d >= policy.first_bookable_date) &&
          (!policy.last_bookable_date || d <= policy.last_bookable_date);
        const choice =
          this.state.showOtherDate ? 'other'
            : date === today ? 'today'
              : date === tomorrow ? 'tomorrow'
                : 'other';

        this.sections.date.body.querySelectorAll('[data-action="date"]').forEach((chip) => {
          const c = chip.dataset.choice;
          chip.setAttribute('aria-pressed', String(c === choice));
          if (c === 'today') chip.disabled = !inRange(today);
          if (c === 'tomorrow') chip.disabled = !inRange(tomorrow);
        });

        const other = this.sections.date.body.querySelector('[data-other-date]');
        if (other) {
          other.hidden = choice !== 'other';
          if (this.dateField && date && this.dateField.value !== date) this.dateField.value = date;
        }
      }

      // Time
      const timeValue = this.sections.time.value;
      if (time) {
        timeValue.textContent = `${time} Uhr`;
        timeValue.classList.remove('is-placeholder');
      } else {
        timeValue.textContent =
          slotStatus === 'loading' || slotStatus === 'idle' ? 'Wird geladen …' : 'Bitte wählen';
        timeValue.classList.add('is-placeholder');
      }
      this.sections.time.body.querySelectorAll('[data-action="slot"]').forEach((chip) => {
        chip.setAttribute('aria-pressed', String(chip.dataset.time === time));
      });

      // Guest details only after a time is chosen (keeps the drawer compact)
      this.details.hidden = !time;

      this.summary.hidden = !time;
      if (time && date) {
        this.summary.textContent =
          `${popupGuestsLabel(guests)} · ${popupFormatDate(date)} · ${time} Uhr`;
      }

      this.updateSubmitState();
    }

    updateSubmitState() {
      const { time, submitting } = this.state;
      const name = this.fields.name.value.trim();
      const email = this.fields.email.value.trim();

      let hint = '';
      if (!time) hint = 'Bitte wählen Sie eine Uhrzeit.';
      else if (!name || !email) hint = 'Bitte geben Sie Name und E-Mail-Adresse ein.';
      else if (!POPUP_EMAIL_PATTERN.test(email)) hint = 'Bitte prüfen Sie Ihre E-Mail-Adresse.';

      this.popupSubmit.disabled = submitting || Boolean(hint);
      this.footerHint.textContent = submitting ? '' : hint;
    }

    // ------------------------------------------------------------
    // EVENTS
    // ------------------------------------------------------------

    bindPopupEvents() {
      this.launcher.addEventListener('click', () => this.openPopup());

      this.root.addEventListener('click', (event) => {
        const target = event.target.closest('[data-action]');
        if (!target || !this.root.contains(target) || target.disabled) return;

        switch (target.dataset.action) {
          case 'close':
            this.closePopup();
            break;
          case 'toggle-section':
            this.toggleSection(target.dataset.section);
            break;
          case 'guests':
            this.setGuests(parseInt(target.dataset.value, 10), true);
            break;
          case 'guests-step':
            this.setGuests(this.state.guests + parseInt(target.dataset.step, 10), false);
            break;
          case 'date':
            this.onDateChoice(target.dataset.choice);
            break;
          case 'slot':
            this.selectSlot(target.dataset.time);
            break;
          case 'next-day':
            this.setDate(popupAddDays(this.state.date, 1), false);
            break;
          case 'retry':
            this.loadAvailability();
            break;
          case 'book-another':
            this.resetPopup();
            break;
          default:
            break;
        }
      });

      Object.values(this.fields).forEach((field) => {
        field.addEventListener('input', () => {
          if (field === this.fields.email) this.validateEmail(false);
          this.updateSubmitState();
        });
      });

      this.fields.email.addEventListener('blur', () => this.validateEmail(true));

      this.popupForm.addEventListener('submit', (event) => {
        event.preventDefault();
        this.submitPopup();
      });

      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && this.state.open) {
          this.closePopup();
        }
      });
    }

    openPopup() {
      if (this.state.open) return;
      this.state.open = true;

      this.root.classList.add('is-open');
      this.launcher.setAttribute('aria-expanded', 'true');
      this.panel.hidden = false;
      void this.panel.offsetWidth; // start the transition from the hidden state
      this.panel.classList.add('is-visible');

      // Availability is only requested once the guest actually opens the drawer
      if (!this.state.loaded) {
        this.state.loaded = true;
        this.openSection('time');
        this.loadAvailability();
      }

      this.closeBtn.focus({ preventScroll: true });
    }

    closePopup() {
      if (!this.state.open) return;
      this.state.open = false;

      const focusWasInside = this.panel.contains(document.activeElement);

      this.panel.classList.remove('is-visible');
      this.root.classList.remove('is-open');
      this.launcher.setAttribute('aria-expanded', 'false');

      const reduceMotion =
        window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      setTimeout(() => {
        if (!this.state.open) this.panel.hidden = true;
      }, reduceMotion ? 0 : 220);

      if (focusWasInside) this.launcher.focus({ preventScroll: true });
    }

    toggleSection(name) {
      const isOpen = this.sections[name].head.getAttribute('aria-expanded') === 'true';
      this.openSection(isOpen ? null : name);
    }

    // Accordion: at most one section open at a time
    openSection(name, { focus = false } = {}) {
      Object.entries(this.sections).forEach(([key, section]) => {
        const open = key === name;
        section.head.setAttribute('aria-expanded', String(open));
        section.body.hidden = !open;
      });

      if (focus && name) this.sections[name].head.focus({ preventScroll: true });
    }

    setGuests(count, advance) {
      const policy = this.state.policy;
      if (!policy || !Number.isFinite(count)) return;

      const next = Math.min(policy.max_party_size, Math.max(policy.min_party_size, count));
      const changed = next !== this.state.guests;
      this.state.guests = next;
      this.syncPopup();

      if (changed) this.scheduleAvailability(advance ? 0 : 300);
      if (advance) this.openSection('date', { focus: true });
    }

    onDateChoice(choice) {
      const policy = this.state.policy;
      if (!policy) return;

      const today = policy.today || popupLocalToday();

      if (choice === 'other') {
        this.state.showOtherDate = true;
        this.syncPopup();
        if (this.dateField) this.dateField.focus();
        return;
      }

      this.state.showOtherDate = false;
      this.setDate(choice === 'today' ? today : popupAddDays(today, 1), true);
    }

    onOtherDateChange() {
      const value = this.dateField.value;
      if (!value) return;
      this.setDate(value, false);
    }

    setDate(date, advance) {
      const policy = this.state.policy;
      if (!date || !policy) return;

      if (
        (policy.first_bookable_date && date < policy.first_bookable_date) ||
        (policy.last_bookable_date && date > policy.last_bookable_date)
      ) {
        this.showPopupAlert(
          `Bitte wählen Sie ein Datum zwischen ${popupFormatDate(policy.first_bookable_date)} und ${popupFormatDate(policy.last_bookable_date)}`
        );
        if (this.dateField) this.dateField.value = this.state.date || '';
        return;
      }

      this.hidePopupAlert();
      const changed = date !== this.state.date;
      this.state.date = date;
      this.syncPopup();

      if (changed) {
        this.state.time = '';
        this.scheduleAvailability(0);
      }
      if (advance || !this.isSectionOpen('date')) this.openSection('time', { focus: advance });
    }

    isSectionOpen(name) {
      return this.sections[name].head.getAttribute('aria-expanded') === 'true';
    }

    selectSlot(time) {
      if (!this.state.slots.some((slot) => slot.time === time)) return;

      this.state.time = time;
      this.hidePopupAlert();
      this.syncPopup();
      this.openSection(null);

      // Continue with the guest details
      const firstEmpty = [this.fields.name, this.fields.email].find((f) => !f.value.trim());
      const focusTarget = firstEmpty || this.popupSubmit;
      if (!focusTarget.disabled) focusTarget.focus({ preventScroll: true });
      this.details.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }

    validateEmail(showError) {
      const value = this.fields.email.value.trim();
      const invalid = Boolean(value) && !POPUP_EMAIL_PATTERN.test(value);

      if (!invalid) {
        this.fields.email.removeAttribute('aria-invalid');
        this.emailError.hidden = true;
      } else if (showError) {
        this.fields.email.setAttribute('aria-invalid', 'true');
        this.emailError.hidden = false;
      }
      return !invalid;
    }

    showPopupAlert(message) {
      this.popupAlert.textContent = message;
      this.popupAlert.hidden = false;
    }

    hidePopupAlert() {
      this.popupAlert.hidden = true;
      this.popupAlert.textContent = '';
    }

    // ------------------------------------------------------------
    // AVAILABILITY (same endpoint and booking policy as the inline widget)
    // ------------------------------------------------------------

    scheduleAvailability(delay) {
      clearTimeout(this.loadTimer);
      this.state.slotStatus = 'loading';
      this.renderTimeBody();
      this.syncPopup();
      this.loadTimer = setTimeout(() => this.loadAvailability(), delay);
    }

    // Mirrors the server policy into the controls. Returns true when the current
    // guests/date had to be moved into the allowed range.
    applyPopupPolicy(policy) {
      const min = Math.max(1, parseInt(policy.min_party_size, 10) || 1);
      const max = Math.max(min, parseInt(policy.max_party_size, 10) || min);
      const normalized = { ...policy, min_party_size: min, max_party_size: max };

      const key = JSON.stringify([
        min, max, policy.today, policy.first_bookable_date, policy.last_bookable_date,
        policy.same_day_booking, policy.min_advance_notice_mins
      ]);

      this.state.policy = normalized;
      if (key !== this.policyKey) {
        this.policyKey = key;
        this.renderGuestsBody();
        this.renderDateBody();
      }

      let adjusted = false;

      if (this.state.guests < min || this.state.guests > max) {
        this.state.guests = Math.min(max, Math.max(min, this.state.guests));
        adjusted = true;
      }

      const date = this.state.date;
      if (policy.first_bookable_date && (!date || date < policy.first_bookable_date)) {
        this.state.date = policy.first_bookable_date;
        adjusted = true;
      } else if (policy.last_bookable_date && date > policy.last_bookable_date) {
        this.state.date = policy.last_bookable_date;
        adjusted = true;
      }

      return adjusted;
    }

    async loadAvailability() {
      clearTimeout(this.loadTimer);

      const seq = ++this.requestSeq;

      if (!this.state.date) {
        this.state.date = (this.state.policy && this.state.policy.first_bookable_date) || popupLocalToday();
      }

      this.state.slotStatus = 'loading';
      this.renderTimeBody();
      this.syncPopup();

      try {
        const response = await fetch(this.availabilityUrl(this.state.date, this.state.guests));
        const data = await response.json().catch(() => null);

        if (seq !== this.requestSeq) return; // a newer request superseded this one

        if (!response.ok || !data) {
          throw new Error(
            (data && data.error && data.error.message) ||
            'Die Verfügbarkeit konnte nicht geladen werden.'
          );
        }

        // First load: move guests/date into the restaurant's policy and reload once
        if (
          data.booking_policy &&
          this.applyPopupPolicy(data.booking_policy) &&
          !this.policyAdjusted
        ) {
          this.policyAdjusted = true;
          return this.loadAvailability();
        }

        if (data.is_open === false) {
          this.state.slots = [];
          this.state.slotStatus = 'closed';
          this.state.slotMessage =
            data.policy_blocked && data.message
              ? String(data.message)
              : 'Das Restaurant ist an diesem Tag geschlossen.';
        } else {
          // Only bookable slots are offered; nothing is invented when none are free
          this.state.slots = (data.slots || []).filter((slot) => slot && slot.available && /^\d{2}:\d{2}$/.test(String(slot.time)));
          this.state.slotStatus = 'ready';
          this.state.slotMessage = '';
        }

        if (this.state.time && !this.state.slots.some((slot) => slot.time === this.state.time)) {
          this.state.time = '';
        }
      } catch (err) {
        if (seq !== this.requestSeq) return;

        console.error('[RestaurantBookingWidget] Popup availability error:', err);
        this.state.slots = [];
        this.state.time = '';
        this.state.slotStatus = 'error';
      }

      this.renderTimeBody();
      this.syncPopup();
    }

    // ------------------------------------------------------------
    // SUBMIT (same POST /api/reservations payload as the inline widget)
    // ------------------------------------------------------------

    async submitPopup() {
      if (this.state.submitting) return;

      this.updateSubmitState();
      if (this.popupSubmit.disabled) {
        if (this.state.time) this.validateEmail(true);
        return;
      }

      const payload = {
        restaurant_id: this.options.restaurantId,
        // Server resolves restaurants.id from the public widget key when present
        widget_key: this.options.widgetKey || undefined,
        name: this.fields.name.value.trim(),
        guests: this.state.guests,
        date: this.state.date,
        time: this.state.time,
        email: this.fields.email.value.trim(),
        phone: this.fields.phone.value.trim() || null,
        special_requests: this.fields.requests.value.trim() || null
      };

      this.state.submitting = true;
      this.hidePopupAlert();
      this.popupSubmit.setAttribute('aria-busy', 'true');
      this.popupSubmit.innerHTML = '<span class="rbwp-spinner" aria-hidden="true"></span><span>Wird reserviert …</span>';
      this.updateSubmitState();

      try {
        const { response, data } = await this.postReservation(payload);

        if (response.status === 409) {
          // Slot was taken in the meantime: refresh real availability
          this.state.time = '';
          this.showPopupAlert(
            (data && data.error && data.error.message) ||
            'Diese Uhrzeit ist inzwischen nicht mehr verfügbar. Bitte wählen Sie eine andere Uhrzeit.'
          );
          this.openSection('time');
          this.loadAvailability();
          return;
        }

        if (!response.ok || !data || !data.success) {
          throw new Error(
            (data && data.error && data.error.message) ||
            'Die Reservierung konnte nicht erstellt werden.'
          );
        }

        this.showPopupSuccess(data.data || {}, payload);
      } catch (err) {
        this.showPopupAlert(
          err && err.message && !/JSON|fetch/i.test(err.message)
            ? err.message
            : 'Die Reservierung konnte nicht erstellt werden. Bitte versuchen Sie es erneut.'
        );
      } finally {
        this.state.submitting = false;
        this.popupSubmit.removeAttribute('aria-busy');
        this.popupSubmit.textContent = 'Reservieren';
        this.updateSubmitState();
      }
    }

    showPopupSuccess(reservation, payload) {
      const confirmed = String(reservation.status || '').toLowerCase() === 'confirmed';

      this.successView.innerHTML = `
        <div class="rbwp-success-icon">${POPUP_ICONS.check}</div>
        <p class="rbwp-success-title"></p>
        <p class="rbwp-success-text"></p>
        <div class="rbwp-success-id" hidden></div>
        <div class="rbwp-success-actions">
          <button type="button" class="rbwp-submit" data-action="close">Schließen</button>
          <button type="button" class="rbwp-secondary" data-action="book-another">Weitere Reservierung</button>
        </div>
      `;

      this.successView.querySelector('.rbwp-success-title').textContent =
        confirmed ? 'Reservierung bestätigt' : 'Reservierungsanfrage erhalten';

      this.successView.querySelector('.rbwp-success-text').textContent =
        `${popupGuestsLabel(payload.guests)} · ${popupFormatDate(payload.date)} · ${payload.time} Uhr`;

      if (reservation.id || reservation.booking_code) {
        const shortCode =
          reservation.booking_code ||
          String(reservation.id || '').split('-')[0].toUpperCase();
        const idBox = this.successView.querySelector('.rbwp-success-id');
        idBox.textContent = `Reservierungs-Code: ${shortCode}`;
        idBox.hidden = false;
      }

      this.popupForm.hidden = true;
      this.successView.hidden = false;
      this.successView.focus({ preventScroll: true });
    }

    resetPopup() {
      Object.values(this.fields).forEach((field) => {
        field.value = '';
      });
      this.validateEmail(false);
      this.hidePopupAlert();

      this.state.time = '';
      this.successView.hidden = true;
      this.successView.innerHTML = '';
      this.popupForm.hidden = false;

      this.openSection('time', { focus: true });
      this.loadAvailability();
    }
  }


  // ============================================================
  // GLOBAL API
  // ============================================================

  window.RestaurantBookingWidget = {

    init: function (
      target,
      options = {}
    ) {

      const container =
        typeof target === 'string'
          ? document.querySelector(
              target
            )
          : target;


      if (!container) {

        console.error(
          '[RestaurantBookingWidget] Target container not found:',
          target
        );


        return null;
      }


      return new BookingWidgetController(
        container,
        options
      );
    },


    // Floating reservation drawer; target is optional (only carries data-* config)
    initPopup: function (
      target,
      options = {}
    ) {

      const container =
        (typeof target === 'string'
          ? document.querySelector(target)
          : target) ||
        document.createElement('div');

      if (container._rbwPopup) {
        return container._rbwPopup;
      }

      container._rbwPopup =
        new PopupBookingController(
          container,
          options
        );

      return container._rbwPopup;
    },


    applyBrandColors
  };


  // ============================================================
  // WEB COMPONENT
  // ============================================================

  if (
    'customElements' in window &&
    !customElements.get(
      'restaurant-booking-widget'
    )
  ) {

    class RestaurantBookingWidgetElement
      extends HTMLElement {

      connectedCallback() {

        new BookingWidgetController(
          this
        );
      }
    }


    customElements.define(
      'restaurant-booking-widget',
      RestaurantBookingWidgetElement
    );
  }


  // ============================================================
  // AUTO INIT
  // ============================================================

  function autoInit() {

    // data-mode="popup": floating drawer instead of the inline widget
    if (
      String(scriptConfig.mode || '').toLowerCase() === 'popup'
    ) {

      const mount =
        document.getElementById(
          'restaurant-booking-popup'
        );

      if (
        scriptConfig.widgetKey ||
        scriptConfig.restaurantId ||
        (mount && (mount.dataset.widgetKey || mount.dataset.restaurantId))
      ) {

        window.RestaurantBookingWidget.initPopup(
          mount
        );
      }

      return;
    }

    const target =
      document.getElementById(
        'restaurant-booking-widget'
      );


    // Only embeds that carry a tenant identifier auto-initialize; pages like
    // booking.html call RestaurantBookingWidget.init(...) themselves.
    const hasTenant =
      target && (
        scriptConfig.widgetKey ||
        scriptConfig.restaurantId ||
        target.dataset.widgetKey ||
        target.dataset.restaurantId
      );


    // CMS editors (e.g. WordPress) may leave whitespace or <br> inside the div
    if (
      hasTenant &&
      !target.textContent.trim() &&
      !target.querySelector('*:not(br)')
    ) {

      target.innerHTML = '';

      window.RestaurantBookingWidget.init(
        target
      );
    }
  }


  // The script may load after DOMContentLoaded (async/deferred by CMS plugins)
  if (document.readyState === 'loading') {

    document.addEventListener(
      'DOMContentLoaded',
      autoInit
    );

  } else {

    autoInit();
  }

})();