/*
 * Google Analytics 4 (GA4) con Consent Mode v2 — carga DIFERIDA al consentimiento.
 *
 * Archivo PROPIO (servido como 'self') para cumplir la CSP sin 'unsafe-inline'
 * en script-src.
 *
 * PRIVACIDAD (requisito del proyecto): mientras el usuario NO acepte, NO se hace
 * NINGUNA petición a Google. A diferencia del Consent Mode "por defecto" (que
 * aun denegado envía pings sin cookies a google-analytics.com/g/collect), aquí
 * el tag de GA (gtag.js) y el `config` SOLO se cargan cuando el usuario ACEPTA
 * en el banner (window.snSetConsent(true)). Si rechaza o no decide, gtag.js
 * nunca se descarga y GA nunca recibe datos.
 *
 * El ID de medición vive aquí (público por naturaleza en GA4).
 */
(function () {
  var GA_ID = 'G-CJLL2445B3';
  var loaded = false;

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = gtag;

  // Consent Mode v2: estado por defecto = TODO DENEGADO. Se registra en
  // dataLayer pero NO dispara red por sí mismo (gtag.js aún no está cargado).
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
  });

  // Carga perezosa del tag de GA. Solo se ejecuta UNA vez, al conceder consentimiento.
  function loadGtag() {
    if (loaded) return;
    loaded = true;
    gtag('js', new Date());
    gtag('config', GA_ID, { anonymize_ip: true });
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
  }

  // API para que el banner actualice el consentimiento.
  //   window.snSetConsent(true)  -> el usuario ACEPTÓ: concede analytics y CARGA GA.
  //   window.snSetConsent(false) -> el usuario RECHAZÓ: nada que cargar, todo denegado.
  //
  // Los permisos de PUBLICIDAD se mantienen DENEGADOS SIEMPRE (este sitio solo
  // mide uso, sin remarketing ni Google Signals).
  window.snSetConsent = function (granted) {
    gtag('consent', 'update', {
      analytics_storage: granted ? 'granted' : 'denied',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    if (granted) loadGtag();
  };
})();
