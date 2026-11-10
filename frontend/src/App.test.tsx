import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App, { formatRemainingTime } from './App';

describe('School Admission System Frontend Automated Tests', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('formatRemainingTime calculates countdown and detects expiration accurately', () => {
    const now = new Date('2026-11-11T10:00:00Z').getTime();
    const future = '2026-11-11T10:05:30Z';
    const past = '2026-11-11T09:59:59Z';

    const activeResult = formatRemainingTime(future, now);
    expect(activeResult.expired).toBe(false);
    expect(activeResult.text).toBe('05:30');

    const expiredResult = formatRemainingTime(past, now);
    expect(expiredResult.expired).toBe(true);
    expect(expiredResult.secondsLeft).toBe(0);
  });

  it('renders classes from API and validates 17-digit Student ID before holding a seat', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/classes')) {
        return new Response(
          JSON.stringify([
            {
              id: 'c_123',
              name: 'Class 6 - Morning Shift',
              totalSeats: 120,
              heldSeats: 15,
              confirmedSeats: 80,
              availableSeats: 25
            }
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Class 6 - Morning Shift')).toBeInTheDocument();
    });

    const idInput = screen.getByLabelText(/X-Student-Id/i);
    fireEvent.change(idInput, { target: { value: '123' } });

    const applyButton = screen.getByRole('button', { name: '\u0986\u09ac\u09c7\u09a6\u09a8 \u0995\u09b0\u09c1\u09a8'.replace(/\u([0-9a-fA-F]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))) });
    fireEvent.click(applyButton);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('automatically marks an expired hold as EXPIRED and disables confirm button without reload', async () => {
    localStorage.setItem('school_admission_student_id', '20152691234567890');
    const pastIso = new Date(Date.now() - 5000).toISOString();

    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/classes')) {
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url.endsWith('/me/holds')) {
        return new Response(
          JSON.stringify([
            {
              holdId: 'h_789',
              classId: 'c_123',
              className: 'Class 6 - Morning Shift',
              status: 'HELD',
              expiresAt: pastIso
            }
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('EXPIRED').length).toBeGreaterThan(0);
    });

    const confirmLabel = '\u09ad\u09b0\u09cd\u09a4\u09bf \u09ab\u09bf \u09a6\u09bf\u09a8'.replace(/\u([0-9a-fA-F]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    const confirmButtons = screen.getAllByRole('button', { name: confirmLabel });
    confirmButtons.forEach((btn) => {
      expect(btn).toBeDisabled();
    });
  });
});
