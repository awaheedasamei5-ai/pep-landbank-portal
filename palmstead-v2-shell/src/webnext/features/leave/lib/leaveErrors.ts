export function leaveErrorMessage(error: unknown): string {
  if (error && typeof error === 'object') {
    const details = error as { code?: unknown; message?: unknown };
    if (details.code === 'PGRST116') return 'This request has changed. Reload Leave and review its current status.';
    if (details.code === '42501') return 'Your account cannot perform this action on the request. Reload Leave or sign in again.';
    if (typeof details.message === 'string' && details.message.trim()) return details.message;
  }
  return 'The change could not be saved. Check your connection and try again.';
}
