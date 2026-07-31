import { NotificationType } from "@prisma/client";

/**
 * Canonical list of notification events that the org-wide
 * `NotificationPreference` table toggles. Each entry pairs:
 *   - eventKey     — the string stored in NotificationPreference.eventKey
 *   - notification — the prisma enum the in-app Notification row uses
 *                    when this event fires (several map to GENERIC because
 *                    the enum is intentionally narrow)
 *   - label        — admin-visible label rendered in Settings → Notifications
 *   - description  — admin-visible helper copy below the label
 *
 * Auth-critical events (PASSWORD_RESET, EMAIL_VERIFY) are deliberately
 * NOT here — they must always send and cannot be silenced by an admin.
 */
export const NOTIFICATION_EVENTS = [
  {
    eventKey: "ACCOUNT_CREATED",
    notification: NotificationType.ACCOUNT_CREATED,
    label: "New account — set password",
    description:
      "Sent to a new employee when their account is created so they can pick their own password.",
  },
  {
    eventKey: "PROJECT_ASSIGNED",
    notification: NotificationType.PROJECT_MEMBER_ADDED,
    label: "Project assigned",
    description: "Sent when an employee is added to a project as a member.",
  },
  {
    eventKey: "PROJECT_DEADLINE_3D",
    notification: NotificationType.PROJECT_DEADLINE_SOON,
    label: "Project deadline — 3 days out",
    description: "Sent to project members and manager 3 days before the end date.",
  },
  {
    eventKey: "PROJECT_DEADLINE_1D",
    notification: NotificationType.PROJECT_DEADLINE_SOON,
    label: "Project deadline — 1 day out",
    description: "Final reminder sent the day before the end date.",
  },
  {
    eventKey: "PROJECT_OVERDUE",
    notification: NotificationType.PROJECT_OVERDUE,
    label: "Project overdue",
    description: "Sent when a project passes its end date and is still ACTIVE.",
  },
  {
    eventKey: "TASK_ASSIGNED",
    notification: NotificationType.TASK_ASSIGNED,
    label: "Task assigned",
    description: "Sent when a task is assigned to an employee.",
  },
  {
    eventKey: "TASK_DUE_SOON",
    notification: NotificationType.TASK_DUE_SOON,
    label: "Task due soon",
    description: "Sent the day before an incomplete task's due date.",
  },
  {
    eventKey: "ATTENDANCE_ABSENT",
    notification: NotificationType.ATTENDANCE_ABSENT,
    label: "Attendance — absent",
    description:
      "Sent at 19:30 if an employee didn't check in on a working day (and no approved leave covers it).",
  },
  {
    eventKey: "ATTENDANCE_MISSED_PUNCH",
    notification: NotificationType.ATTENDANCE_MISSED_PUNCH,
    label: "Attendance — missed clock-out",
    description: "Sent at 19:30 if an employee checked in but never checked out.",
  },
  {
    eventKey: "ATTENDANCE_HALF_DAY_AUTO",
    notification: NotificationType.ATTENDANCE_HALF_DAY_AUTO,
    label: "Attendance — half-day applied (late arrival)",
    description:
      "Sent when check-in after the half-day cutoff auto-applies a half-day deduction.",
  },
  {
    eventKey: "ATTENDANCE_LATE_STREAK",
    notification: NotificationType.ATTENDANCE_LATE_STREAK,
    label: "Attendance — late-streak penalty",
    description:
      "Sent when the configured number of late arrivals in a month triggers a leave penalty.",
  },
  {
    eventKey: "LEAVE_APPROVED",
    notification: NotificationType.LEAVE_APPROVED,
    label: "Leave approved",
    description: "Sent to the employee when their leave request is approved.",
  },
  {
    eventKey: "LEAVE_REJECTED",
    notification: NotificationType.LEAVE_REJECTED,
    label: "Leave rejected",
    description: "Sent to the employee when their leave request is rejected.",
  },
  {
    eventKey: "HOLIDAY_UPCOMING",
    notification: NotificationType.HOLIDAY_UPCOMING,
    label: "Upcoming holiday",
    description: "Sent to every active employee one week before each holiday.",
  },
] as const;

export type NotificationEventKey = (typeof NOTIFICATION_EVENTS)[number]["eventKey"];

export const NOTIFICATION_EVENT_KEYS = NOTIFICATION_EVENTS.map((e) => e.eventKey) as NotificationEventKey[];

export const NOTIFICATION_EVENT_BY_KEY: Record<string, (typeof NOTIFICATION_EVENTS)[number]> =
  Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e.eventKey, e]));
