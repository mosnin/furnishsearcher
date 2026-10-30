export const CLOSED_DOCUMENT_WORK =
  "This discussion is closed. Use a current or previously confirmed stay for new document work.";
export function documentWorkAllowed(status: string) {
  return ["pending", "accepted", "cancelled"].includes(status);
}
export function requireDocumentWork(status: string) {
  if (!documentWorkAllowed(status)) throw new Error(CLOSED_DOCUMENT_WORK);
}
