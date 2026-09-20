/**
 * MAVLink LED_CONTROL (msgid 186), which ArduPilot accepts only when
 * NTF_LED_OVERRIDE is 1 (RGBLed::handle_led_control checks the source first).
 *
 * Serialised here by hand because our generated registry maps 186 to the
 * MatrixPilot dialect's SERIAL_UDB_EXTRA_F20, so the common-dialect message is
 * absent. CRC_EXTRA 72 was computed with the standard MAVLink algorithm and
 * cross-checked by running the same code over HEARTBEAT, which produced its
 * documented 50.
 */

export const LED_CONTROL_ID = 186;
export const LED_CONTROL_CRC_EXTRA = 72;

/** Firmware reads custom_bytes[0..2] as RGB and [3] as an optional blink rate. */
export const LED_CONTROL_PATTERN_CUSTOM = 255;

export interface LedControlCommand {
  targetSystem: number;
  targetComponent: number;
  /** 0 addresses every LED the firmware drives. */
  instance: number;
  red: number;
  green: number;
  blue: number;
  /** 0 = solid. Above 0 the ring blinks at that many hertz. */
  rateHz: number;
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export function serializeLedControl(cmd: LedControlCommand): Uint8Array {
  const payload = new Uint8Array(29);
  payload[0] = clamp(cmd.targetSystem);
  payload[1] = clamp(cmd.targetComponent);
  payload[2] = clamp(cmd.instance);
  payload[3] = LED_CONTROL_PATTERN_CUSTOM;
  // 4 bytes when a rate is given, so the firmware takes the blink branch.
  payload[4] = cmd.rateHz > 0 ? 4 : 3;
  payload[5] = clamp(cmd.red);
  payload[6] = clamp(cmd.green);
  payload[7] = clamp(cmd.blue);
  payload[8] = clamp(cmd.rateHz);
  return payload;
}
