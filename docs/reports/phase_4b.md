# Phase 4b report: game feel

## Outcome

The app is now one game rather than a dashboard with a 3D lobby. Opening it signed out puts the
owner in first person at their own desk, with the sign in form on the monitor and the office
around it. Signing in changes the monitor to the desk. Escape or the World button glides the
camera out of the monitor and back to third person or top down, with the owner standing by the
chair. E at the computer, or the Desk button from anywhere through a short fade, sits them back
down. Keys 1 to 9 and a Go button beside each agent in the HUD jump the owner to that agent. The
desk, sign in and HUD share the world's low poly look: its palette, faceted corners, chunky
shadows and a display font. A gem floats over any agent waiting on an approval, and the office
stands on ground instead of floating in the sky.

Before planning, the design went through a council of five advisors with anonymous peer review.
Its verdict shaped the plan: real DOM in a monitor frame (never a 3D texture), the route as the
only source of the view, one camera glide for every transition, and the restyle done as tokens.

## What was checked here

- **Vitest:** 73 client tests pass with four workers, including the new ones:
  - the seat pose and the teleport landing spot;
  - sign in over a world this device cannot draw, landing on the desk;
  - the Go buttons and number keys.
- **Static checks:** typecheck, ESLint and Prettier are clean, and `npm run build` succeeds.
- **The browser:** walked through by hand against the running development stack: sign in at the
  monitor, the desk in the frame, standing up, a teleport to an agent, and the Desk button
  sitting the owner back down.

## What could not be done here

- **The Playwright flows ran on CI, not here.** The e2e harness spawns `npx` without a shell,
  which Node on Windows refuses, and the development stack's database password is in your local
  env file, which this session does not read. On the pull request all 12 flows pass, as do every
  other check and both image builds. Changes to the flows:
  - the sign in helper stands up after landing at the desk;
  - the walk to the computer starts by walking away from it;
  - two new flows: a reloaded desk screen lands seated, an expired session signs in again in
    place, and the owner teleports to an agent and sits back down.
- **A few Vitest cases time out on a loaded machine.** The cases that wait about one second for
  the first render sometimes run out of time when every worker is busy. The same cases do this on
  `main` on this machine too, so this change did not cause it. With four workers the whole suite
  passes.
- **The frame rate.** As in phase 4, this session has no GPU. While seated, the canvas now
  renders only on change once the glide ends, so the desk costs no more than before.

## Demo

With the development stack up:

```
scripts/stack_up.sh
```

Then, in the browser at `/app/`:

1. Signed out, you are seated at your desk's monitor in the office you last used.
2. Sign in; the monitor shows the desk.
3. Press Escape; the camera glides out to the world.
4. Walk around and press 1; you jump to your first agent.
5. Click Desk; you are back in the chair.
6. Reload any desk screen; you land seated with no animation.
7. Press F3 in the world to read the frame counter.

## What was decided

- **The route is the only state of the view.** Reload, deep links, back and forward and an
  expired session all follow from it, with no special case.
- **The monitor frame is DOM over the 3D monitor.** The camera stops half a metre from the screen
  and the bezel covers the rest, which keeps autofill, focus and screen readers.
- **The desk renders on demand.** Before, the canvas stopped while the desk was open. Now the
  world shows around the bezel, so it renders on change.
- **The restyle is tokens.** No screen was rewritten:
  - the `slate` and `teal` scales are redefined from the world's materials;
  - `corner-shape: bevel` makes every rounded corner a facet, and browsers without it keep round
    corners;
  - buttons press down;
  - the HUD always wears the dark theme, which also fixes the Sign out button that could not be
    seen in the light theme.
- **The frame counter moved behind F3.**
- **Agents keep walking pace on slow frames.** CI renders in software at a few frames a second.
  Each actor tick was capped at 0.1 s, so the agents walked in slow motion there, and the new
  ground made it worse. Actors now tick in 0.1 s steps and catch up on up to half a second each
  frame. The ground takes no shadow and a cheaper material.
- **An existing bug, fixed in passing.** React's development double mount cleared the agents but
  kept the roster flag, so every agent walked in through the door on each page load in
  `npm run dev`. Production builds were not affected. The flag now resets with the agents.

## Waiting for you

- The council's main objection: your six asks change how you get in and out of the world, not
  what you do in it. A game is work arriving, you acting on it and the world reacting. The
  approval gems are a first step. If you want more, a next step is pressing E beside an agent to
  open a small panel with its approval, latest report and chat.
- Read the frame counter (F3) on your laptop during a sit and a stand.
