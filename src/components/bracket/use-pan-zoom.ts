import { useCallback, useEffect, useRef, useState } from "react";

export const MIN_SCALE = 0.5;
export const MAX_SCALE = 2.5;

interface View {
  x: number;
  y: number;
  k: number;
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * Pointer-events based pan/pinch/double-tap zoom.
 * The transform lives in refs and is written straight to the DOM inside rAF,
 * so gestures never trigger a React re-render.
 */
export function usePanZoom() {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const view = useRef<View>({ x: 0, y: 0, k: 1 });
  const frame = useRef<number | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const moved = useRef(false);
  const lastTap = useRef(0);
  const [zoom, setZoom] = useState(1);

  const clampPan = useCallback((next: View) => {
    const vp = viewportRef.current;
    const el = contentRef.current;
    if (!vp || !el) return next;
    const vw = vp.clientWidth;
    const vh = vp.clientHeight;
    const cw = el.offsetWidth * next.k;
    const ch = el.offsetHeight * next.k;
    const margin = 80;
    next.x = cw <= vw ? clamp(next.x, 0, vw - cw) : clamp(next.x, vw - cw - margin, margin);
    next.y = ch <= vh ? clamp(next.y, 0, vh - ch) : clamp(next.y, vh - ch - margin, margin);
    return next;
  }, []);

  const apply = useCallback(() => {
    if (frame.current != null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const el = contentRef.current;
      if (!el) return;
      const { x, y, k } = view.current;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`;
    });
  }, []);

  const commit = useCallback(
    (next: View) => {
      view.current = clampPan(next);
      apply();
      setZoom((z) => (Math.abs(z - view.current.k) > 0.001 ? view.current.k : z));
    },
    [apply, clampPan],
  );

  /** Zoom keeping the given viewport-relative point anchored. */
  const zoomAt = useCallback(
    (nextK: number, px: number, py: number) => {
      const { x, y, k } = view.current;
      const kk = clamp(nextK, MIN_SCALE, MAX_SCALE);
      const ratio = kk / k;
      commit({ k: kk, x: px - (px - x) * ratio, y: py - (py - y) * ratio });
    },
    [commit],
  );

  const zoomBy = useCallback(
    (delta: number) => {
      const vp = viewportRef.current;
      zoomAt(view.current.k + delta, (vp?.clientWidth ?? 0) / 2, (vp?.clientHeight ?? 0) / 2);
    },
    [zoomAt],
  );

  /** Scale the whole tree down until it fits the viewport (never zooms in). */
  const fit = useCallback(() => {
    const vp = viewportRef.current;
    const el = contentRef.current;
    if (!vp || !el) return commit({ x: 0, y: 0, k: 1 });
    const k = clamp(
      Math.min(vp.clientWidth / (el.offsetWidth || 1), vp.clientHeight / (el.offsetHeight || 1), 1),
      MIN_SCALE,
      MAX_SCALE,
    );
    commit({ x: 0, y: 0, k });
  }, [commit]);

  const reset = useCallback(() => fit(), [fit]);

  // Toggling will-change on every pointerdown/up forces the compositor to
  // tear down and rebuild the layer, which is what leaves stale paint tiles
  // (ghosting) on mobile. Keep the hint up for the whole gesture and only
  // release it a moment after the interaction settles.
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setBusy = useCallback((busy: boolean) => {
    const el = contentRef.current;
    if (!el) return;
    if (idleTimer.current) {
      clearTimeout(idleTimer.current);
      idleTimer.current = null;
    }
    if (busy) {
      el.style.willChange = "transform";
      return;
    }
    idleTimer.current = setTimeout(() => {
      idleTimer.current = null;
      const node = contentRef.current;
      if (!node) return;
      node.style.willChange = "auto";
      // Nudge a repaint so any leftover tiles from the gesture are discarded.
      node.style.opacity = "0.999";
      requestAnimationFrame(() => {
        if (contentRef.current) contentRef.current.style.opacity = "";
      });
    }, 260);
  }, []);

  const local = (e: React.PointerEvent) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved.current = false;
      setBusy(true);
      if (pointers.current.size === 2) {
        const [a, b] = [...pointers.current.values()];
        const rect = viewportRef.current?.getBoundingClientRect();
        pinch.current = {
          dist: Math.hypot(a.x - b.x, a.y - b.y),
          cx: (a.x + b.x) / 2 - (rect?.left ?? 0),
          cy: (a.y + b.y) / 2 - (rect?.top ?? 0),
        };
      }
    },
    [setBusy],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const prev = pointers.current.get(e.pointerId);
      if (!prev) return;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.current.size >= 2 && pinch.current) {
        const [a, b] = [...pointers.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinch.current.dist > 0) {
          moved.current = true;
          zoomAt(view.current.k * (dist / pinch.current.dist), pinch.current.cx, pinch.current.cy);
        }
        pinch.current.dist = dist;
        return;
      }

      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) moved.current = true;
      commit({ ...view.current, x: view.current.x + dx, y: view.current.y + dy });
    },
    [commit, zoomAt],
  );

  const endPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      pointers.current.delete(e.pointerId);
      if (pointers.current.size < 2) pinch.current = null;
      if (pointers.current.size === 0) {
        setBusy(false);
        if (!moved.current) {
          const now = Date.now();
          if (now - lastTap.current < 300) {
            const p = local(e);
            zoomAt(view.current.k > 1.2 ? 1 : 1.8, p.x, p.y);
            lastTap.current = 0;
          } else {
            lastTap.current = now;
          }
        }
      }
    },
    [setBusy, zoomAt],
  );

  // Wheel needs a non-passive native listener to preventDefault.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      const rect = vp.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(view.current.k * (1 - e.deltaY * 0.01), px, py);
      } else {
        commit({ ...view.current, x: view.current.x - e.deltaX, y: view.current.y - e.deltaY });
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [commit, zoomAt]);

  useEffect(
    () => () => {
      if (frame.current != null) cancelAnimationFrame(frame.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    },
    [],
  );

  return {
    viewportRef,
    contentRef,
    zoom,
    zoomBy,
    reset,
    fit,
    /** true while the last pointer sequence was a drag (suppresses click) */
    didMove: moved,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
    },
  };
}
