export function unwrapData(payload: unknown): any {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

export function pickItems(payload: unknown): any[] {
  const data = unwrapData(payload);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.list)) return data.list;
  if (Array.isArray(data?.notes)) return data.notes;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

export function nextCursor(payload: unknown, items: any[]): string | null {
  const data = unwrapData(payload);
  const lastItem = items.length ? items[items.length - 1] : null;
  return String(
    data?.since_id ??
      data?.next_since_id ??
      data?.cursor ??
      data?.next_cursor ??
      lastItem?.id ??
      lastItem?.note_id ??
      ""
  ) || null;
}

export function noteIdentity(note: any): string {
  return String(note?.note_id ?? note?.id ?? note?.prime_id ?? "");
}

export function noteTitle(note: any): string {
  return note?.title || note?.name || note?.topic_name || `note-${noteIdentity(note)}`;
}
