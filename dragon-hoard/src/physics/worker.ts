import { Engine } from './engine.ts';
import type { FromWorker, ToWorker } from './protocol.ts';
import { initRapier } from './world.ts';

let engine: Engine | null = null;
const post = (m: FromWorker) => {
  const s = m.snap;
  (self as unknown as Worker).postMessage(m, [s.pos.buffer, s.quat.buffer, s.prevPos.buffer, s.prevQuat.buffer]);
};

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    await initRapier();
    engine = new Engine(msg.capacity, msg.opts, msg.count, msg.seed);
    post({ type: 'ready', snap: engine.snapshot(0, 0) });
  } else if (msg.type === 'step' && engine) {
    post({ type: 'state', snap: engine.run(msg.steps, msg.cmds) });
  }
};
