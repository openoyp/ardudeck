export { AttitudePanel, AttitudeIndicator } from './AttitudePanel';
export { AltitudePanel } from './AltitudePanel';
export { SpeedPanel } from './SpeedPanel';
export { BatteryPanel } from './BatteryPanel';
export { GpsPanel } from './GpsPanel';
export { PositionPanel } from './PositionPanel';
export { VelocityPanel } from './VelocityPanel';
export { FlightModePanel } from './FlightModePanel';
export { FlightControlPanel } from './FlightControlPanel';
export { MapPanel } from './MapPanel';
export { MessagesPanel } from './MessagesPanel';
export { SafetyMonitorPanel } from './SafetyMonitorPanel';
export { NtripPanel } from './NtripPanel';
export { PreflightCheckCard } from '../prearm/PreflightCheckCard';
export { CameraPanel } from '../camera/CameraPanel';
export { JoystickPanel } from './JoystickPanel';

// Re-export mission panels for use in telemetry dashboard
// Note: MissionMapPanel not exported here - mission data now integrated into MapPanel
export { WaypointTablePanel } from '../mission/WaypointTablePanel';
export { AltitudeProfilePanel } from '../mission/AltitudeProfilePanel';

// SITL simulation panels
export { SitlEnvironmentDockPanel } from './SitlEnvironmentDockPanel';
export { SitlFailureDockPanel } from './SitlFailureDockPanel';

// Panel registry for dockview
export const PANEL_COMPONENTS = {
  // Telemetry panels
  attitude: { component: 'AttitudePanel', title: '姿态' },
  altitude: { component: 'AltitudePanel', title: '高度' },
  speed: { component: 'SpeedPanel', title: '速度' },
  battery: { component: 'BatteryPanel', title: '电池' },
  gps: { component: 'GpsPanel', title: 'GPS' },
  position: { component: 'PositionPanel', title: '位置' },
  velocity: { component: 'VelocityPanel', title: '速度矢量' },
  flightMode: { component: 'FlightModePanel', title: '飞行模式' },
  flightControl: { component: 'FlightControlPanel', title: '飞行控制' },
  map: { component: 'MapPanel', title: '地图' }, // Unified map with mission overlays
  camera: { component: 'CameraPanel', title: '视觉' },
  messages: { component: 'MessagesPanel', title: '消息' },
  safetyMonitor: { component: 'SafetyMonitorPanel', title: '安全监视' },
  joystick: { component: 'JoystickPanel', title: '摇杆' },
  rtk: { component: 'NtripPanel', title: 'RTK / NTRIP' },
  preflightCheck: { component: 'PreflightCheckCard', title: '起飞前检查' },
  // Mission panels (for monitoring during flight)
  // Note: missionMap removed - mission data now integrated into unified MapPanel
  waypoints: { component: 'WaypointTablePanel', title: '航点' },
  altitudeProfile: { component: 'AltitudeProfilePanel', title: '高度剖面' },
  // SITL simulation panels (only shown when SITL is running)
  sitlEnvironment: { component: 'SitlEnvironmentDockPanel', title: 'SITL 环境' },
  sitlFailures: { component: 'SitlFailureDockPanel', title: 'SITL 故障' },
} as const;

export type PanelId = keyof typeof PANEL_COMPONENTS;

// Actual component for each panel id, for callers that render a panel inline
// (e.g. MapPanel's in-map split second surface) rather than through dockview's
// string-keyed registry. Every panel is rendered prop-free, so the value is a
// plain component. `map` is intentionally absent: nothing embeds the map inside
// another panel. Keep this in sync with PANEL_COMPONENTS.
import type { ComponentType } from 'react';
import { AttitudePanel as AttitudePanelC } from './AttitudePanel';
import { AltitudePanel as AltitudePanelC } from './AltitudePanel';
import { SpeedPanel as SpeedPanelC } from './SpeedPanel';
import { BatteryPanel as BatteryPanelC } from './BatteryPanel';
import { GpsPanel as GpsPanelC } from './GpsPanel';
import { PositionPanel as PositionPanelC } from './PositionPanel';
import { VelocityPanel as VelocityPanelC } from './VelocityPanel';
import { FlightModePanel as FlightModePanelC } from './FlightModePanel';
import { FlightControlPanel as FlightControlPanelC } from './FlightControlPanel';
import { MessagesPanel as MessagesPanelC } from './MessagesPanel';
import { SafetyMonitorPanel as SafetyMonitorPanelC } from './SafetyMonitorPanel';
import { NtripPanel as NtripPanelC } from './NtripPanel';
import { PreflightCheckCard as PreflightCheckCardC } from '../prearm/PreflightCheckCard';
import { CameraPanel as CameraPanelC } from '../camera/CameraPanel';
import { JoystickPanel as JoystickPanelC } from './JoystickPanel';
import { WaypointTablePanel as WaypointTablePanelC } from '../mission/WaypointTablePanel';
import { AltitudeProfilePanel as AltitudeProfilePanelC } from '../mission/AltitudeProfilePanel';
import { SitlEnvironmentDockPanel as SitlEnvironmentDockPanelC } from './SitlEnvironmentDockPanel';
import { SitlFailureDockPanel as SitlFailureDockPanelC } from './SitlFailureDockPanel';

export const PANEL_RENDERERS: Partial<Record<PanelId, ComponentType>> = {
  attitude: AttitudePanelC,
  altitude: AltitudePanelC,
  speed: SpeedPanelC,
  battery: BatteryPanelC,
  gps: GpsPanelC,
  position: PositionPanelC,
  velocity: VelocityPanelC,
  flightMode: FlightModePanelC,
  flightControl: FlightControlPanelC,
  camera: CameraPanelC,
  messages: MessagesPanelC,
  safetyMonitor: SafetyMonitorPanelC,
  joystick: JoystickPanelC,
  rtk: NtripPanelC,
  preflightCheck: PreflightCheckCardC,
  waypoints: WaypointTablePanelC,
  altitudeProfile: AltitudeProfilePanelC,
  sitlEnvironment: SitlEnvironmentDockPanelC,
  sitlFailures: SitlFailureDockPanelC,
};
