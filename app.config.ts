import { withStringsXml } from '@expo/config-plugins';
import type { Resources } from '@expo/config-plugins/build/android';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const developmentNameSuffix = ' (dev)';
const developmentIdSuffix = '.dev';
const androidAppNameResource = 'app_name';
const fallbackAppName = 'Relay';
const fallbackAppSlug = 'relay';
const fallbackAppBundleId = 'com.milos.becode.rs.relay';

const isDevelopmentBuild = (): boolean => {
  return process.env.APP_VARIANT === 'dev' || process.env.APP_VARIANT === 'development';
};

const toAppName = (params: { config: ConfigContext['config'] }): string => {
  return params.config.name ?? fallbackAppName;
};

const toAppSlug = (params: { config: ConfigContext['config'] }): string => {
  return params.config.slug ?? fallbackAppSlug;
};

const toDevelopmentDisplayName = (params: { name: string }): string => {
  return `${params.name}${developmentNameSuffix}`;
};

const toDevelopmentAppBundleId = (params: { appBundleId?: string }): string => {
  return `${params.appBundleId ?? fallbackAppBundleId}${developmentIdSuffix}`;
};

const toAppNameResourceItem = (params: { displayName: string }): Resources.ResourceItemXML => {
  return { $: { name: androidAppNameResource }, _: params.displayName };
};

const withAndroidDisplayName = (params: { config: ExpoConfig; displayName: string }): ExpoConfig => {
  const { config, displayName } = params;

  return withStringsXml(config, (modConfig) => {
    modConfig.modResults.resources.string = [
      ...(modConfig.modResults.resources.string ?? []).filter((item) => {
        return item.$.name !== androidAppNameResource;
      }),
      toAppNameResourceItem({ displayName }),
    ];

    return modConfig;
  });
};

export default ({ config }: ConfigContext): ExpoConfig => {
  const name = toAppName({ config });
  const expoConfig: ExpoConfig = { ...config, name, slug: toAppSlug({ config }) };

  if (!isDevelopmentBuild()) {
    return expoConfig;
  }

  const displayName = toDevelopmentDisplayName({ name });

  return withAndroidDisplayName({
    config: {
      ...expoConfig,
      ios: {
        ...expoConfig.ios,
        bundleIdentifier: toDevelopmentAppBundleId({ appBundleId: expoConfig.ios?.bundleIdentifier }),
        infoPlist: { ...expoConfig.ios?.infoPlist, CFBundleDisplayName: displayName },
      },
      android: {
        ...expoConfig.android,
        package: toDevelopmentAppBundleId({ appBundleId: expoConfig.android?.package }),
      },
    },
    displayName,
  });
};
