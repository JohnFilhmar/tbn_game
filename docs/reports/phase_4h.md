# Phase 4h report: conversations and commands

## Outcome

**Talking is not working.** A message without a task no longer sends the agent to its desk. It
stays where it stands, plays `think` with a hand to its chin while its run is in flight, and
`talk` while it answers. Only a started task sends it to its desk.

**Commands.** A chat message that starts with `/` is a command and never reaches the model, on
the desk and in the world:

- `/task <what to do>` creates a task for that agent. The first line, up to 80 characters, is the
  title and the whole text is the instructions. The agent answers at once with a short line in
  its speech bubble ("On it!", "Right away.", "Consider it done." or "Fine, on it.") and a
  matching gesture: a thumbs up, a bow, a nod or a sigh.
- `/help` lists the commands. An unknown command says so and sends nothing.

**The characters.** Arms bend at the elbow: each is an upper arm and a forearm. Every clip moves
both, and five clips are new: `think`, `thumbs_up`, `bow`, `nod` and `sigh`. The world's
conversation panel has a Customise button that edits the agent's look with the same dialog as the
owner's character.

**The speech bubble** draws above the panel's blur and stays inside the window.

**send_message to the owner.** The tool says it reaches agents only. A message to "owner" now
answers "to answer the owner, reply in plain text" instead of wasting the turn.

**Agents answer each other.** When an agent asks another a question, the other's plain reply goes
back to the asker as an `answer` message and wakes it, so the asker can carry on. An answer asks
for nothing back, so two agents never reply to each other in a loop. The question tells the model
to answer in plain text.

**Declining a task.** In your stress test, the local model said the essay was beyond it, was told
to call `finish_task`, wrote that call as JSON text, and the task ended Done with the JSON as its
report. Now:

- A `decline_task` tool ends the task as **Declined**, with the agent's reason as its result and
  no report. The system prompt, the task assignment and the "task is still open" nudge all name
  it, and the prompt says to decline what is outside the job description.
- The Tasks screen has a Declined filter and an amber label. A manager whose intern declines hears
  "Subtask declined" with the reason. In the world the agent sighs.
- A reply that is nothing but a JSON tool call naming one of the agent's tools now runs as that
  call, so a small model's `{"name": "decline_task", ...}` declines the task instead of becoming
  its report. Prose that mentions a tool stays prose.

## What was checked here

- **Backend tests**, against a throwaway PostgreSQL container: the run loop, team, transcript,
  `send_message`, adapters and prompt suites pass (8 suites, 33 tests). New checks:
  - a question between two managers comes back to the asker as an answer, and the answerer hears
    nothing more;
  - which questions a run still owes;
  - a task declined through a fenced JSON text reply on the OpenAI format ends `declined` with
    the reason and no report;
  - a tool call in text is read only when it is the whole reply and names an offered tool;
  - `send_message` to "owner" gives the hint.
  The sandbox and Docker suites cannot run on this Windows machine. They run in CI.
- **Vitest**: 124 tests. Commands parse, an agent in conversation thinks in place and plays a
  gesture, and `/help` then `/task` in the world's panel create the task and acknowledge it. A
  full run had three screen tests (reports, sign in) time out under load; each passes run alone,
  as before.
- **Static checks.** Typecheck, ESLint and Prettier are clean.
- **Playwright on CI**: the world's conversation flow now sends `/help` and `/task`.

Not checked here: the new arm and gesture poses in a browser. Look at them after updating the
stack, and tell me any pose that reads wrong.

## What changed from the plan

The plan grew from three asks to eight while it was built. Elbows, customising an agent, the
bubble, answers between agents and declining were added at your request. Its "Objections"
section adds two: reading tool calls out of text is a guess kept deliberately narrow, and a
declined task is not reassigned in place.

## Not built

- **Reassigning a declined task.** Give the work to another agent with a new task.
- **The autopilot CEO.** You described an AI on your own character, on a provider you pick, that
  governs the other agents. The answer relay is a step toward it, since agents now hear back from
  each other, but the autopilot itself is a phase of its own.

## Waiting for you

- After merging, update the stack and apply the migration (a `declined` task status):
  `scripts/stack_up.sh`, then
  `docker compose -f docker-compose.development.yml run --rm --no-deps web /app/node_modules/prisma/build/index.js migrate deploy`.
- Run the essay stress test again on the local model: the task should end Declined with its
  reason.
