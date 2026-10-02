import { startFakeModel } from './fakeModel';
import { RUN_ID, startStack } from './stack';

/**
 * Starts the fake model and the backend once for every flow, and stops them after. The flows read
 * the fake model's address from `E2E_MODEL_URL` and the run's id from `E2E_RUN_ID`, which the
 * test workers inherit. `E2E_MODEL_PIECE_DELAY_MS` slows the model's stream down to watch it.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const delay = process.env['E2E_MODEL_PIECE_DELAY_MS'];
  const model = await startFakeModel(delay === undefined ? undefined : Number(delay));
  process.env['E2E_MODEL_URL'] = model.baseUrl;
  process.env['E2E_RUN_ID'] = RUN_ID;
  const stack = await startStack();
  return async () => {
    await stack.stop();
    await model.close();
  };
}
