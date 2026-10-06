/*
 * Google Analytics 4 (GA4) con Consent Mode v2.
 *
 * Archivo PROPIO (servido como 'self') para cumplir la CSP sin 'unsafe-inline'
 * en script-src. El tag de GA (gtag.js) se carga desde googletagmanager.com,
 * permitido en la CSP (script-src).
 *
 * Consent Mode v2: por DEFECTO todo DENEGADO (analytics_storage, ad_storage,
 * ad_user_data, ad_personalization). GA no deja cookies ni envía datos
 * personales hasta que el usuario ACEPTE en el banner. Si acepta, la app llama
 * a window.snSetConsent(true); si rechaza, se mantiene denegado.
 *
 * El ID de medición vive aquí (público por naturaleza en GA4).
 */
(function () {
  var GA_ID = 'G-CJLL2445B3';

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  // 1) Consent Mode v2: estado por defecto = TODO DENEGADO (antes de config).
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    // Espera a la decisión del usuario antes de disparar nada que requiera cookies.
    wait_for_update: 500,
  });

  gtag('js', new Date());
  // anonymize_ip por buena práctica de privacidad.
  gtag('config', GA_ID, { anonymize_ip: true });

  // 2) Cargar el tag de GA (gtag.js) desde Google. Permitido en la CSP.
  var s = document.createElement('script');
  s.async = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);

  // 3) API para que la app actualice el consentimiento desde el banner.
  //    window.snSetConsent(true)  -> el usuario ACEPTÓ (concede SOLO analytics).
  //    window.snSetConsent(false) -> el usuario RECHAZÓ (mantiene todo denegado).
  //
  // Los permisos de PUBLICIDAD (ad_storage, ad_user_data, ad_personalization)
  // se mantienen DENEGADOS SIEMPRE, incluso al aceptar: este sitio solo mide uso
  // (analytics), no hace remarketing ni Google Signals. Por eso GA4 nunca envía
  // pings a www.google.com ni a stats.g.doubleclick.net, y la CSP no los permite.
  window.snSetConsent = function (granted) {
    gtag('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
  };
})();
