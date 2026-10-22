export function getRecordId(item: { id?: string; _id?: string }): string {
  return item.id || item._id || '';
}
