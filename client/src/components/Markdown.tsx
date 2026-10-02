import ReactMarkdown, { type Components } from 'react-markdown';

const COMPONENTS: Components = {
  h1: ({ children }) => <h2 className="mt-4 text-xl font-semibold">{children}</h2>,
  h2: ({ children }) => <h3 className="mt-4 text-lg font-semibold">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 text-base font-semibold">{children}</h4>,
  h4: ({ children }) => <h5 className="mt-3 text-sm font-semibold">{children}</h5>,
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc pl-6">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal pl-6">{children}</ol>,
  li: ({ children }) => <li className="my-1">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-teal-800 underline dark:text-teal-300"
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-4 border-slate-300 pl-3 text-slate-700 dark:border-slate-600 dark:text-slate-300">
      {children}
    </blockquote>
  ),
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-md bg-slate-100 p-3 text-xs dark:bg-slate-950">
      {children}
    </pre>
  ),
  code: ({ children }) => <code className="font-mono text-sm">{children}</code>,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-slate-300 px-2 py-1 text-left dark:border-slate-700">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-slate-300 px-2 py-1 dark:border-slate-700">{children}</td>
  ),
};

/** Props of `Markdown`. */
export interface MarkdownProps {
  text: string;
}

/**
 * Markdown an agent wrote, such as a report or a reply. Raw HTML in it is not rendered and links
 * open in a new tab without the opener, as the text is data, not trusted markup.
 */
export function Markdown({ text }: MarkdownProps) {
  return (
    <div className="text-sm text-slate-800 dark:text-slate-200">
      <ReactMarkdown components={COMPONENTS}>{text}</ReactMarkdown>
    </div>
  );
}
