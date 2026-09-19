// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useParameterStore, resetParameterFetchBackoff } from './parameter-store';

/**
 * A vehicle rebooting behind an ELRS backpack answers every parameter request
 * instantly with an error, and a failed fetch is exactly what the auto-fetch
 * effect watches for. Without a cooldown that is a console-flooding loop.
 */
describe('parameter fetch backoff', () => {
  const requestAllParameters = vi.fn();

  beforeEach(() => {
    resetParameterFetchBackoff();
    requestAllParameters.mockReset();
    (window as unknown as { electronAPI: unknown }).electronAPI = { requestAllParameters };
    useParameterStore.setState({ downloadState: 'idle', isLoading: false, error: null });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stops hammering after a failure', async () => {
    requestAllParameters.mockResolvedValue({ success: false, error: 'Remote endpoint not set' });
    const { fetchParameters } = useParameterStore.getState();

    await fetchParameters();
    await fetchParameters();
    await fetchParameters();

    expect(requestAllParameters).toHaveBeenCalledTimes(1);
    expect(useParameterStore.getState().downloadState).toBe('failed');
  });

  it('lets a manual retry through immediately', async () => {
    requestAllParameters.mockResolvedValue({ success: false, error: 'nope' });
    const { fetchParameters } = useParameterStore.getState();

    await fetchParameters();
    await fetchParameters({ force: true });

    expect(requestAllParameters).toHaveBeenCalledTimes(2);
  });

  it('backs off further the longer it keeps failing', async () => {
    requestAllParameters.mockResolvedValue({ success: false, error: 'nope' });
    const { fetchParameters } = useParameterStore.getState();

    await fetchParameters();               // 1st: allowed, 1 s cooldown
    vi.advanceTimersByTime(1_100);
    await fetchParameters();               // 2nd: allowed, 2 s cooldown
    vi.advanceTimersByTime(1_100);
    await fetchParameters();               // still inside the 2 s window

    expect(requestAllParameters).toHaveBeenCalledTimes(2);
  });

  it('clears the backoff once a request is accepted', async () => {
    requestAllParameters.mockResolvedValueOnce({ success: false, error: 'nope' });
    requestAllParameters.mockResolvedValue({ success: true });
    const { fetchParameters } = useParameterStore.getState();

    await fetchParameters();
    await fetchParameters({ force: true });
    await fetchParameters();

    expect(requestAllParameters).toHaveBeenCalledTimes(3);
  });
});
