window.TableAITranslations =
  window.TableAITranslations || {};

window.TableAITranslations.de = {

  common: {
    loading: 'Wird geladen...',
    save: 'Speichern',
    cancel: 'Abbrechen',
    close: 'Schließen',
    back: 'Zurück',
    retry: 'Erneut versuchen',
    error:
      'Es ist ein Fehler aufgetreten.',
    success:
      'Die Aktion wurde erfolgreich ausgeführt.'
  },

  auth: {
    sessionExpired:
      'Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.',

    loginRequired:
      'Bitte melden Sie sich an, um fortzufahren.',

    logout:
      'Abmelden'
  },

  admin: {
    pageTitle: 'Restaurantverwaltung',
    loadingRestaurant: 'Restaurant wird geladen…',

    header: {
      bookingView: 'Buchungsseite',
      refresh: 'Aktualisieren',
      refreshTitle: 'Aktuelle Daten neu laden',
      addReservation: 'Neue Reservierung',
      logout: 'Abmelden',
      language: 'Sprache',
      appearance: 'Darstellung',
      themeLight: 'Hell',
      themeDark: 'Dunkel'
    },

    nav: {
      reservations: 'Reservierungen',
      crm: 'Gäste-CRM',
      settings: 'Einstellungen',
      mobileReservations: 'Buchungen',
      mobileCrm: 'Gäste',
      mobileSettings: 'Einstellungen',
      quickAdd: 'Neue Reservierung',
      mainLabel: 'Hauptnavigation',
      mobileLabel: 'Mobile Navigation'
    },

    roles: {
      OWNER: 'Inhaber',
      MANAGER: 'Manager',
      STAFF: 'Mitarbeiter'
    },

    status: {
      PENDING: 'Ausstehend',
      CONFIRMED: 'Bestätigt',
      SEATED: 'Platziert',
      COMPLETED: 'Abgeschlossen',
      CANCELLED: 'Storniert',
      DECLINED: 'Abgelehnt',
      NO_SHOW: 'Nicht erschienen'
    },

    days: {
      monday: 'Montag',
      tuesday: 'Dienstag',
      wednesday: 'Mittwoch',
      thursday: 'Donnerstag',
      friday: 'Freitag',
      saturday: 'Samstag',
      sunday: 'Sonntag'
    },

    daysShort: {
      monday: 'Mo',
      tuesday: 'Di',
      wednesday: 'Mi',
      thursday: 'Do',
      friday: 'Fr',
      saturday: 'Sa',
      sunday: 'So'
    },

    filters: {
      yesterday: 'Gestern',
      today: 'Heute',
      tomorrow: 'Morgen',
      allDates: 'Alle Termine',
      customDate: 'Bestimmtes Datum wählen',
      allShifts: 'Alle Schichten',
      lunch: 'Mittag',
      dinner: 'Abend'
    },

    stats: {
      coversBooked: 'Reservierte Plätze',
      parties: 'Reservierungen',
      seated: 'Platziert',
      capacityLeft: 'Verbleibende Kapazität',
      covers: 'Plätze'
    },

    reservations: {
      pendingTitle: 'Offene Anfragen',
      pendingEmpty: 'Keine offenen Reservierungsanfragen.',
      loadingPending: 'Offene Anfragen werden geladen…',
      liveTitle: 'Aktuelle Reservierungen',
      loading: 'Reservierungen werden geladen…',
      filterAll: 'Alle',
      empty: 'Keine Reservierungen entsprechen den aktuellen Filtern.',
      guest: 'Gast',
      guestOne: 'Person',
      guestMany: 'Personen',
      reservationOne: 'Reservierung',
      reservationMany: 'Reservierungen',
      dateTime: 'Datum & Uhrzeit',
      phone: 'Telefon',
      email: 'E-Mail',
      noPhone: 'Keine Telefonnummer hinterlegt',
      pastNoShow: 'Früher nicht erschienen',
      markVip: 'Als VIP markieren',
      removeVip: 'VIP-Status entfernen',
      confirm: 'Bestätigen',
      decline: 'Ablehnen',
      seat: 'Gast platzieren',
      noShow: 'Nicht erschienen',
      cancel: 'Stornieren',
      complete: 'Besuch abschließen',
      reopen: 'Erneut öffnen & bestätigen',
      unspecifiedDate: 'Datum nicht angegeben',
      table: {
        time: 'Uhrzeit',
        guest: 'Gast',
        party: 'Personen',
        contact: 'Kontakt',
        status: 'Status',
        actions: 'Aktionen'
      }
    },

    crm: {
      title: 'Gäste-CRM',
      subtitle: 'Besuchshistorie, Plätze, Nichterscheinen und VIP-Vorlieben Ihrer Gäste.',
      searchPlaceholder: 'Nach Name oder Telefon suchen…',
      statGuests: 'Gäste',
      statVips: 'VIP-Gäste',
      statNoShows: 'Markierte Nichterscheinen',
      statCovers: 'Bewirtete Plätze',
      loading: 'Gäste werden geladen…',
      empty: 'Keine Gäste entsprechen Ihrer Suche.',
      loadError: 'Die Gästeliste konnte nicht geladen werden.',
      colGuest: 'Gast',
      colContact: 'Kontakt',
      colHistory: 'Historie',
      colLastVisit: 'Letzter Besuch',
      colTags: 'Tags',
      colNotes: 'Notizen',
      colActions: 'Aktionen',
      visits: 'Besuche',
      coversUnit: 'Plätze',
      none: 'Keine',
      notAvailable: 'k. A.',
      regular: 'Standard',
      noShowCount: '{count}× nicht erschienen',
      noShowWarning: 'Dieser Gast ist bereits {count}× nicht erschienen.',
      addVip: 'Als VIP markieren',
      vipActive: 'VIP',
      edit: 'Bearbeiten',
      noPhone: 'Keine Telefonnummer',
      modalTitle: 'Gästeprofil bearbeiten',
      name: 'Name des Gastes',
      tags: 'Tags (durch Komma getrennt)',
      tagsPlaceholder: 'VIP, Stammgast, Jubiläum',
      notes: 'Notizen zum Service',
      notesPlaceholder: 'Bevorzugt einen ruhigen Tisch, Allergie gegen Meeresfrüchte…',
      saveProfile: 'Profil speichern',
      saved: 'Gästeprofil wurde gespeichert.',
      saveError: 'Das Gästeprofil konnte nicht gespeichert werden.',
      vipOn: 'Gast wurde als VIP markiert.',
      vipOff: 'VIP-Status wurde entfernt.',
      vipError: 'Der VIP-Status konnte nicht aktualisiert werden.'
    },

    settings: {
      title: 'Einstellungen',
      subtitle: 'Verwalten Sie Restaurant, Öffnungszeiten, Buchungsregeln und Team.',
      save: 'Änderungen speichern',
      saving: 'Wird gespeichert...',
      saved: 'Änderungen wurden gespeichert.',
      saveError: 'Die Änderungen konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.',
      unsaved: 'Ungespeicherte Änderungen',
      loading: 'Einstellungen werden geladen…',
      loadError: 'Die Einstellungen konnten nicht geladen werden.',
      invalidFields: 'Bitte prüfen Sie die markierten Felder.',
      capabilityMissing: 'Dieser Bereich benötigt das neueste Datenbank-Update (Migration 2026-10-09). Werte können erst danach gespeichert werden.',

      nav: {
        restaurant: 'Restaurant',
        hours: 'Öffnungszeiten',
        booking: 'Buchungsregeln',
        branding: 'Branding',
        integration: 'Website-Integration',
        team: 'Team',
        security: 'Sicherheit',
        notifications: 'Benachrichtigungen',
        analytics: 'Analysen'
      },

      profile: {
        title: 'Restaurantprofil',
        desc: 'Die grundlegenden Informationen, die Gäste über Ihr Restaurant sehen.',
        name: 'Restaurantname',
        nameHint: 'Wird Ihren Gästen bei der Buchung angezeigt.',
        bookingPage: 'Öffentliche Buchungsseite',
        bookingPageHint: 'Ihre gehostete Buchungsseite – bereit zum Teilen mit Gästen.',
        openBookingPage: 'Buchungsseite öffnen',
        timezone: 'Zeitzone',
        timezoneHint: 'Grundlage für die heutige Verfügbarkeit, Vorlaufzeit, Stornierungsfristen und Analysen.',
        detailsTitle: 'Geschäftsdaten',
        detailsDesc: 'Kontaktdaten und Adresse Ihres Restaurants.',
        description: 'Kurzbeschreibung',
        descriptionPlaceholder: 'Ein paar Worte zu Ihrem Restaurant…',
        cuisine: 'Küche',
        cuisinePlaceholder: 'z. B. Italienisch, Mediterran',
        website: 'Website',
        contactEmail: 'Kontakt-E-Mail',
        phone: 'Telefon',
        street: 'Straße und Hausnummer',
        postalCode: 'PLZ',
        city: 'Stadt',
        country: 'Land',
        moreSoon: 'Weitere Profilangaben wie Adresse, Telefonnummer und Küchenrichtung folgen in einem späteren Update.'
      },

      logo: {
        title: 'Logo',
        desc: 'Wird in Ihrem Admin-Bereich angezeigt. PNG, JPEG oder WebP, bis 2 MB.',
        notConfigured: 'Der Logo-Upload benötigt das neueste Datenbank-Update (Migration 2026-10-09).',
        none: 'Kein Logo',
        upload: 'Logo hochladen',
        replace: 'Logo ersetzen',
        remove: 'Entfernen',
        hint: 'Quadratische Bilder eignen sich am besten. Die Datei wird sicher gespeichert, nur ihre Adresse wird hinterlegt.',
        alt: 'Restaurant-Logo',
        uploaded: 'Logo wurde aktualisiert.',
        uploadError: 'Das Logo konnte nicht hochgeladen werden.',
        removeConfirm: 'Aktuelles Logo entfernen?',
        removed: 'Logo wurde entfernt.',
        removeError: 'Das Logo konnte nicht entfernt werden.'
      },

      cover: {
        title: 'Restaurant-Foto',
        desc: 'Wird auf Ihrer Restaurant-Karte auf der öffentlichen Startseite angezeigt. PNG, JPEG oder WebP, bis 5 MB.',
        notConfigured: 'Der Foto-Upload benötigt das neueste Datenbank-Update (Migration 2026-10-10).',
        none: 'Kein Foto',
        upload: 'Foto hochladen',
        replace: 'Foto ersetzen',
        remove: 'Entfernen',
        hint: 'Empfohlen: Querformat 16:10 (z. B. 1600 × 1000 px). Das Bild wird passend zugeschnitten.',
        alt: 'Restaurant-Foto',
        uploaded: 'Restaurant-Foto wurde aktualisiert.',
        uploadError: 'Das Restaurant-Foto konnte nicht hochgeladen werden.',
        removeConfirm: 'Aktuelles Restaurant-Foto entfernen?',
        removed: 'Restaurant-Foto wurde entfernt.',
        removeError: 'Das Restaurant-Foto konnte nicht entfernt werden.'
      },

      policies: {
        title: 'Buchungsrichtlinien',
        desc: 'Regeln für Online-Buchungen über Ihr Widget. Ihr Team kann Reservierungen weiterhin manuell anlegen.',
        minParty: 'Mindestanzahl Personen',
        minPartyHint: 'Kleinste Gruppengröße für Online-Buchungen.',
        maxParty: 'Höchstanzahl Personen',
        maxPartyHint: 'Größere Gruppen werden gebeten, Sie direkt zu kontaktieren.',
        duration: 'Standard-Reservierungsdauer',
        durationHint: 'Wie lange ein Tisch für die Kapazitätsplanung belegt ist.',
        cancelCutoff: 'Stornierungsfrist',
        cancelCutoffHint: 'Gäste können bis so viele Stunden vor dem Besuch online stornieren. 0 = jederzeit.',
        hoursUnit: 'Stunden',
        autoConfirm: 'Online-Buchungen automatisch bestätigen',
        autoConfirmHint: 'Wenn deaktiviert, warten neue Buchungen auf Ihre Bestätigung.',
        sameDay: 'Buchungen für denselben Tag erlauben',
        sameDayHint: 'Wenn deaktiviert, können Gäste erst ab morgen buchen.',
        minutes: '{n} Minuten'
      },

      notifications: {
        title: 'E-Mail-Benachrichtigungen',
        desc: 'Legen Sie fest, welche E-Mails für dieses Restaurant automatisch versendet werden.',
        guestGroup: 'An Gäste',
        guestBooking: 'Bestätigung der Reservierung',
        guestBookingHint: 'Nach einer Online-Anfrage (oder einer manuell angelegten Reservierung).',
        guestStatus: 'Bestätigung, Ablehnung oder Stornierung durch Sie',
        guestStatusHint: 'Wenn Sie den Status einer Reservierung ändern.',
        guestCancel: 'Stornierung durch den Gast',
        guestCancelHint: 'Bestätigung, nachdem der Gast über den E-Mail-Link storniert hat.',
        ownerGroup: 'An Ihr Restaurant',
        ownerNew: 'Neue Online-Reservierung',
        ownerNewHint: 'Eine E-Mail für jede neue Buchung über das Widget.',
        ownerCancel: 'Stornierung durch einen Gast',
        ownerCancelHint: 'Eine E-Mail, wenn ein Gast eine Buchung storniert.',
        ownerEmail: 'Empfänger für Restaurant-Benachrichtigungen',
        ownerEmailHint: 'Wenn leer, wird die Kontakt-E-Mail aus Ihrem Profil oder das Inhaberkonto verwendet.',
        emailOnly: 'Benachrichtigungen werden per E-Mail versendet. SMS und Erinnerungen sind noch nicht verfügbar.'
      },

      hours: {
        title: 'Öffnungszeiten & Schichten',
        desc: 'Legen Sie Ihre Öffnungstage und bis zu 3 Schichten pro Tag fest. Jede Schicht hat eine eigene Kapazität.',
        open: 'Geöffnet',
        closed: 'Geschlossen',
        openForBookings: 'Reservierungen möglich',
        closedDay: 'An diesem Tag geschlossen',
        closedHint: 'Gäste können an diesem Tag nicht online buchen.',
        shift: 'Schicht {n}',
        shiftName: 'Schichtname',
        shiftNamePlaceholder: 'z. B. Mittag',
        start: 'Beginn',
        end: 'Ende',
        capacity: 'Max. Plätze',
        remove: 'Entfernen',
        addShift: 'Schicht hinzufügen',
        maxShifts: 'Maximal 3 Schichten erreicht',
        noShifts: 'Für {day} sind noch keine Schichten eingerichtet.',
        shiftOne: '1 Schicht',
        shiftMany: '{count} Schichten',
        copyAll: 'Auf alle Tage übertragen',
        copyAllHint: 'Überträgt Öffnungsstatus und Schichten von {day} auf alle Wochentage.',
        copyConfirm: 'Den Zeitplan von {day} auf alle 7 Tage übertragen? Die Zeitpläne der anderen Tage werden ersetzt.',
        copied: 'Zeitplan wurde auf alle Tage übertragen. Speichern Sie, um die Änderungen zu übernehmen.',
        shiftDefaults: {
          lunch: 'Mittag',
          dinner: 'Abend',
          late: 'Spätschicht'
        }
      },

      booking: {
        title: 'Buchungsregeln & Kapazität',
        desc: 'Legen Sie fest, wie viele Gäste buchen können und wie weit im Voraus.',
        maxCovers: 'Max. Plätze pro Zeitfenster',
        maxCoversHint: 'Standardanzahl an Gästen, die pro Zeitfenster gebucht werden können.',
        interval: 'Zeitfenster-Intervall',
        interval30: '30 Minuten',
        intervalHint: 'Reservierungen werden in 30-Minuten-Schritten angeboten. Dieses Intervall ist derzeit fest vorgegeben.',
        minNotice: 'Mindestvorlaufzeit',
        minNoticeUnit: 'Minuten',
        minNoticeHint: 'Wie lange im Voraus Gäste online buchen müssen.',
        maxDays: 'Maximaler Buchungszeitraum',
        maxDaysUnit: 'Tage',
        maxDaysHint: 'Wie viele Tage im Voraus Gäste buchen können.'
      },

      branding: {
        title: 'Marke & öffentlicher Auftritt',
        desc: 'Passen Sie das Buchungswidget an den Stil Ihres Restaurants an.',
        primary: 'Akzentfarbe',
        primaryHint: 'Wird für Schaltflächen und Hervorhebungen im Buchungswidget verwendet.',
        background: 'Widget-Hintergrund',
        backgroundHint: 'Hintergrundfarbe hinter dem Buchungsformular.',
        preview: 'Vorschau',
        previewNote: 'Vereinfachte Vorschau – das Live-Widget kann leicht abweichen.',
        previewTitle: 'Tisch reservieren',
        previewButton: 'Jetzt reservieren',
        invalidColor: 'Bitte geben Sie einen gültigen Hex-Farbwert ein, z. B. #D4A373.'
      },

      integration: {
        title: 'Website-Integration',
        desc: 'Kopieren Sie diesen Code in Ihre Website – zum Beispiel WordPress, Wix oder eine beliebige HTML-Seite –, um Ihr Buchungswidget einzubinden.',
        codeLabel: 'Embed-Code',
        copy: 'Embed-Code kopieren',
        copied: '✓ Code kopiert',
        copyError: 'Der Code konnte nicht kopiert werden. Bitte markieren und kopieren Sie ihn manuell.',
        unavailable: 'Kein Embed-Code verfügbar.',
        keyNote: 'Der Widget-Schlüssel identifiziert Ihr Restaurant automatisch.',
        step1: 'Code kopieren',
        step2: 'In einen HTML-Block Ihrer Website einfügen',
        step3: 'Seite veröffentlichen – das Widget erscheint automatisch'
      },

      team: {
        title: 'Team & Zugänge',
        desc: 'Verwalten Sie Logins und Berechtigungen für Manager und Mitarbeiter.',
        add: 'Teammitglied hinzufügen',
        loading: 'Team wird geladen…',
        empty: 'Noch keine Teammitglieder',
        emptyHint: 'Laden Sie Manager und Mitarbeiter ein, damit sie Reservierungen verwalten können.',
        loadError: 'Das Team konnte nicht geladen werden.',
        colName: 'Name',
        colEmail: 'E-Mail',
        colRole: 'Rolle',
        colStatus: 'Status',
        colActions: 'Aktionen',
        active: 'Aktiv',
        inactive: 'Inaktiv',
        you: 'Sie',
        revoke: 'Zugang entziehen',
        revokeConfirm: 'Möchten Sie den Zugang dieses Teammitglieds wirklich entziehen?',
        revoked: 'Zugang wurde entzogen.',
        revokeError: 'Der Zugang konnte nicht entzogen werden.',
        modalTitle: 'Teammitglied hinzufügen',
        name: 'Vollständiger Name',
        namePlaceholder: 'z. B. Maria Rossi',
        email: 'Geschäftliche E-Mail',
        emailPlaceholder: 'maria@restaurant.de',
        role: 'Rolle',
        roleStaff: 'Mitarbeiter – nur Reservierungen',
        roleManager: 'Manager – Reservierungen, CRM & Einstellungen',
        password: 'Initiales Passwort',
        passwordPlaceholder: 'Mindestens 8 Zeichen',
        passwordHint: 'Teilen Sie dieses Passwort auf sicherem Weg. Das Teammitglied kann es nach der Anmeldung ändern.',
        create: 'Konto erstellen',
        created: '{name} wurde zum Team hinzugefügt.',
        createError: 'Das Teammitglied konnte nicht hinzugefügt werden.',
        forbidden: 'Sie haben keine Berechtigung für diese Aktion.'
      },

      security: {
        title: 'Konto & Sicherheit',
        desc: 'Ihre persönlichen Anmeldedaten.',
        account: 'Ihr Konto',
        email: 'E-Mail',
        role: 'Rolle',
        restaurant: 'Restaurant',
        passwordTitle: 'Passwort ändern',
        current: 'Aktuelles Passwort',
        currentPlaceholder: 'Aktuelles Passwort eingeben',
        new: 'Neues Passwort',
        newPlaceholder: 'Mindestens 8 Zeichen',
        newHint: 'Mindestens 8 Zeichen, davon mindestens ein Buchstabe und eine Zahl.',
        confirm: 'Neues Passwort bestätigen',
        confirmPlaceholder: 'Neues Passwort erneut eingeben',
        submit: 'Passwort aktualisieren',
        errCurrent: 'Bitte geben Sie Ihr aktuelles Passwort ein.',
        errWeak: 'Das neue Passwort muss mindestens 8 Zeichen lang sein und mindestens einen Buchstaben sowie eine Zahl enthalten.',
        errMismatch: 'Die neuen Passwörter stimmen nicht überein.',
        errSame: 'Das neue Passwort darf nicht mit dem aktuellen Passwort übereinstimmen.',
        success: 'Das Passwort wurde erfolgreich aktualisiert.',
        error: 'Das Passwort konnte nicht aktualisiert werden.'
      }
    },

    manual: {
      title: 'Neue Reservierung',
      name: 'Name des Gastes',
      namePlaceholder: 'z. B. Anna Schmidt',
      party: 'Personen',
      date: 'Datum',
      time: 'Uhrzeit',
      phone: 'Telefon',
      phonePlaceholder: '+49 170 1234567',
      email: 'E-Mail (optional)',
      emailPlaceholder: 'gast@beispiel.de',
      requests: 'Besondere Wünsche / Notizen',
      requestsPlaceholder: 'Ecktisch, Jubiläum, vegetarisches Menü…',
      submit: 'Reservierung anlegen',
      saving: 'Wird gespeichert...',
      created: 'Reservierung für {name} wurde angelegt.',
      error: 'Die Reservierung konnte nicht angelegt werden.'
    },

    analytics: {
      title: 'Analysen',
      desc: 'Auf Basis der Reservierungen Ihres Restaurants. Namen und Kontaktdaten von Gästen werden nicht verwendet.',
      days7: '7 Tage',
      days30: '30 Tage',
      days90: '90 Tage',
      loading: 'Analysen werden geladen…',
      loadError: 'Die Analysen konnten nicht geladen werden.',
      noData: 'In diesem Zeitraum gibt es noch keine Reservierungen.',
      tableView: 'Als Tabelle anzeigen',
      reservationOne: '{n} Reservierung',
      reservationMany: '{n} Reservierungen',
      notEnoughData: 'Zu wenige Daten ({n} von {min} abgeschlossenen Besuchen)',
      basedOnResolved: 'Basierend auf {n} abgeschlossenen Besuchen',
      kpiToday: 'Reservierungen heute',
      guestsNote: '{n} Gäste',
      kpiWeek: 'Reservierungen diese Woche',
      kpiGuestsWeek: 'Gäste diese Woche',
      excludingCancelled: 'Ohne Stornierungen und Nichterscheinen',
      kpiCancellationRate: 'Stornierungsquote',
      kpiAvgParty: 'Durchschnittliche Gruppengröße',
      inPeriod: 'Im gewählten Zeitraum',
      kpiNoShowRate: 'Nichterscheinen-Quote',
      cancelledCount: '{n} storniert',
      trendTitle: 'Reservierungen pro Tag',
      trendSub: 'ohne Stornierungen',
      colDate: 'Datum',
      colReservations: 'Reservierungen',
      colCancelled: 'Storniert',
      peakTitle: 'Beliebteste Uhrzeiten',
      peakSub: 'Reservierungen nach Beginn im gewählten Zeitraum',
      colHour: 'Uhrzeit',
      weekdayTitle: 'Stärkste Wochentage',
      colWeekday: 'Wochentag',
      statusTitle: 'Reservierungen nach Status'
    },

    errors: {
      network: 'Netzwerkfehler – bitte prüfen Sie Ihre Verbindung und versuchen Sie es erneut.',
      UNSUPPORTED_LOGO_TYPE: 'Bitte wählen Sie ein PNG-, JPEG- oder WebP-Bild.',
      LOGO_TOO_LARGE: 'Das Logo darf höchstens 2 MB groß sein.',
      UNSUPPORTED_COVER_TYPE: 'Bitte wählen Sie ein PNG-, JPEG- oder WebP-Bild.',
      COVER_TOO_LARGE: 'Das Restaurant-Foto darf höchstens 5 MB groß sein.',
      COVER_STORAGE_NOT_CONFIGURED: 'Der Foto-Speicher ist noch nicht eingerichtet (Datenbank-Update erforderlich).',
      INVALID_COVER_UPLOAD: 'Der Upload konnte nicht geprüft werden. Bitte versuchen Sie es erneut.',
      LOGO_STORAGE_NOT_CONFIGURED: 'Der Logo-Speicher ist noch nicht eingerichtet (Datenbank-Update erforderlich).',
      INVALID_PROFILE: 'Bitte prüfen Sie das markierte Profilfeld.',
      EMAIL_TAKEN: 'Für diese E-Mail-Adresse existiert bereits ein Konto.',
      INVALID_EMAIL: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
      INVALID_NAME: 'Bitte geben Sie den vollständigen Namen ein.',
      WEAK_PASSWORD: 'Das Passwort muss mindestens 8 Zeichen lang sein und einen Buchstaben sowie eine Zahl enthalten.',
      ROLE_NOT_ALLOWED: 'Nur der Inhaber kann Manager hinzufügen.',
      INVALID_ROLE: 'Bitte wählen Sie eine gültige Rolle.',
      STAFF_NOT_FOUND: 'Dieses Teammitglied existiert nicht mehr.',
      CANNOT_REVOKE_SELF: 'Sie können Ihren eigenen Zugang nicht entziehen.',
      DB_PERMISSION_DENIED: 'Der Server hat keinen Datenbankzugriff. Bitte prüfen Sie die Konfiguration des Supabase-Service-Schlüssels.',
      SETTINGS_SCHEMA_MISSING: 'In der Datenbank fehlen benötigte Spalten für Einstellungen (Migration nicht ausgeführt).',
      SETTINGS_NOT_FOUND: 'Für dieses Restaurant existiert kein Einstellungsdatensatz.',
      INVALID_SETTINGS: 'Einige Werte liegen außerhalb des erlaubten Bereichs.',
      RATE_LIMITED: 'Zu viele Anfragen. Bitte warten Sie einen Moment und versuchen Sie es erneut.'
    },

    alerts: {
      refreshed: 'Daten wurden aktualisiert.',
      loadError: 'Die Reservierungen konnten nicht geladen werden.',
      statusUpdated: 'Reservierungsstatus wurde auf „{status}“ geändert.',
      statusError: 'Der Reservierungsstatus konnte nicht aktualisiert werden.'
    }
  },

  booking: {
  title: 'Tisch reservieren',
  subtitle: 'Wählen Sie Datum und Personenzahl, um verfügbare Zeiten in Echtzeit anzuzeigen.',

  voiceAssistant: 'KI-Sprachassistent',
  voiceHint: 'Tippen Sie auf das Mikrofon und beschreiben Sie Ihre Reservierung.',
  stopListening: 'Aufnahme stoppen',
  listening: 'Ich höre zu...',
  recording: 'Aufnahme läuft...',
  noSpeech: 'Es wurde keine Sprache erkannt. Tippen Sie auf das Mikrofon und versuchen Sie es erneut.',
  microphoneError: 'Mikrofonfehler',

  date: 'Datum',
  guestCount: 'Personenzahl',
  fullName: 'Vollständiger Name',
  email: 'E-Mail-Adresse',
  phone: 'Telefonnummer',
  specialRequests: 'Besondere Wünsche',

  autoFilled: 'Automatisch ausgefüllt',
  autoSelected: 'Automatisch ausgewählt',

  selectTime: 'Uhrzeit auswählen',
  checkingAvailability: 'Verfügbarkeit wird geprüft...',
  availabilityUnavailable: 'Verfügbarkeit derzeit nicht verfügbar',
  closed: 'Geschlossen',
  restaurantClosed: 'Das Restaurant ist an diesem Tag geschlossen.',
  retryAvailability: 'Die aktuelle Verfügbarkeit konnte nicht geprüft werden. Bitte versuchen Sie es erneut.',

  available: 'frei',
  full: 'Ausgebucht',
  unavailable: 'Nicht verfügbar',
  oneOpenSlot: '1 freie Uhrzeit',
  openSlots: 'freie Uhrzeiten',

  submit: 'Reservierung anfragen',
  processing: 'Reservierung wird verarbeitet...',

  existingBooking: 'Sie haben bereits reserviert? Reservierung anzeigen oder stornieren',

  successTitle: 'Reservierungsanfrage erhalten!',
  successText: 'Ihre Reservierungsanfrage wurde erfolgreich übermittelt.',
  manageBooking: 'Reservierung anzeigen / verwalten',
  bookAnother: 'Weitere Reservierung',

  manageTitle: 'Reservierung verwalten',
  reservationId: 'Reservierungs-ID',
  reservationIdPlaceholder: 'Reservierungs-ID eingeben',
  searchReservation: 'Reservierung suchen',
  cancelReservation: 'Reservierung stornieren',

  status: 'Status',
  dateTime: 'Datum & Uhrzeit',
  guests: 'Personen',
  requests: 'Besondere Wünsche',
  none: 'Keine',
  guest: 'Gast',

  enterReservationId: 'Bitte geben Sie Ihre Reservierungs-ID ein.',
  reservationNotFound: 'Die Reservierung wurde nicht gefunden.',
  lookupFailed: 'Die Reservierung konnte nicht geladen werden.',

  cancelConfirm: 'Möchten Sie diese Reservierung wirklich stornieren?',
  cancelSuccess: 'Die Reservierung wurde erfolgreich storniert.',
  cancelFailed: 'Die Reservierung konnte nicht storniert werden.',

  selectAvailableTime: 'Bitte wählen Sie eine der verfügbaren Uhrzeiten aus.',
  requiredFields: 'Bitte füllen Sie alle Pflichtfelder aus: Datum, Uhrzeit, Personenzahl, vollständiger Name und E-Mail-Adresse.',
  slotNoLongerAvailable: 'Diese Uhrzeit ist inzwischen nicht mehr verfügbar. Bitte wählen Sie eine andere Uhrzeit.',
  createFailed: 'Die Reservierung konnte nicht erstellt werden.',

  processingVoice: 'Anfrage wird verarbeitet...',
  processingVoiceHint: 'Ihre Reservierungsangaben werden ausgewertet und die Verfügbarkeit wird geprüft...',

  restaurantClosedTitle: 'Restaurant geschlossen',
  chooseAnotherDate: 'Bitte wählen Sie ein anderes Datum.',

  timeAvailable: 'Uhrzeit verfügbar',
  timeAvailableHint: 'Die gewünschte Uhrzeit ist verfügbar. Bitte prüfen Sie Ihre Angaben.',

  requestedTimeUnavailable: 'Gewünschte Uhrzeit nicht verfügbar',
  requestedTimeUnavailableHint: 'Ihre Anfrage wurde verstanden, für diese Uhrzeit ist jedoch kein Tisch verfügbar.',

  detailsApplied: 'Angaben übernommen',
  detailsAppliedHint: 'Ihre Reservierungsangaben wurden übernommen. Bitte wählen Sie unten eine verfügbare Uhrzeit.',

  voiceFailed: 'Anfrage konnte nicht verarbeitet werden',
  voiceFailedHint: 'Die Anfrage konnte nicht automatisch verarbeitet werden. Bitte versuchen Sie es erneut oder füllen Sie die Felder manuell aus.',

  selectedAvailableTime: 'Verfügbare Uhrzeit ausgewählt',
  reviewDetails: 'Bitte prüfen Sie die übrigen Reservierungsangaben.',

  confirmed: 'Bestätigt',
  pending: 'Ausstehend',
  seated: 'Platziert',
  completed: 'Abgeschlossen',
  cancelled: 'Storniert',
  declined: 'Abgelehnt',
  noShow: 'Nicht erschienen'
}

};