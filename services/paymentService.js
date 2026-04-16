const PAYMENT_API_BASE = "/api/razorpay";

export const PAYMENT_CONFIG = {
  enabled: true,
  amountPaise: 9900,
  currency: "INR",
};

let cachedPaymentConfig = null;

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

export async function loadRazorpayConfig() {
  if (cachedPaymentConfig?.keyId) {
    return cachedPaymentConfig;
  }

  const response = await fetch(`${PAYMENT_API_BASE}/config`, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  const payload = await parseJsonResponse(response, "Unable to load payment configuration.");

  if (!payload?.keyId) {
    throw new Error("Razorpay key ID is missing in backend config.");
  }

  cachedPaymentConfig = {
    keyId: payload.keyId,
    amountPaise: Number(payload.amountPaise || PAYMENT_CONFIG.amountPaise),
    currency: payload.currency || PAYMENT_CONFIG.currency,
  };

  return cachedPaymentConfig;
}

export async function createRazorpayOrder(registrationPayload = {}) {
  const response = await fetch(`${PAYMENT_API_BASE}/create-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      amountPaise: PAYMENT_CONFIG.amountPaise,
      currency: PAYMENT_CONFIG.currency,
      name: registrationPayload?.name || "",
      email: registrationPayload?.email || "",
      phone: registrationPayload?.phone || "",
    }),
  });

  const payload = await parseJsonResponse(response, "Unable to create Razorpay order.");

  if (!payload?.orderId) {
    throw new Error("Order ID was not returned by the payment API.");
  }

  return {
    orderId: payload.orderId,
    amountPaise: Number(payload.amountPaise || PAYMENT_CONFIG.amountPaise),
    currency: payload.currency || PAYMENT_CONFIG.currency,
    receipt: payload.receipt || "",
  };
}

export async function verifyRazorpayPayment(paymentResponse, orderContext = {}, registrationPayload = {}) {
  const response = await fetch(`${PAYMENT_API_BASE}/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      razorpay_order_id: paymentResponse?.razorpay_order_id || orderContext?.orderId || "",
      razorpay_payment_id: paymentResponse?.razorpay_payment_id || "",
      razorpay_signature: paymentResponse?.razorpay_signature || "",
      amountPaise: orderContext?.amountPaise || PAYMENT_CONFIG.amountPaise,
      currency: orderContext?.currency || PAYMENT_CONFIG.currency,
      name: registrationPayload?.name || "",
      email: registrationPayload?.email || "",
      phone: registrationPayload?.phone || "",
    }),
  });

  const payload = await parseJsonResponse(response, "Payment verification failed.");

  if (!payload?.success || payload?.verified !== true) {
    throw new Error(payload?.message || "Payment verification failed.");
  }

  return {
    paymentId: payload.paymentId || paymentResponse?.razorpay_payment_id || "",
    orderId: payload.orderId || paymentResponse?.razorpay_order_id || orderContext?.orderId || "",
    verified: true,
  };
}
