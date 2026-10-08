"use strict";

const { getAdminServices } = require("./common.js");
const { dayKey, levelForAmount } = require("./savings-policy.js");

function parseBudgetMessage(event) {
  const message = event?.data?.message || event?.message || {};
  const payload = JSON.parse(Buffer.from(String(message.data || ""), "base64").toString("utf8"));
  const amount = Number(payload.costAmount);
  const intervalStart = new Date(payload.costIntervalStart);
  if (payload.currencyCode !== "MXN" || !Number.isFinite(amount) || amount < 0 || Number.isNaN(intervalStart.getTime())) {
    throw new Error("savings_billing_invalid_payload");
  }
  return { budgetId: String(message.attributes?.budgetId || ""), amount, intervalStart, currency: "MXN" };
}

async function recordBillingBudget(event, { db = getAdminServices().db, expectedBudgetId = process.env.SAVINGS_BILLING_BUDGET_ID, now = new Date() } = {}) {
  if (!expectedBudgetId) throw new Error("savings_billing_budget_id_missing");
  const incoming = parseBudgetMessage(event);
  if (incoming.budgetId !== expectedBudgetId) return { ignored: true };
  const month = incoming.intervalStart.toISOString().slice(0, 7);
  if (month !== dayKey(now).slice(0, 7)) return { ignored: true, reason: "other_month" };
  const ref = db.collection("savings_billing").doc("current");
  const controlRef = db.collection("savings_control").doc("global");
  return db.runTransaction(async (tx) => {
    const [billingSnapshot, controlSnapshot] = await Promise.all([tx.get(ref), tx.get(controlRef)]);
    const old = billingSnapshot.data() || {};
    const control = controlSnapshot.data() || {};
    const priorAmount = old.month === month ? Number(old.amount || 0) : 0;
    const amount = Math.max(priorAmount, incoming.amount);
    const threshold = Math.floor(amount / 1000) * 1000;
    tx.set(ref, { month, amount, currency: "MXN", threshold, budgetId: incoming.budgetId, updatedAt: now.toISOString() });
    const level = levelForAmount(amount);
    if (control.mode === "auto" && control.level !== level) {
      tx.set(controlRef, { level, lastAutoLevel: level, changedAt: now.toISOString(), changedBy: "billing" }, { merge: true });
    }
    return { month, amount, threshold, level, crossed: threshold > (old.month === month ? Number(old.threshold || 0) : 0) };
  });
}

module.exports = { parseBudgetMessage, recordBillingBudget };
