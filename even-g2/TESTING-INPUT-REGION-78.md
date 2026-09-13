# Connector 78: Beepster 0.1.14 and Pome 0.1.30

Reported green dot/blob at bottom right in both apps. Source audit found blank input-capture text containers with height 20 near the bottom edge (Beepster y264, Pome y228), and narrow camera capture regions with default padding. Native text overflow is a plausible cause, not yet physically confirmed.

Both renderers now normalize blank input-only text containers to a 40x40 region at the empty upper-left margin, with explicit zero padding, border width/color/radius. Blank content remains blank. Nonblank Pome text capture remains unchanged so native text scrolling still works. Visible row positions, image tile geometry, title icons, menu definitions, and single-line Beepster scrolling remain unchanged.

Validation: 110 Pome/cross-app tests, 73 Beepster tests, 8 bridge tests. The new cross-app regression exercises menu/text/image pages, one capture target, enough blank-line height, no border/padding, existing row placement, and tap/up/down/back delivery. Builds and packages pass, canonical Connector 78 installation succeeds, and both installed asset trees match their source builds. G2 authenticated Beepster and dictation health are ready. These mock bridge checks do not prove absence of a firmware-drawn artifact.

Hardware acceptance pending: update both Betas, check bottom-right while idle, after scrolling, after menu return, and on image/camera pages. Also check no artifact appears at the upper-left capture area. No real messages or HomeKit actions were sent in testing.

Even Hub verified: Beepster 0.1.14 and Pome 0.1.30 Published Beta, both existing one-person groups preserved. Connector status reports both apps ready.
