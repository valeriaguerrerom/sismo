/**
 * Setup global de Vitest para el frontend.
 *
 * - Registra los matchers de @testing-library/jest-dom (toBeInTheDocument, etc).
 * - Limpia el DOM renderizado después de cada test.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
