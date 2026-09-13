# Beepster 0.1.8 / Connector 72

Removed blank rows between messages. A one-pixel, 288-pixel-wide rule now sits at the next message header without allocating a text row. Wide icon strips carry the rule behind native text with explicit z-order; the fixed five-row layout and four-image limit are retained. The browser preview shows compact separators. Two-line scrolling and chronological history remain unchanged.

63 G2 tests and 8 bridge tests pass, including divider pixels, clearing obsolete rules on scroll, fixed geometry and container limits, text-over-image layer order, and absence of separator rows. Canonical Connector 72 installation verified with matching frontend assets, enabled login registration, all Beepster requirements ready and authenticated G2 health ready for Beepster and dictation.

Glasses rendering and transfer latency still need physical acceptance. Divider strips are wider than plain icon strips, so this version transfers more bitmap data on conversation scrolls. No real messages sent or chats archived during testing.
