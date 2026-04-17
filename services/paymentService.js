const PAYMENT_API_BASE = window.BOTD_CASHFREE_API_BASE || "/api/cashfree";

export const CASHFREE_CONFIG = {
  enabled: true,
  amount: 99,
  currency: "INR",
};

let cachedCashfreeConfig = null;

async function parseJsonResponse(response, fallbackMessage) {
  let payload = {};

  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload?.message || fallbackMessage);
  }

  return payload;
}

export async function loadCashfreeConfig() {
  if (cachedCashfreeConfig?.appId) {
    return cachedCashfreeConfig;
  }

  const response = await fetch(`${PAYMENT_API_BASE}/config`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await parseJsonResponse(response, "Unable to load Cashfree configuration.");

  if (!payload?.appId) {
    throw new Error("Cashfree app ID is missing in backend config.");
  }

  cachedCashfreeConfig = {
    appId: payload.appId,
    mode: payload.mode || "sandbox",
    amount: Number(payload.amount || CASHFREE_CONFIG.amount),
    currency: payload.currency || CASHFREE_CONFIG.currency,
  };

  return cachedCashfreeConfig;
}

export async function createCashfreeOrder(registrationPayload = {}) {
  const response = await fetch(`${PAYMENT_API_BASE}/create-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      orderAmount: CASHFREE_CONFIG.amount,
      currency: CASHFREE_CONFIG.currency,
      name: registrationPayload?.name || "",
      email: registrationPayload?.email || "",
      phone: registrationPayload?.phone || "",
    }),
  });

  const payload = await parseJsonResponse(response, "Unable to create Cashfree order.");

  if (!payload?.orderId || !payload?.paymentSessionId) {
    throw new Error("Cashfree order details were not returned by the payment API.");
  }

  return {
    orderId: payload.orderId,
    cfOrderId: payload.cfOrderId || "",
    paymentSessionId: payload.paymentSessionId,
    amount: Number(payload.amount || CASHFREE_CONFIG.amount),
    currency: payload.currency || CASHFREE_CONFIG.currency,
    orderStatus: payload.orderStatus || "ACTIVE",
  };
}

export async function verifyCashfreeOrder(orderId) {
  const response = await fetch(`${PAYMENT_API_BASE}/verify-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      orderId,
    }),
  });

  const payload = await parseJsonResponse(response, "Cashfree order verification failed.");

  if (!payload?.success || payload?.verified !== true) {
    throw new Error(payload?.message || "Cashfree order verification failed.");
  }

  return {
    orderId: payload.orderId || orderId,
    orderStatus: payload.orderStatus || "PAID",
    cfOrderId: payload.cfOrderId || "",
    paymentId: payload.paymentId || "",
    amount: Number(payload.amount || CASHFREE_CONFIG.amount),
    currency: payload.currency || CASHFREE_CONFIG.currency,
    paymentTime: payload.paymentTime || "",
    paymentDetails: payload.paymentDetails || null,
    verified: true,
  };
}
