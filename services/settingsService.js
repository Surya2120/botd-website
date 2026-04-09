import { doc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { db } from "./firebase.js";

export function subscribeSettings(onData, onError) {
  return onSnapshot(
    doc(db, "settings", "app"),
    (snap) => {
      onData(snap.exists() ? snap.data() : { votingOpen: false, activeCategory: null, votingEndTime: null, announcement: "" });
    },
    onError
  );
}

export async function ensureSettingsDocument() {
  await setDoc(
    doc(db, "settings", "app"),
    {
      votingOpen: false,
      activeCategory: "KG",
      votingEndTime: null,
      announcement: "",
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "settings", "home"),
    {
      bannerImage: "",
      title: "Battle Of The Dance",
      subtitle: "India's Hybrid Online Dance Competition",
      prizeText: "-",
      isLive: true,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
}
