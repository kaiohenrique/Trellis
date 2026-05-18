import { diffLines } from 'diff';
import { useMemo } from 'react';

interface Props {
  left: string;
  right: string;
  leftLabel: string;
  rightLabel: string;
}

interface DiffRow {
  left?: string;
  right?: string;
  type: 'same' | 'added' | 'removed';
}

function alignDiff(a: string, b: string): DiffRow[] {
  const parts = diffLines(a, b);
  const rows: DiffRow[] = [];
  let i = 0;
  while (i < parts.length) {
    const p = parts[i];
    if (p.removed && parts[i + 1]?.added) {
      const leftLines = p.value.replace(/\n$/, '').split('\n');
      const rightLines = parts[i + 1].value.replace(/\n$/, '').split('\n');
      const n = Math.max(leftLines.length, rightLines.length);
      for (let k = 0; k < n; k++) {
        rows.push({
          left: leftLines[k],
          right: rightLines[k],
          type: leftLines[k] === rightLines[k] ? 'same' : leftLines[k] === undefined ? 'added' : 'removed',
        });
      }
      i += 2;
    } else if (p.removed) {
      for (const line of p.value.replace(/\n$/, '').split('\n')) {
        rows.push({ left: line, type: 'removed' });
      }
      i += 1;
    } else if (p.added) {
      for (const line of p.value.replace(/\n$/, '').split('\n')) {
        rows.push({ right: line, type: 'added' });
      }
      i += 1;
    } else {
      for (const line of p.value.replace(/\n$/, '').split('\n')) {
        rows.push({ left: line, right: line, type: 'same' });
      }
      i += 1;
    }
  }
  return rows;
}

export function DiffViewer({ left, right, leftLabel, rightLabel }: Props) {
  const rows = useMemo(() => alignDiff(left, right), [left, right]);

  return (
    <div className="diff-container">
      <div className="diff-side">
        <div className="header">{leftLabel}</div>
        <div className="body">
          {rows.map((r, i) => (
            <div key={i} className={`diff-line ${r.left !== undefined && r.type === 'removed' ? 'removed' : ''}`}>
              {r.left ?? ' '}
            </div>
          ))}
        </div>
      </div>
      <div className="diff-side">
        <div className="header">{rightLabel}</div>
        <div className="body">
          {rows.map((r, i) => (
            <div key={i} className={`diff-line ${r.right !== undefined && r.type === 'added' ? 'added' : ''}`}>
              {r.right ?? ' '}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
