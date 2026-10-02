/** Hands a file to the browser to save, under a name safe on every system. */
export function saveBlob(blob: Blob, name: string): void {
  const safe = name.replace(/[^\w .-]+/g, '_').slice(0, 120) || 'download';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safe;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
