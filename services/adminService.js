import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { db } from "./firebase.js";

async function readCollectionItems(collectionName, constraints = []) {
  const ref = constraints.length
    ? query(collection(db, collectionName), ...constraints)
    : collection(db, collectionName);
  const snapshot = await getDocs(ref);
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function fetchRegistrations() {
  return readCollectionItems("registrations", [orderBy("createdAt", "desc")]);
}

export function fetchContacts() {
  return readCollectionItems("contacts", [orderBy("createdAt", "desc")]);
}

export function fetchSponsorLeads() {
  return readCollectionItems("sponsors", [where("recordType", "==", "lead")]);
}

export function fetchVoteTallies() {
  return readCollectionItems("votes");
}

export function fetchTeams() {
  return readCollectionItems("teams", [orderBy("votes", "desc")]);
}
