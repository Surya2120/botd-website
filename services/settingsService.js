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

  await setDoc(
    doc(db, "settings", "uiControls"),
    {
      showVotes: false,
      showLeaderboard: true,
      registrationOpen: false,
      showInterestButton: true,
      showRules: true,
      registrationFeeAmount: 1,
      registrationClosedMessage: "AUDITIONS OPEN ON 20th APRIL",
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  await setDoc(
    doc(db, "settings", "events"),
    {
      partyBlast: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export function subscribeUiControls(onData, onError) {
  return onSnapshot(
    doc(db, "settings", "uiControls"),
    (snap) => {
      onData(snap.exists() ? snap.data() : {
        showVotes: false,
        showLeaderboard: true,
        registrationOpen: false,
        showInterestButton: true,
        showRules: true,
        registrationFeeAmount: 1,
        registrationClosedMessage: "AUDITIONS OPEN ON 20th APRIL",
      });
    },
    onError
  );
}

export async function updateUiControls(partialControls = {}) {
  await setDoc(
    doc(db, "settings", "uiControls"),
    {
      ...partialControls,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

function parseBooleanControl(value, fallback = false) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "open", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "closed", "off"].includes(normalized)) return false;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  return fallback;
}

export function subscribeVoteVisibility(onData, onError) {
  return subscribeUiControls(
    (data) => onData({
      showVotes: Boolean(data?.showVotes),
      showLeaderboard: Boolean(data?.showLeaderboard),
      registrationOpen: parseBooleanControl(data?.registrationOpen, false),
      showInterestButton: data?.showInterestButton !== false,
      showRules: data?.showRules !== false,
      registrationFeeAmount: Number(data?.registrationFeeAmount || 1),
      registrationClosedMessage: data?.registrationClosedMessage || "AUDITIONS OPEN ON 20th APRIL",
    }),
    onError
  );
}

export async function setVoteVisibility(showVotes) {
  await updateUiControls({ showVotes: Boolean(showVotes) });
}

export async function setLeaderboardVisibility(showLeaderboard) {
  await updateUiControls({ showLeaderboard: Boolean(showLeaderboard) });
}

export function subscribeEventSignals(onData, onError) {
  return onSnapshot(
    doc(db, "settings", "events"),
    (snap) => {
      onData(snap.exists() ? snap.data() : { partyBlast: null });
    },
    onError
  );
}

export async function triggerPartyBlast() {
  await setDoc(
    doc(db, "settings", "events"),
    {
      partyBlast: Date.now(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
