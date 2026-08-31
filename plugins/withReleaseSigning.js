const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Adds a `release` signing config to android/app/build.gradle whose credentials
 * come from environment variables:
 *
 *   ANDROID_KEYSTORE_PATH       path to the keystore, relative to android/app/
 *   ANDROID_KEYSTORE_PASSWORD   store password
 *   ANDROID_KEY_ALIAS           key alias
 *   ANDROID_KEY_PASSWORD        key password
 *
 * The `release` build type uses this config only when ANDROID_KEYSTORE_PATH is
 * set (i.e. in CI). Locally, with the vars unset, it falls back to the debug
 * keystore exactly as the stock template does — so `expo run:android` and local
 * release builds keep working unchanged.
 *
 * Runs on every `expo prebuild`; the edits are idempotent.
 */
module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withReleaseSigning: unexpected non-groovy build.gradle');
    }
    let src = cfg.modResults.contents;
    if (src.includes('signingConfigs.release')) return cfg;

    const releaseConfig = [
      '        release {',
      "            def ksPath = System.getenv('ANDROID_KEYSTORE_PATH')",
      "            storeFile file(ksPath ?: 'release.keystore')",
      "            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')",
      "            keyAlias System.getenv('ANDROID_KEY_ALIAS')",
      "            keyPassword System.getenv('ANDROID_KEY_PASSWORD')",
      '        }',
      '        debug {',
    ].join('\n');

    src = src.replace(
      /^(\s*)signingConfigs \{\n\s*debug \{/m,
      `$1signingConfigs {\n${releaseConfig}`,
    );

    // Point the release build type at the release config when a keystore is provided.
    src = src.replace(
      /signingConfig signingConfigs\.debug(\n\s*def enableShrinkResources)/,
      "signingConfig (System.getenv('ANDROID_KEYSTORE_PATH') ? signingConfigs.release : signingConfigs.debug)$1",
    );

    if (!src.includes('signingConfigs.release')) {
      throw new Error(
        'withReleaseSigning: failed to patch build.gradle (Expo template changed?)',
      );
    }

    cfg.modResults.contents = src;
    return cfg;
  });
};
