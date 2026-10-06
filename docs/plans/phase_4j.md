# Phase 4j plan: sound

## Goal

The world makes small sounds where something happens: footsteps, pouring a coffee or a cup of
water, watering a plant, touching grass, sitting on a sofa or at the computer, the blinds, a light
switch or the radio's switch, drawing on the board, and sending or getting a message. Each is one
to three synthesized tones or a short burst of noise, never a file. Sounds in the world fade with
distance: a guest across the room hears another guest's blinds faintly, and louder as they walk
closer. The same holds for footsteps and for the radio's loop.

## Exit criteria

1. Walking makes footsteps, faster and a little louder when running, for your own character, the
   other players and the agents.
2. Using a prop plays its sound where the prop is, for you and for every other player in the same
   environment, quieter the farther away they stand and panned to the side it is on.
3. Agents using the coffee set, the water cooler or the grass make the same sounds where they are.
4. Sending a player message or a chat line plays a short send sound; a message pop up plays a
   chime. These are not placed in the world.
5. The radio's loop plays from the radio, louder close to it.
6. A volume slider in the world's top bar sets every sound, the radio included, remembered in that
   browser; zero is silent. Guests have it too.

## Tasks

1. `client/src/game/sound/`: one shared `AudioContext` created on the first key or click, a master
   gain at the remembered volume, the listener on your character facing the camera's way, and
   `playSound(name, at?)` that places a sound with the browser's own `PannerNode` (inverse distance
   falloff), or plays it flat without a position.
2. The sounds as small recipes of oscillators and filtered noise.
3. Footsteps in `Character`, the body every walker shares: one step per stride travelled, so no
   clip timing is needed. The character preview stays silent.
4. A `sound` per prop kind in the interactions table. Using a prop plays it and sends a cue.
5. The gateway relays a cue to the other players of the owner, at most a few a second per socket.
6. The radio moves onto the shared context with a panner at the radio.
7. Message and chat sounds in the player chat panel, the agent conversation panels and the pop ups.
8. The volume slider in the HUD.

## Contracts that change

- `packages/contracts/src/players.ts`: `SoundCueNameSchema` and `SoundCueSchema`
  (`{ sound, environment, x, z }`).
- `REALTIME_MESSAGES.cue`: both ways. A client sends a cue; the server relays it unchanged to the
  owner's other players.

## Tests

- Backend: a cue reaches the other player and not its sender, a malformed cue is dropped, and cues
  past the rate are dropped (`presence_gateway.spec.ts`).
- Client: the stride counter, the remembered volume (bad and missing values fall back), and a cue
  from another environment staying silent.

## Notes on the brief

- The pose carries the act since the fix on #22, so the others see a player sit or drink. The
  sound still travels as its own cue: an act is held for seconds, a sound happens once.
- The volume lives in the browser, not in the world preferences, because guests cannot write
  preferences and each person wants their own level.
- Browsers start sound only after a key or a click on the page, so the world is silent until then.
