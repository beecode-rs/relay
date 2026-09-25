// TODO: Remove when @xterm/headless stops reading navigator.userAgent/navigator.platform at module load — React Native's navigator provides neither, so the import crashes with "Cannot read property 'includes' of undefined"
type NavigatorStrings = {
  userAgent?: string;
  platform?: string;
};

const navigatorStrings = (globalThis as { navigator?: NavigatorStrings }).navigator;

if (navigatorStrings !== undefined) {
  if (navigatorStrings.userAgent === undefined) {
    navigatorStrings.userAgent = 'ReactNative';
  }
  if (navigatorStrings.platform === undefined) {
    navigatorStrings.platform = 'ReactNative';
  }
}
