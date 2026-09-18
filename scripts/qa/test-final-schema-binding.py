#!/usr/bin/env python3
"""Exercise real release binders and stored-manifest validation without AWS or a DB."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = Path('apps/v1_api/prisma/schema.prisma')
M11 = Path('apps/v1_api/prisma/migrations/20260911090000_retire_tournament_fixture_tables/migration.sql')
OLD_SCHEMA = 'e44990c6d17e612b9d93e4ce41a6c5adaacb813ab3c67f75fd4f05b185736f46'
CURRENT_SCHEMA = hashlib.sha256((ROOT / SCHEMA).read_bytes()).hexdigest()
M11_SHA = '08eac7347cbb10fcc4ef87d31d63bd9516d5bfda281dcf5730c4f0a1985d9323'


class FinalSchemaBinding(unittest.TestCase):
    def bind(self, tamper=None):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for source in (SCHEMA, M11):
                (root / source).parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(ROOT / source, root / source)
            if tamper:
                with (root / tamper).open('a') as stream:
                    stream.write('\n// unreviewed change\n')
            output = root / 'github-output'
            result = subprocess.run(['bash', str(ROOT / 'scripts/release/prepare-task168-final-steady-inputs.sh')],
                                    cwd=root, env={**os.environ, 'GITHUB_ENV': str(output)}, capture_output=True, text=True)
            return result.returncode, output.read_text() if output.exists() else ''

    def test_current_source_binds_exact_digests(self):
        code, output = self.bind()
        self.assertEqual(code, 0)
        self.assertIn(f'TASK168_SCHEMA_SHA256={CURRENT_SCHEMA}\n', output)
        self.assertIn(f'TASK168_M11_SHA256={M11_SHA}\n', output)

    def test_modified_schema_does_not_publish_binding(self):
        code, output = self.bind(SCHEMA)
        self.assertNotEqual(code, 0)
        self.assertEqual(output, '')

    def test_modified_m11_does_not_publish_binding(self):
        code, output = self.bind(M11)
        self.assertNotEqual(code, 0)
        self.assertEqual(output, '')

    def valid_manifest(self, schema, client=None, m11=M11_SHA, bad_checksum=False):
        release = 'a' * 40
        registry = '111111111111.dkr.ecr.ap-northeast-2.amazonaws.com'
        digest = 'sha256:' + 'b' * 64
        document = {
            'schemaVersion': 1, 'environment': 'alpha',
            'release': {'sha': release, 'version': 'test', 'createdAt': '2026-09-19T00:00:00Z'},
            'source': {'bucket': 'test', 'key': f'releases/{release}.tar.gz', 'versionId': '1', 'sha256': 'c' * 64},
            'database': {'migrationPolicy': 'task168-final', 'rollbackMode': 'final-only',
                         'compatibilityCheck': 'expand-contract-sql-v1', 'migrationValidatedFrom': None,
                         'rollbackCompatibleWith': None, 'task168': {'stage': 'final', 'schemaSha256': schema,
                         'runtimeClientSchemaSha256': client or schema, 'm11Sha256': m11}},
            'images': {name: {'repository': f'{registry}/teameet-alpha-v1-{name}', 'digest': digest,
                             'uri': f'{registry}/teameet-alpha-v1-{name}@{digest}'} for name in ('api', 'web')},
        }
        with tempfile.TemporaryDirectory() as directory:
            manifest = Path(directory) / 'manifest.json'
            manifest.write_text(json.dumps(document))
            checksum = '0' * 64 if bad_checksum else hashlib.sha256(manifest.read_bytes()).hexdigest()
            return subprocess.run(['bash', '-c', 'source "$1"; validate_alpha_final_release_manifest "$2" "$3" test "$4" "$5"',
                                   'test', str(ROOT / 'deploy/alpha-manifest-common.sh'), str(manifest), release, checksum, registry],
                                  capture_output=True).returncode == 0

    def test_current_and_historical_final_manifests(self):
        self.assertTrue(self.valid_manifest(CURRENT_SCHEMA))
        self.assertTrue(self.valid_manifest(OLD_SCHEMA))

    def test_unreviewed_schema_rejected(self):
        self.assertFalse(self.valid_manifest('f' * 64))

    def test_client_schema_mismatch_rejected(self):
        self.assertFalse(self.valid_manifest(CURRENT_SCHEMA, client=OLD_SCHEMA))

    def test_m11_and_manifest_checksum_tampering_rejected(self):
        self.assertFalse(self.valid_manifest(CURRENT_SCHEMA, m11='f' * 64))
        self.assertFalse(self.valid_manifest(CURRENT_SCHEMA, bad_checksum=True))


if __name__ == '__main__':
    unittest.main(verbosity=2)
