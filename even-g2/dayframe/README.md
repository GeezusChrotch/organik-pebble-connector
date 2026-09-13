# DayFrame for G2

Your calendars. In sight.

## Setup

1. Download Organik Apps Connector for Mac from [GitHub Releases](https://github.com/GeezusChrotch/organik-pebble-connector/releases/latest). Use the Developer ID signed and notarized download once the release coordinator confirms the compatible release is live; the Mac App Store version is separately under review.
2. Install and run Connector on an always-on, awake Mac. The Mac must stay awake and Connector must remain running whenever you use DayFrame, including away from home.
3. Sign in to Tailscale on both the Mac and the phone paired with your Even G2 glasses, on the same private tailnet. Keep Tailscale connected on both for remote access. Do not enable public Funnel access.
4. Make the calendars you want available in Apple Calendar on that Mac. Grant Connector macOS Calendars permission. Calendar providers must already be syncing with the Mac.
5. Open Connector → Even G2 → DayFrame, enable Calendars, start the G2 connection, and choose Copy pairing. In the Even phone app, open DayFrame settings → Connection, paste those pairing details, and choose Connect. Keep the pairing credential private.
6. Choose visible calendars, custom combinations and calendar order in phone settings. Open DayFrame on the glasses and choose a calendar or combined list.

DayFrame reads calendar names, event titles, dates, times and locations. It never edits events. List countdowns are optional; event details always include a visual countdown. They do not create alarms or notifications. No microphone or AI provider is required.

## Current interface

Calendars open first. Agenda pages can include multiple days: every date heading is centered, with thin separators only between days. Event rows begin with time and a middle dot; events share a left edge within a centered column. The entire screen has a thin outline. Scroll selects events, tap opens details, and double tap returns. Native menu date jumps support week, month and year. Calendar names appear in combined lists when enabled; a single-calendar view omits redundant calendar names.

## Development

`npm ci --ignore-scripts` then `npm test`, `npm run build`, `npm run pack`.
`npm run dev -- --port 5190` and `http://127.0.0.1:5190/?demo=1` opens the synthetic
interactive preview. Preview is not a firmware simulator.

Phone tabs: Calendars (visibility), Custom (combined list), Order (drag handles),
Display (countdown placement, clock and jump preference). Glasses scroll moves
selection, tap opens, double tap returns; calendar-list root double tap uses system exit
confirmation. Native system menu provides direct week/month/year jumps, Today,
Calendars, Settings and Refresh.

See ../../docs/DAYFRAME-DESIGN.md for data flow, feature scope and release gates.

## Verified candidate

0.1.0: 9 DayFrame tests and 11 shared route tests passed; native compile and
Connector checks passed. Connector build 84 installed canonically. Live loopback
and private HTTPS reads passed, unauthenticated reads returned 401, and installed
assets matched source hashes. Pome/Beepster remained healthy. Synthetic browser
checks covered visibility, custom list, drag persistence, countdown, year jump
and 390px phone layout. See ../DAYFRAME-CANDIDATE-0.1.0.json.

Published to Even Hub Beta as v0.1.0; developer tester invited. Not yet installed
on glasses or publicly submitted. Physical
input, locked-phone operation and native-storage upgrade acceptance remain pending.

0.1.2 Beta: Calendars and Custom settings preview two upcoming events per calendar
from a single 30-day read. Includes unchecked calendars, dates/times, refresh, and
empty/unavailable states. 13 tests and phone-width preview passed; physical acceptance pending.

0.1.3 Beta: Fix startup payload exceeding the firmware maximum of eight text
containers. Create loading page before native settings reads. Fourteen tests pass;
physical launch acceptance pending. The footer is phone-preview-only; event detail
page numbers now appear in the glasses heading.

0.1.4 Beta: Calendars are the root screen. Events scroll continuously across dates,
loading adjacent 30-day windows at the edges. No Previous/Next navigation rows.
Back returns details → events → calendars; only calendar-root Back exits.

### 0.1.5
Event details always show a countdown from the event start, including all-day and past events. The phone and glasses setting only toggles the extra list countdown. Legacy list preferences are preserved.

### 0.1.6
One day per screen: date heading, all-day events followed by timed events, no repeated dates. Scroll past the last/first event to the next/previous calendar day; empty days are explicit. Calendar names appear in combined lists when enabled and are omitted in single-calendar lists.

### 0.1.7
Compact time-first rows (All Day · Event / 2:30pm · Event), full-width grayscale separators and a bitmap calendar icon before DayFrame in the root menu. Titles and native text retain firmware font size; the SDK has no native font-size control, so no font-size preference is exposed. Image repaint follows text updates and overlay restoration.

### 0.1.8
Thin full-screen outline. Lists and menus are centered as a block with a shared left edge, measured using the firmware font metrics. Cursor changes keep the column stable. Titles and the calendar icon are centered together. Separators are inset clear of the frame.

### 0.1.9–0.1.10
Multi-day agenda pages restored, with separators only between date groups. Version 0.1.10 centers every date heading independently of the event column. 24 tests, TypeScript and a fresh production build pass. The retained package matches the recorded published Beta hash. See release/AUDIT.json, release/PUBLICATION.md and release/gallery.html. Latest physical-glasses acceptance remains pending. Public publication is held for coordinator confirmation of the compatible GitHub Connector download.
