import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hlc, decodeCursor, encodeCursor, parsePartQuery, toSearchParams, ulid } from '../src/index.ts';

test('query round-trips and rejects junk', () => {
  const q = parsePartQuery(new URLSearchParams('q=oil&brand=1,2,x&status=hold,bogus&limit=99999&year=2018'));
  assert.deepEqual(q.brandId, [1, 2]);
  assert.deepEqual(q.status, ['hold']);
  assert.equal(q.limit, 500);
  assert.deepEqual(parsePartQuery(toSearchParams(q)), q);
});

test('cursor encodes and survives tampering', () => {
  assert.deepEqual(decodeCursor(encodeCursor([123, '01ABC'])), [123, '01ABC']);
  assert.equal(decodeCursor('%%%'), null);
});

test('HLC is monotonic and merges remote clocks', () => {
  let t = 1000;
  const a = new Hlc('a', () => t);
  const x = a.tick();
  const y = a.tick();
  assert.ok(y > x);
  a.receive('0000000005000:0003:b');
  assert.ok(a.tick() > '0000000005000:0003:b');
});

test('ULIDs sort by time', () => {
  assert.ok(ulid(2000) > ulid(1000));
  assert.equal(ulid().length, 26);
});
