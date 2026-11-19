import { Prisma } from '@prisma/client';
import { PrivacyCipher } from './privacy-cipher';
import { PRIVACY_FIELDS, privacyLookupField } from './privacy-fields';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): value is RecordValue => Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
const models = new Map(Prisma.dmmf.datamodel.models.map((model) => [model.name, model]));
const mapItems = (value: unknown, run: (item: RecordValue) => unknown): unknown =>
  Array.isArray(value) ? value.map((item) => record(item) ? run(item) : item) : record(value) ? run(value) : value;

/** Explicit exact-match indexes; unsupported ciphertext predicates fail rather than silently returning incomplete data. */
export class PrivacyStorage {
  constructor(private readonly cipher: PrivacyCipher) {}

  args(model: string, input: unknown): unknown {
    if (!record(input)) return input;
    const out = { ...input };
    if (out.where) out.where = this.where(model, out.where);
    if (out.cursor) out.cursor = this.where(model, out.cursor);
    if (out.data) out.data = mapItems(out.data, (row) => this.data(model, row, record(out.where) && typeof out.where.id === 'string' ? out.where.id : undefined));
    for (const key of ['create', 'update']) if (out[key]) out[key] = mapItems(out[key], (row) => this.data(model, row));
    for (const key of ['select', 'include']) if (record(out[key])) {
      const selection = { ...out[key] };
      for (const field of models.get(model)?.fields ?? []) if (field.kind === 'object' && record(selection[field.name])) {
        selection[field.name] = this.args(field.type, selection[field.name]);
      }
      out[key] = selection;
    }
    for (const key of ['orderBy', 'distinct', 'by', 'having', '_min', '_max']) {
      if (this.referencesPrivateField(model, out[key])) throw new Error(`Encrypted field does not support ${key}`);
    }
    return out;
  }

  result(model: string, value: unknown): unknown {
    return mapItems(value, (row) => {
      const out: RecordValue = { ...row };
      for (const [field, kind] of Object.entries(PRIVACY_FIELDS[model] ?? {})) {
        delete out[privacyLookupField(field)];
        if (out[field] === null || out[field] === undefined) continue;
        if (typeof row.id !== 'string') throw new Error('Private record ID required in selection');
        const plain = this.cipher.open(model, field, row.id, out[field]);
        if (kind === 'text' && typeof plain !== 'string') throw new Error('Invalid private text');
        out[field] = plain;
      }
      for (const field of models.get(model)?.fields ?? []) if (field.kind === 'object' && out[field.name]) {
        out[field.name] = this.result(field.type, out[field.name]);
      }
      return out;
    });
  }

  data(model: string, row: RecordValue, contextId?: string): RecordValue {
    const out: RecordValue = { ...row };
    for (const [field, kind] of Object.entries(PRIVACY_FIELDS[model] ?? {})) {
      if (!(field in row)) continue;
      let value = row[field];
      if (kind === 'text' && record(value)) {
        if (Object.keys(value).length !== 1 || !('set' in value)) throw new Error('Unsupported private field update');
        value = value.set;
      }
      if (value === undefined) continue;
      if (value === null || value === Prisma.DbNull || value === Prisma.JsonNull) {
        out[field] = value;
        if (kind === 'text') out[privacyLookupField(field)] = null;
        continue;
      }
      if (kind === 'text' && typeof value !== 'string') throw new Error('Invalid private text');
      const recordId = typeof row.id === 'string' ? row.id : contextId;
      if (!recordId || contextId && recordId !== contextId) throw new Error('Private record ID required for write');
      out[field] = this.cipher.seal(model, field, recordId, value);
      if (kind === 'text') out[privacyLookupField(field)] = this.cipher.lookup(model, field, value as string);
    }
    for (const field of models.get(model)?.fields ?? []) {
      const nested = row[field.name];
      if (field.kind === 'object' && record(nested)) out[field.name] = this.nested(field.type, nested);
    }
    return out;
  }

