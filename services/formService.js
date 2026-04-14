import {
  addDoc,
  collection,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { db } from "./firebase.js";

export async function submitRegistration(payload) {
  await addDoc(collection(db, "registrations"), {
    name: payload.name,
    phone: payload.phone,
    email: payload.email,
    teamName: payload.teamName,
    danceStyle: payload.danceStyle,
    city: payload.city,
    videoLink: payload.videoLink,
    createdAt: serverTimestamp(),
    details: payload.details || {},
  });
}

export async function submitSponsorEnquiry(payload) {
  await addDoc(collection(db, "sponsors"), {
    companyName: payload.companyName,
    contactPerson: payload.contactPerson,
    phone: payload.phone,
    email: payload.email,
    category: payload.category,
    createdAt: serverTimestamp(),
    recordType: "lead",
    visible: false,
    message: payload.message || "",
  });
}

export async function submitContactMessage(payload) {
  await addDoc(collection(db, "contacts"), {
    name: payload.name,
    email: payload.email,
    message: payload.message,
    createdAt: serverTimestamp(),
    phone: payload.phone || "",
    subject: payload.subject || "",
  });
}
