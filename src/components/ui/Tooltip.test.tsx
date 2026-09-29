// @vitest-environment jsdom
/**
 * Regresión del Tooltip (PART A):
 * - Un control (botón) envuelto por un Tooltip con ícono debe seguir
 *   ejecutando su onClick al hacer clic sobre el control (no sobre el ícono).
 *   El Tooltip no debe bloquear ni interceptar ese clic.
 * - Al tocar/clicar el ícono de información, el tooltip se abre y muestra
 *   su contenido.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Tooltip } from './Tooltip';

describe('Tooltip — no bloquea el clic del control que envuelve', () => {
  it('el clic sobre el botón envuelto ejecuta su acción', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <button onClick={onClick}>
        <Tooltip content="Explicación de la capa" showIcon>
          Magnitud
        </Tooltip>
      </button>,
    );
    // Clic sobre el texto del control (no sobre el ícono).
    await user.click(screen.getByText('Magnitud'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('el clic sobre el ícono de información abre el tooltip', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(
      <button onClick={onClick}>
        <Tooltip content="Explicación de la capa" showIcon>
          Magnitud
        </Tooltip>
      </button>,
    );
    // Al inicio el contenido del tooltip no está en el DOM.
    expect(screen.queryByText('Explicación de la capa')).not.toBeInTheDocument();
    // Clic sobre el ícono de información (role=button, aria-label).
    await user.click(screen.getByRole('button', { name: 'Ver explicación' }));
    // El tooltip se abre y muestra su contenido.
    expect(await screen.findByText('Explicación de la capa')).toBeInTheDocument();
    // Y el ícono no dispara la acción del control envuelto (stopPropagation).
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sin ícono, el texto es tocable y muestra el tooltip', async () => {
    const user = userEvent.setup();
    render(<Tooltip content="Dato informativo">Amplitud máx.</Tooltip>);
    await user.click(screen.getByText('Amplitud máx.'));
    expect(await screen.findByText('Dato informativo')).toBeInTheDocument();
  });
});
