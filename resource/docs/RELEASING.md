# Releasing

How Relay's tag-driven release pipeline works. See the [README](../../README.md) for an overview of the app.

Releases are tag-driven. From `main`:

```bash
pnpm release:patch   # or release:minor / release:major
```

That bumps the version (`package.json` + `app.json`, including `android.versionCode` and `ios.buildNumber`), commits, tags `v<version>`, and pushes. GitHub Actions then runs the quality gate, builds the Android APK and the unsigned iOS IPA — failing if the tag does not match the version in `app.json` — and publishes both to the Releases page with auto-generated notes. The workflow can also be run manually from the Actions tab as a dry run: it builds both artifacts but skips the release step.

The script pushes to the `github` remote when one exists, otherwise `origin`. If you keep Gitea as `origin`, add the GitHub remote once:

```bash
git remote add github git@github.com:beecode-rs/relay.git
```

## One-time Android signing setup

CI signs release APKs with a keystore kept in GitHub secrets. Generate it once and keep the original safe (it is gitignored via `*.jks`) — without it, future releases cannot install as updates over existing installs:

```bash
keytool -genkey -v -keystore relay-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias relay-upload
base64 -i relay-upload.jks
```

Then add these secrets to the GitHub repository:

| Secret | Value |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | the base64 output above |
| `RELAY_ANDROID_STORE_PASSWORD` | the keystore password |
| `RELAY_ANDROID_KEY_ALIAS` | `relay-upload` |
| `RELAY_ANDROID_KEY_PASSWORD` | the key password |
