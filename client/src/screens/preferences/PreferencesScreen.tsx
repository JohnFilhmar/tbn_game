import { PageHeader } from '@/components/PageHeader';
import { Panel } from '@/components/Panel';
import { QueryStatus } from '@/components/states/QueryStatus';
import { usePreferences } from '@/lib/data/queries';
import { PREFERENCE_GROUPS } from './preferenceFields';
import { PreferenceRow } from './PreferenceRow';

/** Every preference with its type, each saved on its own. */
export function PreferencesScreen() {
  const preferences = usePreferences();
  const header = (
    <PageHeader
      title="Preferences"
      description="How the company runs. A change applies from the next turn, wake or command."
    />
  );
  if (preferences.data === undefined) {
    return (
      <>
        {header}
        <QueryStatus queries={[preferences]} label="preferences" />
      </>
    );
  }
  return (
    <>
      {header}
      {PREFERENCE_GROUPS.map((group) => (
        <Panel key={group.title} title={group.title}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {group.fields.map((field) => (
              <PreferenceRow key={field.key} field={field} preferences={preferences.data} />
            ))}
          </div>
        </Panel>
      ))}
    </>
  );
}
