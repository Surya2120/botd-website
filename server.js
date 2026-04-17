require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
require("dotenv").config();

const app = express();
const PORT = Number(process.env.PORT || 3000);

const {
  CASHFREE_APP_ID = "",
  CASHFREE_SECRET_KEY = "",
  CASHFREE_ENVIRONMENT = "sandbox",
  CASHFREE_API_VERSION = "2023-08-01",
  CASHFREE_AMOUNT = "99",
  CASHFREE_CURRENCY = "INR",
  CORS_ORIGIN = "",
} = process.env;

const CASHFREE_BASE_URL = CASHFREE_ENVIRONMENT === "production"
  ? "https://api.cashfree.com/pg"
  : "https://sandbox.cashfree.com/pg";

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validatePaymentCredentials() {
  if (!isNonEmptyString(CASHFREE_APP_ID) || !isNonEmptyString(CASHFREE_SECRET_KEY)) {
    throw new Error("Cashfree credentials are missing. Set CASHFREE_APP_ID and CASHFREE_SECRET_KEY.");
  }
}

function sanitizeOrderIdPart(value, fallback) {
  return String(value || fallback || "botd")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20) || fallback;
}

function createOrderId(seedValue) {
  const token = crypto.randomBytes(4).toString("hex");
  const stamp = Date.now();
  return `botd_${sanitizeOrderIdPart(seedValue, "registration")}_${stamp}_${token}`.slice(0, 45);
}

function isPaidCashfreeStatus(value) {
  return ["PAID", "SUCCESS", "SUCCESSFUL", "COMPLETED"].includes(String(value || "").toUpperCase());
}

async function callCashfree(endpoint, options = {}) {
  validatePaymentCredentials();

  const response = await fetch(`${CASHFREE_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-api-version": CASHFREE_API_VERSION,
      "x-client-id": CASHFREE_APP_ID,
      "x-client-secret": CASHFREE_SECRET_KEY,
      "x-request-id": crypto.randomUUID(),
      ...(options.headers || {}),
    },
  });

  let payload = {};
  try {
    payload = await response.json();
  } catch (error) {
    payload = {};
  }

  if (!response.ok) {
    throw new Error(payload?.message || payload?.type || "Cashfree API request failed.");
  }

  return payload;
}

app.use((request, response, next) => {
  if (isNonEmptyString(CORS_ORIGIN)) {
    response.setHeader("Access-Control-Allow-Origin", CORS_ORIGIN);
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type,Accept");

  if (request.method === "OPTIONS") {
    return response.sendStatus(204);
  }

  return next();
});

app.use(express.json({ limit: "256kb" }));
app.use(express.static(__dirname));

app.get("/api/cashfree/config", (request, response) => {
  if (!isNonEmptyString(CASHFREE_APP_ID)) {
    return response.status(500).json({
      success: false,
      message: "CASHFREE_APP_ID is not configured on the server.",
    });
  }

  return response.json({
    success: true,
    appId: CASHFREE_APP_ID,
    mode: CASHFREE_ENVIRONMENT === "production" ? "production" : "sandbox",
    amount: Number(CASHFREE_AMOUNT || 99),
    currency: CASHFREE_CURRENCY || "INR",
  });
});

app.post("/api/cashfree/create-order", async (request, response) => {
  try {
    const amount = Number(request.body?.orderAmount || CASHFREE_AMOUNT || 99);
    const currency = String(request.body?.currency || CASHFREE_CURRENCY || "INR").trim().toUpperCase();
    const name = String(request.body?.name || "").trim();
    const email = String(request.body?.email || "").trim();
    const phone = String(request.body?.phone || "").replace(/\D/g, "").slice(0, 15);

    if (!Number.isFinite(amount) || amount < 1) {
      return response.status(400).json({
        success: false,
        message: "Invalid Cashfree order amount.",
      });
    }

    const orderId = createOrderId(name || email || phone);
    const orderPayload = {
      order_id: orderId,
      order_amount: Number(amount.toFixed(2)),
      order_currency: currency,
      customer_details: {
        customer_id: sanitizeOrderIdPart(email || phone || name || orderId, "customer"),
        customer_name: name || "BOTD User",
        customer_email: email || "support@botd.in",
        customer_phone: phone || "9999999999",
      },
      order_meta: {
        return_url: `${request.protocol}://${request.get("host")}/register.html?cashfree_order_id=${orderId}`,
      },
      order_note: "BOTD registration payment",
    };

    const cashfreeOrder = await callCashfree("/orders", {
      method: "POST",
      body: JSON.stringify(orderPayload),
    });

    return response.json({
      success: true,
      orderId: cashfreeOrder.order_id,
      cfOrderId: cashfreeOrder.cf_order_id,
      paymentSessionId: cashfreeOrder.payment_session_id,
      orderStatus: cashfreeOrder.order_status,
      amount: cashfreeOrder.order_amount,
      currency: cashfreeOrder.order_currency,
    });
  } catch (error) {
    console.error("[BOTD] Cashfree create-order failed", error);
    return response.status(500).json({
      success: false,
      message: error.message || "Unable to create Cashfree order.",
    });
  }
});

app.post("/api/cashfree/verify-order", async (request, response) => {
  try {
    const orderId = String(request.body?.orderId || "").trim();

    if (!isNonEmptyString(orderId)) {
      return response.status(400).json({
        success: false,
        verified: false,
        message: "Missing Cashfree order ID.",
      });
    }

    const order = await callCashfree(`/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    let payments = [];
    try {
      const paymentResponse = await callCashfree(`/orders/${encodeURIComponent(orderId)}/payments`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });
      payments = Array.isArray(paymentResponse) ? paymentResponse : [];
    } catch (paymentError) {
      console.warn("[BOTD] Cashfree payment detail lookup failed", paymentError.message);
      payments = [];
    }

    const successfulPayment = payments.find((payment) => isPaidCashfreeStatus(payment?.payment_status));
    const verified = isPaidCashfreeStatus(order?.order_status) || Boolean(successfulPayment);

    if (!verified) {
      return response.status(400).json({
        success: false,
        verified: false,
        orderId: order?.order_id || orderId,
        orderStatus: order?.order_status || "ACTIVE",
        message: "Payment is not completed yet.",
      });
    }

    return response.json({
      success: true,
      verified: true,
      orderId: order.order_id,
      cfOrderId: order.cf_order_id,
      orderStatus: order.order_status,
      paymentId: successfulPayment?.cf_payment_id || "",
      amount: successfulPayment?.payment_amount || order.order_amount || Number(CASHFREE_AMOUNT || 99),
      currency: order.order_currency || CASHFREE_CURRENCY || "INR",
      paymentTime: successfulPayment?.payment_completion_time || successfulPayment?.payment_time || new Date().toISOString(),
      paymentDetails: successfulPayment || null,
    });
  } catch (error) {
    console.error("[BOTD] Cashfree order verification failed", error);
    return response.status(500).json({
      success: false,
      verified: false,
      message: error.message || "Unable to verify Cashfree order.",
    });
  }
});

app.get("*", (request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[BOTD] Server running at http://localhost:${PORT}`);
});
