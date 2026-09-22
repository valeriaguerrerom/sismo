import { runFDM } from './simulation';
import { SimulationParams, WavefieldSnapshot } from './types';

interface WorkerMessage {
  type: 'run';
  params: SimulationParams;
}

interface ProgressMsg {
  type: 'progress';
  step: number;
  totalSteps: number;
  percent: number;
}

interface DoneMsg {
  type: 'done';
  result: {
    waveData: { time: number[]; north: number[]; east: number[]; vertical: number[] };
    // snapshots sent separately as transferable
    snapshotMeta: { time: number; nx: number; nz: number }[];
    snapshotFields: ArrayBuffer[];
    maxAmplitude: number;
    duration: number;
    dominantFrequency: number;
    params: SimulationParams;
    gridInfo: {
      nx: number; nz: number; dx: number; dt: number;
      dtAdjusted: boolean; dxAdjusted: boolean; totalSteps: number;
      receiverX: number; receiverZ: number;
      sourceX: number; sourceZ: number;
      pointsPerWavelength: number;
    };
    pArrival: number;
    sArrival: number;
    pArrivalDetected: boolean;
    sArrivalDetected: boolean;
  };
}

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  if (e.data.type === 'run') {
    const result = runFDM(e.data.params, (step, total) => {
      const msg: ProgressMsg = {
        type: 'progress',
        step,
        totalSteps: total,
        percent: Math.round((step / total) * 100),
      };
      self.postMessage(msg);
    });

    // Separate snapshot fields for transferable
    const snapshotMeta = result.snapshots.map((s: WavefieldSnapshot) => ({
      time: s.time, nx: s.nx, nz: s.nz,
    }));
    const snapshotFields = result.snapshots.map((s: WavefieldSnapshot) => s.field.buffer);

    const msg: DoneMsg = {
      type: 'done',
      result: {
        waveData: result.waveData,
        snapshotMeta,
        snapshotFields,
        maxAmplitude: result.maxAmplitude,
        duration: result.duration,
        dominantFrequency: result.dominantFrequency,
        params: result.params,
        gridInfo: result.gridInfo,
        pArrival: result.pArrival,
        sArrival: result.sArrival,
        pArrivalDetected: result.pArrivalDetected,
        sArrivalDetected: result.sArrivalDetected,
      },
    };

    self.postMessage(msg, { transfer: snapshotFields as unknown as Transferable[] });
  }
};
