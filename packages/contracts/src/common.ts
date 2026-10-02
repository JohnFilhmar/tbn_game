import { z } from 'zod';

/** A row id. Every id in the system is a UUID. */
export const IdSchema = z.uuid();

/** Path parameter `:id`. */
export const IdParamSchema = z.strictObject({ id: IdSchema });

/** An instant as an ISO 8601 string. */
export const DateTimeSchema = z.iso.datetime();
