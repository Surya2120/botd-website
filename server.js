require("dotenv").config();

const crypto = require("crypto");
const path = require("path");
const express = require("express");
const Razorpay = require("razorpay");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const {
  RAZORPAY_KEY_ID = "",
  RAZORPAY_KEY_SECRET = "",
  RAZORPAY_AMOUNT_PAISE = "9900",
  RAZORPAY_CURRENCY = "INR",
} = process.env;

const razorpay = new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET,
});

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function validatePaymentCredentials() {
  if (!isNonEmptyString(RAZORPAY_KEY_ID) || !isNonEmptyString(RAZORPAY_KEY_SECRET)) {
    throw new Error("Razorpay credentials are missing. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.");
  }
}

function sanitizeReceiptPart(value, fallback) {
  const normalized = String(value || fallback || "botd")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);

  return normalized || fallback;
}

app.use(express.json({ limit: "256kb" }));
app.use(express.static(__dirname));

app.get("/api/razorpay/config", (request, response) => {
  if (!isNonEmptyString(RAZORPAY_KEY_ID)) {
    return response.status(500).json({
      success: false,
      message: "RAZORPAY_KEY_ID is not configured on the server.",
    });
  }

  return response.json({
    success: true,
    keyId: RAZORPAY_KEY_ID,
    amountPaise: Number(RAZORPAY_AMOUNT_PAISE || 9900),
    currency: RAZORPAY_CURRENCY || "INR",
  });
});

app.post("/api/razorpay/create-order", async (request, response) => {
  try {
    validatePaymentCredentials();

    const amountPaise = Number(request.body?.amountPaise || RAZORPAY_AMOUNT_PAISE || 9900);
    const currency = String(request.body?.currency || RAZORPAY_CURRENCY || "INR").trim().toUpperCase();
    const name = String(request.body?.name || "").trim();
    const email = String(request.body?.email || "").trim();
    const phone = String(request.body?.phone || "").trim();

    if (!Number.isFinite(amountPaise) || amountPaise <= 0) {
      return response.status(400).json({
        success: false,
        message: "Invalid order amount.",
      });
    }

    if (!isNonEmptyString(currency)) {
      return response.status(400).json({
        success: false,
        message: "Invalid currency.",
      });
    }

    const receipt = [
      "botd",
      sanitizeReceiptPart(name || email || phone || "registration", "registration"),
      Date.now(),
    ].join("_").slice(0, 40);

    const order = await razorpay.orders.create({
      amount: amountPaise,
      currency,
      receipt,
      notes: {
        name,
        email,
        phone,
        source: "botd_registration",
      },
    });

    return response.json({
      success: true,
      orderId: order.id,
      amountPaise: order.amount,
      currency: order.currency,
      receipt: order.receipt,
    });
  } catch (error) {
    console.error("[BOTD] Razorpay create-order failed", error);
    return response.status(500).json({
      success: false,
      message: error.message || "Unable to create Razorpay order.",
    });
  }
});

app.post("/api/razorpay/verify", (request, response) => {
  try {
    validatePaymentCredentials();

    const razorpayOrderId = String(request.body?.razorpay_order_id || "").trim();
    const razorpayPaymentId = String(request.body?.razorpay_payment_id || "").trim();
    const razorpaySignature = String(request.body?.razorpay_signature || "").trim();

    if (!isNonEmptyString(razorpayOrderId) || !isNonEmptyString(razorpayPaymentId) || !isNonEmptyString(razorpaySignature)) {
      return response.status(400).json({
        success: false,
        verified: false,
        message: "Missing Razorpay payment verification fields.",
      });
    }

    const generatedSignature = crypto
      .createHmac("sha256", RAZORPAY_KEY_SECRET)
      .update(`${razorpayOrderId}|${razorpayPaymentId}`)
      .digest("hex");

    const verified = generatedSignature === razorpaySignature;

    if (!verified) {
      return response.status(400).json({
        success: false,
        verified: false,
        message: "Payment verification failed.",
      });
    }

    return response.json({
      success: true,
      verified: true,
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
    });
  } catch (error) {
    console.error("[BOTD] Razorpay verification failed", error);
    return response.status(500).json({
      success: false,
      verified: false,
      message: error.message || "Unable to verify payment.",
    });
  }
});

app.get("*", (request, response) => {
  response.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`[BOTD] Server running at http://localhost:${PORT}`);
});
