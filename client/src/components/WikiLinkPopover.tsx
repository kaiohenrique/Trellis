import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getNode } from '../api';
import { DomainBadge } from './DomainBadge';
import { useWorkspaceId } from '../context/WorkspaceContext';

interface Props {
  id: string;
  label: string;
}

export function WikiLinkPopover({ id, label }: Props) {
  const ws = useWorkspaceId();
  const [hovering, setHovering] = useState(false);
  const [show, setShow] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const linkRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const { data } = useQuery({
    queryKey: ['node', ws, id],
    queryFn: () => getNode(ws, id),
    enabled: show,
    staleTime: 5 * 60_000,
  });

  const onEnter = () => {
    setHovering(true);
    timer.current = window.setTimeout(() => {
      const rect = linkRef.current?.getBoundingClientRect();
      if (rect) setPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
      setShow(true);
    }, 300);
  };

  const onLeave = () => {
    setHovering(false);
    if (timer.current) clearTimeout(timer.current);
    setShow(false);
  };

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  return (
    <>
      <span ref={linkRef} onMouseEnter={onEnter} onMouseLeave={onLeave}>
        <Link to={`/workspaces/${ws}/wiki/${id}`}>{label}</Link>
      </span>
      {show && hovering && pos && data && (
        <div className="wikilink-popover" style={{ top: pos.top, left: pos.left }}>
          <h4>{data.title}</h4>
          <div style={{ marginBottom: 4 }}>
            <DomainBadge domain={data.domain} />
            {data.tags.slice(0, 3).map((t) => (
              <span key={t} className="tag-pill">{t}</span>
            ))}
          </div>
          <div className="body">{data.body.slice(0, 200)}{data.body.length > 200 ? '…' : ''}</div>
        </div>
      )}
    </>
  );
}
