import { DeviceSource } from './device.ts';
import { EdgeSource } from './edge.ts';
import { HybridSource } from './hybrid.ts';

/** One router per tab. Edge = same origin (Vite proxy in dev, CDN/edge route in prod). */
export const data = new HybridSource(new EdgeSource(import.meta.env.VITE_API_BASE ?? ''), new DeviceSource());
export type { Mode } from './hybrid.ts';
