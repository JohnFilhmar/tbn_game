# Phase 4h plan: conversations and commands

## Goal

The owner's asks after trying a local model:

1. **`send_message` to the owner.** A small model tried to answer the owner with `send_message`
   to "owner" and got "No live agent is named owner", a wasted turn. The tool should say it is
   for agents only, and its error should say how to answer the owner.
2. **Talking is not working.** A message from the owner sets the agent `working`, which the world
   reads as a task: the agent walks to its desk and types. A conversation should keep the agent
   where it stands, facing the owner, thinking with a hand to its chin while the reply is
   prepared, and talking with gestures while it answers.
3. **Commands.** A message that starts with `/` is a command, not a message. `/task <what to
   do>` gives the agent a task; the agent answers at once with a short line ("On it.") and a
   gesture picked at random: a thumbs up, a bow, a nod or a sigh. Only then does it walk to its
   desk. `/help` lists the commands.

Asked while it was being built:

4. **Elbows.** Arms bend at the elbow instead of swinging as one straight box.
5. **Customise an agent** the way the owner customises their own character.
6. **The speech bubble** sat under the conversation panel's blur and read as out of focus.
7. **Agents answer each other.** An agent that asked another a question never heard back: the
   answer stayed in the other agent's session, and the asker's run had already ended.
8. **Declining a task.** A local model told to keep to easy questions was given an essay. It said
   it could not do it, was nudged to call `finish_task`, wrote that call as JSON text, and the task
   ended `done` with the JSON as its report. An agent needs a way to turn a task down, and the
   task needs its own label for it.

## Exit criteria

1. `send_message`'s description says it reaches other agents only, and a recipient named like the
   owner answers "To answer the owner, reply in plain text".
2. An agent the owner messages without a task stays where it is: it plays `think` while its run
   is in flight and `talk` while it stands with the owner. A task still sends it to its desk.
3. `/task Write a haiku` in the chat, on the desk or in the world, creates a task for that agent
   with the text as its instructions and its first 80 characters as the title, sends no message,
   and shows the acknowledgement: a line in the speech bubble and the narration, and the gesture.
4. `/help` lists the commands in the chat; an unknown command says so and sends nothing.
5. The characters carry five more clips: `think`, `thumbs_up`, `bow`, `nod` and `sigh`.
6. Each arm is an upper arm and a forearm with its own joint, and every clip moves both.
7. The world's conversation panel has a Customise button that saves the agent's appearance.
8. The speech bubble draws above the panel's backdrop and stays inside the window.
9. An agent's reply to another agent's question goes back to the asker as an `answer` message and
   wakes it. An answer asks for nothing back, so two agents never answer each other in a loop.
10. A `decline_task` tool ends the task as `declined` with the reason as its result, and no
    report. The desk filters and labels declined tasks, a manager hears "Subtask declined", and
    the agent sighs in the world. A tool call that a small model writes as the whole of its text,
    naming a tool it was offered, runs as that call.

## Design

- **The world.** `agent_working` no longer starts work: it starts thinking, which keeps the agent
  in place. Only `task_started` sends it to its desk, as it already does for every task. A think
  never overrides work already started.
- **The acknowledgement** is the client's alone: no model call, so it costs nothing and comes at
  once. The world store holds the latest one for an agent; the actor plays its gesture and the
  speech bubble shows its line for a few seconds.
- **Commands** are parsed in the shared message box, so the desk chat and the world's panel both
  take them. A command never reaches the model.
- **Clips** are made by the character generator like the others. With the elbow, "hand on chin"
  is the forearm folded up to the face with the other arm across the chest.
- **Answers between agents.** A run with no task that ends owes an answer to each agent whose
  `question` reached it since its previous run, unless it already wrote to that agent with
  `send_message`. Its last text goes to each as an `answer`. The question carries a line telling
  the model to answer in plain text.
- **Declining.** `decline_task` sits beside `finish_task`; the run loop marks the task
  `declined`, a new value of `task_status`, and ends the run. The system prompt, the task
  assignment and the nudge all name it.

## Tests

- **Backend:** `send_message` to "owner" answers the hint; a question between two managers comes
  back to the asker as an answer and goes no further; the questions a run owes; a task declined
  through a call written as fenced JSON text ends `declined` with no report; a tool call in text
  is read only when it is the whole reply and names an offered tool.
- **Vitest:** commands parse; the world reads a working agent as thinking and a started task as
  work; the actor thinks in place and plays a gesture; the message box creates a task for
  `/task` and sends nothing to the agent.
- **Playwright:** `/task` in the world's conversation panel creates the task and shows the
  acknowledgement.

## Objections

- **The acknowledgement is not the agent's own words.** Asking the model for "On it" would cost a
  call and arrive late, and a small local model may not manage it. A fixed set of short lines,
  picked at random with the gesture, is instant and free; the task's own report is still the
  agent's work.
- **Reading tool calls out of text is a guess.** Only a reply that is nothing but one JSON object
  naming an offered tool is read as a call, so prose that mentions a tool stays prose. The better
  fix is a model that emits real tool calls; this keeps small local models usable meanwhile.
- **Declining does not reassign.** A declined task stays declined; the owner gives it to someone
  else with a new task. Reassigning in place would need a new command and its own rules.
