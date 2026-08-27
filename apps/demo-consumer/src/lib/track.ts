'use client';

/**
 * Client-callable conversion tracker. POSTs to /api/convert, which reads the
 * user's id from their (httpOnly) exp_uid cookie — sent automatically with
 * this same-origin request — so the client never needs to read or pass it.
 */
export async function track(eventName: string, value?: number): Promise<void> {
  try {
    await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName, value }),
    });
  } catch {
    // Best-effort — a failed conversion ping should never break the UI.
  }
}
