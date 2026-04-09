import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { db } from "./firebase.js";

export async function submitRegistration(payload) {
  await addDoc(collection(db, "users"), {
    ...payload,
    createdAt: serverTimestamp()
  });
}

export async function submitSponsorEnquiry(payload) {
  await addDoc(collection(db, "sponsorEnquiries"), {
    ...payload,
    createdAt: serverTimestamp()
  });
}

export async function submitContactMessage(payload) {
  await addDoc(collection(db, "contactMessages"), {
    ...payload,
    createdAt: serverTimestamp()
  });
}
