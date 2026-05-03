/**
 * useWakeLock — Screen Wake Lock API wrapper.
 *
 * Keeps the screen on while recording so that:
 *   • The OS never locks the screen mid-session (prevents audio loss on mobile)
 *   • The user doesn't have to touch the screen every few minutes
 *
 * Behaviour:
 *   - acquire()  : request a 'screen' wake lock; no-op when unsupported
 *   - release()  : release the lock when recording stops
 *   - On visibility change to 'visible' while still "should be locked":
 *       automatically re-acquires (OS releases the lock whenever page hides)
 *
 * Return values
 *   isActive      : lock is currently held
 *   isUnsupported : browser has no Wake Lock API (show fallback tip)
 *   acquire / release
 */

import { useState, useRef, useCallback, useEffect } from 'react';

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  addEventListener: (type: string, cb: () => void) => void;
};

export type WakeLockStatus = 'off' | 'active' | 'released' | 'unsupported';

export function useWakeLock() {
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [status, setStatus] = useState<WakeLockStatus>(supported ? 'off' : 'unsupported');
  const sentinelRef  = useRef<WakeLockSentinelLike | null>(null);
  const shouldLock   = useRef(false);  // tracks "user wants lock on" across visibility cycles

  const acquire = useCallback(async () => {
    if (!supported) return;
    shouldLock.current = true;
    try {
      const lock = await (navigator as any).wakeLock.request('screen') as WakeLockSentinelLike;
      sentinelRef.current = lock;
      setStatus('active');

      // OS releases the lock when the page becomes invisible; record that so we can re-acquire
      lock.addEventListener('release', () => {
        sentinelRef.current = null;
        setStatus('released');
      });
    } catch {
      // Permission denied or document not focused — not fatal
      setStatus('off');
    }
  }, [supported]);

  const release = useCallback(async () => {
    shouldLock.current = false;
    if (sentinelRef.current) {
      try { await sentinelRef.current.release(); } catch {}
      sentinelRef.current = null;
    }
    setStatus('off');
  }, []);

  // Re-acquire when the user returns to the page (e.g. after a quick tab switch)
  useEffect(() => {
    const onVisibilityChange = async () => {
      if (document.visibilityState === 'visible' && shouldLock.current && status !== 'active') {
        await acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [acquire, status]);

  return {
    status,
    isActive:      status === 'active',
    isUnsupported: status === 'unsupported',
    acquire,
    release,
  };
}

/**
 * keepAliveAudio — plays a near-silent audio loop in an AudioContext.
 *
 * iOS Safari pauses audio capture when the page is backgrounded unless there
 * is an active AudioContext with at least one node outputting to the destination.
 * Calling start() triggers that state; call stop() to tear it down.
 *
 * This is a best-effort workaround — iOS may still pause capture when the
 * screen locks, but it meaningfully helps for app-switching scenarios.
 */
export function keepAliveAudio() {
  let ctx: AudioContext | null = null;
  let source: AudioBufferSourceNode | null = null;

  const start = () => {
    try {
      ctx = new AudioContext();
      const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate); // 1 s silence
      source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      // Gain of 0.001 — technically audible on some hardware at max volume,
      // but inaudible in practice. Setting exactly 0 allows browsers to
      // optimise away the node and defeat the purpose.
      const gain = ctx.createGain();
      gain.gain.value = 0.001;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.start();
    } catch {
      // AudioContext blocked before user gesture — ignore
    }
  };

  const stop = () => {
    try { source?.stop(); } catch {}
    try { ctx?.close(); } catch {}
    source = null;
    ctx = null;
  };

  return { start, stop };
}
