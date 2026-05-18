import { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { autocompleteNodes } from '../api';
import type { AutocompleteResult } from '@kb/shared';
import { DomainBadge } from './DomainBadge';
import { useWorkspaceId } from '../context/WorkspaceContext';

interface Props {
  initialValue: string;
  onChange: (value: string) => void;
}

interface PickerState {
  open: boolean;
  q: string;
  results: AutocompleteResult[];
  active: number;
  pos: { top: number; left: number };
  triggerPos: number; // doc position of the opening [[
}

const EMPTY_PICKER: PickerState = {
  open: false,
  q: '',
  results: [],
  active: 0,
  pos: { top: 0, left: 0 },
  triggerPos: -1,
};

export function WikiEditor({ initialValue, onChange }: Props) {
  const ws = useWorkspaceId();
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [picker, setPicker] = useState<PickerState>(EMPTY_PICKER);
  const pickerRef = useRef(picker);
  pickerRef.current = picker;

  useEffect(() => {
    if (!hostRef.current) return;

    const state = EditorState.create({
      doc: initialValue,
      extensions: [
        lineNumbers(),
        history(),
        highlightActiveLine(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          {
            key: 'ArrowDown',
            run: () => {
              const p = pickerRef.current;
              if (!p.open) return false;
              setPicker((cur) => ({ ...cur, active: Math.min(cur.active + 1, cur.results.length - 1) }));
              return true;
            },
          },
          {
            key: 'ArrowUp',
            run: () => {
              const p = pickerRef.current;
              if (!p.open) return false;
              setPicker((cur) => ({ ...cur, active: Math.max(cur.active - 1, 0) }));
              return true;
            },
          },
          {
            key: 'Enter',
            run: () => {
              const p = pickerRef.current;
              if (!p.open) return false;
              const item = p.results[p.active];
              if (item) insertWikilink(item);
              return true;
            },
          },
          {
            key: 'Escape',
            run: () => {
              if (!pickerRef.current.open) return false;
              setPicker(EMPTY_PICKER);
              return true;
            },
          },
        ]),
        markdown(),
        oneDark,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString());
          }
          if (update.docChanged || update.selectionSet) {
            detectWikilinkContext(update.view);
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: hostRef.current });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect whether the cursor is inside an unclosed [[... and update the picker.
  const detectWikilinkContext = (view: EditorView) => {
    const pos = view.state.selection.main.head;
    const doc = view.state.doc.toString();
    const before = doc.slice(0, pos);
    // last [[ without a closing ]] in between
    const lastOpen = before.lastIndexOf('[[');
    if (lastOpen === -1) {
      setPicker(EMPTY_PICKER);
      return;
    }
    const between = before.slice(lastOpen + 2);
    if (between.includes(']]') || between.includes('\n')) {
      setPicker(EMPTY_PICKER);
      return;
    }
    const q = between;
    const coords = view.coordsAtPos(pos);
    if (!coords) return;
    setPicker((cur) => ({
      ...cur,
      open: true,
      q,
      triggerPos: lastOpen,
      pos: { top: coords.bottom + window.scrollY, left: coords.left + window.scrollX },
    }));
  };

  useEffect(() => {
    if (!picker.open) return;
    const timer = setTimeout(() => {
      autocompleteNodes(ws, picker.q).then((results) => {
        setPicker((cur) => (cur.open ? { ...cur, results, active: 0 } : cur));
      });
    }, 200);
    return () => clearTimeout(timer);
  }, [picker.open, picker.q, ws]);

  const insertWikilink = (item: AutocompleteResult) => {
    const view = viewRef.current;
    const p = pickerRef.current;
    if (!view || p.triggerPos < 0) return;
    const from = p.triggerPos;
    const to = view.state.selection.main.head;
    const insert = `[[${item.id}|${item.title}]]`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
    });
    setPicker(EMPTY_PICKER);
    view.focus();
  };

  const surround = (open: string, close = open) => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    const text = view.state.doc.sliceString(sel.from, sel.to);
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: `${open}${text}${close}` },
      selection: { anchor: sel.from + open.length, head: sel.from + open.length + text.length },
    });
    view.focus();
  };

  const insertAtCursor = (text: string) => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    view.dispatch({
      changes: { from: sel.from, to: sel.to, insert: text },
      selection: { anchor: sel.from + text.length },
    });
    view.focus();
  };

  const insertHeading = () => {
    const view = viewRef.current;
    if (!view) return;
    const sel = view.state.selection.main;
    const line = view.state.doc.lineAt(sel.from);
    view.dispatch({
      changes: { from: line.from, insert: '## ' },
    });
    view.focus();
  };

  return (
    <div className="editor-pane">
      <div className="toolbar">
        <button onClick={() => surround('**')} title="Bold">B</button>
        <button onClick={() => surround('_')} title="Italic"><i>I</i></button>
        <button onClick={insertHeading} title="Heading">H</button>
        <button onClick={() => surround('`')} title="Code">{'<>'}</button>
        <button onClick={() => insertAtCursor('\n```\n\n```\n')} title="Code block">{'{}'}</button>
        <button onClick={() => insertAtCursor('[label](url)')} title="Link">🔗</button>
        <button onClick={() => insertAtCursor('[[')} title="Wikilink">[[ ]]</button>
        <button onClick={() => insertAtCursor('\n```mermaid\ngraph TD\n  A --> B\n```\n')} title="Mermaid">⛕</button>
        <button onClick={() => insertAtCursor('\n---\n')} title="Horizontal rule">―</button>
      </div>
      <div ref={hostRef} />
      {picker.open && picker.results.length > 0 && (
        <div className="autocomplete" style={{ top: picker.pos.top, left: picker.pos.left }}>
          {picker.results.map((r, i) => (
            <div
              key={r.id}
              className={`item ${i === picker.active ? 'active' : ''}`}
              onMouseDown={(e) => {
                e.preventDefault();
                insertWikilink(r);
              }}
            >
              <DomainBadge domain={r.domain} />
              <span>{r.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
