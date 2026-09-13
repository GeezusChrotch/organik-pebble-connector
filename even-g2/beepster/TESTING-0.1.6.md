# Beepster G2 0.1.6 / Connector 70

Installed at the canonical Applications path, registered login item, matching bundled frontend/proxy, and all Beepster connection requirements green. Authenticated G2 health reports Beepster and dictation ready. Emoji assets return HTTP 200 and match packaged bytes. Published to existing one-person Even Hub Beta group; public release unchanged.

55 G2 tests and 8 bridge tests pass. Coverage includes 15 configured emoji slots, actual Unicode send payload after confirmation, bitmap chat bodies/reactions including joined emoji and flags, captured system-menu target, deferred actions after overlay dismissal, off-page pins, pinned sorting after refresh, failed pin storage, successful and failed archive, authentication, retained reading position, and previous mic/icon regressions.

Custom menu order: Quick reply, Dictate, Pin / unpin, Archive, Refresh. Even controls Display off, Brightness and Close placements; these cannot be reordered through SDK 0.0.15. Source: https://hub.evenrealities.com/docs/build/contextual-menu

Pinned chats are local G2 preferences, persisted with phone settings; they do not modify Beeper's native pin state. Phone settings replace configurable menu remapping with a Pinned chats tab. Drag handles and accessible up/down controls order pins. Shared reply settings remain unchanged. Missing/archived pinned IDs are resolved against the current primary snapshot, never fabricated from saved metadata.

Archive uses the existing authenticated gateway archive route on the selected conversation container, removes it after success, and removes its G2 pin. No real conversation was archived or sent a test message. Reversing an archive is available in Beeper.

At 390px width, verified two synthetic pins, arrow ordering, saving, matching inbox order, clean message rows and bitmap reaction preview. Drag interaction has code review but no physical iPhone touch test. Chat emoji use separate bitmap rows with readable labels; they are not inline glyphs inside native G2 text.

## On-glasses acceptance still needed

- Update to 0.1.6 in the Even app and reopen Beepster.
- Check the five custom system actions and firmware-provided slots.
- Pin/unpin from inbox and inside a conversation; reorder in phone settings, save, and reopen.
- Archive a conversation intentionally and verify it disappears from Beeper's primary inbox.
- Swipe up/down through icon pages and all 15 emoji quick replies.
- Open a chat containing emoji/reactions; verify bitmap rows and paging.
- Start/cancel/restart dictation repeatedly, then confirm or discard the transcript.

Hardware appearance, actual microphone reliability, real-message delivery and real-chat archive behavior remain user acceptance checks.
