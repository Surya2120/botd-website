import {
  collection,
  getDocs,
  orderBy,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  get,
  ref as realtimeRef,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { db, realtimeDb } from "./firebase.js";

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
  return get(realtimeRef(realtimeDb, "contestants")).then((snapshot) => {
    const value = snapshot.val() || {};
    return Object.entries(value)
      .map(([id, item]) => ({
        ...item,
        id,
        visible: (item.visible ?? item.isVisible) !== false,
        approved: (item.approved ?? true) !== false,
        categoryId: item.categoryId || item.category || "",
        votes: Number(item.votes || 0),
      }))
      .sort((left, right) => Number(right.votes || 0) - Number(left.votes || 0));
  });
}
