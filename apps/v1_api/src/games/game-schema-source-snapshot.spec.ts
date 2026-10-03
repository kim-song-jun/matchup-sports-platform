import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gameSchemaSourceManifest, verifyGameSchemaSourceSnapshot } from '../../test/fixtures/game-schema.fixture';

describe('game schema source snapshot without a database', () => {
  const schema = resolve(__dirname, '../../prisma/schema.prisma');
  const migration = resolve(__dirname, '../../prisma/migrations/20260729000100_v1_game_operations/migration.sql');
  let directory: string;
  let candidates: { schema: string; migration: string };

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'teameet-game-schema-source-unit-'));
    candidates = { schema: join(directory, 'schema.prisma'), migration: join(directory, 'migration.sql') };
    copyFileSync(schema, candidates.schema);
    copyFileSync(migration, candidates.migration);
  });

  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  it('binds the committed schema and historical migration to their reviewed manifest', () => {
    expect(() => verifyGameSchemaSourceSnapshot(gameSchemaSourceManifest, candidates)).not.toThrow();
  });

  it('accepts repeated CRLF materialization of the same sources', () => {
    for (const path of Object.values(candidates)) {
      // The second pass starts with CRLF, as an autocrlf checkout can.
      for (let pass = 0; pass < 2; pass += 1) {
        writeFileSync(path, readFileSync(path, 'utf8').replaceAll('\r\n', '\n').replaceAll('\n', '\r\n'));
      }
    }
    expect(() => verifyGameSchemaSourceSnapshot(gameSchemaSourceManifest, candidates)).not.toThrow();
  });

  it('rejects unreviewed schema bytes before any migration verification', () => {
    writeFileSync(candidates.schema, `${readFileSync(candidates.schema, 'utf8')}\n// unreviewed schema mutation\n`);
    expect(() => verifyGameSchemaSourceSnapshot(gameSchemaSourceManifest, candidates)).toThrow(
      'SOURCE_SNAPSHOT_DRIFT: schema bytes differ from bound source snapshot',
    );
  });

  it('rejects mutation of the historical migration even when the schema is unchanged', () => {
    writeFileSync(candidates.migration, `${readFileSync(candidates.migration, 'utf8')}\n-- unreviewed migration mutation\n`);
    expect(() => verifyGameSchemaSourceSnapshot(gameSchemaSourceManifest, candidates)).toThrow(
      'SOURCE_SNAPSHOT_DRIFT: migration bytes differ from bound source snapshot',
    );
  });

  it('does not hide an unreviewed schema mutation during CRLF normalization', () => {
    writeFileSync(candidates.schema, `${readFileSync(candidates.schema, 'utf8').replaceAll('\r\n', '\n').replaceAll('\n', '\r\n')}\r\n// unreviewed schema mutation\r\n`);
    expect(() => verifyGameSchemaSourceSnapshot(gameSchemaSourceManifest, candidates)).toThrow(
      'SOURCE_SNAPSHOT_DRIFT: schema bytes differ from bound source snapshot',
    );
  });
});
