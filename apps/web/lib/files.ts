export const UPLOADS_DIR = "uploads"
export const DESIGN_PATH = "design.md"

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const value = bytes / 1024 ** exponent
  const rounded = exponent === 0 ? value : Math.round(value * 10) / 10
  return `${rounded} ${units[exponent]}`
}

export function isImageType(contentType: string): boolean {
  return contentType.startsWith("image/")
}

export function isPdfType(contentType: string): boolean {
  return contentType === "application/pdf"
}

export function isTextType(contentType: string): boolean {
  return (
    contentType.startsWith("text/") ||
    contentType === "application/json" ||
    contentType === "application/xml" ||
    /\+(json|xml)$/.test(contentType)
  )
}

/**
 * Builds a unique tree path for an upload, disambiguating duplicate filenames
 * so the file tree never receives colliding paths.
 */
export function uploadTreePath(name: string, seen: Map<string, number>): string {
  const base = name.trim() || "file"
  const count = seen.get(base) ?? 0
  seen.set(base, count + 1)
  const unique = count === 0 ? base : appendBeforeExtension(base, ` (${count})`)
  return `${UPLOADS_DIR}/${unique}`
}

function appendBeforeExtension(name: string, suffix: string): string {
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return `${name}${suffix}`
  return `${name.slice(0, dot)}${suffix}${name.slice(dot)}`
}
