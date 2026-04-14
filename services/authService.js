import {
  RecaptchaVerifier,
  onAuthStateChanged,
  signInWithPhoneNumber,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { auth, db } from "./firebase.js";

let recaptchaVerifier = null;
let recaptchaWidgetId = null;

export const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;
export const SUPPORTED_PHONE_COUNTRIES = [
  { id: "IN", label: "India", dialCode: "+91" },
  { id: "US", label: "USA", dialCode: "+1" },
  { id: "GB", label: "UK", dialCode: "+44" },
  { id: "AE", label: "UAE", dialCode: "+971" },
  { id: "SG", label: "Singapore", dialCode: "+65" },
  { id: "AU", label: "Australia", dialCode: "+61" },
  { id: "CA", label: "Canada", dialCode: "+1" },
];

export function extractIndianMobileDigits(rawValue) {
  const raw = String(rawValue || "").trim();
  const digits = raw.replace(/\D/g, "");

  if (digits.length === 10) {
    return digits;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }

  if (raw.startsWith("+91")) {
    return raw.slice(3).replace(/\D/g, "");
  }

  return digits;
}

export function isValidIndianMobileInput(rawValue) {
  return INDIAN_MOBILE_PATTERN.test(extractIndianMobileDigits(rawValue));
}

export function normalizePhoneNumber(rawValue) {
  const digits = extractIndianMobileDigits(rawValue);

  if (INDIAN_MOBILE_PATTERN.test(digits)) {
    return `+91${digits}`;
  }

  throw new Error("Enter a valid 10-digit mobile number.");
}

export function sanitizePhoneDigits(rawValue) {
  return String(rawValue || "").replace(/\D/g, "");
}

export function buildInternationalPhoneNumber(selectedCode, rawPhoneNumber) {
  const dialCode = String(selectedCode || "+91").trim();
  const dialDigits = sanitizePhoneDigits(dialCode);
  const localDigits = sanitizePhoneDigits(rawPhoneNumber);
  const totalDigits = `${dialDigits}${localDigits}`;

  const isSupportedCountry = SUPPORTED_PHONE_COUNTRIES.some((item) => item.dialCode === dialCode);

  if (!isSupportedCountry || !dialDigits) {
    throw new Error("Select a valid country code.");
  }

  if (!/^\d+$/.test(localDigits) || localDigits.length < 6 || totalDigits.length > 15) {
    throw new Error("Enter a valid phone number.");
  }

  return `+${totalDigits}`;
}

export async function ensureUserProfile(user) {
  if (!user?.uid) {
    throw new Error("Authenticated user not found.");
  }

  const userRef = doc(db, "users", user.uid);
  const existing = await getDoc(userRef);

  await setDoc(
    userRef,
    {
      phoneNumber: user.phoneNumber || "",
      createdAt: existing.exists() ? existing.data().createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function createRecaptchaVerifier(containerId) {
  if (recaptchaVerifier) {
    return recaptchaVerifier;
  }

  recaptchaVerifier = new RecaptchaVerifier(
    containerId,
    {
      size: "invisible",
      callback: () => {},
    },
    auth
  );

  recaptchaWidgetId = await recaptchaVerifier.render();
  return recaptchaVerifier;
}

export function resetRecaptcha() {
  if (typeof window.grecaptcha !== "undefined" && recaptchaWidgetId !== null) {
    window.grecaptcha.reset(recaptchaWidgetId);
  }
}

export async function sendPhoneOtp(rawPhoneNumber, containerId, options = {}) {
  const phoneNumber = options?.countryCode
    ? buildInternationalPhoneNumber(options.countryCode, rawPhoneNumber)
    : normalizePhoneNumber(rawPhoneNumber);
  const verifier = await createRecaptchaVerifier(containerId);
  const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);

  return {
    confirmationResult,
    phoneNumber,
  };
}

export async function verifyPhoneOtp(confirmationResult, otpCode) {
  if (!confirmationResult) {
    throw new Error("OTP session expired. Please request a new code.");
  }

  const credential = await confirmationResult.confirm(otpCode);
  await ensureUserProfile(credential.user);
  return credential.user;
}

export function subscribeAuthState(onData, onError) {
  return onAuthStateChanged(auth, onData, onError);
}

export function getCurrentUser() {
  return auth.currentUser;
}
