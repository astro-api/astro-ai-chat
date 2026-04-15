const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

/**
 * Ad-hoc code signing for macOS distribution without Apple Developer ID.
 *
 * On macOS 15+ (Sequoia) the OS enforces Team ID consistency across nested
 * frameworks. The fix is to add the `disable-library-validation` entitlement
 * so the main process is allowed to load frameworks signed by a different
 * (or absent) team.
 *
 * Sign order: dylibs → Helper .app bundles (deepest first) → Electron Framework → main .app
 */
exports.default = async function sign(configuration) {
  const appPath = configuration.path
  if (!appPath || process.platform !== 'darwin') return

  console.log('sign.cjs: signing', appPath)

  const entitlementsPath = path.join(__dirname, '..', 'build', 'entitlements.mac.plist')
  const hasEntitlements = fs.existsSync(entitlementsPath)

  const signTarget = (target, withEntitlements = false) => {
    const entFlag = withEntitlements && hasEntitlements
      ? `--entitlements "${entitlementsPath}"`
      : ''
    execSync(
      `codesign --force --sign - --timestamp=none ${entFlag} "${target}"`,
      { stdio: 'inherit' }
    )
  }

  // 1. Sign all .dylib and .so files
  try {
    const out = execSync(`find "${appPath}" \\( -name "*.dylib" -o -name "*.so" \\)`)
      .toString().trim()
    for (const f of out.split('\n').filter(Boolean)) {
      try { signTarget(f) } catch { /* non-fatal */ }
    }
  } catch { /* find returned nothing */ }

  // 2. Sign Helper .app bundles — deepest paths first
  try {
    const out = execSync(
      `find "${appPath}/Contents/Frameworks" -name "*.app" -maxdepth 3`
    ).toString().trim()
    const helpers = out.split('\n').filter(Boolean)
      .sort((a, b) => b.split(path.sep).length - a.split(path.sep).length)
    for (const h of helpers) {
      try { signTarget(h) } catch (e) { console.warn('sign.cjs: helper warning:', e.message) }
    }
  } catch { /* no helpers */ }

  // 3. Sign Electron Framework binary directly
  const frameworkBin = path.join(
    appPath,
    'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework'
  )
  if (fs.existsSync(frameworkBin)) {
    try { signTarget(frameworkBin) } catch (e) { console.warn('sign.cjs: framework warning:', e.message) }
  }

  // 4. Sign the main .app — WITH entitlements (disable-library-validation lives here)
  try {
    signTarget(appPath, true)
    console.log('sign.cjs: done')
  } catch (e) {
    console.error('sign.cjs: final sign failed:', e.message)
    throw e
  }
}
