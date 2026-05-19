import { useEffect, useState } from 'react';
import mermaid from 'mermaid';
import { useInViewport } from '../hooks/useInViewport';

interface Props {
  code: string;
}

function uid(): string {
  return `mmd-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

// Lazy: mermaid.render() is heavy and serializes (singleton id generator).
// We hold off until the block is within 500px of the viewport so a 100-section
// article with mermaid diagrams paints in <1s instead of >5s.
export function MermaidBlock({ code }: Props) {
  const [setVisibilityRef, visible] = useInViewport<HTMLDivElement>({ rootMargin: '500px 0px' });
  const [svgEl, setSvgEl] = useState<HTMLDivElement | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const setRefs = (el: HTMLDivElement | null) => {
    setSvgEl(el);
    setVisibilityRef(el);
  };

  useEffect(() => {
    if (!visible || !svgEl) return;
    let cancelled = false;
    const id = uid();
    mermaid
      .render(id, code)
      .then(({ svg, bindFunctions }) => {
        if (cancelled || !svgEl) return;
        svgEl.innerHTML = svg;
        if (bindFunctions) bindFunctions(svgEl);
        setErr(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
        document.getElementById(`d${id}`)?.remove();
      });
    return () => {
      cancelled = true;
    };
  }, [code, visible, svgEl]);

  if (err) {
    return (
      <pre style={{ color: 'var(--danger)' }}>
        mermaid error: {err}
        {'\n\n'}
        {code}
      </pre>
    );
  }
  return (
    <div className="mermaid" ref={setRefs} style={{ minHeight: visible ? undefined : 120 }}>
      {!visible && <div className="mermaid-placeholder">diagram</div>}
    </div>
  );
}
