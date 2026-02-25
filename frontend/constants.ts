
import { MasteringParams } from './types';

export const DEFAULT_PARAMS: MasteringParams = {
  tube_drive_amount: 0.42,
  low_contour_amount: 1.8,
  limiter_ceiling_db: -0.5,
  gain_adjustment_db: 0,
};

export const EFFECTIVE_ENGINE_CONSTANTS = {
  tubeTape: { flux: 0.35, harmonicDensity: 0.28 },
  eq: { hpfFreq: 30, midBellGain: 0.6, highShelfGain: 4.5, phaseShift: 12.3 },
  transientLimiter: { softClipThreshold: 0.99, limiterAttack: 5, gainReduction: 1.5, punchIndex: 0.87, crestReduction: 6 },
  neuroDrive: { hpfCutoff: 250, highShelfDrive: 4.5, wetMix: 0.22 },
  convergence: { phaseStability: 0.96 },
} as const;

export const BEATPORT_TARGETS = {
  LUFS: -8.5,
  DYNAMIC_RANGE: 6.0,
  STEREO_WIDTH: 0.75,
  SUB_BASS_ENERGY: -12.0,
};
