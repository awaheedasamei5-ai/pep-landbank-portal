export function isVisibleScheduleTodo(status: string): boolean {
  return status !== "cancelled" && status !== "rescheduled";
}

export function isVisibleScheduleMeeting(status: string): boolean {
  return status !== "cancelled";
}
