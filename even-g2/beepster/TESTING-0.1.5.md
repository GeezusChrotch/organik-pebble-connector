# Beepster G2 0.1.5 / Connector 69

Scrolling uses five fixed row containers and two fixed icon strips, including the last partial page. It no longer rebuilds when chat-name lengths change. Icon strips and heading images are repainted after text updates and restored after the OS menu closes. Sequential image transfers finish before the latest queued screen renders.

Emoji replies use 18x18, four-bit sprites compiled from the full Pebble catalog. All 3,944 sprites are nonblank, with dark colors lifted for the green display. All 15 configured slots appear across reply pages. Labels and review text remain readable without relying on the firmware Unicode font; transmitted text remains the original emoji. Existing short saved lists are expanded to match the 15 slots displayed by phone settings.

Microphone start/stop calls are serialized. Starting drains display work and waits for the menu to close, clears a prior session, then confirms actual PCM. Negative acknowledgements with real audio are accepted; positive acknowledgements without audio are not. One clean restart is attempted only when no PCM arrived. Cancellation prevents a queued start. The recording page stays geometrically fixed as its status changes to Listening. A generic SDK failure is no longer misreported as revoked permission.

45 G2 tests and seven bridge tests pass. The new tests simulate bitmap loss on text updates, rapid scrolling, overlay restoration, microphone races and all emoji slots. Browser preview verified raster emoji with readable labels. The installed Connector matches the package and serves all emoji assets with correct MIME and identical bytes. Beepster requirements and login registration are verified.

Hardware acceptance remains pending: scroll up and down through multiple inbox pages, browse to the last emoji row and back, and start/stop dictation several times. Wait for Listening before speaking. Cancel one startup and immediately try again. No real outgoing test messages were sent.
