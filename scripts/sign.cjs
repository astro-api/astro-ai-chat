const { execSync } = require('child_process')

exports.default = async function sign(configuration) {
  const appPath = configuration.path
  if (!appPath) return
  console.log('sign.cjs: signing', appPath)
  try {
    execSync(`codesign --deep --force --sign - "${appPath}"`, { stdio: 'inherit' })
    console.log('sign.cjs: done')
  } catch (e) {
    console.warn('sign.cjs: codesign failed (non-fatal):', e.message)
  }
}
