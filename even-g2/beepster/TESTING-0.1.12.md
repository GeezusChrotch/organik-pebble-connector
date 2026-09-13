# Beepster G2 0.1.12 / Connector 76

Quit cancellation now restores image contents on foreground/close events and the next app gesture when a return event is missing. A quit request also schedules image-only restoration, avoiding rebuilding a still-open native confirmation. Resources stop only after confirmed exit, which suppresses queued redraws.

Image transfers use lossless grayscale PNG with automatic BMP fallback for host format rejection. Independent PNG decoding checks CRCs and every pixel, including padded BMP rows. Representative four-tile thread payload decreased from 361,688 to 736 bytes. This measures bridge payload, not physical BLE latency. Superseded scroll frames finish the in-flight tile and skip remaining old tiles; a regression checks one old transfer plus four current transfers without a page rebuild.

Validation: 72 G2 tests and 8 bridge tests passed; TypeScript/Vite build, package, native layout/media/bundle checks and signing passed. Canonical installer installed Connector 76. Installed frontend assets match source build. Beepster requirements, including attachments, are ready; authenticated G2 health reports Beepster and dictation ready.

Physical acceptance remains pending: double tap from inbox, choose No, confirm title/service/emoji icons remain; repeat and scroll rapidly in both directions in inbox and a thread. Check perceived latency and attachments on real G2 firmware. No real messages were sent during testing.

Even Hub verified: v0.1.12 Published Beta, existing one-person testing group preserved.
