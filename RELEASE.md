# Organik Apps Pebble Connector 1.0 — release candidate

Not yet publicly available. This replaces the earlier submitted candidate with the accepted direct HomeKit backend and simplified setup.

- Pome connects directly to Apple Home for devices, rooms, scenes and optional cameras. No Itsyhome installation or separate home-control server is required.
- Each app has three numbered setup steps with an explanation of what is configured and why: connect its source, establish the private phone connection, and pair the phone.
- Notesy starts after vault selection. Beepster uses its guided token/Contacts/service setup. Optional attachments, cameras and agent links are separate from the main setup; repairs are in Troubleshooting.
- Pome home controls and cameras reuse one private URL/token. Camera pause keeps home controls available. Closing Connector's window preserves services; Quit stops them.

Requires macOS14 or later; optional camera capture requires macOS15.2 or later. Universal Intel/Apple silicon. Watch apps install separately. Tesla stays hidden by default and marked Coming soon.

The stable Xcode Cloud Store archive uses the accepted local39 source hashes in `cloud/ACCEPTED-SOURCE.json`. Signing, build number and compiler provenance differ from the local development build. Archive validation, Apple review and publication remain pending. Historical release notes are preserved in Git tags.
