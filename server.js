const crypto = require("crypto");
const path = require("path");
const express = require("express");
const cors = require("cors");
const fetch = require("node-fetch");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

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

const allowedOrigins = CORS_ORIGIN
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const verifiedOrders = new Set();
const verifyingOrders = new Set();

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function sanitizeOrderIdPart(value, fallback = "botd") {
  return String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 20) || fallback;
}

function createOrderId(seedValue) {
  const token = crypto.randomBytes(4).toString("hex");
  return `botd_${sanitizeOrderIdPart(seedValue, "registration")}_${Date.now()}_${token}`.slice(0, 45);
}

function validateCashfreeCredentials() {
  if (!isNonEmptyString(CASHFREE_APP_ID) || !isNonEmptyString(CASHFREE_SECRET_KEY)) {
    throw new Error("Cashfree credentials are not configured.");
  }
}

function getPublicBaseUrl(request) {
  const protocol = request.headers["x-forwarded-proto"] || request.protocol;
  const host = request.headers["x-forwarded-host"] || request.get("host");
  return `${protocol}://${host}`;
}

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch (error) {
    return {};
  }
}

async function callCashfree(endpoint, options = {}) {
  validateCashfreeCredentials();

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

  const payload = await readJsonResponse(response);

  if (!response.ok) {
    throw new Error(payload?.message || payload?.type || "Cashfree API request failed.");
  }

  return payload;
}

function parseAmount(value) {
  const amount = Number(value || CASHFREE_AMOUNT || 99);
  return Number.isFinite(amount) ? amount : 99;
}

app.disable("x-powered-by");

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      return callback(null, true);
    }

    if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error("Origin is not allowed by BOTD payment server."));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"],
}));

app.use(express.json({ limit: "256kb" }));
app.use(express.static(__dirname));

app.get("/api/health", (request, response) => {
  response.json({
    success: true,
    service: "BOTD Cashfree backend",
    environment: CASHFREE_ENVIRONMENT === "production" ? "production" : "sandbox",
  });
});

app.get("/api/cashfree/config", (request, response) => {
  try {
    if (!isNonEmptyString(CASHFREE_APP_ID)) {
      return response.status(500).json({
        success: false,
        message: "Payment server is not configured.",
      });
    }

    return response.json({
      success: true,
      appId: CASHFREE_APP_ID,
      mode: CASHFREE_ENVIRONMENT === "production" ? "production" : "sandbox",
      amount: parseAmount(CASHFREE_AMOUNT),
      currency: CASHFREE_CURRENCY || "INR",
    });
  } catch (error) {
    console.error("[BOTD] Cashfree config failed", error);
    return response.status(500).json({
      success: false,
      message: "Unable to load payment configuration.",
    });
  }
});

app.post("/api/cashfree/create-order", async (request, response) => {
  try {
    const amount = parseAmount(request.body?.orderAmount);
    const currency = String(request.body?.currency || CASHFREE_CURRENCY || "INR").trim().toUpperCase();
    const name = String(request.body?.name || "").trim();
    const email = String(request.body?.email || "").trim();
    const phone = String(request.body?.phone || "").replace(/\D/g, "").slice(0, 15);
    const returnUrl = String(request.body?.returnUrl || "").trim();

    if (!Number.isFinite(amount) || amount < 1) {
      return response.status(400).json({
        success: false,
        message: "Invalid payment amount.",
      });
    }

    if (phone && phone.length < 6) {
      return response.status(400).json({
        success: false,
        message: "Invalid phone number.",
      });
    }

    const orderId = createOrderId(name || email || phone);
    const fallbackReturnUrl = `${getPublicBaseUrl(request)}/register.html?cashfree_order_id=${orderId}`;
    const resolvedReturnUrl = returnUrl ? returnUrl.replaceAll("{order_id}", orderId) : fallbackReturnUrl;

    const cashfreeOrder = await callCashfree("/orders", {
      method: "POST",
      body: JSON.stringify({
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
          return_url: resolvedReturnUrl,
        },
        order_note: "BOTD registration payment",
      }),
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
      message: "Unable to create payment order. Please try again.",
    });
  }
});

app.post("/api/cashfree/verify-order", async (request, response) => {
  const orderId = String(request.body?.orderId || "").trim();

  try {
    if (!isNonEmptyString(orderId)) {
      return response.status(400).json({
        success: false,
        verified: false,
        message: "Missing payment order ID.",
      });
    }

    if (verifiedOrders.has(orderId)) {
      return response.json({
        success: true,
        verified: true,
        duplicate: true,
        orderId,
        orderStatus: "PAID",
        message: "Payment already verified.",
      });
    }

    if (verifyingOrders.has(orderId)) {
      return response.status(409).json({
        success: false,
        verified: false,
        message: "Payment verification is already in progress.",
      });
    }

    verifyingOrders.add(orderId);

    const order = await callCashfree(`/orders/${encodeURIComponent(orderId)}`, {
      method: "GET",
    });

    if (String(order?.order_status || "").toUpperCase() !== "PAID") {
      return response.status(400).json({
        success: false,
        verified: false,
        orderId: order?.order_id || orderId,
        orderStatus: order?.order_status || "ACTIVE",
        message: "Payment is not completed yet.",
      });
    }

    let successfulPayment = null;

    try {
      const payments = await callCashfree(`/orders/${encodeURIComponent(orderId)}/payments`, {
        method: "GET",
      });
      successfulPayment = Array.isArray(payments)
        ? payments.find((payment) => String(payment?.payment_status || "").toUpperCase() === "SUCCESS")
        : null;
    } catch (paymentError) {
      console.warn("[BOTD] Cashfree payment details lookup failed", paymentError.message);
    }

    verifiedOrders.add(orderId);

    return response.json({
      success: true,
      verified: true,
      duplicate: false,
      orderId: order.order_id,
      cfOrderId: order.cf_order_id,
      orderStatus: order.order_status,
      paymentId: successfulPayment?.cf_payment_id || "",
      amount: successfulPayment?.payment_amount || order.order_amount || parseAmount(CASHFREE_AMOUNT),
      currency: order.order_currency || CASHFREE_CURRENCY || "INR",
      paymentTime: successfulPayment?.payment_completion_time || successfulPayment?.payment_time || new Date().toISOString(),
      paymentDetails: successfulPayment || null,
    });
  } catch (error) {
    console.error("[BOTD] Cashfree verify-order failed", error);
    return response.status(500).json({
      success: false,
      verified: false,
      message: "Unable to verify payment. Please try again.",
    });
  } finally {
    if (orderId) {
      verifyingOrders.delete(orderId);
    }
  }
});

app.use((error, request, response, next) => {
  if (response.headersSent) {
    return next(error);
  }

  console.error("[BOTD] Server error", error);
  return response.status(500).json({
    success: false,
    message: "Something went wrong. Please try again.",
  });
});

app.get("*", (request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[BOTD] Server running on port ${PORT}`);
});
