import { cx } from '@/lib/ui/cx';

/** Props of `CodeBlock`. */
export interface CodeBlockProps {
  text: string;
  /** Read by screen readers for the block, such as `Standard output`. */
  label?: string;
  /** Colours added and removed lines of a unified diff. */
  isDiff?: boolean;
  /** Caps the height and scrolls inside; on by default. */
  isCapped?: boolean;
}

function lineClass(line: string): string {
  if (line.startsWith('+++') || line.startsWith('---')) return 'font-semibold';
  if (line.startsWith('+'))
    return 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
  if (line.startsWith('-')) return 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200';
  if (line.startsWith('@@')) return 'text-sky-800 dark:text-sky-300';
  return '';
}

/** Preformatted output, a diff or JSON, scrolled inside its own box. */
export function CodeBlock({ text, label, isDiff = false, isCapped = true }: CodeBlockProps) {
  const className = cx(
    'overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-200',
    isCapped && 'max-h-96',
  );
  if (text.length === 0) {
    return <p className="text-sm text-slate-600 italic dark:text-slate-400">Nothing here.</p>;
  }
  return (
    // A scrollable region has to be reachable by keyboard.
    <pre className={className} tabIndex={0} aria-label={label}>
      {isDiff
        ? text.split('\n').map((line, index) => (
            <span key={index} className={cx('block', lineClass(line))}>
              {line.length > 0 ? line : ' '}
            </span>
          ))
        : text}
    </pre>
  );
}

/** Any JSON value, indented. */
export function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null';
}
