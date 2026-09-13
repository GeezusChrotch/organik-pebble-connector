# Beepster G2 0.1.13 / Connector 77

User hardware report: 0.1.12 loses icons as soon as native quit confirmation opens, and they remain missing after cancel. Its image-only lifecycle recovery did not fix the reported device behavior.

Double tap from the inbox now opens an app-owned confirmation page. No, stay is selected initially. No or double tap returns using ordinary page navigation. Yes alone calls shutDownPageContainer(0), avoiding the native confirmation overlay entirely. Successful exit stops resources and polling; rejected close retains a usable page. Back during an in-flight chat load still cancels the load without opening quit. Polling pauses on confirmation. Native system-menu Close remains firmware owned.

Validation: 73 G2 tests, 8 bridge tests passed. Tests cover cancel via No and double tap with icons and inbox selection retained, no native shutdown before Yes, immediate exit mode, resource cleanup, rejected close/retry, and late chat-load cancellation. Browser demo verified opening the confirmation with icons and returning to inbox via No. TypeScript/Vite packaging, native layout/media/bundle checks, signing and canonical installation passed. Installed build 77 frontend assets match candidate; all Beepster requirements and authenticated G2 Beepster/dictation health are ready. Faster image transfers from 0.1.12 are preserved.

Physical glasses acceptance remains pending: open Beepster 0.1.13, double tap in inbox, verify the new No, stay / Yes, quit page, choose No and check service/title icons, repeat with double-tap cancel, then verify Yes closes. No real messages sent in testing.

Even Hub verified: v0.1.13 Published Beta, existing one-person group preserved.
