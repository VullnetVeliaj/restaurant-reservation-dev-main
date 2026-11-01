(function () {

  const DEFAULT_LANGUAGE =
    'de';

  const SUPPORTED_LANGUAGES =
    ['de', 'en'];


  function getStoredLanguage() {

    const stored =
      localStorage.getItem(
        'tableai_language'
      );

    if (
      stored &&
      SUPPORTED_LANGUAGES.includes(
        stored
      )
    ) {
      return stored;
    }

    return DEFAULT_LANGUAGE;
  }


  function setLanguage(language) {

    const resolvedLanguage =
      SUPPORTED_LANGUAGES.includes(
        language
      )
        ? language
        : DEFAULT_LANGUAGE;

    localStorage.setItem(
      'tableai_language',
      resolvedLanguage
    );

    document.documentElement.lang =
      resolvedLanguage;

    return resolvedLanguage;
  }


  function getTranslation(
    path,
    fallback = ''
  ) {

    const language =
      getStoredLanguage();

    const dictionary =
      window.TableAITranslations?.[
        language
      ] ||
      window.TableAITranslations?.[
        DEFAULT_LANGUAGE
      ];

    if (!dictionary) {
      return fallback || path;
    }

    const value =
      path
        .split('.')
        .reduce(
          (current, key) =>
            current?.[key],
          dictionary
        );

    return (
      value ??
      fallback ??
      path
    );
  }

  function applyTranslations() {

  document
    .querySelectorAll('[data-i18n]')
    .forEach((element) => {

      const key =
        element.getAttribute(
          'data-i18n'
        );

      const translated =
        getTranslation(
          key,
          element.textContent
        );

      element.textContent =
        translated;

    });


  document
    .querySelectorAll(
      '[data-i18n-placeholder]'
    )
    .forEach((element) => {

      const key =
        element.getAttribute(
          'data-i18n-placeholder'
        );

      const translated =
        getTranslation(
          key,
          element.placeholder
        );

      element.placeholder =
        translated;

    });


  document
    .querySelectorAll(
      '[data-i18n-title]'
    )
    .forEach((element) => {

      const key =
        element.getAttribute(
          'data-i18n-title'
        );

      const translated =
        getTranslation(
          key,
          element.title
        );

      element.title =
        translated;

    });


  document
    .querySelectorAll(
      '[data-i18n-aria-label]'
    )
    .forEach((element) => {

      const key =
        element.getAttribute(
          'data-i18n-aria-label'
        );

      const translated =
        getTranslation(
          key,
          element.getAttribute('aria-label') || ''
        );

      element.setAttribute(
        'aria-label',
        translated
      );

    });

}

  window.TableAI18n = {
    

  t:

    getTranslation,

  getLanguage:

    getStoredLanguage,

  setLanguage,

  apply:

    applyTranslations,

  supportedLanguages:

    SUPPORTED_LANGUAGES
  };


  setLanguage(
    getStoredLanguage()
  );

  document.addEventListener(
  'DOMContentLoaded',
  () => {

    applyTranslations();

  }
);

})();