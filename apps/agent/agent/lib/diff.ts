export function unifiedDiff(before: string, after: string) {
  if (before === after) return "No changes.";
  const oldLines = before.split("\n");
  const newLines = after.split("\n");
  const rows = lcs(oldLines, newLines);
  const lines = ["--- design.md", "+++ design.md"];
  let i = 0;
  let j = 0;
  for (const [nextI, nextJ] of rows) {
    while (i < nextI) lines.push(`-${oldLines[i++]}`);
    while (j < nextJ) lines.push(`+${newLines[j++]}`);
    lines.push(` ${oldLines[i]}`);
    i++;
    j++;
  }
  while (i < oldLines.length) lines.push(`-${oldLines[i++]}`);
  while (j < newLines.length) lines.push(`+${newLines[j++]}`);
  return lines.join("\n");
}

function lcs(a: string[], b: string[]) {
  const dp = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs: [number, number][] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pairs.push([i++, j++]);
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}
