/**
 * Built-in survey generator self-registration.
 *
 * Importing this module is sufficient to populate the survey generator
 * registry with the bundled generators (grid, crosshatch, circular,
 * spiral, perimeter-fill). The survey-store imports this once at
 * module load.
 */

import { registerSurveyGenerator } from '../generator-registry';
import { generateGrid } from './grid-generator';
import { generateCrosshatch } from './crosshatch-generator';
import { generateCircular } from './circular-generator';
import { generateSpiral } from './spiral-generator';
import { generatePerimeterFill } from './perimeter-fill-generator';
import { generateCorridor } from './corridor-generator';
import { generatePanorama } from './panorama-generator';

registerSurveyGenerator({
  id: 'builtin.grid',
  version: '1.0.0',
  displayName: '网格',
  description:
    '牛耕式割草机图案。平行扫描线横跨多边形,转弯带过冲。',
  capabilities: {
    supportsHoles: true,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generateGrid,
});

registerSurveyGenerator({
  id: 'builtin.crosshatch',
  version: '1.0.0',
  displayName: '交叉网格',
  description:
    '两组互相垂直的网格。照片密度更高,3D 重建效果优于单组网格。',
  capabilities: {
    supportsHoles: true,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generateCrosshatch,
});

registerSurveyGenerator({
  id: 'builtin.circular',
  version: '1.0.0',
  displayName: '环形',
  description: '以固定半径环绕兴趣点。',
  capabilities: {
    supportsHoles: false,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generateCircular,
});

registerSurveyGenerator({
  id: 'builtin.spiral',
  version: '1.0.0',
  displayName: '螺旋',
  description: '多边形内的内向或外向螺旋。',
  capabilities: {
    supportsHoles: false,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generateSpiral,
});

registerSurveyGenerator({
  id: 'builtin.corridor',
  version: '1.0.0',
  displayName: '走廊',
  description:
    '沿中心线的线状勘测(道路、铁路、电力线、管道)。平行条带,固定翼采用跑道式转弯或多旋翼原地转向。',
  capabilities: {
    supportsHoles: false,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generateCorridor,
});

registerSurveyGenerator({
  id: 'builtin.panorama',
  version: '1.0.0',
  displayName: '全景',
  description:
    '拍摄一条线(海岸线、悬崖、立面):绘制的线即主体,航线在其侧推算得出,相机全程朝向主体。',
  capabilities: {
    supportsHoles: false,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generatePanorama,
});

registerSurveyGenerator({
  id: 'builtin.perimeter-fill',
  version: '1.0.0',
  displayName: '轮廓填充',
  description: '先沿轮廓飞行 N 圈,再以网格填充内部。',
  capabilities: {
    supportsHoles: false,
    supportsWorkspace: false,
    requiresCamera: true,
    isAsync: false,
    isRemote: false,
  },
  generate: generatePerimeterFill,
});
