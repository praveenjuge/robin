export function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return "just now"
  if (diff < hour) {
    const value = Math.round(diff / minute)
    return `${value}m ago`
  }
  if (diff < day) {
    const value = Math.round(diff / hour)
    return `${value}h ago`
  }
  if (diff < 7 * day) {
    const value = Math.round(diff / day)
    return `${value}d ago`
  }
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      new Date(timestamp).getFullYear() === new Date().getFullYear()
        ? undefined
        : "numeric",
  })
}
