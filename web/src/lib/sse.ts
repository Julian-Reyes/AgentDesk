/**
 * Parses a Server-Sent Events stream as it arrives.
 *
 * The browser's EventSource can only make GET requests, and sending a chat
 * message is a POST with a body and a token header, so the widget reads the
 * response with fetch and feeds the text through this parser. Network chunks
 * can end anywhere (mid-line, mid-event), so it keeps whatever is incomplete
 * until the next chunk. Follows the SSE format: events end with a blank line,
 * `data:` lines join with "\n", lines starting with ":" are comments.
 */
export type SseEvent = { event: string; data: string };

export class SseParser {
  private buffer = "";

  /** Adds a chunk of text; returns the events it completed. */
  push(chunk: string): SseEvent[] {
    this.buffer += chunk.replace(/\r\n?/g, "\n");
    const events: SseEvent[] = [];
    let end: number;
    while ((end = this.buffer.indexOf("\n\n")) >= 0) {
      const block = this.buffer.slice(0, end);
      this.buffer = this.buffer.slice(end + 2);
      const parsed = parseBlock(block);
      if (parsed) events.push(parsed);
    }
    return events;
  }
}

function parseBlock(block: string): SseEvent | null {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (!line || line.startsWith(":")) continue;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }
  return data.length ? { event, data: data.join("\n") } : null;
}
