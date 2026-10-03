import type {
  Integration,
  IntegrationBodyFormat,
  IntegrationMethod,
  IntegrationPlaceholder,
} from '@tbn/contracts';

/** One header row, as typed. */
export interface HeaderRow {
  name: string;
  value: string;
}

/** The integration form, as typed. The token stays empty unless the owner sets a new one. */
export interface IntegrationDraft {
  name: string;
  method: IntegrationMethod;
  url: string;
  headers: HeaderRow[];
  token: string;
  body_format: IntegrationBodyFormat;
  body_template: string;
  placeholders: IntegrationPlaceholder[];
}

/** A new integration: a JSON POST with the token as a bearer header. */
export const EMPTY_INTEGRATION_DRAFT: IntegrationDraft = {
  name: '',
  method: 'POST',
  url: '',
  headers: [{ name: 'Authorization', value: 'Bearer {{token}}' }],
  token: '',
  body_format: 'json',
  body_template: '{\n  "text": "{{summary}}"\n}',
  placeholders: [{ name: 'summary', description: 'What to send', required: true }],
};

/** The form of an existing integration. */
export function integrationDraftOf(integration: Integration): IntegrationDraft {
  return {
    name: integration.name,
    method: integration.method,
    url: integration.url,
    headers: Object.entries(integration.headers).map(([name, value]) => ({ name, value })),
    token: '',
    body_format: integration.body_format,
    body_template: integration.body_template ?? '',
    placeholders: integration.placeholders,
  };
}

/** The request body of the form; an empty token is left out, which keeps the saved one. */
export function integrationInput(draft: IntegrationDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    method: draft.method,
    url: draft.url.trim(),
    headers: Object.fromEntries(
      draft.headers
        .filter((row) => row.name.trim().length > 0)
        .map((row) => [row.name.trim(), row.value]),
    ),
    body_format: draft.body_format,
    body_template:
      draft.body_format === 'none' || draft.body_template.trim().length === 0
        ? null
        : draft.body_template,
    placeholders: draft.placeholders.map((placeholder) => ({
      ...placeholder,
      name: placeholder.name.trim(),
      description: placeholder.description.trim(),
    })),
    ...(draft.token.length > 0 ? { token: draft.token } : {}),
  };
}
