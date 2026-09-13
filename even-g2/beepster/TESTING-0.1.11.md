# Beepster 0.1.11 / Connector 75

Sender, timestamp and text now share a wrapped paragraph, separated by middots. Sender/time toggles are respected without dangling separators. The service icon remains before the first text line. Bitmap emoji keep their existing separate rows where native inline glyphs are unavailable. No change to full-width dividers, six-line viewport, single-line scrolling or menu recovery.

68 G2 tests and 8 bridge tests pass. Added exact-format checks for all sender/time visibility combinations and natural wrapping without repeated prefixes; updated existing chronology, reaction, attachment and viewport assertions for the combined text. Demo screenshot verified sender, timestamp and message on the same line.

Connector 75 installed through canonical installer; all bundled frontend files match, all Beepster requirements ready, private route ready and authenticated G2 health reports Beepster/dictation ready. No real messages sent or chats archived during testing. Physical glasses acceptance remains pending.
