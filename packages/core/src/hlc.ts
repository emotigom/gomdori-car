/**
 * Hybrid logical clock + ULID — the two primitives that let any node
 * (cloud region, edge isolate, phone, laptop offline) mint ids and order
 * writes without a central coordinator.
 *
 * HLC string format: `<ms:13 digits>:<counter:4 hex>:<node>` — sorts lexically
 * in causal order, so `a > b` on strings is the LWW comparison.
 */

export class Hlc {
  private last = 0;
  private counter = 0;
  readonly node: string;
  private now: () => number;
  // No TS parameter properties: the code must run under Node's type stripping.
  constructor(node: string, now: () => number = () => Date.now()) {
    this.node = node;
    this.now = now;
  }

  tick(): string {
    const t = this.now();
    if (t > this.last) {
      this.last = t;
      this.counter = 0;
    } else {
      this.counter++;
    }
    return format(this.last, this.counter, this.node);
  }

  /** Merge a remote clock so our next tick is causally after it. */
  receive(remote: string): void {
    const r = parse(remote);
    if (!r) return;
    const t = this.now();
    const max = Math.max(t, this.last, r.ms);
    if (max === this.last && max === r.ms) this.counter = Math.max(this.counter, r.counter) + 1;
    else if (max === this.last) this.counter++;
    else if (max === r.ms) this.counter = r.counter + 1;
    else this.counter = 0;
    this.last = max;
  }
}

function format(ms: number, counter: number, node: string): string {
  return `${String(ms).padStart(13, '0')}:${counter.toString(16).padStart(4, '0')}:${node}`;
}

export function parse(h: string): { ms: number; counter: number; node: string } | null {
  const m = /^(\d{13}):([0-9a-f]{4}):(.+)$/.exec(h);
  if (!m) return null;
  return { ms: Number(m[1]), counter: parseInt(m[2]!, 16), node: m[3]! };
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** ULID: 48-bit time + 80-bit randomness, Crockford base32, lexically sortable. */
export function ulid(time = Date.now(), rand: () => number = Math.random): string {
  let t = time;
  let out = '';
  for (let i = 0; i < 10; i++) {
    out = CROCKFORD[t % 32]! + out;
    t = Math.floor(t / 32);
  }
  for (let i = 0; i < 16; i++) out += CROCKFORD[Math.floor(rand() * 32)]!;
  return out;
}
