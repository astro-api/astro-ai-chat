const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

/**
 * Ad-hoc code signing for macOS distribution without Apple Developer ID.
 * Signs all nested binaries/frameworks first (inside-out order),
 * then signs the .app bundle itself.
 *
 * Required because macOS Sequoia (15+) rejects --deep signing when
 * nested frameworks have mismatched Team IDs.
 */
exports.default = async function sign(configuration) {
  const appPath = configuration.path
  if (!appPath || process.platform !== 'darwin') return

  console.log('sign.cjs: signing', appPath)

  const sign = (target) => {
    execSync(
      `codesign --force --sign - --timestamp=none --preserve-metadata=identifier,entitlements,flags "${target}"`,
      { stdio: 'inherit' }
    )
  }

  // 1. Sign all .dylib and .so files
  const findOutput = execSync(`find "${appPath}" \\( -name "*.dylib" -o -name "*.so" \\)`)
    .toString()
    .trim()
  if (findOutput) {
    for (const f of findOutput.split('\n').filter(Boolean)) {
      try { sign(f) } catch { /* skip already-signed or non-binary */ }
    }
  }

  // 2. Sign all Helper .app bundles (Renderer, GPU, Plugin, etc.) — deepest first
  const helpersOutput = execSync(
    `find "${appPath}/Contents/Frameworks" -name "*.app" -maxdepth 3`
  )
    .toString()
    .trim()
  if (helpersOutput) {
    // Sort by path depth descending so inner bundles are signed before outer
    const helpers = helpersOutput
      .split('\n')
      .filter(Boolean)
      .sort((a, b) => b.split(path.sep).length - a.split(path.sep).length)
    for (const h of helpers) {
      try { sign(h) } catch (e) { console.warn('sign.cjs: helper warning:', e.message) }
    }
  }

  // 3. Sign the Electron Framework itself
  const frameworkPath = path.join(
    appPath,
    'Contents/Frameworks/Electron Framework.framework/Versions/A/Electron Framework'
  )
  if (fs.existsSync(frameworkPath)) {
    try { sign(frameworkPath) } catch (e) { console.warn('sign.cjs: framework warning:', e.message) }
  }

  // 4. Sign the main .app bundle last
  try {
    sign(appPath)
    console.log('sign.cjs: done')
  } catch (e) {
    console.error('sign.cjs: final sign failed:', e.message)
    throw e
  }
}
