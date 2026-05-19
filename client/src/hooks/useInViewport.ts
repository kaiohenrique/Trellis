import { useEffect, useRef, useState } from 'react';

// Returns true once the element has ever been within (rootMargin) of the viewport.
// Used to lazy-render heavy article sections + mermaid blocks: render a cheap
// placeholder until the user scrolls close, then upgrade to the real content.
// Sticky: once true, stays true (we don't unmount what's already been rendered).
export function useInViewport<T extends Element>(
  options: { rootMargin?: string; threshold?: number } = {},
): [(el: T | null) => void, boolean] {
  const [visible, setVisible] = useState(false);
  const seenRef = useRef(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const setRef = (el: T | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (!el || seenRef.current) return;

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            seenRef.current = true;
            setVisible(true);
            obs.disconnect();
            observerRef.current = null;
            return;
          }
        }
      },
      {
        rootMargin: options.rootMargin ?? '500px 0px',
        threshold: options.threshold ?? 0,
      },
    );
    obs.observe(el);
    observerRef.current = obs;
  };

  useEffect(
    () => () => {
      observerRef.current?.disconnect();
    },
    [],
  );

  return [setRef, visible];
}
