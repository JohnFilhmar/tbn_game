import { act, renderHook } from '@testing-library/react';
import { OwnerMessageSchema } from '@tbn/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/api/apiError';
import { useForm } from './useForm';

/** Submits and lets the submission settle inside `act`. */
async function submit(handle: (event: { preventDefault: () => void }) => void): Promise<void> {
  await act(async () => {
    handle({ preventDefault: () => undefined });
    await Promise.resolve();
  });
}

describe('a form', () => {
  it('sends a resubmitted draft with the same command id and an edited one with a new id', async () => {
    const onSubmit = vi
      .fn<(body: { text: string }, commandId: string) => Promise<unknown>>()
      .mockRejectedValueOnce(new ApiError(0, 'The server could not be reached.'))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() =>
      useForm({
        initial: { text: 'hello' },
        schema: OwnerMessageSchema,
        toInput: (draft) => draft,
        onSubmit,
      }),
    );
    await submit(result.current.handleSubmit);
    expect(result.current.errors['']).toBe(
      'The server could not be reached. Check the connection.',
    );
    await submit(result.current.handleSubmit);
    const [first, second] = onSubmit.mock.calls;
    expect(first?.[1]).toBeDefined();
    expect(second?.[1]).toBe(first?.[1]);

    act(() => result.current.setField('text', 'hello again'));
    await submit(result.current.handleSubmit);
    expect(onSubmit.mock.calls[2]?.[1]).not.toBe(first?.[1]);
    expect(onSubmit.mock.calls[2]?.[0]).toEqual({ text: 'hello again' });
  });

  it('does not send a draft the schema rejects, and marks the field', async () => {
    const onSubmit = vi.fn<(body: { text: string }, commandId: string) => Promise<unknown>>();
    const { result } = renderHook(() =>
      useForm({
        initial: { text: '   ' },
        schema: OwnerMessageSchema,
        toInput: (draft) => ({ text: draft.text.trim() }),
        onSubmit,
      }),
    );
    await submit(result.current.handleSubmit);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(result.current.errors['text']).toBeDefined();
    expect(result.current.errors['']).toBe('Some fields need a change before this can be sent.');
  });
});
