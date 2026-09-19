import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSettingsStore } from '../../stores/settings-store';
import { speedValueFromMetersPerSecond, UNIT_LABELS } from '../../../shared/user-units.js';
import { PanelContainer, StatRow, formatNumber } from './panel-utils';

export function SpeedPanel() {
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const speedLabel = UNIT_LABELS.speed[speedUnit];

  return (
    <PanelContainer>
      <div className="space-y-1">
        <StatRow label="地速" value={formatNumber(speedValueFromMetersPerSecond(vfrHud.groundspeed, speedUnit), 1)} unit={speedLabel} highlight />
        <StatRow label="空速" value={formatNumber(speedValueFromMetersPerSecond(vfrHud.airspeed, speedUnit), 1)} unit={speedLabel} />
        <StatRow label="航向" value={formatNumber(vfrHud.heading, 0)} unit="°" />
        <StatRow label="油门" value={vfrHud.throttle} unit="%" />
      </div>
    </PanelContainer>
  );
}
