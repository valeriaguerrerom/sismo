import { test, expect, IS_PROD } from './support/fixtures';

/**
 * COMENTARIOS (feedback). Enviar un comentario desde la página "Acerca de" y
 * verificar que se acepta y NO devuelve 429 (rate limit).
 *
 * Nota sobre datos basura: los mensajes de feedback solo los ve un admin
 * (tabla feedback_messages con RLS). La cuenta de prueba es un investigador, no
 * puede borrarlos por la UI. Por eso:
 *   - En LOCAL se ejecuta siempre (base de datos de prueba/efímera).
 *   - En PROD solo se ejecuta si E2E_RUN_FEEDBACK=1, y el mensaje se marca con
 *     un prefijo [E2E] + marca de tiempo para que un admin lo purgue fácil.
 */

const SHOULD_RUN = !IS_PROD || process.env.E2E_RUN_FEEDBACK === '1';

test.describe('Comentarios — envío sin 429', () => {
  test.skip(!SHOULD_RUN, 'En prod, exporta E2E_RUN_FEEDBACK=1 para enviar un comentario real (lo verá un admin).');

  test('enviar un comentario se acepta y no da 429', async ({ app, page }) => {
    // Capturamos la respuesta de /api/feedback para comprobar el status.
    const feedbackResponses: number[] = [];
    page.on('response', (res) => {
      if (/\/api\/feedback(\?|$)/.test(new URL(res.url()).pathname)) {
        feedbackResponses.push(res.status());
      }
    });

    await app.open();
    // La sección de feedback vive en "Acerca de".
    await page.getByRole('button', { name: 'Acerca de' }).first().click();
    await expect(page.getByRole('heading', { name: 'Nariño tiembla. Queríamos entender cómo.' })).toBeVisible();

    // Mensaje identificable como prueba automática.
    const stamp = new Date().toISOString();
    const message = `[E2E] Comentario de prueba automática — ${stamp}. Ignorar/eliminar.`;

    // Rellenar el formulario de feedback.
    const textarea = page.getByPlaceholder('Escribe aquí tu mensaje…');
    await textarea.scrollIntoViewIfNeeded();
    await textarea.fill(message);

    // Email de la cuenta de prueba (opcional salvo que requireEmail); al
    // escribirlo aparece el checkbox de consentimiento, que marcamos.
    const emailInput = page.getByPlaceholder('tucorreo@ejemplo.com');
    if (await emailInput.isVisible().catch(() => false)) {
      await emailInput.fill(process.env.E2E_USER_EMAIL || 'prueba1@ejemplo.com');
      // Marcar el consentimiento si aparece.
      const consent = page.getByRole('checkbox');
      if (await consent.first().isVisible().catch(() => false)) {
        await consent.first().check().catch(() => undefined);
      }
    }

    await page.getByRole('button', { name: 'Enviar mensaje' }).click();

    // Éxito visible.
    await expect(page.getByText('Gracias, recibimos tu mensaje.')).toBeVisible({ timeout: 20_000 });

    // El backend respondió y NUNCA con 429.
    expect(feedbackResponses.length, 'no se registró respuesta de /api/feedback').toBeGreaterThan(0);
    expect(feedbackResponses, `respuestas de feedback: ${feedbackResponses.join(', ')}`).not.toContain(429);
  });
});
