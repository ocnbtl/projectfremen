export function inertPreviewBlob(blob: Blob): Blob {
  // Text uploads, including HTML, are documents to read, never app-origin pages.
  return blob.type.startsWith("text/") ? blob.slice(0, blob.size, "text/plain;charset=utf-8") : blob;
}

export default function VaultMediaPreview({ url, mimeType, fileName }: { url: string; mimeType: string; fileName: string }) {
  if (mimeType.startsWith("image/")) return <img src={url} alt={fileName} />;
  if (mimeType.startsWith("audio/")) return <audio controls src={url} />;
  if (mimeType.startsWith("video/")) return <video controls src={url} />;
  // Defense in depth: even a mislabeled document cannot access its parent or run scripts.
  return <iframe src={url} sandbox="" referrerPolicy="no-referrer" title={`Preview of ${fileName}`} />;
}
