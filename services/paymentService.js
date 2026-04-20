function getPaymentApiBase() {
  const configuredBase = String(window.BOTD_CASHFREE_API_BASE || "").trim().replace(/\/+$/, "");

  if (configuredBase) {
    return configuredBase;
  }

  return "https://botd-backend.onrender.com/api/cashfree";
}

const PAYMENT_API_BASE = getPaymentApiBase();

export const CASHFREE_CONFIG = {
  enabled: true,
  amount: 1,
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

  if (!PAYMENT_API_BASE) {
    throw new Error("Cashfree backend URL is not configured for this hosted website.");
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
  const config = cachedCashfreeConfig || await loadCashfreeConfig();
  const customerName = registrationPayload?.name || registrationPayload?.fullName || "";
  const returnUrl = `${window.location.origin}${window.location.pathname}?cashfree_order_id={order_id}`;
  const requestedAmount = Number(
    registrationPayload?.details?.paymentAmount
    ?? registrationPayload?.paymentAmount
    ?? NaN
  );
  const orderAmount = Number.isFinite(requestedAmount) && requestedAmount > 0
    ? requestedAmount
    : (config.amount || CASHFREE_CONFIG.amount);

  console.log("[BOTD] Creating Cashfree order", {
    apiBase: PAYMENT_API_BASE,
    orderAmount,
    currency: config.currency || CASHFREE_CONFIG.currency,
  });

  const response = await fetch(`${PAYMENT_API_BASE}/create-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      orderAmount,
      currency: config.currency || CASHFREE_CONFIG.currency,
      name: customerName,
      email: registrationPayload?.email || "",
      phone: registrationPayload?.phone || "",
      returnUrl,
    }),
  });

  const payload = await parseJsonResponse(response, "Unable to create Cashfree order.");

  const orderId = payload?.orderId || payload?.order_id || "";
  const paymentSessionId = payload?.paymentSessionId || payload?.payment_session_id || "";

  console.log("[BOTD] Cashfree create-order response", payload);

  if (!orderId || !paymentSessionId) {
    throw new Error("Cashfree order details were not returned by the payment API.");
  }

  return {
    orderId,
    cfOrderId: payload.cfOrderId || payload?.cf_order_id || "",
    paymentSessionId,
    amount: Number(payload.amount || orderAmount || config.amount || CASHFREE_CONFIG.amount),
    currency: payload.currency || config.currency || CASHFREE_CONFIG.currency,
    orderStatus: payload.orderStatus || "ACTIVE",
  };
}

export async function verifyCashfreeOrder(orderId) {
  if (!PAYMENT_API_BASE) {
    throw new Error("Cashfree backend URL is not configured for this hosted website.");
  }

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
