/**
 * ServoTuningTab
 *
 * Standalone servo tuning tab for MspConfigView.
 * Handles initialization of servo support check and loads servo configs from FC.
 * Auto-defaults to 'traditional' preset if no aircraft type is detected.
 */

import { useEffect } from 'react';
import { useServoWizardStore } from '../../stores/servo-wizard-store';
import { ServoTuningView } from '../servo-wizard/tuning';
import { CircleSlash } from 'lucide-react';

export default function ServoTuningTab() {
  const {
    checkServoSupport,
    servoSupported,
    isCheckingSupport,
    supportError,
    isMultirotor,
    reset,
  } = useServoWizardStore();

  // Initialize on mount - check support and load from FC
  useEffect(() => {
    checkServoSupport();
    // Reset on unmount to clean up polling
    return () => {
      reset();
    };
  }, [checkServoSupport, reset]);

  // Loading state
  if (isCheckingSupport || servoSupported === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] h-full gap-4 text-content-secondary">
        <svg
          className="animate-spin h-8 w-8 text-blue-500"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          ></circle>
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        <p className="text-sm">正在检查舵机支持...</p>
      </div>
    );
  }

  // Servo not supported
  if (!servoSupported) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-8 max-w-lg mx-auto text-center">
        <CircleSlash className="w-16 h-16 text-content-secondary" />
        <div>
          <h2 className="text-xl font-bold text-content mb-2">
            {isMultirotor ? '飞控已配置为多旋翼' : '舵机设置不可用'}
          </h2>
          <p className="text-content-secondary">{supportError || '当前板配置下没有可用的舵机输出。'}</p>
        </div>

        <div className="bg-surface border rounded-xl p-4 text-left">
          <p className="text-sm text-content font-medium mb-2">舵机调试用于：</p>
          <ul className="text-xs text-content-secondary space-y-1 list-disc list-inside">
            <li><strong>固定翼</strong> — 副翼、升降舵、方向舵</li>
            <li><strong>飞翼</strong> — 升降副翼混控</li>
            <li><strong>云台舵机</strong> — 相机平移/俯仰（需要兼容的板）</li>
          </ul>
        </div>

        {isMultirotor && (
          <div className="bg-blue-500/10 border-blue-500/30 rounded-xl p-4 w-full">
            <p className="text-sm text-blue-300">
              要将此板配置为固定翼，请在机型选择中使用舵机向导，或在 iNav Configurator 中更改机型。
            </p>
          </div>
        )}
      </div>
    );
  }

  // Render the tuning view
  return <ServoTuningView />;
}
