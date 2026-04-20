import { fetchRegistrationByNumber } from "../services/formService.js";

const params = new URLSearchParams(window.location.search);
const registrationId = String(params.get("id") || "").trim().toUpperCase();

const statusElement = document.getElementById("verify-status");
const resultElement = document.getElementById("verify-result");
const badgeElement = document.getElementById("verify-badge");
const nameElement = document.getElementById("verify-name");
const categoryElement = document.getElementById("verify-category");
const paymentStatusElement = document.getElementById("verify-payment-status");
const registrationIdElement = document.getElementById("verify-registration-id");

function getVerifyApiUrl(id) {
  const paymentBase = String(window.BOTD_CASHFREE_API_BASE || "").trim().replace(/\/+$/, "");

  if (!paymentBase) {
    return "";
  }

  const apiRoot = paymentBase.replace(/\/cashfree$/i, "");
  return `${apiRoot}/verify/${encodeURIComponent(id)}`;
}

function setText(element, value) {
  if (element) {
    element.textContent = value || "-";
  }
}

function renderResult(record) {
  const paymentStatus = String(record?.paymentStatus || record?.payment_status || record?.status || "").toUpperCase();
  const isConfirmed = paymentStatus === "SUCCESS" || paymentStatus === "PAID";

  setText(nameElement, record?.name);
  setText(categoryElement, record?.category);
  setText(paymentStatusElement, paymentStatus || "NOT FOUND");
  setText(registrationIdElement, record?.registrationId || registrationId);

  if (badgeElement) {
    badgeElement.textContent = isConfirmed ? "ENTRY CONFIRMED" : "INVALID / NOT PAID";
    badgeElement.classList.toggle("is-invalid", !isConfirmed);
  }

  if (statusElement) {
    statusElement.textContent = isConfirmed
      ? "This BOTD registration is confirmed."
      : "This registration could not be confirmed as paid.";
  }

  if (resultElement) {
    resultElement.hidden = false;
  }
}

async function fetchFromBackend(id) {
  const verifyUrl = getVerifyApiUrl(id);

  if (!verifyUrl) {
    return null;
  }

  const response = await fetch(verifyUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await response.json();
  return payload?.registration || payload?.data || null;
}

async function initVerification() {
  if (!registrationId) {
    if (statusElement) {
      statusElement.textContent = "Registration ID is missing.";
    }
    renderResult({ registrationId, paymentStatus: "INVALID" });
    return;
  }

  try {
    const backendRecord = await fetchFromBackend(registrationId).catch(() => null);
    const record = backendRecord || await fetchRegistrationByNumber(registrationId);

    if (!record) {
      renderResult({ registrationId, paymentStatus: "INVALID" });
      return;
    }

    renderResult({
      ...record,
      registrationId,
    });
  } catch (error) {
    console.error("[BOTD] Verification failed", error);
    if (statusElement) {
      statusElement.textContent = "Unable to verify right now. Please try again.";
    }
    renderResult({ registrationId, paymentStatus: "INVALID" });
  }
}

initVerification();
