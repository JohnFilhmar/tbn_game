import { Outlet } from 'react-router';
import { PageHeader } from '@/components/PageHeader';
import { TabLinks } from '@/components/Tabs';

/** The integrations screen: the request templates, the channels that send notices, and the log. */
export function IntegrationsLayout() {
  return (
    <>
      <PageHeader
        title="Integrations"
        description="HTTP requests agents can make with your tokens, and the notices the system sends you through them."
      />
      <TabLinks
        label="Integration sections"
        tabs={[
          { to: '/integrations', label: 'Integrations', end: true },
          { to: '/integrations/channels', label: 'Notification channels' },
          { to: '/integrations/log', label: 'Notification log' },
        ]}
      />
      <Outlet />
    </>
  );
}
