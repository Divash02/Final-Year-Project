import { Notification, WorkflowInstance } from "../models/index.js";

let timer = null;
let running = false;

async function sendPendingReminders() {
  const now = new Date();
  const candidates = await WorkflowInstance.find({
    status: "in_progress",
    currentApprovers: { $ne: [] },
  })
    .populate("workflow", "name notifications")
    .sort({ lastReminderAt: 1, createdAt: 1 })
    .limit(500);

  for (const instance of candidates) {
    const settings = instance.workflow?.notifications;
    if (!settings?.pendingReminders || !instance.currentApprovers.length) continue;
    const reminderBase = instance.lastReminderAt || instance.createdAt;
    const elapsedHours = (now.getTime() - reminderBase.getTime()) / 3_600_000;
    if (elapsedHours < settings.reminderHours) continue;

    const idempotencyBase = `workflow:${instance._id}:reminder:${reminderBase.getTime()}`;
    for (const user of instance.currentApprovers) {
      await Notification.updateOne(
        { idempotencyKey: `${idempotencyBase}:${user}` },
        {
          $setOnInsert: {
            user,
            title: "Pending approval reminder",
            message: `Approval is still pending for workflow "${instance.workflow.name}".`,
            category: "workflow",
            priority: "normal",
            idempotencyKey: `${idempotencyBase}:${user}`,
          },
        },
        { upsert: true },
      );
    }
    instance.lastReminderAt = now;
    await instance.save();
  }
}

async function tick() {
  if (running) return;
  running = true;
  try {
    await sendPendingReminders();
  } catch (error) {
    console.error("Workflow reminder sweep failed:", error);
  } finally {
    running = false;
  }
}

export function startWorkflowScheduler() {
  if (timer) return timer;
  const interval = Math.max(
    30_000,
    Number.parseInt(process.env.COLLEGEOS_WORKFLOW_REMINDER_INTERVAL_MS || "60000", 10) || 60_000,
  );
  timer = setInterval(tick, interval);
  if (typeof timer.unref === "function") timer.unref();
  return timer;
}

export function stopWorkflowScheduler() {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
