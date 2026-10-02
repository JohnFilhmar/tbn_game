import { useCallback, useState, type FormEvent } from 'react';
import type { z } from 'zod';
import { ApiError, errorMessage } from '@/lib/api/apiError';
import { errorsFromIssues, validate, type FieldErrors } from './validate';

const CHECK_FIELDS = 'Some fields need a change before this can be sent.';

/** What a form needs: its first values, the route's schema and what to do with a valid body. */
export interface FormOptions<Draft, Body> {
  initial: Draft;
  schema: z.ZodType<Body>;
  /** Turns the fields into the request body, before the schema checks it. */
  toInput: (draft: Draft) => unknown;
  onSubmit: (body: Body) => Promise<unknown>;
}

/** A form's state and handlers. */
export interface Form<Draft> {
  draft: Draft;
  setField: <Key extends keyof Draft>(key: Key, value: Draft[Key]) => void;
  /** Field errors by dotted path; `''` holds an error of the whole form. */
  errors: FieldErrors;
  isSubmitting: boolean;
  handleSubmit: (event: FormEvent) => void;
  reset: (next?: Draft) => void;
}

/**
 * Form state checked with a contracts schema before it is sent. A rejection from the server lands
 * on the fields it names, or on the form when it names none.
 */
export function useForm<Draft, Body>(options: FormOptions<Draft, Body>): Form<Draft> {
  const { initial, schema, toInput, onSubmit } = options;
  const [draft, setDraft] = useState(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const setField = useCallback(<Key extends keyof Draft>(key: Key, value: Draft[Key]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const handleSubmit = (event: FormEvent): void => {
    event.preventDefault();
    if (isSubmitting) return;
    const checked = validate(schema, toInput(draft));
    if (!checked.ok) {
      setErrors({ ...checked.errors, '': CHECK_FIELDS });
      return;
    }
    setErrors({});
    setIsSubmitting(true);
    onSubmit(checked.value)
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
    },
    [initial],
  );

  return { draft, setField, errors, isSubmitting, handleSubmit, reset };
}
