"""Evidence gate regression tests with synthetic packages; no live permissions."""
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('review_gate', Path(__file__).parents[1] / 'scripts/check-review-readiness.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)


class ReviewReadinessTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.pkg = root / 'fixture.pkg'
        self.pkg.write_bytes(b'synthetic test package, not a signed app')
        digest = hashlib.sha256(self.pkg.read_bytes()).hexdigest()
        artifact = root / 'artifact.json'
        artifact.write_text(json.dumps(dict(build=1, sourceCommit='a'*40, pkgSHA256=digest, pkg=str(self.pkg), deepSignatureVerified=True, installerSignatureVerified=True)))
        self.record = dict(schema=1, build=1, sourceCommit='a'*40, pkgSHA256=digest, artifactEvidence=str(artifact), openFindings=[], checks={
            name: dict(status='passed', assessment='Synthetic fixture', checkedAt='2026-09-11', checkedBy='Test', evidence=[dict(path=str(self.pkg), sha256=digest)]) for name in gate.REQUIRED
        })

    def test_complete_fixture(self):
        self.assertEqual(gate.validate(self.record), [])

    def test_pending_and_missing_checks_fail(self):
        self.record['checks']['permissions']['status'] = 'pending'
        del self.record['checks']['lifecycle']
        self.assertIn('permissions: pending', gate.validate(self.record))
        self.assertIn('lifecycle: missing', gate.validate(self.record))

    def test_open_findings_fail_even_with_all_passes(self):
        self.record['openFindings'] = ['Unfixed behavior']
        self.assertTrue(gate.validate(self.record))

    def test_no_evidence_and_no_rationale_fail(self):
        self.record['checks']['downloads'].update(status='not_applicable', assessment='', evidence=[])
        self.assertTrue(gate.validate(self.record))

    def test_changed_package_and_evidence_fail(self):
        self.pkg.write_bytes(b'different package')
        failures = gate.validate(self.record)
        self.assertIn('Package hash mismatch', failures)
        self.assertIn('artifact: evidence identity mismatch', failures)

    def test_wrong_build_or_source_fail(self):
        self.record.update(build=2, sourceCommit='b'*40)
        failures = gate.validate(self.record)
        self.assertIn('Artifact build mismatch', failures)
        self.assertIn('Artifact sourceCommit mismatch', failures)

    def test_artifact_cannot_be_skipped(self):
        self.record['checks']['artifact']['status'] = 'not_applicable'
        self.assertIn('artifact: cannot be not_applicable', gate.validate(self.record))


if __name__ == '__main__':
    unittest.main()
