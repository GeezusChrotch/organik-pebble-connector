# Beepster 0.1.15 / Connector 79

More conversations fetched and appended the next page but push() reset the selection to zero. Pagination now updates the existing inbox and selects the first newly visible conversation after merging/deduplicating and applying service filters/pin order. A duplicate-only or empty page retains the tail selection, clamped at end-of-list. Failed requests leave the cursor and More row usable for retry. Late responses cannot replace a departed page.

75 Beepster, 110 cross-app/Pome, and 8 bridge tests passed; build/pack/native checks and canonical installation passed. Added tests cover two sequential cursor pages, duplicate merging, first-new selection, preserving loaded history and selection across polling, duplicate-only pages, rejected requests and end-of-list. Installed assets match candidate. No real messages sent. Physical More conversations acceptance remains pending.

Even Hub verified: 0.1.15 Published Beta; existing one-person group preserved.
