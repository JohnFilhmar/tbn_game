# Phase 4j report: sound

## Outcome

The world makes small sounds, each one to three synthesized tones or a short burst of filtered
noise, with no audio files:

| Where | Sound |
| --- | --- |
| Walking, running | a soft footfall every stride, a little louder running; you, the other players and the agents |
| Coffee set | a pour that rises as the cup fills |
| Water cooler | three glugs |
| Plant, tree | a sprinkle with a few drips |
| Grass | a rustle |
| Sofa, beanbag, the computer's chair | a thump as you sit |
| Light switch, radio | a click |
| Blinds | a rattle |
| Whiteboard | a marker's squeak |
| Sending a message or a chat line | two rising notes |
| A message for you | a two note chime |

**Distance.** A sound in the world comes from where it happened: full within a metre and a half,
a third at four metres, about a tenth across a ten metre room, and from the side it is on. When a
guest closes the blinds across the room, the others hear a faint rattle that grows as they walk
closer. Footsteps and the radio's loop fade the same way. The chat's sounds play straight to you.

**Other players.** Using a prop sends its sound to everyone in the same environment, who hear it
where the prop is. Agents make their prop sounds in each player's own world, as they already
appear there.

**Volume.** A Sound slider in the top bar sets everything, the radio included, and this browser
remembers it. Guests have it too. Browsers allow sound only after a key or a click on the page,
so the world is silent until then.

## Demo

1. Deploy this branch to the box: `scripts/vps_up.sh` from `/opt/tbn_game`.
2. Open the world in two browsers, as you and as a guest, and click once in each.
3. Walk one character toward the other: their footsteps grow louder. Close the blinds with one
   and listen from the far side of the room in the other, then from beside them.
4. Turn the radio on and walk away from it and back.
5. Move the Sound slider to zero: everything stops, the radio included.

## What was checked here

- **Backend**: a cue reaches the other player and not its sender; an unknown sound, a malformed
  one and one sent too soon after the last are dropped (`presence_gateway.spec.ts`). The events
  suites pass: 8 suites, 32 tests.
- **Vitest**: footfalls once a stride at any frame rate and never on a teleport; the remembered
  volume with bad and out of range values; your sound sent with its environment and another
  player's heard only in the environment shown. A full run passes all but load timeouts in desk
  screens this phase does not touch; those files pass when run with fewer workers.
- **Static checks**: typecheck, ESLint and Prettier on everything changed.
- **Not checked here**: how the sounds actually sound and how loud each is against the others.
  That needs your ears; every level is one number in `client/src/game/sound/recipes.ts`, and the
  falloff is in `client/src/game/sound/listener.ts`.

## Not built

- A sound per agent action beyond the props (typing at a desk, a wave).
- Separate sliders for the world and the radio.
