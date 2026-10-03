import { readFileSync, writeFileSync } from 'node:fs'

const gradlePropertiesPath = new URL('../android/gradle.properties', import.meta.url)
const buildGradlePath = new URL('../android/app/build.gradle', import.meta.url)

// expo prebuild regenerates the android folder with template defaults that
// break or slow down release builds: a 2 GB Gradle heap (OutOfMemoryError
// during mergeReleaseJavaResource / mergeDexRelease), four ABIs when the app
// only ships to arm64 phones (Samsung S26 class devices), and release lint
// vital checks that add minutes without catching JS-side regressions (JS lint
// already runs in the quality CI job). Build caching is disabled on purpose —
// on the first build after a fresh prebuild, cache restores triggered a
// mid-task "stale output" cleanup that deleted the JS bundle between Metro
// and hermesc/node and failed the build intermittently. The gradle
// invocations in CI and package.json also pass --no-build-cache as a hard
// guarantee.
const properties = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
  'org.gradle.caching': 'false',
  reactNativeArchitectures: 'arm64-v8a',
  'android.enablePngCrunchInReleaseBuilds': 'false',
}

const upsertGradleProperties = () => {
  const lines = readFileSync(gradlePropertiesPath, 'utf8').split('\n')
  let patched = 0

  for (const [key, value] of Object.entries(properties)) {
    const entry = `${key}=${value}`
    const index = lines.findIndex((line) => line.startsWith(`${key}=`))
    if (index === -1) {
      lines.push(entry)
      patched += 1
    } else if (lines[index] !== entry) {
      lines[index] = entry
      patched += 1
    }
  }

  let output = lines.join('\n')
  if (!output.endsWith('\n')) {
    output += '\n'
  }

  writeFileSync(gradlePropertiesPath, output)
  console.log(`patched android/gradle.properties (${patched} properties updated)`)
}

const disableReleaseLintChecks = () => {
  const source = readFileSync(buildGradlePath, 'utf8')

  if (source.includes('checkReleaseBuilds')) {
    console.log('android/app/build.gradle already disables release lint checks')
    return
  }

  const androidBlockStart = source.indexOf('android {\n')
  if (androidBlockStart === -1) {
    console.error('could not find the android block in android/app/build.gradle')
    console.error('the expo prebuild template may have changed — update scripts/patch-android-build.mjs')
    process.exit(1)
  }

  const insertionPoint = androidBlockStart + 'android {\n'.length
  const lintBlock = '    lint {\n        checkReleaseBuilds = false\n    }\n'
  writeFileSync(buildGradlePath, source.slice(0, insertionPoint) + lintBlock + source.slice(insertionPoint))
  console.log('patched android/app/build.gradle to skip release lint checks')
}

upsertGradleProperties()
disableReleaseLintChecks()
