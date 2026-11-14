import { afterEach, describe, expect, it, vi } from 'vitest';

let requestExpandedModeMock: ReturnType<typeof vi.fn>;

vi.mock('@devvit/web/client', () => {
  requestExpandedModeMock = vi.fn();
  return {
    context: { username: 'test-user' },
    requestExpandedMode: requestExpandedModeMock,
  };
});

vi.mock('./trpc', () => ({
  trpc: { day: { init: { query: () => Promise.reject(new Error('offline')) } } },
}));

afterEach(() => {
  requestExpandedModeMock?.mockReset();
});

describe('Splash', () => {
  it('shows today\'s decree and opens the game in expanded mode', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import('./splash');
    await new Promise((r) => setTimeout(r, 0));

    expect(document.querySelector('h1')?.textContent).toBe('All Roads Lead to Rome');
    expect(document.querySelector('.decree')?.textContent?.length).toBeGreaterThan(10);

    const play = Array.from(document.querySelectorAll('button')).find((b) => /march/i.test(b.textContent ?? ''));
    expect(play).toBeTruthy();
    play!.click();
    expect(requestExpandedModeMock).toHaveBeenCalledTimes(1);
    expect(requestExpandedModeMock.mock.calls[0]?.[1]).toBe('game');
  });
});