  private nested(model: string, input: RecordValue): RecordValue {
    const out = { ...input };
    for (const key of ['create', 'createMany']) if (out[key]) {
      out[key] = key === 'createMany' && record(out[key])
        ? { ...out[key], data: mapItems(out[key].data, (row) => this.data(model, row)) }
        : mapItems(out[key], (row) => this.data(model, row));
    }
    for (const key of ['connect', 'disconnect', 'set', 'delete', 'deleteMany']) if (record(out[key]) || Array.isArray(out[key])) {
      out[key] = mapItems(out[key], (where) => this.where(model, where));
    }
    for (const key of ['update', 'updateMany', 'upsert', 'connectOrCreate']) if (out[key]) {
      out[key] = mapItems(out[key], (value) => {
        if ('data' in value || 'create' in value || 'update' in value) return this.args(model, value);
        // A to-one nested update can use data directly, or a where/data envelope.
        return this.data(model, value);
      });
    }
    return out;
  }

  private where(model: string, input: unknown): unknown {
    if (!record(input)) return input;
    const out: RecordValue = {};
    for (const [key, value] of Object.entries(input)) {
      if (['AND', 'OR', 'NOT'].includes(key)) { out[key] = mapItems(value, (part) => this.where(model, part)); continue; }
      if (PRIVACY_FIELDS[model]?.[key]) {
        if (value === null || record(value) && Object.values(value).every((item) => item === null)) { out[key] = value; continue; }
        if (PRIVACY_FIELDS[model][key] !== 'text') throw new Error('Private JSON filtering is unavailable');
        out[privacyLookupField(key)] = this.predicate(model, key, value);
        continue;
      }
      const relation = models.get(model)?.fields.find((field) => field.name === key && field.kind === 'object');
      if (relation && record(value)) {
        const wrapped: RecordValue = {};
        for (const [operator, condition] of Object.entries(value)) {
          if (['is', 'isNot', 'some', 'every', 'none'].includes(operator)) wrapped[operator] = this.where(relation.type, condition);
        }
        out[key] = Object.keys(wrapped).length ? wrapped : this.where(relation.type, value);
        continue;
      }
      const compound = models.get(model)?.uniqueFields.find((fields) => fields.join('_') === key);
      if (compound && compound.some((field) => PRIVACY_FIELDS[model]?.[field]) && record(value)) {
        const renamed = compound.map((field) => PRIVACY_FIELDS[model]?.[field] ? privacyLookupField(field) : field).join('_');
        out[renamed] = this.where(model, value);
        continue;
      }
      out[key] = value;
    }
    return out;
  }

  private predicate(model: string, field: string, value: unknown): unknown {
    if (value === null) return null;
    if (typeof value === 'string') return this.cipher.lookup(model, field, value);
    if (!record(value)) throw new Error('Unsupported private field predicate');
    const out: RecordValue = {};
    for (const [operator, condition] of Object.entries(value)) {
      if (operator === 'mode' && /email/i.test(field) && condition === 'insensitive') continue;
      if (operator === 'equals' || operator === 'not') out[operator] = this.predicate(model, field, condition);
      else if ((operator === 'in' || operator === 'notIn') && Array.isArray(condition)) {
        out[operator] = condition.map((item) => this.predicate(model, field, item));
      } else throw new Error('Encrypted fields support exact matching only');
    }
    return out;
  }

  private referencesPrivateField(model: string, input: unknown): boolean {
    if (typeof input === 'string') return Boolean(PRIVACY_FIELDS[model]?.[input]);
    if (Array.isArray(input)) return input.some((part) => this.referencesPrivateField(model, part));
    if (!record(input)) return false;
    return Object.entries(input).some(([key, value]) => PRIVACY_FIELDS[model]?.[key]
      || this.referencesPrivateField(models.get(model)?.fields.find((field) => field.name === key)?.type ?? model, value));
  }
}
