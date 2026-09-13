# Beepster G2 0.1.4 / Connector 68

The installed candidate fixes stale ordering of Beeper merged containers by sorting the inbox on the newest member activity before paging. At the top of the glasses inbox, refresh follows the newest conversation. After scrolling down, refresh preserves the selected conversation. Returning from a chat refreshes the inbox immediately.

The main screen remains the inbox and is titled Beepster. Conversation rows and individual messages have monochrome service icons. Merged messages use their actual source service, while replies use the explicit Beeper default destination.

Phone settings use the same light Organik layout as Pebble, with Setup, Shortcuts and Replies tabs. Shared choices include service filters, refresh, hide links, three image modes, eight quick reply slots and 15 reorderable emoji slots using the complete watch catalog. To honor the no-text-input requirement, quick reply slots use preset selectors while preserving existing custom replies. G2 has separate thread/chat assignments for its two system-menu actions. Theme, seven-button watch mappings, pinning and manual Apple aliases are not implemented in this G2 candidate; explicit Beeper merged conversations remain supported.

Beeper-owned cached media is fetched through its authenticated asset API and decoded by the native Connector in a scoped temporary directory. Apple Messages files continue to use the selected folder scope. No broader folder grant or permission reset was required.

## Verified

- 31 G2 tests, 245 gateway tests and the native decoding/confinement checks pass. The broader C harness requires Xcode's matching SDK via command-local DEVELOPER_DIR and SDKROOT.
- All three phone tabs fit a 390px viewport, with no text inputs. Emoji category selection, replacement, reorder and save/apply were exercised in the synthetic demo.
- The canonical installer installed signed Connector build 68 and registered its login item. Installed G2 and gateway files match the tested source/artifact.
- Live G2 route rendered 19 attachments: 16 Instagram and three Apple Messages. Two Apple Messages files are missing, correctly returning MEDIA_MISSING. All successful previews decode as G2 bitmaps.
- Live received thumbs-up reaction is present and has readable labels. Sending and recipient routing are covered by synthetic tests only. No real test messages were sent.
- All Connector Beepster requirements and Tailscale are green.

## Glasses acceptance

Open the new beta and confirm Beepster/inbox layout, service icons, recent activity ordering and phone setting persistence. Open Jane's conversation, locate the received reaction and view both Apple Messages and Instagram media. Test a reply only when you intend to send it. Confirm GIF frame navigation and Parakeet recording/review on the hardware.

Default polling waits 15 seconds between completed refresh attempts while open. Phone options are 5, 15, 30, 60 seconds or manual. Polling pauses for recording, reply review, sending and app exit. Requests add their own response time to the interval.
