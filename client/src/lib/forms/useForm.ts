import { useCallback, useState } from 'react';
import type { z } from 'zod';
import { newCommandId } from '@/lib/api/apiClient';
import { ApiError, errorMessage } from '@/lib/api/apiError';
import { errorsFromIssues, validate, type FieldErrors } from './validate';

const CHECK_FIELDS = 'Some fields need a change before this can be sent.';

/** What a form needs: its first values, the route's schema and what to do with a valid body. */
export interface FormOptions<Draft, Body> {
  initial: Draft;
  schema: z.ZodType<Body>;
  /** Turns the fields into the request body, before the schema checks it. */
  toInput: (draft: Draft) => unknown;
  /** Sends the body with the submission's command id, which a resubmit of the same draft reuses. */
  onSubmit: (body: Body, commandId: string) => Promise<unknown>;
}

/** A form's state and handlers. */
export interface Form<Draft> {
  draft: Draft;
  setField: <Key extends keyof Draft>(key: Key, value: Draft[Key]) => void;
  /** Field errors by dotted path; `''` holds an error of the whole form. */
  errors: FieldErrors;
  isSubmitting: boolean;
  /** Takes the submit event, or any event that can stop the browser's own submit. */
  handleSubmit: (event: { preventDefault: () => void }) => void;
  reset: (next?: Draft) => void;
}

/**
 * Form state checked with a contracts schema before it is sent. A rejection from the server lands
 * on the fields it names, or on the form when it names none. Sending the same draft again, after a
 * dropped connection, reuses its command id, so the server runs it once; any edit starts a new one.
 */
export function useForm<Draft, Body>(options: FormOptions<Draft, Body>): Form<Draft> {
  const { initial, schema, toInput, onSubmit } = options;
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commandId, setCommandId] = useState(newCommandId);

  const setField = useCallback(<Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setCommandId(newCommandId());
  }, []);

  const handleSubmit = (event: { preventDefault: () => void }): void => {
    event.preventDefault();
    if (isSubmitting) return;
    const checked = validate(schema, toInput(draft));
    if (!checked.ok) {
      setErrors({ ...checked.errors, '': CHECK_FIELDS });
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    onSubmit(checked.value, commandId)
      .then(() => setCommandId(newCommandId()))
      .catch((caught: unknown) => {
        const fieldErrors =
          caught instanceof ApiError && caught.issues.length > 0
            ? errorsFromIssues(caught.issues)
            : {};
        setErrors({ ...fieldErrors, '': errorMessage(caught) });
      })
      .finally(() => setIsSubmitting(false));
  };

  const reset = useCallback(
    (next?: Draft) => {
      setDraft(next ?? initial);
      setErrors({});
      setCommandId(newCommandId());
    },
    [initial],
  );

  return { draft, setField, errors, isSubmitting, handleSubmit, reset };
}
