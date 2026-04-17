import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { db } from "./firebase.js";

export function subscribeHomeContent(onData, onError) {
  return onSnapshot(
    doc(db, "settings", "home"),
    (snap) => onData(snap.exists() ? snap.data() : null),
    onError
  );
}
