import { readFileSync, writeFileSync } from 'node:fs'

const buildGradlePath = new URL('../android/app/build.gradle', import.meta.url)

const releaseSigningConfig = [
  '        release {',
  "            storeFile file(System.getenv('RELAY_ANDROID_STORE_FILE'))",
  "            storePassword System.getenv('RELAY_ANDROID_STORE_PASSWORD')",
  "            keyAlias System.getenv('RELAY_ANDROID_KEY_ALIAS')",
  "            keyPassword System.getenv('RELAY_ANDROID_KEY_PASSWORD')",
  '        }',
].join('\n')

const insertReleaseSigningConfig = (source) => {
  const signingConfigsStart = source.indexOf('    signingConfigs {')
  const signingConfigsEnd = source.indexOf('\n    }', signingConfigsStart)
  if (signingConfigsStart < 0 || signingConfigsEnd < 0) {
    return undefined
  }

  return `${source.slice(0, signingConfigsEnd)}\n${releaseSigningConfig}${source.slice(signingConfigsEnd)}`
}

const useReleaseSigningConfig = (source) => {
  const buildTypesStart = source.indexOf('    buildTypes {')
  const releaseBuildTypeStart = source.indexOf('        release {', buildTypesStart)
  const releaseBuildTypeEnd = source.indexOf('\n        }', releaseBuildTypeStart)
  if (buildTypesStart < 0 || releaseBuildTypeStart < 0 || releaseBuildTypeEnd < 0) {
    return undefined
  }

  const releaseBuildType = source
    .slice(releaseBuildTypeStart, releaseBuildTypeEnd)
    .replace('signingConfig signingConfigs.debug', 'signingConfig signingConfigs.release')

  return source.slice(0, releaseBuildTypeStart) + releaseBuildType + source.slice(releaseBuildTypeEnd)
}

const source = readFileSync(buildGradlePath, 'utf8')

if (source.includes('signingConfig signingConfigs.release')) {
  console.log('android release signing already configured')
  process.exit(0)
}

const patchedSource = useReleaseSigningConfig(insertReleaseSigningConfig(source))

if (patchedSource === undefined || !patchedSource.includes('signingConfig signingConfigs.release')) {
  console.error('could not find the signingConfigs block or release buildType in android/app/build.gradle')
  console.error('the expo prebuild template may have changed — update scripts/patch-android-release-signing.mjs')
  process.exit(1)
}

writeFileSync(buildGradlePath, patchedSource)
console.log('patched android/app/build.gradle to sign releases from RELAY_ANDROID_* env vars')
