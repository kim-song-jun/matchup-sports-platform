#!/usr/bin/env python3
"""Real git histories and manifest pairs exercise the rollback compatibility boundary."""
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
HELPER = ROOT / 'deploy/alpha-tournament-runtime.sh'


class TournamentRollback(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='teameet-runtime-gate-')
        self.repo = Path(self.temp.name)
        self.git('init', '-q')
        self.git('config', 'user.email', 'fixture@example.test')
        self.git('config', 'user.name', 'runtime fixture')
        (self.repo / 'old').write_text('pre-feature runtime')
        self.git('add', 'old')
        self.git('commit', '-qm', 'old release')
        self.old = self.git('rev-parse', 'HEAD').strip()
        (self.repo / 'deploy').mkdir()
        (self.repo / 'deploy/alpha-tournament-runtime.sh').write_text(HELPER.read_text())
        self.git('add', 'deploy/alpha-tournament-runtime.sh')
        self.git('commit', '-qm', 'compatible runtime')
        self.new = self.git('rev-parse', 'HEAD').strip()

    def tearDown(self):
        self.temp.cleanup()

    def git(self, *args):
        return subprocess.check_output(['git', *args], cwd=self.repo, text=True)

    def shell(self, command, *args):
        return subprocess.run(['bash', '-c', 'source "$1"; ' + command, '_', str(HELPER), *args], cwd=self.repo, capture_output=True, text=True)

    def test_pre_feature_final_is_not_marked_compatible(self):
        result = self.shell('alpha_tournament_rollback_target "$2" final', self.old)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), '')

    def test_known_compatible_final_is_preserved(self):
        result = self.shell('alpha_tournament_rollback_target "$2" final', self.new)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout.strip(), self.new)

    def test_unknown_history_fails_closed(self):
        self.assertNotEqual(self.shell('alpha_tournament_rollback_target "$2" final', 'f' * 40).returncode, 0)

    def test_stage_a_and_absent_predecessors_have_no_target(self):
        for sha, stage in [(self.new, 'stageAIntermediate'), ('none', 'none')]:
            result = self.shell('alpha_tournament_rollback_target "$2" "$3"', sha, stage)
            self.assertEqual((result.returncode, result.stdout.strip()), (0, ''))

    def test_rollback_execution_refuses_missing_or_changed_runtime_even_with_matching_sha(self):
        active = self.repo / 'active.json'
        previous = self.repo / 'previous.json'
        active.write_text(json.dumps({'database': {'tournamentRuntimeVersion': 2, 'rollbackCompatibleWith': self.old}}))
        for version in [None, 0, 1, '2', 3, 2]:
            previous.write_text(json.dumps({'release': {'sha': self.old}, 'database': {'tournamentRuntimeVersion': version}}))
            result = self.shell('assert_alpha_tournament_rollback_runtime "$2" "$3"', str(active), str(previous))
            self.assertEqual(result.returncode == 0, version == 2)


    def test_failed_candidate_restore_checks_runtime_before_source_or_images(self):
        candidate = self.repo / 'candidate.json'
        previous = self.repo / 'previous.json'
        marker = self.repo / 'activated'
        candidate.write_text(json.dumps({'database': {'tournamentRuntimeVersion': 2}}))
        command = r'''export ALPHA_HOME_DIR="$3"
source "$2"
mkdir -p "$ALPHA_RELEASE_STATE_DIR"
printf '{"activeManifestSha256":"fixture"}' > "$ALPHA_RELEASE_STATE_FILE"
fixture_previous="$4"; ALPHA_MANIFEST_FILE="$5"; restore_marker="$6"
ALPHA_ECR_REGISTRY=fixture
ALPHA_TOURNAMENT_RUNTIME_STARTED="$7"
extract_active_manifest() { cp "$fixture_previous" "$1"; }
validate_stored_alpha_manifest() { return 0; }
alpha_release_source_key() { printf fixture; }
activate_alpha_release_source() { touch "$restore_marker"; }
load_alpha_release_manifest() { return 0; }
pull_release_images() { return 0; }
write_release_metadata() { return 0; }
wait_for_alpha_health_contract() { return 0; }
assert_running_release_digests() { return 0; }
compose=(true)
restore_active_release
'''
        for started, version, allowed in [('true', 0, False), ('true', 2, True), ('false', 0, True)]:
            marker.unlink(missing_ok=True)
            previous.write_text(json.dumps({'database': {'tournamentRuntimeVersion': version}}))
            result = self.shell(command, str(ROOT / 'deploy/alpha-release-common.sh'), str(self.repo), str(previous), str(candidate), str(marker), started)
            self.assertEqual(result.returncode == 0, allowed, result.stderr)
            self.assertEqual(marker.exists(), allowed)

    def test_deployment_enables_guard_before_candidate_seed_writer(self):
        source = (ROOT / 'deploy/deploy-alpha.sh').read_text()
        segment = '# 게임 운영 플래그 불변 행 시드.' + source.split('# 게임 운영 플래그 불변 행 시드.', 1)[1].split('"${compose[@]}" exec -T v1_postgres', 1)[0]
        prefix = 'ALPHA_TOURNAMENT_RUNTIME_STARTED=false\nprobe() { [[ "$ALPHA_TOURNAMENT_RUNTIME_STARTED" == true ]]; }\ncompose=(probe)\n'
        result = subprocess.run(['bash', '-ec', prefix + segment], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        mutant = segment.replace('ALPHA_TOURNAMENT_RUNTIME_STARTED=true', '')
        self.assertNotEqual(subprocess.run(['bash', '-ec', prefix + mutant], capture_output=True).returncode, 0)


if __name__ == '__main__':
    unittest.main()
