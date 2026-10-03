import { readFileSync, writeFileSync } from 'node:fs'

const gradlePropertiesPath = new URL('../android/gradle.properties', import.meta.url)

// expo prebuild regenerates gradle.properties with template defaults that break
// or slow down release builds: a 2 GB Gradle heap (OutOfMemoryError during
// mergeReleaseJavaResource / mergeDexRelease) and four ABIs when the app only
// ships to arm64 phones (Samsung S26 class devices).
const properties = {
  'org.gradle.jvmargs': '-Xmx4096m -XX:MaxMetaspaceSize=1024m',
  'org.gradle.caching': 'true',
  reactNativeArchitectures: 'arm64-v8a',
  'android.enablePngCrunchInReleaseBuilds': 'false',
}

const source = readFileSync(gradlePropertiesPath, 'utf8')
const lines = source.split('\n')
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
