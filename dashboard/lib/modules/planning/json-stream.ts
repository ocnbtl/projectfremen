// Large geographic responses use the platform's supported streaming path.
// Encode once before slicing so a chunk boundary cannot corrupt Unicode.
export function privateJsonStream(body: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.subarray(offset, offset + 64 * 1024));
      offset += 64 * 1024;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "private, no-store",
    },
  });
}
