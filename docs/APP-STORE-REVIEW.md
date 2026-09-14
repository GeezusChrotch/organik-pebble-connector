# Apple review: development and release checks

Reviewed against Apple's current documentation on 2026-09-11. Recheck at feature design and before every submission; this is our engineering workflow, not an Apple certification. A successful upload or approval does not replace runtime acceptance.

## Official references

- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/): 2.1 completeness; 2.3 metadata; 2.4.5 Mac distribution; 2.5 APIs; 4 design; 4.2.3 dependencies/downloads; 5.1 privacy; 5.2 rights.
- [Privacy HIG](https://developer.apple.com/design/human-interface-guidelines/privacy): contextual permission requests, specific purpose strings, and a single neutral Continue/Next action in a custom pre-alert. The system prompt supplies the permission decision; a custom pre-alert should not offer Cancel/Not Now.
- [App privacy details](https://developer.apple.com/app-store/app-privacy-details/): label answers require assessing developer/partner access and retention. Transmission to a user's own devices still needs an accurate explanation; it is not automatically developer collection. Optional providers and derived data need separate assessment.
- [Submitting](https://developer.apple.com/app-store/submitting/): refresh supported tooling and submission requirements; record actual exported provenance.
- [Apple's AI disclosure clarification](https://developer.apple.com/news/?id=ey6d8onl): explain third-party personal-data sharing and obtain permission before sending.

## Before implementing a feature

Write down: user action, necessary permission, exact fields read, processing location, recipients, retention/deletion, offline/denied behavior, and reviewer setup. Assess third-party dependencies, licenses, public APIs, required entitlements and additional downloads before choosing the architecture. Update this assessment when a route, provider, helper, SDK or permission changes.

For Connector specifically:

- Contacts: distinguish local address-book matching from matched names/group identifiers sent to paired devices. Test optional access with Beeper-provided labels as fallback.
- Pome: trace HomeKit controls and camera images through the hidden helper, App Group and authenticated private routes. Exercise capture, pause, window close, reopen and Quit separately. Keep camera imagery out of diagnostics and marketing fixtures.
- G2: distinguish bundled speech executable from downloadable model data. Record actual model size, source and disk requirements; provide a deliberate setup choice before download. Audit custom-endpoint disclosure, consent, endpoint changes and temporary-audio deletion independently from local speech.
- Notesy, Reminders and Eventz: test selected-folder bookmarks and permission revocation after relaunch. Confirm actual device delivery, not only green status lights.
- Beepster/agents: inventory external services and their terms, attachment handling, agent approval routing and the Store-specific restriction on installing external code. Assess messaging/reporting/blocking applicability explicitly; do not assume the private-client design exempts everything.
- Network listeners: retain `cloud/NETWORK-SERVICES.md` and review notes explaining each inbound route and its authentication. Test unauthenticated requests, unavailable Tailscale and recovery. Do not enable Funnel.
- Assets and metadata: use synthetic screenshot content and verify licenses for embedded emoji, thumbnails, dependencies and models. Record hardware, OS and account requirements per feature; do not imply every Mac supports local speech or every camera supports snapshots.

## Required evidence for each candidate

Create a fresh JSON record using the keys enforced by `scripts/check-review-readiness.py`. Use `pending` until observed, `failed` for a reproduced defect, `passed` with evidence, or `not_applicable` with a specific rationale. Each completed check cites hashed local evidence files. Never copy an earlier build's pass without an explicit equivalence assessment and artifact identity.

| Check ID | Connector acceptance exercise |
| --- | --- |
| `guidelines` | Record date, changed-feature assessment and unresolved questions. |
| `artifact` | Verify exported package signature/hash, accepted source, nested bundle executables, distribution profiles, sandbox/entitlements, architectures, current toolchain and absent Sparkle. Use the existing artifact verifier and bundle audit. |
| `permissions` | On a test account/device, exercise first request, denial, later grant, revocation and relaunch for Contacts, Reminders, Calendars, Home and selected folders. Inspect actual pre-alerts and purpose strings. Do not reset Josh's live permissions for convenience. |
| `data_flow` | Trace each integration and optional provider; compare app disclosure, privacy policy, App Store labels, manifests and required-reason APIs. Inspect third-party SDKs too. |
| `downloads` | With an empty test cache, verify size/source disclosure, download consent, cancellation, failure/retry and offline cached operation. |
| `lifecycle` | Close window; reopen via File and Command-O; check background operation; Quit; verify owned helpers stop. Check opt-in login behavior. |
| `fresh_install` | Install the exact Store candidate canonically on a clean test setup and exercise configuration without Josh's saved tokens or developer-only services. |
| `integrations` | Record real phone/watch/glasses results for the advertised features, plus unavailable-service behavior. |
| `review_access` | Supply usable setup and hardware/account access arrangements, and an accurate walkthrough. A video supplements access; do not presume it replaces it or that Apple owns our hardware. |
| `metadata_rights` | Check screenshots, feature claims, support/privacy links, age rating, rights, regions and declarations against this candidate. Reassess accounts/payments/login rules if those features are introduced. |

Run the evidence gate before the next submission and again before manual public release. It checks record completeness and artifact/evidence identity, not whether a human observation is truthful or every Apple rule is satisfied. Existing compiler, packaging and runtime tests remain necessary. Do not let Cloud success stand in for this gate.

```sh
python3 scripts/check-review-readiness.py /absolute/path/to/candidate/review-readiness.json
python3 -m unittest discover -s tests -p 'test_review_readiness.py'
```

## Build 58 audit: newly identified gaps

Build 58 was already submitted before this workflow was added. Preserve that submission history; this audit is not evidence that Apple rejected it.

1. **Contacts pre-alert:** frozen `cloud/mac/BeepsterModule.swift` adds Continue and Not Now in `requestContactsAccess()`. This conflicts with the single-action HIG. Fix the pre-alert pattern and test it fresh; retain optional Contacts access through the system decision and normal settings.
2. **Speech download:** frozen `cloud/mac/EvenG2Service.swift` calls `prepareSpeech()` during start; `EvenG2View.swift` describes automatic preparation without model size or a download confirmation. Correct first-time setup and verify from an empty cache. This is a review risk under 4.2.3(ii), not a new Apple rejection.
3. **Evidence gaps:** window reopening and fresh permissions remain pending. Hardware review access, custom-provider consent/labels and clean Store setup need a recorded assessment; existing setup text alone is not proof.

The artifact checks for build 58 passed. Those results cannot close the findings above. The accompanying `connector-g2-store58/review-readiness.json` deliberately fails the new gate. Keep Pome G2 and Pebble publication held. Any replacement requires its own build, artifact checks, runtime evidence and explicit submission-state verification; do not silently replace build 58 or rewrite its historic records.

## Regression history

| Previous issue | Prevention |
| --- | --- |
| Build 35 toolchain provenance | Inspect actual exported main app and helpers; refresh Apple's requirements, not just local Xcode selection. |
| Build 37 server entitlement question | Document the concrete listener and reviewer exercise for each entitlement. |
| Build 40 permission wording/data disclosure/window reopening | Fresh permission and lifecycle exercises; field-by-field data flow. |
| Build 57 upload 90261 | Audit every nested declared executable before signing/export and again in the downloaded artifact. Keep the narrow resource-bundle regression tests. |

Do not push a documentation-only change to the release branch merely to trigger another Cloud build. Keep runtime fixes and their release evidence together when preparing the next candidate.

## Build 110 Home repair assessment (2026-09-13)

User action: Fix beside Home access or Apple Home. The Connector reloads the existing helper credential and checks the authenticated local Home status. Denied access invokes the existing helper Home connection request and, if still denied, opens HomeKit privacy settings. Loading/no-home status restarts only the owned helper to recreate its HomeKit manager, retaining stored credentials and schedules. Continued no-home status explains the account/home check and offers Apple Home explicitly. Other failures retain specific service/update guidance. Returning to Connector triggers a background check.

No new permission, entitlement, endpoint, data field, recipient, retention, download, or third-party sharing is introduced. Existing Home metadata stays in the established local helper/private paired-device flow. The Apple Privacy HIG reference was rechecked for this repair; system permission UI remains the decision surface. Repair classification tests and both edition compilations pass; live denied/loading repair flows and physical-device acceptance remain pending. Healthy startup alone does not close those checks.
