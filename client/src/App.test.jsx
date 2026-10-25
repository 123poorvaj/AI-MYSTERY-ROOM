import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App.jsx';

afterEach(cleanup);

describe('mystery room navigation and creation', () => {
  it('shows the product introduction and routes to case creation', () => {
    render(<MemoryRouter><App /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: /somewhere/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('link', { name: /create your mystery/i }));
    expect(screen.getByRole('heading', { name: /every case starts/i })).toBeTruthy();
    expect(screen.getByLabelText(/the premise/i)).toBeTruthy();
  });

  it('keeps case generation disabled until the premise reaches 20 characters', () => {
    render(<MemoryRouter initialEntries={['/create']}><App /></MemoryRouter>);
    const premise = screen.getByLabelText(/the premise/i);
    const submit = screen.getByRole('button', { name: /build the case/i });
    expect(submit.disabled).toBe(true);
    fireEvent.change(premise, { target: { value: 'A painting disappears during a storm.' } });
    expect(submit.disabled).toBe(false);
  });
});
