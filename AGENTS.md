# Local Connector test installations

## Apple rules before implementation and release

Read `docs/APP-STORE-REVIEW.md` when designing Store-facing features and before any App Store submission or public release. Recheck the linked official Apple guidance for changed features. Record permission/data flows and review access while designing, not after rejection. Run `scripts/check-review-readiness.py` against a candidate-specific evidence record before submission and manual release. Pending checks and unresolved findings are not passes. This evidence gate supplements packaging and actual device testing; it does not certify compliance. Preserve already submitted artifacts and report newly found issues honestly before preparing a replacement.

Josh requires the latest test candidate to be the only installed/running Connector and the only Connector login item. Do not launch test candidates directly from build directories.

- Validate the explicit signed candidate, then install through `python3 scripts/install-test-build.py '/absolute/path/to/candidate.app'`.
- The permanent path is `/Applications/Organik Apps Pebble Connector.app`. Previous installed apps and obsolete startup files belong under `~/Library/Application Support/Organik Connector Archives.noindex/`, never hidden inside Applications.
- The installer removes the previous native login registration, stops owned processes, archives obsolete standalone Connector apps and the legacy Beepster launch agent, installs the candidate, and registers its permanent path using `--login-item=enable`.
- Verify the installed version/process paths, native login registration, service ownership, and preserved pairing/settings after each installation. Record the candidate in `build/current-test-install.json`. Build output alone is not installation or functional acceptance.
- Do not roll back unless Josh explicitly asks. Preserve evidence and report a failing test without replacing the current candidate with an older version.
- Keep public/App Store artifacts and submission work separate from local test deployment. Do not modify unrelated personal gateways while cleaning Connector leftovers.

## Standing two-edition requirement

Every Connector change must apply to both editions by default. Keep shared behavior, navigation, setup, repairs, and fixes aligned; do not treat a GitHub-only implementation as completion.

- App Store edition retains full Pome functionality alongside the other apps. Its publication follows Apple review and approval.
- GitHub edition excludes Pome functionality and shows “Pome coming soon to the App Store”. It can be released when ready without waiting for Apple approval.
- Build and validate both configurations for shared changes. Report each edition’s source, build, installation, and publication status separately. Updating Store source does not update an already-submitted build.
- Preserve submitted artifacts; coordinate a new Store candidate rather than modifying submission history.
