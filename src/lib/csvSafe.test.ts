// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { sanitizeCell } from './csvSafe';

describe('sanitizeCell (inyección de fórmulas en hojas de cálculo)', () => {
  it('antepone apóstrofo a valores que empiezan por caracteres de fórmula', () => {
    expect(sanitizeCell('=1+1')).toBe("'=1+1");
    expect(sanitizeCell('+48')).toBe("'+48");
    expect(sanitizeCell('-5')).toBe("'-5");
    expect(sanitizeCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    expect(sanitizeCell('=HYPERLINK("http://x","clic")')).toBe('\'=HYPERLINK("http://x","clic")');
  });

  it('neutraliza caracteres de control iniciales (tab y CR)', () => {
    expect(sanitizeCell('\t=cmd')).toBe("'\t=cmd");
    expect(sanitizeCell('\r=cmd')).toBe("'\r=cmd");
  });

  it('deja intactos los valores de texto normales', () => {
    expect(sanitizeCell('Universidad Mariana')).toBe('Universidad Mariana');
    expect(sanitizeCell('Pasto')).toBe('Pasto');
    expect(sanitizeCell('')).toBe('');
    expect(sanitizeCell('a=b')).toBe('a=b'); // el disparador solo cuenta al inicio
  });

  it('no altera valores que no son texto', () => {
    expect(sanitizeCell(42)).toBe(42);
    expect(sanitizeCell(null)).toBe(null);
    expect(sanitizeCell(undefined)).toBe(undefined);
  });
});
