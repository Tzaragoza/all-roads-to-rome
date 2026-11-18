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
  it('keeps today\'s decree sealed before you play, and opens the game in expanded mode', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await import('./splash');
    await new Promise((r) => setTimeout(r, 0));

    expect(document.querySelector('h1')?.textContent).toBe('All Roads Lead to Rome');
    // not played: the faction shows, the decree's text does not (it is revealed in the game, by the seal)
    expect(document.querySelector('.sealed')?.textContent).toMatch(/sealed until you march/);
    expect(document.querySelector('.decsmall')).toBeNull();

    const play = Array.from(document.querySelectorAll('button')).find((b) => /march/i.test(b.textContent ?? ''));
    expect(play).toBeTruthy();
    play!.click();
    expect(requestExpandedModeMock).toHaveBeenCalledTimes(1);
    expect(requestExpandedModeMock.mock.calls[0]?.[1]).toBe('game');
  });
});
