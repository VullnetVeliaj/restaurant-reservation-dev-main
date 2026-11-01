window.TableAITranslations =
  window.TableAITranslations || {};

window.TableAITranslations.en = {

  common: {
    loading: 'Loading...',
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    back: 'Back',
    retry: 'Try again',
    error:
      'An error occurred.',
    success:
      'The action was completed successfully.'
  },

  auth: {
    sessionExpired:
      'Your session has expired. Please sign in again.',

    loginRequired:
      'Please sign in to continue.',

    logout:
      'Sign out'
  },

  admin: {
    pageTitle: 'Restaurant Admin',
    loadingRestaurant: 'Loading restaurant…',

    header: {
      bookingView: 'Booking page',
      refresh: 'Refresh',
      refreshTitle: 'Reload the latest data',
      addReservation: 'New reservation',
      logout: 'Sign out',
      language: 'Language',
      appearance: 'Appearance',
      themeLight: 'Light',
      themeDark: 'Dark'
    },

    nav: {
      reservations: 'Reservations',
      crm: 'Guest CRM',
      settings: 'Settings',
      mobileReservations: 'Bookings',
      mobileCrm: 'Guests',
      mobileSettings: 'Settings',
      quickAdd: 'New reservation',
      mainLabel: 'Main navigation',
      mobileLabel: 'Mobile navigation'
    },

    roles: {
      OWNER: 'Owner',
      MANAGER: 'Manager',
      STAFF: 'Staff'
    },

    status: {
      PENDING: 'Pending',
      CONFIRMED: 'Confirmed',
      SEATED: 'Seated',
      COMPLETED: 'Completed',
      CANCELLED: 'Cancelled',
      DECLINED: 'Declined',
      NO_SHOW: 'No-show'
    },

    days: {
      monday: 'Monday',
      tuesday: 'Tuesday',
      wednesday: 'Wednesday',
      thursday: 'Thursday',
      friday: 'Friday',
      saturday: 'Saturday',
      sunday: 'Sunday'
    },

    daysShort: {
      monday: 'Mon',
      tuesday: 'Tue',
      wednesday: 'Wed',
      thursday: 'Thu',
      friday: 'Fri',
      saturday: 'Sat',
      sunday: 'Sun'
    },

    filters: {
      yesterday: 'Yesterday',
      today: 'Today',
      tomorrow: 'Tomorrow',
      allDates: 'All dates',
      customDate: 'Pick a specific date',
      allShifts: 'All shifts',
      lunch: 'Lunch',
      dinner: 'Dinner'
    },

    stats: {
      coversBooked: 'Covers booked',
      parties: 'Reservations',
      seated: 'Seated',
      capacityLeft: 'Capacity left',
      covers: 'covers'
    },

    reservations: {
      pendingTitle: 'Pending requests',
      pendingEmpty: 'No pending reservation requests.',
      loadingPending: 'Loading pending requests…',
      liveTitle: 'Current reservations',
      loading: 'Loading reservations…',
      filterAll: 'All',
      empty: 'No reservations match the current filters.',
      guest: 'Guest',
      guestOne: 'guest',
      guestMany: 'guests',
      reservationOne: 'reservation',
      reservationMany: 'reservations',
      dateTime: 'Date & time',
      phone: 'Phone',
      email: 'Email',
      noPhone: 'No phone provided',
      pastNoShow: 'Previous no-show',
      markVip: 'Mark as VIP',
      removeVip: 'Remove VIP status',
      confirm: 'Confirm',
      decline: 'Decline',
      seat: 'Seat guest',
      noShow: 'No-show',
      cancel: 'Cancel',
      complete: 'Complete visit',
      reopen: 'Re-open & confirm',
      unspecifiedDate: 'Date not specified',
      table: {
        time: 'Time',
        guest: 'Guest',
        party: 'Party',
        contact: 'Contact',
        status: 'Status',
        actions: 'Actions'
      }
    },

    crm: {
      title: 'Guest CRM',
      subtitle: 'Visit history, covers, no-shows and VIP preferences for every guest.',
      searchPlaceholder: 'Search by name or phone…',
      statGuests: 'Guests',
      statVips: 'VIP guests',
      statNoShows: 'Flagged no-shows',
      statCovers: 'Covers served',
      loading: 'Loading guests…',
      empty: 'No guests match your search.',
      loadError: 'The guest list could not be loaded.',
      colGuest: 'Guest',
      colContact: 'Contact',
      colHistory: 'History',
      colLastVisit: 'Last visit',
      colTags: 'Tags',
      colNotes: 'Notes',
      colActions: 'Actions',
      visits: 'visits',
      coversUnit: 'covers',
      none: 'None',
      notAvailable: 'n/a',
      regular: 'Regular',
      noShowCount: '{count} no-show(s)',
      noShowWarning: 'This guest has {count} previous no-show(s).',
      addVip: 'Mark VIP',
      vipActive: 'VIP',
      edit: 'Edit',
      noPhone: 'No phone',
      modalTitle: 'Edit guest profile',
      name: 'Guest name',
      tags: 'Tags (comma-separated)',
      tagsPlaceholder: 'VIP, Regular, Anniversary',
      notes: 'Hospitality notes',
      notesPlaceholder: 'Prefers a quiet table, allergic to shellfish…',
      saveProfile: 'Save profile',
      saved: 'Guest profile saved.',
      saveError: 'The guest profile could not be saved.',
      vipOn: 'Guest marked as VIP.',
      vipOff: 'VIP status removed.',
      vipError: 'The VIP status could not be updated.'
    },

    settings: {
      title: 'Settings',
      subtitle: 'Manage your restaurant, opening hours, booking rules and team.',
      save: 'Save changes',
      saving: 'Saving…',
      saved: 'Changes saved successfully.',
      saveError: 'Your changes could not be saved. Please try again.',
      unsaved: 'Unsaved changes',
      loading: 'Loading settings…',
      loadError: 'Settings could not be loaded.',
      invalidFields: 'Please check the highlighted fields.',
      capabilityMissing: 'This section needs the latest database update (migration 2026-10-09). Values cannot be saved until it has been applied.',

      nav: {
        restaurant: 'Restaurant',
        hours: 'Opening hours',
        booking: 'Booking rules',
        branding: 'Branding',
        integration: 'Website integration',
        team: 'Team',
        security: 'Security',
        notifications: 'Notifications',
        analytics: 'Analytics'
      },

      profile: {
        title: 'Restaurant profile',
        desc: 'The basic information guests see about your restaurant.',
        name: 'Restaurant name',
        nameHint: 'Displayed to your guests when they book.',
        bookingPage: 'Public booking page',
        bookingPageHint: 'Your hosted booking page, ready to share with guests.',
        openBookingPage: 'Open booking page',
        timezone: 'Timezone',
        timezoneHint: 'Used for today’s availability, advance notice, cancellation deadlines and analytics.',
        detailsTitle: 'Business details',
        detailsDesc: 'Contact details and address of your restaurant.',
        description: 'Short description',
        descriptionPlaceholder: 'A few words about your restaurant…',
        cuisine: 'Cuisine',
        cuisinePlaceholder: 'e.g. Italian, Mediterranean',
        website: 'Website',
        contactEmail: 'Contact email',
        phone: 'Phone',
        street: 'Street and number',
        postalCode: 'Postal code',
        city: 'City',
        country: 'Country',
        moreSoon: 'Additional profile details such as address, phone number and cuisine will be available in a future update.'
      },

      logo: {
        title: 'Logo',
        desc: 'Shown in your admin area. PNG, JPEG or WebP, up to 2 MB.',
        notConfigured: 'Logo upload needs the latest database update (migration 2026-10-09).',
        none: 'No logo',
        upload: 'Upload logo',
        replace: 'Replace logo',
        remove: 'Remove',
        hint: 'Square images work best. The file is stored securely and only its address is saved.',
        alt: 'Restaurant logo',
        uploaded: 'Logo updated.',
        uploadError: 'The logo could not be uploaded.',
        removeConfirm: 'Remove the current logo?',
        removed: 'Logo removed.',
        removeError: 'The logo could not be removed.'
      },

      cover: {
        title: 'Restaurant cover photo',
        desc: 'Shown on your restaurant card on the public homepage. PNG, JPEG or WebP, up to 5 MB.',
        notConfigured: 'Cover photo upload needs the latest database update (migration 2026-10-10).',
        none: 'No photo',
        upload: 'Upload photo',
        replace: 'Replace photo',
        remove: 'Remove',
        hint: 'Recommended: landscape 16:10 (e.g. 1600 × 1000 px). The image is cropped to fill the card.',
        alt: 'Restaurant cover photo',
        uploaded: 'Cover photo updated.',
        uploadError: 'The cover photo could not be uploaded.',
        removeConfirm: 'Remove the current cover photo?',
        removed: 'Cover photo removed.',
        removeError: 'The cover photo could not be removed.'
      },

      policies: {
        title: 'Booking policies',
        desc: 'Rules for online bookings through your widget. Staff can still create any booking manually.',
        minParty: 'Minimum party size',
        minPartyHint: 'Smallest party that can book online.',
        maxParty: 'Maximum party size',
        maxPartyHint: 'Larger groups are asked to contact you directly.',
        duration: 'Default reservation duration',
        durationHint: 'How long a table stays blocked for capacity planning.',
        cancelCutoff: 'Cancellation deadline',
        cancelCutoffHint: 'Guests can cancel online until this many hours before the visit. 0 = any time.',
        hoursUnit: 'hours',
        autoConfirm: 'Confirm online bookings automatically',
        autoConfirmHint: 'When off, new bookings wait for your confirmation.',
        sameDay: 'Allow same-day bookings',
        sameDayHint: 'When off, guests can book from tomorrow onwards.',
        minutes: '{n} minutes'
      },

      notifications: {
        title: 'Email notifications',
        desc: 'Choose which emails are sent automatically for this restaurant.',
        guestGroup: 'To guests',
        guestBooking: 'Booking confirmation',
        guestBookingHint: 'After an online request (or a booking you create manually).',
        guestStatus: 'Confirmed, declined or cancelled by you',
        guestStatusHint: 'When you change the status of a reservation.',
        guestCancel: 'Cancellation by the guest',
        guestCancelHint: 'Confirmation after the guest cancels via the email link.',
        ownerGroup: 'To your restaurant',
        ownerNew: 'New online booking',
        ownerNewHint: 'An email for every new booking made through the widget.',
        ownerCancel: 'Guest cancellation',
        ownerCancelHint: 'An email when a guest cancels a booking.',
        ownerEmail: 'Recipient for restaurant notifications',
        ownerEmailHint: 'If empty, the contact email from your profile or the owner account is used.',
        emailOnly: 'Notifications are sent by email. SMS and reminder messages are not available yet.'
      },

      hours: {
        title: 'Opening hours & shifts',
        desc: 'Set your opening days and up to 3 shifts per day. Each shift has its own capacity.',
        open: 'Open',
        closed: 'Closed',
        openForBookings: 'Accepting reservations',
        closedDay: 'Closed on this day',
        closedHint: 'Guests cannot book online on this day.',
        shift: 'Shift {n}',
        shiftName: 'Shift name',
        shiftNamePlaceholder: 'e.g. Lunch',
        start: 'Start',
        end: 'End',
        capacity: 'Max. covers',
        remove: 'Remove',
        addShift: 'Add shift',
        maxShifts: 'Maximum of 3 shifts reached',
        noShifts: 'No shifts configured for {day} yet.',
        shiftOne: '1 shift',
        shiftMany: '{count} shifts',
        copyAll: 'Apply to all days',
        copyAllHint: 'Copies the opening status and shifts of {day} to every day of the week.',
        copyConfirm: 'Apply the schedule of {day} to all 7 days? The schedules of the other days will be replaced.',
        copied: 'Schedule applied to all days. Save to keep the changes.',
        shiftDefaults: {
          lunch: 'Lunch',
          dinner: 'Dinner',
          late: 'Late night'
        }
      },

      booking: {
        title: 'Booking rules & capacity',
        desc: 'Control how many guests can book and how far in advance.',
        maxCovers: 'Max. covers per time slot',
        maxCoversHint: 'Default number of guests that can be booked per time slot.',
        interval: 'Time slot interval',
        interval30: '30 minutes',
        intervalHint: 'Reservations are offered in 30-minute steps. This interval is currently fixed.',
        minNotice: 'Minimum advance notice',
        minNoticeUnit: 'minutes',
        minNoticeHint: 'How far in advance guests must book online.',
        maxDays: 'Maximum booking window',
        maxDaysUnit: 'days',
        maxDaysHint: 'How many days ahead guests can book.'
      },

      branding: {
        title: 'Brand & public identity',
        desc: 'Match the booking widget to your restaurant’s look.',
        primary: 'Accent color',
        primaryHint: 'Used for buttons and highlights in the booking widget.',
        background: 'Widget background',
        backgroundHint: 'Background color behind the booking form.',
        preview: 'Preview',
        previewNote: 'Simplified preview — the live widget may differ slightly.',
        previewTitle: 'Reserve a table',
        previewButton: 'Book now',
        invalidColor: 'Please enter a valid hex color, e.g. #D4A373.'
      },

      integration: {
        title: 'Website integration',
        desc: 'Copy this code into your website — for example WordPress, Wix or any HTML page — to show your booking widget.',
        codeLabel: 'Embed code',
        copy: 'Copy embed code',
        copied: '✓ Code copied',
        copyError: 'The code could not be copied. Please select it and copy it manually.',
        unavailable: 'No embed code available.',
        keyNote: 'The widget key automatically identifies your restaurant.',
        step1: 'Copy the code',
        step2: 'Paste it into an HTML block on your website',
        step3: 'Publish the page — the widget appears automatically'
      },

      team: {
        title: 'Team & staff access',
        desc: 'Manage logins and permissions for managers and staff.',
        add: 'Add team member',
        loading: 'Loading team…',
        empty: 'No team members yet',
        emptyHint: 'Invite managers and staff so they can manage reservations.',
        loadError: 'The team could not be loaded.',
        colName: 'Name',
        colEmail: 'Email',
        colRole: 'Role',
        colStatus: 'Status',
        colActions: 'Actions',
        active: 'Active',
        inactive: 'Inactive',
        you: 'You',
        revoke: 'Revoke access',
        revokeConfirm: 'Revoke this team member’s access?',
        revoked: 'Access revoked.',
        revokeError: 'Access could not be revoked.',
        modalTitle: 'Add team member',
        name: 'Full name',
        namePlaceholder: 'e.g. Maria Rossi',
        email: 'Work email',
        emailPlaceholder: 'maria@restaurant.com',
        role: 'Role',
        roleStaff: 'Staff — reservations only',
        roleManager: 'Manager — reservations, CRM & settings',
        password: 'Initial password',
        passwordPlaceholder: 'At least 8 characters',
        passwordHint: 'Share this password securely. The team member can change it after signing in.',
        create: 'Create account',
        created: '{name} was added to your team.',
        createError: 'The team member could not be added.',
        forbidden: 'You do not have permission for this action.'
      },

      security: {
        title: 'Account & security',
        desc: 'Your personal login details.',
        account: 'Your account',
        email: 'Email',
        role: 'Role',
        restaurant: 'Restaurant',
        passwordTitle: 'Change password',
        current: 'Current password',
        currentPlaceholder: 'Enter your current password',
        new: 'New password',
        newPlaceholder: 'At least 8 characters',
        newHint: 'At least 8 characters, including at least one letter and one number.',
        confirm: 'Confirm new password',
        confirmPlaceholder: 'Re-enter your new password',
        submit: 'Update password',
        errCurrent: 'Please enter your current password.',
        errWeak: 'The new password must be at least 8 characters long and contain at least one letter and one number.',
        errMismatch: 'The new passwords do not match.',
        errSame: 'The new password must be different from your current password.',
        success: 'Your password was updated successfully.',
        error: 'Your password could not be updated.'
      }
    },

    manual: {
      title: 'New reservation',
      name: 'Guest name',
      namePlaceholder: 'e.g. Sarah Connor',
      party: 'Guests',
      date: 'Date',
      time: 'Time',
      phone: 'Phone',
      phonePlaceholder: '+1 555 0199',
      email: 'Email (optional)',
      emailPlaceholder: 'guest@example.com',
      requests: 'Special requests / notes',
      requestsPlaceholder: 'Corner booth, anniversary, vegetarian menu…',
      submit: 'Create reservation',
      saving: 'Saving…',
      created: 'Reservation for {name} created.',
      error: 'The reservation could not be created.'
    },

    analytics: {
      title: 'Analytics',
      desc: 'Based on your restaurant’s reservations. Guest names and contact details are not used.',
      days7: '7 days',
      days30: '30 days',
      days90: '90 days',
      loading: 'Loading analytics…',
      loadError: 'Analytics could not be loaded.',
      noData: 'No reservations in this period yet.',
      tableView: 'Show as table',
      reservationOne: '{n} reservation',
      reservationMany: '{n} reservations',
      notEnoughData: 'Not enough data ({n} of {min} completed visits)',
      basedOnResolved: 'Based on {n} completed visits',
      kpiToday: 'Reservations today',
      guestsNote: '{n} guests',
      kpiWeek: 'Reservations this week',
      kpiGuestsWeek: 'Guests this week',
      excludingCancelled: 'Excluding cancellations and no-shows',
      kpiCancellationRate: 'Cancellation rate',
      kpiAvgParty: 'Average party size',
      inPeriod: 'In the selected period',
      kpiNoShowRate: 'No-show rate',
      cancelledCount: '{n} cancelled',
      trendTitle: 'Reservations per day',
      trendSub: 'excluding cancellations',
      colDate: 'Date',
      colReservations: 'Reservations',
      colCancelled: 'Cancelled',
      peakTitle: 'Peak booking times',
      peakSub: 'Reservations by start time in the selected period',
      colHour: 'Time',
      weekdayTitle: 'Busiest weekdays',
      colWeekday: 'Weekday',
      statusTitle: 'Reservations by status'
    },

    errors: {
      network: 'Network error — please check your connection and try again.',
      UNSUPPORTED_LOGO_TYPE: 'Please choose a PNG, JPEG or WebP image.',
      LOGO_TOO_LARGE: 'The logo must be 2 MB or smaller.',
      UNSUPPORTED_COVER_TYPE: 'Please choose a PNG, JPEG or WebP image.',
      COVER_TOO_LARGE: 'The cover photo must be 5 MB or smaller.',
      COVER_STORAGE_NOT_CONFIGURED: 'Cover photo storage is not set up yet (database update required).',
      INVALID_COVER_UPLOAD: 'The upload could not be verified. Please try again.',
      LOGO_STORAGE_NOT_CONFIGURED: 'Logo storage is not set up yet (database update required).',
      INVALID_PROFILE: 'Please check the highlighted profile field.',
      EMAIL_TAKEN: 'An account with this email address already exists.',
      INVALID_EMAIL: 'Please enter a valid email address.',
      INVALID_NAME: 'Please enter the full name.',
      WEAK_PASSWORD: 'The password must be at least 8 characters and contain a letter and a number.',
      ROLE_NOT_ALLOWED: 'Only the owner can add managers.',
      INVALID_ROLE: 'Please choose a valid role.',
      STAFF_NOT_FOUND: 'This team member no longer exists.',
      CANNOT_REVOKE_SELF: 'You cannot revoke your own account.',
      DB_PERMISSION_DENIED: 'The server is not allowed to access the database. Please check the Supabase service key configuration.',
      SETTINGS_SCHEMA_MISSING: 'The database is missing required settings columns (migration not applied).',
      SETTINGS_NOT_FOUND: 'No settings record exists for this restaurant.',
      INVALID_SETTINGS: 'Some values are outside the allowed range.',
      RATE_LIMITED: 'Too many requests. Please wait a moment and try again.'
    },

    alerts: {
      refreshed: 'Data refreshed.',
      loadError: 'Reservations could not be loaded.',
      statusUpdated: 'Reservation status changed to “{status}”.',
      statusError: 'The reservation status could not be updated.'
    }
  },

  booking: {
  title: 'Reserve a Table',
  subtitle: 'Select your date and guest count to see real-time table availability.',

  voiceAssistant: 'AI Voice Assistant',
  voiceHint: 'Tap the microphone and describe your reservation naturally.',
  stopListening: 'Stop Listening',
  listening: 'Listening...',
  recording: 'Listening...',
  noSpeech: 'No speech detected. Tap the microphone and try again.',
  microphoneError: 'Microphone error',

  date: 'Date',
  guestCount: 'Guest Count',
  fullName: 'Full Name',
  email: 'Email Address',
  phone: 'Phone Number',
  specialRequests: 'Special Requests',

  autoFilled: 'Auto-filled',
  autoSelected: 'Auto-selected',

  selectTime: 'Select Time Slot',
  checkingAvailability: 'Checking availability...',
  availabilityUnavailable: 'Availability unavailable',
  closed: 'Closed',
  restaurantClosed: 'The restaurant is closed on this date.',
  retryAvailability: 'We could not check live availability. Please try again.',

  available: 'left',
  full: 'Full',
  unavailable: 'Unavailable',
  oneOpenSlot: '1 open slot',
  openSlots: 'open slots',

  submit: 'Confirm & Book Reservation',
  processing: 'Processing Booking...',

  existingBooking: 'Already have a booking? View or cancel your reservation here',

  successTitle: 'Reservation Received!',
  successText: 'Your reservation request has been submitted.',
  manageBooking: 'View / Manage Booking',
  bookAnother: 'Book Another Table',

  manageTitle: 'Manage Your Reservation',
  reservationId: 'Reservation Tracking ID',
  reservationIdPlaceholder: 'Enter reservation ID',
  searchReservation: 'Search Reservation',
  cancelReservation: 'Cancel This Reservation',

  status: 'Status',
  dateTime: 'Date & Time',
  guests: 'Guests',
  requests: 'Requests',
  none: 'None',
  guest: 'Guest',

  enterReservationId: 'Please enter a reservation ID.',
  reservationNotFound: 'Reservation not found.',
  lookupFailed: 'Reservation lookup failed.',

  cancelConfirm: 'Are you sure you want to cancel this reservation?',
  cancelSuccess: 'Reservation cancelled successfully.',
  cancelFailed: 'Could not cancel reservation.',

  selectAvailableTime: 'Please select one of the available time slots.',
  requiredFields: 'Please fill all required fields: Date, Time, Guest Count, Full Name and Email.',
  slotNoLongerAvailable: 'This time slot is no longer available. Please choose another time.',
  createFailed: 'Reservation could not be created.',

  processingVoice: 'Processing request...',
  processingVoiceHint: 'Understanding your reservation details and checking availability...',

  restaurantClosedTitle: 'Restaurant Closed',
  chooseAnotherDate: 'Please choose another date.',

  timeAvailable: 'Time Available',
  timeAvailableHint: 'Your requested table time is available. Please review your details.',

  requestedTimeUnavailable: 'Requested Time Unavailable',
  requestedTimeUnavailableHint: 'Your request was understood correctly, but there is no availability at that time.',

  detailsApplied: 'Details Applied',
  detailsAppliedHint: 'Your booking details were filled in. Please select one of the available times below.',

  voiceFailed: 'Could not process the request',
  voiceFailedHint: 'Could not process the request automatically. Please try again or fill the fields manually.',

  selectedAvailableTime: 'Available Time Selected',
  reviewDetails: 'Please review the remaining booking details.',

  confirmed: 'Confirmed',
  pending: 'Pending',
  seated: 'Seated',
  completed: 'Completed',
  cancelled: 'Cancelled',
  declined: 'Declined',
  noShow: 'No-Show'
}

};