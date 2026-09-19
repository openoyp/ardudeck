import { describe, it, expect } from 'vitest';
import { accelCalibrationState, accelCalibrationNote } from './accel-calibration-state';

const from = (params: Record<string, number>) => (name: string) => params[name];

const calibrated = {
  INS_ACC_ID: 2621450,
  INS_ACCOFFS_X: 0.12, INS_ACCOFFS_Y: -0.04, INS_ACCOFFS_Z: 0.31,
  INS_ACCSCAL_X: 1.001, INS_ACCSCAL_Y: 0.998, INS_ACCSCAL_Z: 1.004,
};

describe('does the board have a 3D accel calibration', () => {
  it('says yes when offsets and scales are stored', () => {
    expect(accelCalibrationState(from(calibrated))).toEqual({
      calibrated: true, missing: [], unknown: false,
    });
  });

  // The case that started this: a level calibration writes AHRS_TRIM_* and
  // leaves these at zero, so the arming check still refuses.
  it('says no when only the level calibration was run', () => {
    const state = accelCalibrationState(from({
      INS_ACC_ID: 2621450,
      INS_ACCOFFS_X: 0, INS_ACCOFFS_Y: 0, INS_ACCOFFS_Z: 0,
      INS_ACCSCAL_X: 0, INS_ACCSCAL_Y: 0, INS_ACCSCAL_Z: 0,
      AHRS_TRIM_X: 0.01, AHRS_TRIM_Y: -0.02,
    }));
    expect(state.calibrated).toBe(false);
    expect(state.missing).toEqual([1]);
    expect(accelCalibrationNote(state)).toContain('6-point');
  });

  it('names every instance that is missing it', () => {
    const state = accelCalibrationState(from({
      ...calibrated,
      INS_ACC2_ID: 2621451,
      INS_ACC2OFFS_X: 0, INS_ACC2OFFS_Y: 0, INS_ACC2OFFS_Z: 0,
      INS_ACC2SCAL_X: 1, INS_ACC2SCAL_Y: 1, INS_ACC2SCAL_Z: 1,
    }));
    expect(state.missing).toEqual([2]);
    expect(accelCalibrationNote(state)).toContain('Accelerometer 2');
  });

  it('ignores instances the board does not have', () => {
    const state = accelCalibrationState(from({ ...calibrated, INS_ACC2_ID: 0 }));
    expect(state.calibrated).toBe(true);
  });

  it('says nothing useful before the parameters arrive', () => {
    const state = accelCalibrationState(from({}));
    expect(state.unknown).toBe(true);
    expect(accelCalibrationNote(state)).toBeNull();
  });
});
