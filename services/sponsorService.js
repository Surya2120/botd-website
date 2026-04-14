import { collection, onSnapshot, orderBy, query } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { db } from "./firebase.js";

export function subscribeSponsors(onData, onError) {
  const ref = query(collection(db, "sponsors"), orderBy("category", "asc"), orderBy("createdAt", "desc"));
  return onSnapshot(ref, (snap) => onData(snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }))), onError);
}
