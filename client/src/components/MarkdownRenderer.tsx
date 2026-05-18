import { isValidElement, type ReactElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Link } from 'react-router-dom';
import type { Components } from 'react-markdown';
import { MermaidBlock } from './MermaidBlock';
import { WikiLinkPopover } from './WikiLinkPopover';

interface Props {
  body: string;
  inline?: boolean;
}

const WIKILINK_RE = /\[\[([a-zA-Z0-9_\-]+)(?:\|([^\]]+))?\]\]/g;

function preprocessWikilinks(body: string): string {
  return body.replace(WIKILINK_RE, (_full, id: string, label?: string) => {
    const text = label ?? id;
    return `[${text}](/wiki/${id})`;
  });
}

function extractMermaidSource(node: unknown): string | null {
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<{ className?: string; children?: unknown }>;
  const className = el.props?.className;
  if (typeof className !== 'string' || !className.includes('language-mermaid')) return null;
  return String(el.props.children ?? '').replace(/\n$/, '');
}

export function MarkdownRenderer({ body, inline = false }: Props) {
  const processed = preprocessWikilinks(body);

  const components: Components = {
    a({ href, children, ...rest }) {
      const text = Array.isArray(children) ? children.join('') : String(children ?? '');
      if (href && href.startsWith('/wiki/')) {
        const id = href.slice('/wiki/'.length);
        return <WikiLinkPopover id={id} label={text} />;
      }
      if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" {...rest}>
            {children}
          </a>
        );
      }
      if (href && href.startsWith('/')) {
        return <Link to={href}>{children}</Link>;
      }
      return (
        <a href={href} {...rest}>
          {children}
        </a>
      );
    },
    // Fenced code blocks come through as <pre><code class="language-X">…</code></pre>.
    // We unwrap mermaid blocks here so the SVG isn't trapped in a <pre>.
    pre({ children, ...rest }) {
      const mermaidSrc = extractMermaidSource(children);
      if (mermaidSrc !== null) return <MermaidBlock code={mermaidSrc} />;
      return <pre {...rest}>{children}</pre>;
    },
  };

  if (inline) {
    // Strip block-level constructs visually; let ReactMarkdown still render lists/links.
    return (
      <div className="markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {processed}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: true, ignoreMissing: true }]]}
        components={components}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
