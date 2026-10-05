# Correo de recuperación de contraseña: configurar SMTP en Supabase

## Por qué no llega el correo

El envío del correo de "recuperar contraseña" lo hace **Supabase**, no la
aplicación. El código de SismoNariño está correcto: llama a
`supabase.auth.resetPasswordForEmail(...)` (`src/lib/auth.tsx`,
`sendPasswordReset`). Si el correo no llega, la causa está en la configuración
del proyecto de Supabase, no en el repositorio.

La causa más común es el **servidor de correo de cortesía de Supabase**, que
tiene un límite muy bajo (unos 2 a 4 correos por hora en todo el proyecto) y a
veces solo entrega a correos del equipo. No muestra error: simplemente no llega.

La solución es conectar un **SMTP propio** (gratis con Resend o Brevo). Con eso
el envío es fiable, lo cual es importante para la sustentación.

## Opción recomendada: Resend (gratis)

### 1. Crear cuenta y API key
1. Entra a https://resend.com y crea una cuenta.
2. Ve a **API Keys** y crea una. Cópiala (empieza por `re_...`); solo se ve una vez.

### 2. Datos SMTP de Resend
- Host: `smtp.resend.com`
- Puerto: `587`
- Usuario: `resend`
- Contraseña: la API key (`re_...`)
- Remitente (sender): `onboarding@resend.dev` para empezar sin verificar dominio,
  o `no-reply@sismonarino.com` si verificas el dominio en Resend (Domains).

> Nota: con `onboarding@resend.dev` el envío funciona de inmediato pero el correo
> sale desde un dominio de Resend. Para que salga desde `@sismonarino.com` hay
> que verificar el dominio en Resend (añadir unos registros DNS). Para la
> sustentación, `onboarding@resend.dev` es suficiente.

### 3. Pegar en Supabase
Supabase → **Authentication → Emails → SMTP Settings** → activa
**Enable Custom SMTP** y completa:
- Sender email: el remitente de arriba.
- Sender name: `SismoNariño`.
- Host: `smtp.resend.com`
- Port: `587`
- Username: `resend`
- Password: la API key de Resend.
Guarda los cambios.

### 4. Subir el límite de correos
Supabase → **Authentication → Rate Limits** → "Emails sent": súbelo a unos
`30` por hora (el valor por defecto es muy bajo).

### 5. Confirmar las URLs de redirección (ya están)
Supabase → **Authentication → URL Configuration**. Deben estar (ya lo están en
este proyecto): `http://localhost:5173/**`, `https://sismonarino.com/**` y el de
Railway. El enlace del correo vuelve a la app con `?recovery=1`, que dispara la
pantalla "Nueva contraseña".

## Probar
1. En la app, "Iniciar sesión" → "¿Olvidaste tu contraseña?" → escribe tu correo.
2. Debe aparecer el mensaje: "Si el correo está registrado, te enviamos un
   enlace…". Ese mensaje confirma que la app hizo su parte.
3. Revisa la bandeja (y spam). Con SMTP propio debe llegar en segundos.
4. Abre el enlace: vuelve a la app en la pantalla "Nueva contraseña".

## Alternativas sin SMTP (atajos mientras tanto)
- **Cambiar la contraseña con sesión abierta**: Perfil → cambiar contraseña. Pide
  la contraseña actual y NO usa correo. Sirve para demostrar el cambio.
- **Enviar el enlace a mano desde Supabase**: Authentication → Users → el usuario
  → "Send recovery". (Usa el mismo SMTP, así que requiere tenerlo configurado.)

## Diagnóstico si sigue sin llegar
- Mira **Authentication → Logs** (Auth logs): busca el intento y si dice
  "email rate limit exceeded" o un error de envío.
- Revisa spam/promociones.
- Confirma que el remitente del SMTP esté permitido por el proveedor (en Resend,
  que el dominio esté verificado si usas `@sismonarino.com`).
