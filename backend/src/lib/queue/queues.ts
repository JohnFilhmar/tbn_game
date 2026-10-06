/** Queue that wakes an agent to work through its queued tasks and pending owner messages. */
export const AGENT_WAKE_QUEUE = 'agent_wake';

/** Payload of an `agent_wake` job. */
export interface AgentWakeJob {
  owner_id: string;
  agent_id: string;
}

/** Queue of sandbox jobs for the launcher. The row in `sandbox_jobs` holds the spec. */
export const SANDBOX_JOB_QUEUE = 'sandbox_job';

/** Payload of a `sandbox_job` job. */
export interface SandboxJobJob {
  owner_id: string;
  job_id: string;
}

/** Queue of notifications the worker sends through the owner's channels. */
export const NOTIFY_QUEUE = 'notify';

/** Payload of a `notify` job. */
export interface NotifyJob {
  owner_id: string;
  notification_id: string;
}

/** Queue of guest messages the worker answers on the guest model. */
export const GUEST_REPLY_QUEUE = 'guest_reply';

/** Payload of a `guest_reply` job: the conversation of one guest with one agent. */
export interface GuestReplyJob {
  owner_id: string;
  guest_id: string;
  agent_id: string;
}
