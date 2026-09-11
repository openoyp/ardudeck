/**
 * Hangar APPS, which are not modules.
 *
 * A module is JavaScript this app loads into itself. An app is a separate native program that
 * the Hangar distributes and this app merely detects once it is on disk: no entry point, no
 * permissions, no manifest we parse, and a DIFFERENT BINARY PER PLATFORM.
 */

/** Node's own `process.platform` values, so nothing has to be mapped on the way out. */
export type AppPlatform = 'darwin' | 'win32' | 'linux';

/** 'archive' extracts in place and needs no privileges; 'installer' is a dmg/exe the user runs. */
export type AppReleaseKind = 'archive' | 'installer';

export interface HangarAppRelease {
  version: string;
  platform: AppPlatform;
  kind: AppReleaseKind;
  changelog: string | null;
  bundleSize: number;
  bundleHash: string;
  minAppVersion: string | null;
  createdAt: string;
}

export interface HangarApp {
  slug: string;
  name: string;
  description: string | null;
  authorName: string;
  category: string | null;
  iconUrl: string | null;
  downloads: number;
  latestVersion: string | null;
  /** Read off the released rows, so a platform whose build failed is not offered. */
  platforms: AppPlatform[];
}

export interface InstalledApp {
  slug: string;
  name: string;
  version: string;
  platform: AppPlatform;
  installPath: string;
  installedAt: string;
  bundleHash: string;
}

export interface AppProgress {
  stage: 'downloading' | 'verifying' | 'extracting' | 'done' | 'error';
  message: string;
  percent?: number;
}
