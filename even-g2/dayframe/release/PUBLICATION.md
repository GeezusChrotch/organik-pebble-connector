# DayFrame 0.1.10 — publication draft

Status: already published to the existing personal Even Hub Beta. No public submission authorized until the coordinator confirms the compatible Developer ID signed/notarized Connector download is live. This preparation does not certify physical acceptance or store review readiness.

## Store description

Your calendars. In sight.

DayFrame brings your Mac calendars to Even G2. Choose a calendar or combine selected calendars into one agenda. Browse events by time across multiple days, with centered date headings and thin separators between days. Open an event for its time, calendar, location and visual countdown.

Choose visible calendars, arrange their order and build a custom combined list. Add countdowns to the agenda, choose a 12- or 24-hour clock, and jump by week, month or year.

Requires Organik Apps Connector on an always-on, awake Mac, calendars synced to Apple Calendar on that Mac, macOS Calendars permission, and Tailscale connected on both the Mac and paired phone in the same private tailnet. Connector and the Mac must remain available, including when you are away from home.

Download Connector: https://github.com/GeezusChrotch/organik-pebble-connector/releases/latest

Pair in Connector → Even G2 → DayFrame → Copy pairing, then paste into DayFrame's Connection settings in the Even phone app. Never share pairing credentials. DayFrame is read-only; it does not create or edit events. Countdowns are visual and do not sound alarms. No AI or microphone is required. Screenshots use sample calendars. Independent software by Organik Apps, not affiliated with Apple or Even Realities.

## Changelog

Multiple days can share an agenda page. All date headings are centered, with thin separators only between days. Event text remains aligned in its centered column, using compact time-first titles. Calendar selection and countdown preferences are preserved.

## Artwork and review gaps

Use artwork/01-calendars.png, 02-agenda.png and 03-event.png: fresh official simulator framebuffers from the current shipping controller/display, with isolated realistic fixtures in release/capture.ts. Keep PNG alpha. The 24×24 local icon concept is included, but the saved Hub icon was drawn separately and has not been downloaded for byte comparison. Retain the existing Hub icon unless intentionally replacing it; regenerate the Hub environment cover from the fresh agenda screenshot at publication time. Old Hub screenshots and the one-day wording are stale and must be replaced with these materials once the hold is lifted.

No new API changes required. Physical checks still needed on 0.1.10: all headings centered, date separators, forward/back pagination, details, locked-phone and remote Tailscale use, launch/exit and native settings persistence. Prior user feedback establishes that 0.1.9 displayed on glasses but identified the date alignment defect; it does not accept 0.1.10. Review the Hub-generated policy PDF against actual data flows before public submission.
