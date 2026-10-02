import {
  CreateNotificationChannelSchema,
  NotificationChannelSchema,
  NotificationEventTypeSchema,
  UpdateNotificationChannelSchema,
  type Integration,
  type NotificationChannel,
  type NotificationEventInfo,
} from '@tbn/contracts';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/Button';
import { CheckboxField } from '@/components/fields/CheckboxField';
import { SelectField } from '@/components/fields/SelectField';
import { TextAreaField } from '@/components/fields/TextField';
import { FormError } from '@/components/FormError';
import { newCommandId } from '@/lib/api/apiClient';
import { putRow } from '@/lib/data/cacheWrites';
import { COLLECTIONS } from '@/lib/data/collections';
import { humanize } from '@/lib/format/labels';
import { useForm } from '@/lib/forms/useForm';
import { useApi } from '@/providers/SessionProvider';

/** Props of `ChannelForm`. */
export interface ChannelFormProps {
  channel: NotificationChannel | undefined;
  events: readonly NotificationEventInfo[];
  integrations: readonly Integration[];
  onDone: () => void;
}

/** Sends a system event through an integration, with the event's default body or one of its own. */
export function ChannelForm({ channel, events, integrations, onDone }: ChannelFormProps) {
  const api = useApi();
  const client = useQueryClient();
  const form = useForm({
    initial: {
      event_type: channel?.event_type ?? '',
      integration_id: channel?.integration_id ?? '',
      body_template: channel?.body_template ?? '',
      enabled: channel?.enabled ?? true,
    },
    schema:
      channel === undefined ? CreateNotificationChannelSchema : UpdateNotificationChannelSchema,
    toInput: (draft) => ({
      event_type: draft.event_type,
      integration_id: draft.integration_id,
      body_template: draft.body_template.trim().length > 0 ? draft.body_template : null,
      enabled: draft.enabled,
    }),
    onSubmit: async (body) => {
      const saved =
        channel === undefined
          ? await api.send('POST', '/notification_channels', NotificationChannelSchema, {
              body,
              commandId: newCommandId(),
            })
          : await api.send(
              'PATCH',
              `/notification_channels/${channel.id}`,
              NotificationChannelSchema,
              {
                body,
                commandId: newCommandId(),
              },
            );
      putRow(client, COLLECTIONS.notificationChannels, saved);
      onDone();
    },
  });
  const { draft, setField, errors } = form;
  const event = events.find((row) => row.event_type === draft.event_type);
  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <SelectField
          label="Event"
          placeholder="Choose an event"
          value={draft.event_type}
          options={NotificationEventTypeSchema.options.map((value) => ({
            value,
            label: humanize(value),
          }))}
          onChange={(value) => setField('event_type', value)}
          hint={event?.description}
          error={errors['event_type']}
        />
        <SelectField
          label="Integration"
          placeholder={integrations.length === 0 ? 'Add an integration first' : 'Choose one'}
          value={draft.integration_id}
          options={integrations.map((integration) => ({
            value: integration.id,
            label: integration.name,
          }))}
          onChange={(value) => setField('integration_id', value)}
          error={errors['integration_id']}
        />
      </div>
      <TextAreaField
        label="Body"
        rows={5}
        isCode
        hint={
          event === undefined
            ? 'Empty uses the event’s default body.'
            : `Empty uses the default. Placeholders: ${event.placeholders.map((placeholder) => `{{${placeholder.name}}}`).join(', ')}.`
        }
        placeholder={event?.default_body}
        value={draft.body_template}
        onChange={(value) => setField('body_template', value)}
        error={errors['body_template']}
      />
      <CheckboxField
        label="Enabled"
        checked={draft.enabled}
        onChange={(value) => setField('enabled', value)}
      />
      <FormError message={errors['']} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" isBusy={form.isSubmitting}>
          {channel === undefined ? 'Add channel' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
