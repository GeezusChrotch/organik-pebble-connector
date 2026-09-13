# Beepster 0.1.17: window outline

Adds the DayFrame-style one-pixel square frame at gray level8 around the 576x288 app window. Reuses full-screen blank capture at zOrder0; no additional containers. All images/text remain above it. Top-edge bitmap containers start at y1 with matching top scanline removed; interior pixels and message dividers retain their original coordinates. Header bounds leave the outside frame pixels free. Preview uses a matching square thin green outline without changing its content layout.

77 Beepster tests pass, including official SDK page validation for inbox, conversation, dictation, quit and image screens in normal and compatibility modes, before/after native overlay restoration; all images are inset, byte dimensions match SDK geometry, container limits hold, and bitmap cropping preserves remaining scanlines. Existing scrolling, dictation and pagination regressions pass. TypeScript/Vite build and package pass. Browser demo preview visually checked.

Shared installation waits for Pome build93, then clones that exact installed app and replaces only Beepster frontend assets as build94. No native/source helper rebuild and no Pome or DayFrame frontend replacement. Publication and hardware acceptance remain pending until recorded in candidate evidence. No real messages sent.

Installed Connector94 from freshly installed Pome93. Pome and DayFrame assets byte-identical; native executable identical after removing signatures from temporary comparison copies (re-signing necessarily changes its signature bytes). Beepster installed assets match package build. Login item status1. Beta upload failed because Even Hub login expired; publication pending sign-in, DayFrame task presenting login. Hardware acceptance pending.

After Even Hub sign-in restoration: exact tested package uploaded and verified Published Beta0.1.17, existing one-person group preserved. No further Connector install or Store listing edits.
