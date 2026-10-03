# Phase 4f report: the suggested objects

## Outcome

The nine objects phase 4e suggested are in the world, each a prop the owner can place in build
mode and use with E or a Within reach button:

- **Inbox tray** on the owner's desk. Paper stacks up with the approvals waiting; using it sits
  the owner at the approvals screen.
- **Cork board.** A card for each of the six latest reports; using it lists them, and Read opens
  one at the computer.
- **Server rack.** A green light blinks for each running sandbox job; using it sits the owner at
  the sandbox jobs.
- **Wall clock.** Its hands show the world's hour; using it opens the time of day.
- **Sofa and beanbag.** The owner sits back until they move; idle agents sit back for a nap.
- **Exit sign** over the door. Using it offers the other environments and travels there through
  a fade.
- **Plants that need care.** A pot plant or tree is drawn yellowed before its first watering and
  three days after its last; watering it rains drops and it greens again.
- **Trophy shelf.** A gold trophy for the first merged request, the tenth report and the
  hundredth task; using it lists the milestones.
- **Radio.** Off by default; using it plays a calm loop of soft chords and a pentatonic melody,
  made in the browser.

The office holds all nine. The home holds all but the rack; the warehouse holds the inbox, the
clock, the radio and the exit sign.

Two leftovers are fixed: standing up from a desk screen before the world has drawn now lands
beside the computer, not at the pack's spawn; and the roadmap's status table is current.

## What was checked here

- **Backend tests**, against a throwaway PostgreSQL container: the world, events and knowledge
  suites pass, 12 files and 54 tests, with a new case that keeps a plant's watering and a radio's
  switch, and refuses a watering that is not a time.
- **Vitest.** The game and lib files pass, 28 files and 105 tests, with new checks for thirst,
  the milestones, the pinned reports and their titles, the clock's hands, the radio's notes, a
  sitter on a seat and back on its spot, and the computer keeping E over a nearer prop.
- **Static checks.** Typecheck, ESLint and Prettier are clean.
- **The browser**, against this branch's web process on a throwaway database:
  - standing up straight after sign in, before the world drew, lands beside the computer, with
    E on the computer and the inbox, the grass and the light switch within reach;
  - the office from above, with every new object in place;
  - watering the corner plant: the drops, and the plant greening while the other stays yellow;
  - the clock, the cork board, the inbox tray and the trophy shelf on their walls and desk;
  - sitting back on the sofa;
  - the radio switching on and off, saved, with no errors on the page.

  The radio's sound itself was not heard here; only its switch and the absence of errors were.
- **Playwright on CI**: two new flows, checking the inbox to land on the approvals screen, and
  watering a plant and finding it watered after a reload.

## What changed from the plan

The plan records seven changes under "As built". The two that matter most:

- **The computer keeps E.** The inbox on the computer's desk is nearer the chair than the
  screen, so within the computer's reach no prop takes the prompt.
- **An exit sign, not a door**, since the shells already have their doorways.

## Waiting for you

- **A layout you saved earlier keeps its old props.** The new objects are in the pack defaults,
  so an environment you saved in build mode shows none of them until you add them from the
  catalog or press Reset. The same holds for the lamps and blinds from phase 4e.
- After merging, update the stack: `scripts/stack_up.sh`. This phase adds no migration; the new
  states live in phase 4e's table.

## Demo

At `/app/` in the browser, in the office:

1. Stand up from the desk. E still uses the computer; Check the inbox in the Within reach list
   opens the approvals.
2. Walk left past the board to the yellowed pot plant and water it.
3. Look at the north wall: the clock shows the world's hour, and the cork board holds a card per
   report.
4. Walk to the sofa by the door and sit back; switch the radio on beside the coffee.
5. Use the exit sign over the door to go to the home.
