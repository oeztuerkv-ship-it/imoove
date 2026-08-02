/** Deep-Link / Notification-Tap → private Notiz im Fahrer-Dashboard öffnen. */

type OpenHandler = (reminderId: string) => void;

let openHandler: OpenHandler | null = null;
let pendingReminderId: string | null = null;

export function setPrivateReminderOpenHandler(handler: OpenHandler | null): void {
  openHandler = handler;
  if (handler && pendingReminderId) {
    const id = pendingReminderId;
    pendingReminderId = null;
    handler(id);
  }
}

export function requestOpenPrivateReminder(reminderId: string): void {
  const id = reminderId.trim();
  if (!id) return;
  if (openHandler) {
    openHandler(id);
    return;
  }
  pendingReminderId = id;
}
