// Usage: PGLITE_MODULE=/tmp/qa/node_modules/@electric-sql/pglite/dist/index.js node scripts/qa/verify-knockout-display-migration.mjs
// Install: npm install --prefix /tmp/qa --no-save --ignore-scripts @electric-sql/pglite@0.5.15
// The optional QA runtime stays in /tmp; the app and shared dependencies are untouched.
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`CREATE TABLE v1_tournaments(id text PRIMARY KEY, multi_finals jsonb);
CREATE TABLE v1_tournament_groups(id text PRIMARY KEY, tournament_id text, name text, phase text, bracket_track text, updated_at timestamptz, UNIQUE(tournament_id,name));
CREATE TABLE v1_tournament_slots(id text PRIMARY KEY, group_id text, kind text);
CREATE TABLE v1_tournament_match_details(team_match_id text PRIMARY KEY, group_id text, round text, updated_at timestamptz);`);
const cases = [
  ['named12', 12, '프리미어', '프리미어 · 16강', '16강', true, '프리미어 · 12강', '12강'],
  ['custom12', 12, '챌린지', '운영자가 저장한 이름', '16강', true, '운영자가 저장한 이름', '12강'],
  ['named10', 10, '프리미어', '프리미어 · 16강', '16강', true, '프리미어 · 10강', '10강'],
  ['named6', 6, '프리미어', '프리미어 · 8강', '8강', true, '프리미어 · 6강', '6강'],
  ['odd5', 5, '프리미어', '프리미어 · 8강', '8강', true, '프리미어 · 8강', '8강'],
  ['flex10', 10, 'overall', '10팀 첫 라운드', '10팀 첫 라운드', false, '10팀 첫 라운드', '10팀 첫 라운드'],
  ['regular16', 16, '프리미어', '프리미어 · 16강', '16강', true, '프리미어 · 16강', '16강'],
  ['manual', 12, 'overall', '수동 조 이름', '16강', false, '수동 조 이름', '16강'],
  ['mismatchedCapacity', 10, '프리미어', '프리미어 · 16강', '16강', true, '프리미어 · 16강', '16강', 12],
  ['customRound', 12, '프리미어', '내 결선 이름', '운영자 지정 라운드', true, '내 결선 이름', '운영자 지정 라운드'],
];
for (const [id,size,track,name,round,named,,,capacity] of cases) {
 await db.query('INSERT INTO v1_tournaments VALUES ($1,$2)', [id, JSON.stringify({ finals: named ? [{ name: track, capacity: capacity ?? size }] : [] })]);
 await db.query('INSERT INTO v1_tournament_groups VALUES ($1,$1,$2,$3,$4,null)', [id, name, size <= 8 ? 'quarter' : 'round16', track]);
 await db.query('INSERT INTO v1_tournament_match_details VALUES ($1,$1,$2,null)', [id, round]);
 for(let i=0;i<size;i++) await db.query("INSERT INTO v1_tournament_slots VALUES ($1,$2,'GROUP_RANK')", [`${id}:${i}`,id]);
}
const sql = await readFile(new URL('../../apps/v1_api/prisma/migrations/20261106130000_knockout_display_names/migration.sql', import.meta.url),'utf8');
for(let iteration=0;iteration<2;iteration++) {
 await db.exec(sql);
 for(const [id,size,,,,,name,round] of cases) {
  const {rows:[actual]}=await db.query('SELECT g.name,g.phase,d.round FROM v1_tournament_groups g JOIN v1_tournament_match_details d ON d.group_id=g.id WHERE g.id=$1',[id]);
  assert.equal(actual.name,name,id);assert.equal(actual.round,round,id);assert.equal(actual.phase,size <= 8 ? 'quarter' : 'round16',id);
 }
 const {rows:[counts]}=await db.query('SELECT (SELECT count(*) FROM v1_tournament_groups)::int AS groups,(SELECT count(*) FROM v1_tournament_match_details)::int AS matches,(SELECT count(*) FROM v1_tournament_slots)::int AS slots');
 assert.deepEqual(counts,{groups:cases.length,matches:cases.length,slots:cases.reduce((sum,row)=>sum+row[1],0)});
}
console.log(`PASS: ${cases.length} persisted bracket scenarios; even 6+ names repaired; odd/flexible/custom names, rounds, phases, IDs/counts preserved; replay idempotent.`);
await db.close();
