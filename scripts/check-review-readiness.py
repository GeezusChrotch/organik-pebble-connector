#!/usr/bin/env python3
"""Read-only evidence gate. Does not build, submit, or certify Apple compliance."""
import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

REQUIRED = {
    'guidelines', 'artifact', 'permissions', 'data_flow', 'downloads',
    'lifecycle', 'fresh_install', 'integrations', 'review_access', 'metadata_rights',
}


def validate(record):
    errors = []
    if record.get('schema') != 1:
        errors.append('Unsupported or missing schema')
    if not re.fullmatch(r'[0-9a-f]{40}', str(record.get('sourceCommit', ''))):
        errors.append('Missing exact source commit')
    if not str(record.get('build', '')).isdecimal():
        errors.append('Missing build identity')
    checks = record.get('checks', {})
    if not isinstance(checks, dict):
        return errors + ['checks must be an object']
    for name in sorted(REQUIRED):
        check = checks.get(name, {})
        if not isinstance(check, dict):
            errors.append(f'{name}: invalid check')
            continue
        status = check.get('status', 'missing')
        if status not in ('passed', 'not_applicable'):
            errors.append(f'{name}: {status}')
            continue
        if name in ('guidelines', 'artifact') and status == 'not_applicable':
            errors.append(f'{name}: cannot be not_applicable')
        for key in ('assessment', 'checkedAt', 'checkedBy'):
            if not isinstance(check.get(key), str) or not check[key].strip():
                errors.append(f'{name}: missing {key}')
        evidence = check.get('evidence', [])
        if not isinstance(evidence, list) or not evidence:
            errors.append(f'{name}: missing evidence')
            continue
        for item in evidence:
            try:
                path = Path(item['path'])
                if not path.is_absolute() or hashlib.sha256(path.read_bytes()).hexdigest() != item['sha256']:
                    errors.append(f'{name}: evidence identity mismatch')
            except (OSError, KeyError, TypeError):
                errors.append(f'{name}: unreadable evidence')
    try:
        artifact = json.loads(Path(record['artifactEvidence']).read_text())
        for key in ('build', 'sourceCommit', 'pkgSHA256'):
            if str(record.get(key)) != str(artifact.get(key)) or key not in record:
                errors.append(f'Artifact {key} mismatch')
        if artifact.get('deepSignatureVerified') is not True or artifact.get('installerSignatureVerified') is not True:
            errors.append('Artifact signature evidence missing')
        if hashlib.sha256(Path(artifact['pkg']).read_bytes()).hexdigest() != record['pkgSHA256']:
            errors.append('Package hash mismatch')
    except (OSError, KeyError, TypeError, ValueError):
        errors.append('Unreadable artifact evidence or package')
    if record.get('openFindings'):
        errors.append('Unresolved findings: ' + str(record['openFindings']))
    return errors


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('record', type=Path)
    args = parser.parse_args()
    try:
        data = json.loads(args.record.read_text())
        if not isinstance(data, dict):
            raise ValueError('Record must be an object')
        failures = validate(data)
    except (OSError, ValueError) as error:
        failures = [str(error)]
    if failures:
        print('NOT READY\n' + '\n'.join('- ' + error for error in failures))
        sys.exit(1)
    print('PASS: evidence record complete and package identity verified; runtime observations require human review.')
