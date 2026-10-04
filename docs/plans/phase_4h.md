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

## Design

- **The world.** `agent_working` no longer starts work: it starts thinking, which keeps the agent
  in place. Only `task_started` sends it to its desk, as it already does for every task. A think
  never overrides work already started.
- **The acknowledgement** is the client's alone: no model call, so it costs nothing and comes at
  once. The world store holds the latest one for an agent; the actor plays its gesture and the
  speech bubble shows its line for a few seconds.
- **Commands** are parsed in the shared message box, so the desk chat and the world's panel both
  take them. A command never reaches the model.
- **Clips** are made by the character generator like the others, from the joints the characters
  have; with no elbow, "hand on chin" is the forearm raised across the chest with the head bowed.

## Tests

- **Backend:** `send_message` to "owner" answers the hint.
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
