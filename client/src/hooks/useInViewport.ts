import { useCallback, useEffect, useRef, useState } from 'react';

// Returns true once the element has ever entered (or come within rootMargin of)
// the viewport. Sticky: stays true after the first hit.
//
// Implementation note: an earlier version recreated the IntersectionObserver
// inside the ref callback on every render, which (combined with React Query
// cache updates causing re-renders) sometimes tore the observer down before
// its first asynchronous callback fired — so sections deep in an article would
// stay as placeholders forever. The fix is to store the element in state via
// a stable useCallback, then create the observer once per *element* in a
// useEffect. Once the section is marked visible, the observer is disconnected
// and we never re-attach.
export function useInViewport<T extends Element>(
  options: { rootMargin?: string; threshold?: number } = {},
): [(el: T | null) => void, boolean] {
  const [el, setEl] = useState<T | null>(null);
  const [visible, setVisible] = useState(false);
  const setRef = useCallback((node: T | null) => {
    setEl(node);
  }, []);

  // Capture options in refs so a parent passing inline `{ rootMargin: '...' }`
  // doesn't retrigger the effect every render.
  const rootMargin = options.rootMargin ?? '500px 0px';
  const threshold = options.threshold ?? 0;
  const optionsRef = useRef({ rootMargin, threshold });
  optionsRef.current = { rootMargin, threshold };

  useEffect(() => {
    if (!el || visible) return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
            return;
          }
        }
      },
      { rootMargin: optionsRef.current.rootMargin, threshold: optionsRef.current.threshold },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [el, visible]);

  return [setRef, visible];
}
