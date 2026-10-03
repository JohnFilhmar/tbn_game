# Phase 4b plan: game feel

## Goal

The app stops looking like a dashboard with a 3D lobby and starts feeling like one game. The owner
signs in at the monitor of their own desk, seen in first person; once signed in the same monitor
shows the desk. Standing up glides the camera back to the third person or top-down view. The
owner can sit at the desk from anywhere, and jump to any agent. The desk, the sign in screen and
the HUD share the world's low poly look: its colours, faceted corners and a display font.

The owner asked for this after phase 4. Its brief, in the owner's words: the sign in screen on the
desk monitor in first person; after sign in the monitor shows the desk; the desk restyled low poly
to match the world in fonts, elements and colours; leaving the desk glides the camera back to the
default view; sitting at the desk whenever the owner wants, or teleporting to it; a teleport to
agents.

The design below went through a council of five advisors with peer review before this plan was
written; its verdict is folded in, and the objections it raised are at the end.

## Exit criteria

1. Opening the app signed out shows the sign in form on the owner's desk monitor, in first person,
   in the environment the owner last used on this device. Sign in works with WebGL unavailable.
2. After sign in the monitor shows the desk, with no camera move. A session that expires while
   seated swaps the monitor back to the sign in form in place and returns to the same screen.
3. Leaving the desk (Escape, the World button) glides the camera from the monitor back to the
   owner's camera mode, with the owner standing at the chair. Sitting down (E at the computer, or
   the Desk button from anywhere, which teleports with a short fade) glides it in.
4. Reloading or deep linking a desk screen lands seated with no animation. Every transition is
   instant under reduced motion.
5. Number keys 1 to 9 and the "Go" buttons in the HUD teleport the owner beside an agent. No world
   key fires while focus is in a field or a dialog.
6. The desk, sign in and HUD use the low poly theme: world palette, bevelled corners, chunky
   offset shadows, self-hosted fonts. Every phase 3 and phase 4 flow still passes.
7. A marker floats over every agent with a pending approval.
8. The office stands on ground instead of floating in the sky.

## Design

### The route decides the view

`/` is the world; every other route, `/sign_in` and every desk screen, is the owner seated at the
monitor. Nothing else holds that state, so reload, deep links, back and forward and session expiry
all follow from the address. `WorldLayout` becomes the root route for everyone: the canvas renders
before sign in, with no agents, and `RequireSession` moves inside it around the world and the desk.

```
/            WorldLayout          the canvas, always
  sign_in    SignInScreen         seated, in the monitor frame
  (session)  RequireSession
    index                         the world, the HUD
    *        DesktopLayout        seated, in the monitor frame
```

After sign in the owner lands on the last desk screen (or the agents), not the world, so the
monitor changes from the form to the desk.

### The camera

`CameraRig` gains a seated pose: the eye half a metre in front of the screen at its height,
looking at it, so the monitor fills most of the view and the desk and room show around it. The
rig already eases the camera towards its target each frame; it now eases the look point and the
up vector too, slower for a second after the view changes, so sit and stand are one glide in
either direction. On the first frame, and always under `prefers-reduced-motion`, it snaps.

While seated the canvas renders on demand instead of every frame, after the glide has run, so the
desk costs no more than it does today. The owner's character sits in the chair with the `sit` clip
and is hidden while the camera is inside it; standing up puts it on the floor beside the chair,
facing the desk.

### The monitor frame

The desk and the sign in form render as real DOM inside a monitor bezel that fills the viewport
less a margin, with the world visible around it. A 3D texture would lose autofill, screen readers
and focus. The bezel powers on with a short scale and fade when the owner sits down, and not at
all on a reload or under reduced motion.

### Teleport

- To the desk: the Desk button fades the screen out for 180 ms, sits the owner, and fades in.
  E within reach of the computer sits without a fade.
- To an agent: keys 1 to 9 and a "Go" button on each row of the HUD's agent list. The owner lands
  1.2 m from the agent's current position, snapped to the navigation mesh, facing it. Agent
  positions are client side, so this goes where the agent is drawn, which is what the owner sees.

Every world key goes through `isTypingTarget`, so typing a 3 in chat never teleports.

### The low poly theme

One stylesheet, as the rules want, and no screen rewritten:

- The `slate` and `teal` scales are redefined in `@theme` from the world's materials: the warm
  floor and the blue grey walls for the neutrals, the plants' green for the accent. Every screen
  uses those two scales, so the whole desk takes the palette at once.
- `corner-shape: bevel` on every element turns each rounded corner into a facet, borders and
  focus rings included. Browsers without it keep round corners.
- Buttons get a hard offset shadow that presses down on click.
- Chakra Petch for headings, buttons and labels, Rubik for text, both self-hosted woff2 under the
  SIL Open Font License, since the VPN may have no internet and Inter never loaded.
- The HUD panels and the monitor bezel take the same tokens. The frame counter moves behind F3.

### Approval markers and ground

A floating faceted marker over every agent with a pending approval, read from the approvals the
desk already caches. A large ground disc under every pack, in fog, so nothing floats in the sky.

## Contracts that change

None on the server. In the client: the route table, `CameraRig` props, `World` props (the pending
approvals and the seated flag), the world store (teleport requests, the transition flag), a small
registry of agent positions written by `Agents`, and a device setting `tbn_environment`.

## Tests

- Vitest: the view derived from a route; the seated pose from a computer anchor; the teleport
  landing spot; sign in renders over the world; the agent list's Go buttons; the existing world
  layout and sign in tests updated for the new routes.
- Playwright, with reduced motion forced in the config:
  - reloading a desk screen lands seated with the desk open and no HUD;
  - signing in lands on the desk, and Escape returns to the world;
  - an expired session while seated shows the sign in form and returns to the same screen;
  - teleporting to an agent by its number key;
  - the six phase 3 flows and four phase 4 flows still pass, with the sign in helper and the walk
    to the computer adjusted for landing at the desk.

## Objections

- **The six asks polish the way in and out, not what the owner does in the world.** All five
  advisors said so; a game is a loop of work arriving, the owner acting and the world reacting.
  The brief is built as asked, with one small loop element added: the approval markers.
- **The monitor cannot hold the desk at its real size.** Dense tables in a 0.6 m screen are
  unreadable, so the camera glides in until the monitor nearly fills the view and the DOM desk
  takes over inside a bezel; the monitor is the frame, not a texture.
- **Spectating an agent was proposed and cut.** Agent positions exist only in the browser, and
  following one with its live transcript is a phase of its own.
