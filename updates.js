const RELEASES_PAGE = 'https://github.com/theoverloadstudio/ChatGPTUsage/releases'
const LATEST_RELEASE_API = 'https://api.github.com/repos/theoverloadstudio/ChatGPTUsage/releases/latest'

function versionParts(value) {
  const match = typeof value === 'string' && /^v?(\d+)\.(\d+)\.(\d+)$/.exec(value)
  if (!match) return null
  const parts = match.slice(1).map(Number)
  return parts.every(Number.isSafeInteger) ? parts : null
}

function releaseStatus(output, installedVersion) {
  const split = output.lastIndexOf('\n')
  const code = output.slice(split + 1)
  if (split < 0) return {message:'Couldn’t read the response from GitHub.'}
  if (code === '404') return {message:'No stable release is published on GitHub yet.'}
  if (code === '403' || code === '429') return {message:'GitHub declined the check. Try again later.'}
  if (code !== '200') return {message:'GitHub couldn’t check for updates. Try again.'}

  let release
  try { release = JSON.parse(output.slice(0,split)) }
  catch (_) { return {message:'Couldn’t read the release from GitHub.'} }
  const latest = versionParts(release?.tag_name)
  const installed = versionParts(installedVersion)
  if (!latest || !installed || release.draft || release.prerelease) {
    return {message:'Couldn’t compare the installed and GitHub versions.'}
  }
  for (let i = 0; i < latest.length; i++) {
    if (latest[i] < installed[i]) break
    if (latest[i] > installed[i]) {
      return {
        message:'Version ' + latest.join('.') + ' is available.',
        url:RELEASES_PAGE + '/tag/' + encodeURIComponent(release.tag_name)
      }
    }
  }
  return {message:'You’re up to date (version ' + installedVersion + ').'}
}
