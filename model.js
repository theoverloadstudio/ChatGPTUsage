// Rate-limit model. A window is shown only when Codex reports it.
const clamp = x => Math.max(0, Math.min(1, x))
const whole = x => Math.round(x * 100) + '%'
function decodeLimits(result) {
  const explicit = result?.rateLimitsByLimitId?.codex
  const legacy = result?.rateLimits
  const bucket = explicit || (legacy && (!legacy.limitId || legacy.limitId === 'codex') ? legacy : null)
  const windows = [bucket?.primary, bucket?.secondary].filter(w =>
    w && Number.isFinite(w.usedPercent) && Number.isFinite(w.windowDurationMins) &&
    w.windowDurationMins > 0 && w.usedPercent >= 0
  )
  return {
    week: windows.find(w => w.windowDurationMins >= 6 * 1440 && w.windowDurationMins <= 8 * 1440) || null,
    session: windows.find(w => w.windowDurationMins < 1440) || null
  }
}
function measure(w, now) {
  if (!w) return null
  const used = clamp(w.usedPercent / 100)
  const hasReset = Number.isFinite(w.resetsAt) && w.resetsAt > 0
  const seconds = hasReset ? w.resetsAt - now : null
  const elapsed = hasReset ? 1 - clamp(seconds / (w.windowDurationMins * 60)) : null
  const past = hasReset && seconds <= 0
  return { used, seconds, elapsed, past, ahead: elapsed !== null && !past && used > elapsed + 0.04 }
}
function timeLeft(seconds) {
  if (seconds < 60) return '<1m'
  const minutes = Math.ceil(seconds / 60)
  const d = Math.floor(minutes / 1440)
  const h = Math.floor(minutes / 60) % 24
  const m = minutes % 60
  return d ? d + 'd ' + h + 'h' : h ? h + 'h ' + m + 'm' : m + 'm'
}
