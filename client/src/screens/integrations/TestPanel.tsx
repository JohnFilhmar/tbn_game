import {
  IntegrationCallResultSchema,
  type Integration,
  type IntegrationCallResult,
} from '@tbn/contracts';
import { useState } from 'react';
import { Button } from '@/components/Button';
import { CodeBlock } from '@/components/CodeBlock';
import { DetailList } from '@/components/DetailList';
import { TextField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { Panel } from '@/components/Panel';
import { newCommandId } from '@/lib/api/apiClient';
import { errorMessage } from '@/lib/api/apiError';
import { useApi } from '@/providers/SessionProvider';

/** Sends the saved integration once with values the owner types, and shows what came back. */
export function TestPanel({ integration }: { integration: Integration }) {
  const api = useApi();
  const [values, setValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<IntegrationCallResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const send = (): void => {
    setIsSending(true);
    setError(null);
    api
      .send('POST', `/integrations/${integration.id}/test`, IntegrationCallResultSchema, {
        body: { values },
        commandId: newCommandId(),
      })
      .then(setResult)
      .catch((caught: unknown) => setError(errorMessage(caught)))
      .finally(() => setIsSending(false));
  };
  return (
    <Panel
      title="Test"
      description="Sends the saved request for real, through the egress proxy, with these values."
    >
      {integration.placeholders.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {integration.placeholders.map((placeholder) => (
            <TextField
              key={placeholder.name}
              label={placeholder.name}
              hint={placeholder.description}
              value={values[placeholder.name] ?? ''}
              onChange={(value) =>
                setValues((current) => ({ ...current, [placeholder.name]: value }))
              }
            />
          ))}
        </div>
      )}
      <FormError message={error} />
      <div>
        <Button isBusy={isSending} onClick={send}>
          Send a test
        </Button>
      </div>
      {result !== null && (
        <div role="status" className="flex flex-col gap-3">
          <DetailList
            items={[
              { term: 'Status', detail: result.status },
              { term: 'Time', detail: `${result.duration_ms} ms` },
            ]}
          />
          <CodeBlock label="Start of the response" text={result.excerpt} />
        </div>
      )}
    </Panel>
  );
}
