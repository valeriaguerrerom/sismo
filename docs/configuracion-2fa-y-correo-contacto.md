# Configuración: verificación en dos pasos (2FA) y correo de contacto

Esta guía cubre dos cosas que ya quedaron en el código y lo que tú tienes que
configurar por fuera (en Supabase y en Railway) para que funcionen de punta a punta.

- **2FA (verificación en dos pasos)**: opcional, por usuario, con app autenticadora (TOTP).
- **Correo de contacto**: `contacto@sismonarino.com` ya está en el código. Falta
  que ese buzón reciba realmente los correos (reenvío a tu Gmail).

---

## 1. Verificación en dos pasos (2FA TOTP)

### Qué quedó hecho en el código

- **Perfil → sección "Verificación en dos pasos"**: cualquier usuario puede
  activarla. Al pulsar *Activar*, aparece un **código QR** y una **clave de
  respaldo**; el usuario lo escanea con su app (Google Authenticator, Microsoft
  Authenticator, Authy, etc.) y confirma con el código de 6 dígitos. También
  puede *Desactivarla* cuando quiera.
- **Inicio de sesión**: si la cuenta tiene 2FA activa, tras la contraseña se pide
  el código de 6 dígitos antes de entrar.
- Es **opcional**: quien no la active, entra solo con su contraseña.

### Qué tienes que configurar en Supabase

La API de MFA/TOTP de Supabase viene **habilitada por defecto**, así que lo más
probable es que no tengas que tocar nada. Para asegurarte:

1. Entra a tu proyecto en **supabase.com**.
2. Ve a **Authentication → Sign In / Providers** (o **Authentication → Settings**,
   según la versión del panel).
3. Busca la sección **Multi-Factor Authentication (MFA)** y confirma que
   **TOTP (Authenticator app)** está activado.
4. No necesitas plan de pago para TOTP; es parte del nivel gratuito.

> Nota: no hace falta ninguna migración de base de datos. Supabase guarda los
> factores MFA en su propio esquema de autenticación, no en tus tablas.

### Cómo probarlo

1. Inicia sesión con tu cuenta.
2. Ve a **Mi perfil → Verificación en dos pasos → Activar**.
3. Escanea el QR con tu app autenticadora y escribe el código de 6 dígitos.
4. Cierra sesión y vuelve a entrar: después de la contraseña debe pedirte el código.
5. Si quieres apagarla, vuelve al perfil y pulsa **Desactivar**.

> Si pierdes el teléfono: como admin puedes borrar el factor del usuario desde
> Supabase (**Authentication → Users →** usuario **→ Factors**), o el usuario
> entra con un dispositivo donde siga teniendo la app y lo desactiva desde el perfil.

---

## 2. Correo de contacto `contacto@sismonarino.com`

El correo ya aparece en la app (página *Acerca de* y en el aviso de cuenta
desactivada). Para **recibir** los mensajes que lleguen a esa dirección, usa el
**reenvío de correo (Email Forwarding) de Railway** sobre el dominio
`sismonarino.com`.

### Pasos en Railway

1. Entra a **railway.com → tu workspace → Domains → `sismonarino.com`**.
2. Abre **Email Forwarding** (reenvío de correo).
3. Crea una regla:
   - **From / Alias**: `contacto@sismonarino.com`
   - **To / Destino**: tu correo real (por ejemplo tu Gmail).
4. Guarda. Railway añade solos los registros MX necesarios en el DNS del dominio.
5. Envía un correo de prueba a `contacto@sismonarino.com` y verifica que llega a tu Gmail.

> **No actives "Enable Receiving" ni el "Under Attack Mode"** de Cloudflare: no
> hacen falta para esto y pueden interferir con la verificación del dominio.

---

## 3. Pendiente aparte: correos de la app (confirmación / recuperación)

Esto es distinto del correo de contacto. Son los correos que **envía** Supabase
(confirmar cuenta, restablecer contraseña). Para que lleguen bien hace falta un
SMTP propio con dominio verificado (Resend), que ya estabas configurando:

1. Termina de **verificar el dominio `sismonarino.com` en Resend** (los registros
   DNS DKIM/CNAME/DMARC se añaden en Railway → Domains → DNS Records).
2. Cuando el estado quede **Verified**, en Supabase ve a
   **Authentication → Emails → SMTP Settings** y pon como *Sender* un correo del
   dominio verificado, por ejemplo `no-reply@sismonarino.com`.
3. Prueba *recuperar contraseña*: el correo debe llegar (revisa también spam).

Detalle completo de ese flujo en `docs/correo-recuperacion-smtp.md`.

---

## Resumen de qué hace quién

| Tarea | Dónde | Quién |
|-------|-------|-------|
| Activar/usar 2FA | Código (ya hecho) + perfil del usuario | Usuario |
| Confirmar que MFA TOTP está on | Supabase → Authentication | Tú (admin) |
| Recibir `contacto@sismonarino.com` | Railway → Email Forwarding | Tú |
| Correos de confirmación/recuperación | Resend (verificar dominio) + Supabase SMTP | Tú |
