-- An agent's attached integrations and plugins change its attachments view, so each attachment
-- row records an update of `agent_attachments` under the agent's id.
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "integration_attachments"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('agent_attachments', 'agent_id', '');
CREATE CONSTRAINT TRIGGER tbn_events AFTER INSERT OR UPDATE OR DELETE ON "plugin_attachments"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION tbn_record_event('agent_attachments', 'agent_id', '');
