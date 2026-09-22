import { SimulationParams, SimulationResult, WavefieldSnapshot, WaveData } from './types';

function ricker(t: number, f0: number, t0: number): number {
  const arg = Math.PI * f0 * (t - t0);
  return (1 - 2 * arg * arg) * Math.exp(-arg * arg);
}

export function defaultParams(): SimulationParams {
  const vp = 3500, vs = 2000, density = 2600;
  const mu = density * vs * vs;
  const lambda = density * vp * vp - 2 * mu;
  return { vp, vs, density, lambda, mu, sourceType: 'tectonic', magnitude: 5.0, depth: 15, epicenterLat: 1.2136, epicenterLon: -77.2811, duration: 60, dx: 100, dt: 0.02 };
}

export function computeLame(vp: number, vs: number, density: number) {
  const mu = density * vs * vs;
  const lambda = density * vp * vp - 2 * mu;
  return { lambda, mu };
}

/** Detect first arrival by STA threshold on signal, searching from startIdx */
function detectArrival(signal: number[], dt: number, threshold: number = 0.05, startIdx: number = 10): number {
  const maxVal = Math.max(...signal.map(Math.abs));
  if (maxVal < 1e-30) return 0;
  const trigger = maxVal * threshold;
  for (let i = Math.max(10, startIdx); i < signal.length; i++) {
    let sta = 0;
    for (let j = Math.max(0, i - 4); j <= i; j++) sta += Math.abs(signal[j]);
    sta /= 5;
    if (sta > trigger) return i * dt;
  }
  return 0;
}

/**
 * 2D Elastic Wave Equation — Finite Difference Method
 * ρ(∂²u/∂t²) = (λ+2μ)∇(∇·u) - μ∇×(∇×u) + f
 */
