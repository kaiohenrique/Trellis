import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface Props {
  code: string;
}

function uid(): string {
  // Letter-prefixed so it's a valid CSS/HTML id, and unique enough that
  // strict-mode double mounts and parallel renders don't collide.
  return `mmd-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
}

export function MermaidBlock({ code }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const id = uid();
    mermaid
      .render(id, code)
      .then(({ svg, bindFunctions }) => {
        if (cancelled || !ref.current) return;
        ref.current.innerHTML = svg;
        if (bindFunctions) bindFunctions(ref.current);
        setErr(null);
      })
      .catch((e) => {
        if (cancelled) return;
        setErr(e instanceof Error ? e.message : String(e));
        // Mermaid leaves the throwaway element behind on failure
        document.getElementById(`d${id}`)?.remove();
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (err) {
    return (
      <pre style={{ color: 'var(--danger)' }}>
        mermaid error: {err}
        {'\n\n'}
        {code}
      </pre>
    );
  }
  return <div className="mermaid" ref={ref} />;
}
