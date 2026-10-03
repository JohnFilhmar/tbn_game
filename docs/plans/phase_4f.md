# Phase 4f plan: the suggested objects

## Goal

Every object phase 4e suggested, so the office ties to the work it shows. Each is a prop from
phase 4d that the owner can place, and each is used with E or a HUD button through phase 4e's
interaction table:

1. **Inbox tray** on the owner's desk. Its paper stack grows with the approvals waiting; E opens
   the approvals screen at the computer.
2. **Cork board.** A pinned card for each of the six latest reports; E lists them, and picking
   one opens that report at the computer.
3. **Server rack.** A blinking light for each running sandbox job; E opens the sandbox jobs.
4. **Wall clock.** Shows the world's hour; E opens the time of day choice.
5. **Sofa and beanbag.** The owner or an idle agent sits back on them.
6. **Exit sign** over a door. E offers the other environments and travels there through a fade.
7. **Plants that need care.** A plant or tree droops three days after its last watering, and from
   the start until it is first watered; E waters it with a burst of drops.
8. **Trophy shelf.** A trophy for each milestone reached: the first merged request, the tenth
   report and the hundredth task. E lists them.
9. **Radio.** Plays a calm loop, off by default; E switches it.

Two leftovers from phase 4e:

- **Standing up early.** A reload on a desk screen, then standing up before the world has drawn,
  leaves the owner at the pack's spawn instead of beside the computer.
- **The roadmap's status table** still shows phase 4d in progress and 4e planned.

## Exit criteria

1. Each of the nine objects is in the build catalog, in at least the office's default layout,
   and usable from E and from the Within reach list.
2. The inbox, the cork board, the server rack and the trophy shelf follow the live data: a new
   approval, report, running job or milestone shows without a reload.
3. A watered plant stands up again, and the watering is kept across reloads and devices; so is
   the radio's switch.
4. Idle agents sit back on the sofa and the beanbag.
5. Standing up from a desk screen always lands beside the computer.

## As built

Seven things changed while building; the design below is the plan as it was written.

- **An exit sign, not a door.** The shells already have their doorways, so the prop is a lit
  sign hung over one, which the owner can move in build mode like any wall prop.
- **Watering has no can in hand.** The owner plays `touch` and a burst of drops falls on the
  plant. A held can would need a second hand item beside the cup.
- **Agents nap like they take any break.** The sofa and the beanbag are `rest` spots the wander
  scheduler picks among the rest, for twelve seconds, rather than a nap reserved for an agent
  idle a long while.
- **The cork board opens a panel.** E lists the pinned reports and each opens at the computer,
  rather than E on one card in the canvas, which would need a pointer aimed at a card.
- **Not every object in every pack.** The office has all nine; the home has all but the rack;
  the warehouse has the inbox, the clock, the radio and the exit sign. Every kind is in the
  build catalog for every pack.
- **The computer keeps E.** The inbox on the computer's own desk is nearer the chair than the
  screen, so within the computer's reach no prop takes the prompt; the props stay in the Within
  reach list.
- **The clock hangs at 2.35 metres**, under the home's 2.8 metre walls, so in the office it sits
  between two windows instead of above the board.

## Design

- **Props.** Eight new kinds: `inbox_tray`, `cork_board`, `server_rack`, `wall_clock`, `beanbag`,
  `exit_sign`, `trophy_shelf`, `radio`. The sofa, the plant and the tree gain interactions. The
  fixed parts are built from code in `props/gadgets.ts`; the parts that follow the data (papers,
  cards, lights, hands, trophies) are drawn per placement in `objects/LiveProps.tsx` from a
  snapshot of the collections the client already keeps live.
- **State.** Two more kinds in `world_prop_states`, with no migration: a plant or tree
  `{ watered_at }` and a radio `{ on }`.
- **Sitting.** A spot can carry a seat. The sitter walks to the spot, plays `sit` on the seat,
  and steps back to the spot when it ends, since the seat is inside the furniture's footprint.
- **The radio** plays a loop generated with the Web Audio API: soft chords and a few notes of a
  pentatonic scale. Nothing is downloaded, so there is no licence to track. It starts on the
  owner's press, as browsers ask.
- **Standing up early.** The world store remembers that the owner sat at the computer; the
  owner's character, when it first appears, starts beside the chair if so.

## Tests

- **Contracts:** the plant and radio states.
- **Backend:** the route saves both, and refuses a plant state without a valid time.
- **Vitest:** thirst after three days and before the first watering; the milestones reached; the
  six latest reports and a card's title; the clock's hands; a sitter on a seat and back on its
  spot; an idle agent sitting back; the radio's notes for a bar.
- **Playwright:** standing up beside the computer, check the inbox and land on the approvals
  screen; walk to a plant, water it, reload, and find it watered.

## Objections

- **A plant nobody watered droops from the start.** The server has no time a pack default plant
  appeared, so "three days without water" has no start until the first watering. Drooping from
  the start makes the first visit ask for care; the alternative is plants that never droop until
  watered once.
- **Agents do not water the plants or switch the radio.** Agents move in each open tab alone, so
  a state an agent changed would be saved once per tab. They sit back and look at the plants.
