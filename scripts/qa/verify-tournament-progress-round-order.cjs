// Run the production stage builder without changing this shared tree's package links.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const compilerDirectory = fs.readdirSync(path.join(root, 'node_modules/.pnpm')).find(name => name.startsWith('typescript@'));
const ts = require(path.join(root, 'node_modules/.pnpm', compilerDirectory, 'node_modules/typescript'));
function loadSource(filename) {
  const source = process.argv.includes('--baseline') && filename.endsWith('tournament-progress-stepper.tsx')
    ? execFileSync('git', ['show', 'HEAD:apps/v1_web/src/components/tournaments/tournament-progress-stepper.tsx'], { cwd: root, encoding: 'utf8' })
    : fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module, exports: module.exports,
    require(name) {
      if (name.startsWith('./')) return loadSource(path.resolve(path.dirname(filename), name + '.ts'));
      if (!name.startsWith('@/')) throw new Error(`Unexpected runtime dependency: ${name}`);
      return loadSource(path.join(root, 'apps/v1_web/src', name.slice(2) + '.ts'));
    },
  }, { filename });
  return module.exports;
}
const { buildTournamentStages } = loadSource(path.join(root, 'apps/v1_web/src/components/tournaments/tournament-progress-stepper.tsx'));
const expected = ['조별리그', '12강', '8강', '4강', '결승'];
for (const rounds of [
  ['group', 'semi', 'quarter', 'round12', 'final'],
  ['조별리그', '4강', '8강', '12강', '결승'],
]) {
  for (const tied of [true, false]) {
    const stages = buildTournamentStages({
      kind: 'regular_tournament', format: 'group_knockout', status: 'in_progress',
      fixtures: rounds.map((round, index) => ({ round, fixtureNumber: tied ? 1 : index + 1, liveStatus: index === 2 ? 'live' : 'scheduled' })),
    });
    assert.deepEqual(Array.from(stages, stage => stage.label), expected);
    assert.deepEqual(Array.from(stages, stage => stage.status), ['done', 'done', 'active', 'upcoming', 'upcoming']);
  }
}
console.log('PASS: production builder, Korean/English rounds × tied/reversed fixture numbers; order and statuses (4 scenarios).');

const grouping = loadSource(path.join(root, 'apps/v1_web/src/components/public-game-records/schedule-grouping.ts'));
const order = loadSource(path.join(root, 'apps/v1_web/src/lib/tournament-display-order.ts'));
const entries = ['semi', 'B조', 'C조', 'A조', 'final', 'quarter', 'round12'].map((name, index) => ({
  fixtureId: name, round: name.endsWith('조') ? 'group' : name,
  groupName: name.endsWith('조') ? name : null, fixtureNumber: index + 1, status: 'scheduled', scheduledAt: null,
}));
const expectedGroups = ['A조', 'B조', 'C조', '12강', '8강', '4강', '결승'];
assert.deepEqual(Array.from(grouping.groupScheduleEntries(entries).flatMap(phase => phase.groups), group => group.label), expectedGroups);
assert.deepEqual(Array.from(grouping.groupUnscheduledEntries(entries), group => group.label), expectedGroups);
const fixture = (fixtureId, status) => ({ fixtureId, status, round: 'group', fixtureNumber: 1, scheduledAt: null });
const liveA = fixture('live-a', 'live'), liveB = fixture('live-b', 'live');
const partition = grouping.partitionLiveSchedule([fixture('ended', 'ended'), liveA, fixture('future', 'scheduled')], [liveB, liveA]);
assert.deepEqual(Array.from(partition.live, entry => entry.fixtureId), ['live-a', 'live-b']);
assert.deepEqual(Array.from(partition.items, entry => entry.fixtureId), ['ended', 'future']);
assert.equal(partition.unscheduled.length, 0);
assert.equal(grouping.partitionLiveSchedule([fixture('live-a', 'ended')], []).live.length, 0);

// Evaluate the exact production partition function, without importing the entire Next page.
const detailFilename = path.join(root, 'apps/v1_web/src/app/tournaments/[id]/tournament-detail-client.tsx');
const source = fs.readFileSync(detailFilename, 'utf8');
const parsed = ts.createSourceFile(detailFilename, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
const declaration = parsed.statements.find(statement => ts.isFunctionDeclaration(statement) && statement.name?.text === 'partitionTournamentSections');
const pureCode = ts.transpileModule(declaration.getText(parsed), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const partitionModule = { exports: {} };
vm.runInNewContext(pureCode, { exports: partitionModule.exports, compareTournamentGroupNames: order.compareTournamentGroupNames });
const groupInput = ['B조', 'C조', 'A조', '10조', '2조'].map(name => ({ id: name, name, phase: 'group' }));
const section = partitionModule.exports.partitionTournamentSections('group_knockout', [], groupInput);
assert.deepEqual(Array.from(section.groupPhaseGroups, group => group.name), ['2조', '10조', 'A조', 'B조', 'C조']);
assert.deepEqual(groupInput.map(group => group.name), ['B조', 'C조', 'A조', '10조', '2조']);
console.log('PASS: production schedule grouping (scheduled/unscheduled), multiple live games/dedup/end transition, exact page standings partition/natural order/immutable source.');