export function runFDM(
  params: SimulationParams,
  onProgress?: (step: number, total: number) => void
): SimulationResult {
  const { vp, vs, density, lambda, mu, magnitude, depth, sourceType, duration } = params;
  let { dx, dt } = params;

  // ── Grid sizing: nz must accommodate the requested depth ──
  const absThick = 15;
  const NX_MAX = 200;
  const NZ_MAX = 400;

  const nx = Math.min(NX_MAX, Math.max(60, Math.floor(20000 / dx)));

  // Source should sit within top 70% of nz (leaving 30% for propagation + sponge below)
  const depthNodes = Math.floor((depth * 1000) / dx);
  // nz must fit: source at 70% → nz >= depthNodes / 0.7
  const nzRequired = Math.max(40, Math.ceil(depthNodes / 0.7) + absThick);
  let dxAdjusted = false;
  let nz: number;

  if (nzRequired <= NZ_MAX) {
    nz = Math.min(NZ_MAX, Math.max(40, nzRequired));
  } else {
    // Depth exceeds representable range: increase dx to fit
    // depthNodes_new / 0.7 + absThick <= NZ_MAX → depthNodes_new <= (NZ_MAX - absThick) * 0.7
    const maxDepthNodes = Math.floor((NZ_MAX - absThick) * 0.7);
    const newDx = Math.ceil((depth * 1000) / maxDepthNodes);
    dx = newDx;
    dxAdjusted = true;
    nz = NZ_MAX;
  }

  // CFL check (must re-check after possible dx change)
  const cflLimit = dx / (vp * Math.SQRT2);
  let dtAdjusted = false;
  if (dt > cflLimit) { dt = cflLimit * 0.9; dtAdjusted = true; }

  const totalSteps = Math.min(6000, Math.floor(duration / dt));
  const snapshotInterval = Math.max(1, Math.floor(totalSteps / 80));

  // Source position: depth in nodes, clamped to 70% of nz
  const srcX = Math.floor(nx / 2);
  const srcZ = Math.min(Math.floor(nz * 0.7), Math.max(5, Math.floor((depth * 1000) / dx)));

  // Receiver on surface
  const recOffset = Math.min(Math.floor(nx * 0.15), Math.floor(3000 / dx));
  const recX = Math.min(nx - 15, srcX + recOffset);
  const recZ = 2;

  const f0 = sourceType === 'volcanic' ? 2.0 : 3.5;
  const t0 = 1.5 / f0;
  const ampScale = Math.pow(10, magnitude - 2) * 1e4;

  const size = nx * nz;
  let uxPrev = new Float32Array(size);
  let uxCurr = new Float32Array(size);
  let uxNext = new Float32Array(size);
  let uzPrev = new Float32Array(size);
  let uzCurr = new Float32Array(size);
  let uzNext = new Float32Array(size);

  // Absorbing boundary (sponge)
  const absCoeff = new Float32Array(size);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      let d = 1.0;
      if (i < absThick) d *= (i / absThick) * (i / absThick);
      if (i >= nx - absThick) d *= ((nx - 1 - i) / absThick) * ((nx - 1 - i) / absThick);
      if (j >= nz - absThick) d *= ((nz - 1 - j) / absThick) * ((nz - 1 - j) / absThick);
      absCoeff[i * nz + j] = d;
    }
  }

  const dx2 = dx * dx;
  const dt2 = dt * dt;
  const c1 = (lambda + 2 * mu) / density;
  const c2 = mu / density;
  const c3 = (lambda + mu) / density;

  const timeArr: number[] = [];
  const northArr: number[] = [];
  const eastArr: number[] = [];
  const vertArr: number[] = [];
  const snapshots: WavefieldSnapshot[] = [];

  const idx = (i: number, j: number) => i * nz + j;

  for (let step = 0; step < totalSteps; step++) {
    const t = step * dt;

    // Distributed source injection
    const srcVal = ricker(t, f0, t0) * ampScale;
    const spread = 2;
    for (let di = -spread; di <= spread; di++) {
      for (let dj = -spread; dj <= spread; dj++) {
        const si = srcX + di, sj = srcZ + dj;
        if (si < 2 || si >= nx - 2 || sj < 2 || sj >= nz - 2) continue;
        const dist = Math.sqrt(di * di + dj * dj);
        const weight = Math.exp(-dist * dist / (spread * 0.8));
        const sIdx = idx(si, sj);

        if (sourceType === 'tectonic') {
          uxCurr[sIdx] += srcVal * weight * 0.8 * (di !== 0 ? Math.sign(di) * 0.3 : 1);
          uzCurr[sIdx] += srcVal * weight * 1.0;
        } else {
          const angle = Math.atan2(dj, di);
          uxCurr[sIdx] += srcVal * weight * 0.4 * Math.cos(angle);
          uzCurr[sIdx] += srcVal * weight * 1.0;
        }
      }
    }

    // FDM update interior (j starts at 1 to update row below surface)
    for (let i = 2; i < nx - 2; i++) {
      for (let j = 1; j < nz - 2; j++) {
        const ij = idx(i, j);
        const d2ux_dx2 = (uxCurr[idx(i + 1, j)] - 2 * uxCurr[ij] + uxCurr[idx(i - 1, j)]) / dx2;
        const d2ux_dz2 = (uxCurr[idx(i, j + 1)] - 2 * uxCurr[ij] + uxCurr[idx(i, j - 1)]) / dx2;
        const d2uz_dx2 = (uzCurr[idx(i + 1, j)] - 2 * uzCurr[ij] + uzCurr[idx(i - 1, j)]) / dx2;
        const d2uz_dz2 = (uzCurr[idx(i, j + 1)] - 2 * uzCurr[ij] + uzCurr[idx(i, j - 1)]) / dx2;
        const d2uz_dxdz = (uzCurr[idx(i+1,j+1)] - uzCurr[idx(i+1,j-1)] - uzCurr[idx(i-1,j+1)] + uzCurr[idx(i-1,j-1)]) / (4 * dx2);
        const d2ux_dxdz = (uxCurr[idx(i+1,j+1)] - uxCurr[idx(i+1,j-1)] - uxCurr[idx(i-1,j+1)] + uxCurr[idx(i-1,j-1)]) / (4 * dx2);

        uxNext[ij] = 2 * uxCurr[ij] - uxPrev[ij] + dt2 * (c1 * d2ux_dx2 + c2 * d2ux_dz2 + c3 * d2uz_dxdz);
        uzNext[ij] = 2 * uzCurr[ij] - uzPrev[ij] + dt2 * (c2 * d2uz_dx2 + c1 * d2uz_dz2 + c3 * d2ux_dxdz);
      }
    }

    // Stress-free surface at z=0
    for (let i = 1; i < nx - 1; i++) {
      uzNext[idx(i, 0)] = -uzNext[idx(i, 1)];
      uxNext[idx(i, 0)] = uxNext[idx(i, 1)];
    }

    // Absorbing boundaries
    for (let k = 0; k < size; k++) {
      uxNext[k] *= absCoeff[k];
      uzNext[k] *= absCoeff[k];
    }

    // Swap buffers
    const tux = uxPrev; uxPrev = uxCurr; uxCurr = uxNext; uxNext = tux;
    const tuz = uzPrev; uzPrev = uzCurr; uzCurr = uzNext; uzNext = tuz;

    // Record at receiver
    const recIdx = idx(recX, recZ);
    const uxVal = uxCurr[recIdx];
    const uzVal = uzCurr[recIdx];
    const eastVal = uxVal;
    const recIdxUp = idx(recX, Math.max(1, recZ - 2));
    const recIdxDown = idx(recX, Math.min(nz - 2, recZ + 2));
    const transverseVal = (uxCurr[recIdxUp] - uxCurr[recIdxDown]) / (4 * dx) * dx * 0.5;

    timeArr.push(t);
    northArr.push(transverseVal);
    eastArr.push(eastVal);
    vertArr.push(uzVal);

    // Snapshots
    if (step % snapshotInterval === 0) {
      const snap = new Float32Array(size * 3);
      for (let k = 0; k < size; k++) {
        snap[k] = uxCurr[k];
        snap[size + k] = uzCurr[k];
        snap[size * 2 + k] = Math.sqrt(uxCurr[k] * uxCurr[k] + uzCurr[k] * uzCurr[k]);
      }
      snapshots.push({ time: t, field: snap, nx, nz });
    }

    if (onProgress && step % 100 === 0) onProgress(step, totalSteps);
  }

  const allAmps = [...northArr, ...eastArr, ...vertArr].map(Math.abs);
  const maxAmplitude = Math.max(...allAmps, 1e-30);

  // ── Arrival detection ──
  const distM = Math.sqrt(Math.pow((recX - srcX) * dx, 2) + Math.pow((recZ - srcZ) * dx, 2));
  const pTheoreticalTime = distM / vp + t0;
  const sTheoreticalTime = distM / vs + t0;
  const vpVsRatio = vp / vs;

  // P-arrival: detect on vertical component (15% tolerance)
  const pArrivalDet = detectArrival(vertArr, dt, 0.03, 10);
  let pArrival: number;
  let pArrivalDetected: boolean;
  if (pArrivalDet > 0) {
    const pRelErr = Math.abs(pArrivalDet - pTheoreticalTime) / pTheoreticalTime;
    if (pRelErr < 0.15) {
      pArrival = pArrivalDet;
      pArrivalDetected = true;
    } else {
      pArrival = pTheoreticalTime;
      pArrivalDetected = false;
    }
  } else {
    pArrival = pTheoreticalTime;
    pArrivalDetected = false;
  }

  // S-arrival: search AFTER P-arrival + wavelet duration (several periods of 1/f0)
  const waveletDuration = 3.0 / f0;
  const sSearchStartTime = pArrival + waveletDuration;
  const sSearchStartIdx = Math.max(10, Math.floor(sSearchStartTime / dt));
  const sArrivalDet = detectArrival(eastArr, dt, 0.05, sSearchStartIdx);
  let sArrival: number;
  let sArrivalDetected: boolean;
  if (sArrivalDet > 0) {
    // Validate: 15% tolerance against theoretical
    const sRelErr = Math.abs(sArrivalDet - sTheoreticalTime) / sTheoreticalTime;
    // Coherence check: (S - t0)/(P - t0) should be close to Vp/Vs
    const detectedRatio = (sArrivalDet - t0) / (pArrival - t0 + 1e-30);
    const ratioRelErr = Math.abs(detectedRatio - vpVsRatio) / vpVsRatio;
    if (sRelErr < 0.15 && ratioRelErr < 0.15) {
      sArrival = sArrivalDet;
      sArrivalDetected = true;
    } else {
      sArrival = sTheoreticalTime;
      sArrivalDetected = false;
    }
  } else {
    sArrival = sTheoreticalTime;
    sArrivalDetected = false;
  }

  // ── Numerical dispersion metric ──
  // Minimum wavelength: Vs / f_max, where f_max ≈ 2.5 * f0 for Ricker wavelet
  const fMax = 2.5 * f0;
  const lambdaMin = vs / fMax;
  const pointsPerWavelength = lambdaMin / dx;

  // Downsample
  const maxPoints = 3000;
  let waveData: WaveData;
  if (timeArr.length > maxPoints) {
    const s = Math.ceil(timeArr.length / maxPoints);
    waveData = {
      time: timeArr.filter((_, i) => i % s === 0),
      north: northArr.filter((_, i) => i % s === 0),
      east: eastArr.filter((_, i) => i % s === 0),
      vertical: vertArr.filter((_, i) => i % s === 0),
    };
  } else {
    waveData = { time: timeArr, north: northArr, east: eastArr, vertical: vertArr };
  }

  return {
    waveData, snapshots, maxAmplitude, duration: params.duration, dominantFrequency: f0,
    params: { ...params, dx, dt },
    gridInfo: { nx, nz, dx, dt, dtAdjusted, dxAdjusted, totalSteps, receiverX: recX, receiverZ: recZ, sourceX: srcX, sourceZ: srcZ, pointsPerWavelength },
    pArrival, sArrival, pArrivalDetected, sArrivalDetected,
  };
}
