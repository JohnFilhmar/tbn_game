import { PluginToolSchema, type Plugin, type PluginTool } from '@tbn/contracts';
import { useEffect, useState } from 'react';
import { CodeBlock, jsonText } from '@/components/CodeBlock';
import { ErrorState } from '@/components/states/ErrorState';
import { LoadingState } from '@/components/states/LoadingState';
import { newCommandId } from '@/lib/api/apiClient';
import { errorMessage } from '@/lib/api/apiError';
import { useApi } from '@/providers/SessionProvider';

/** The tools a plugin offers now, asked from the server when the dialog opens. */
export function PluginTools({ plugin }: { plugin: Plugin }) {
  const api = useApi();
  const [tools, setTools] = useState<PluginTool[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let isCurrent = true;
    api
      .send('POST', `/plugins/${plugin.id}/tools`, PluginToolSchema.array(), {
        commandId: newCommandId(),
      })
      .then((listed) => {
        if (isCurrent) setTools(listed);
      })
      .catch((caught: unknown) => {
        if (isCurrent) setError(errorMessage(caught));
      });
    return () => {
      isCurrent = false;
    };
  }, [api, plugin.id, attempt]);

  if (error !== null) {
    return (
      <ErrorState
        title="The plugin did not answer"
        message={error}
        onRetry={() => {
          setError(null);
          setTools(null);
          setAttempt((count) => count + 1);
        }}
      />
    );
  }
  if (tools === null) return <LoadingState label="tools" />;
  if (tools.length === 0) return <p className="text-sm">This plugin offers no tools.</p>;
  return (
    <ul className="flex flex-col gap-3">
      {tools.map((tool) => (
        <li key={tool.name} className="flex flex-col gap-1">
          <span className="font-mono text-sm font-medium">
            plugin_{plugin.name}__{tool.name}
          </span>
          <span className="text-sm text-slate-700 dark:text-slate-300">{tool.description}</span>
          <details className="text-sm">
            <summary className="cursor-pointer text-slate-600 dark:text-slate-400">
              Input schema
            </summary>
            <CodeBlock label={`Input schema of ${tool.name}`} text={jsonText(tool.input_schema)} />
          </details>
        </li>
      ))}
    </ul>
  );
}
