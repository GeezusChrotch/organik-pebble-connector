# Pome for Even G2 — 0.1.5 development candidate

Pome runs in the Even phone app and shares the Organik Connector's native HomeKit
service with Pebble. This is a new client, not an Itsyhome dependency. The Connector
has separate Pebble and Even G2 tabs; existing Pebble endpoints and pairing remain.

## Build and preview

`npm ci --prefix even-g2/pome --ignore-scripts`

`npm run build --prefix even-g2/pome`

`npm run dev --prefix even-g2/pome -- --port 5188`

Open `http://localhost:5188/?demo=1` for an interactive sample home. Demo controls
never reach real devices. The phone preview is not a firmware simulator.

`npm run pack --prefix even-g2/pome` produces the .ehpk. Upload it to an Even Hub
beta group and install with the Even phone app for real lifecycle testing.

## Setup

In Connector → Even G2, connect Apple Home, start G2 connection, then Copy pairing.
Paste into Pome's Connection settings in the Even phone app. Mac and phone must
both be on the private Tailscale network. The G2 bridge listens on loopback 7858
and requests private HTTPS port 10558 using the existing collision-aware helper.
The HomeKit service remains on loopback 7855. Never use Funnel.

Home settings choose visible home sections, add favorites through type/item dropdowns,
and set room ordering. Only pinned items appear in the favorites list. Drag to reorder; focused drag handles
also support arrow keys. Voice settings currently support English home commands
and long-press assignment. Images settings choose contrast and camera visibility.
Camera capture schedules remain shared with Pebble and are configured in the
Connector's existing Pome camera setup. Hiding cameras on G2 does not stop capture.

## Dictation

The G2 microphone sends 16 kHz mono signed-16 PCM. Capture is explicitly started,
ends on tap, cancels on double tap/lifecycle exit, and is bounded to two minutes.
The default on Apple Silicon is free local Parakeet TDT v3 through FluidAudio/Core ML.
Starting the G2 connection automatically prepares local dictation. The Connector downloads models
once to its Application Support directory; subsequent transcription stays offline.
The signed helper reads a private temporary WAV that is removed after the request.
No provider account or API key is required. Intel Macs can use a custom provider.

Open Advanced and enable Use a custom provider to use a Mac-configured OpenAI-compatible
`/audio/transcriptions` endpoint. Keys stay on the Mac. Local providers use localhost;
hosted providers require HTTPS. Existing custom-provider settings are preserved.
All recognized home commands are presented for confirmation, including room-wide
commands. Failed group commands report partial completion and are not retried.

## Implemented in this candidate

- Rooms, scenes, devices, sensor state; favorites and ordering in phone settings.
- Lights (power, brightness, named colors), fan speed, blind position; room lights.
- Read-only handling for unsupported/sensitive device types; scene confirmation.
- Cached green camera images with age and explicit fresh capture/polling.
- Shared Mac speech-provider forwarding and G2 recording/command confirmation.
- Separate Mac platform tabs, private G2 pairing, runtime resource packaging.

## Acceptance boundaries

No physical G2 installation or locked-phone acceptance has been performed yet.
Phone preview and SDK build checks do not prove firmware image decoding or gestures.
Images currently reuse the existing RGB222 camera frame, then fit it into a
288×144 grayscale image; this loses detail compared with an original camera image.
Scene-to-room inference, camera history UI, automatic refresh,
are not implemented in this first candidate.
No ambient listening or plugin push notifications. Readouts use HomeKit Celsius.

The manifest uses network whitelist `*`, matching the public Even Messages source.
Official documentation conflicts with that usage. Acceptance with SDK 0.0.15 and
new submissions must be verified. No public publication has been requested.

Tests: `npm test --prefix even-g2/pome` and `node --test even-g2/tests/server.test.mjs`.

0.1.1: 16 light presets plus custom hue/saturation controls, shared by individual
lights and All lights within each room. The Colors phone tab sets the initial
custom color. Home section visibility does not remove pins or disable HomeKit.
User reported the 0.1.0 glasses app working except voice, which remains untested.
0.1.1 changes have automated and demo UI verification; physical acceptance pending.

0.1.2: touch/pointer drag handles replace HTML drag-and-drop; verified room order
persists after saving in the preview. Microphone starts after the listening page
is ready, duplicate page rebuilds are suppressed, and a negative stop acknowledgement
no longer discards captured audio. Phone preview displays microphone status.
Physical glasses microphone acceptance remains pending.

0.1.3: camera pages use non-overlapping text/image containers. Capture age is
sent to the glasses only after the SDK accepts the image. Image errors are shown
on the phone with Retry glasses display and a failure caption on glasses.
Read-only live check found nine prepared, nonuniform frames and one camera without
a prepared image. Physical confirmation of the blank-image repair is pending.

0.1.4: pairing and all preferences are saved through Even native storage under a
stable, version-independent key. Startup waits for native settings before displaying
the form or connecting. Existing browser settings migrate when still accessible;
failed native reads cannot overwrite stored settings with defaults. Browser demo
settings use an isolated key. Real beta-to-beta upgrade persistence still requires
hardware verification; storage lifecycle tests simulate a new empty WebView.

0.1.5: stable pointer capture during room/favorite dragging; rows animate without
DOM reparenting until release. Drag foreground/background colors are explicit in
both themes. Edge scrolling is supported. Demo home has 14 rooms for regression
checks. Browser verification at 390x844: downward multi-row drag; upward four-row
drag; save retains order. Raw touch injection is unavailable in the in-app browser,
so this is phone-layout pointer testing, not physical iOS touch acceptance.
