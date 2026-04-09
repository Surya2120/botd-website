import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  where
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { db } from "./firebase.js";

export function subscribeTeams(onData, onError) {
  return onSnapshot(
    collection(db, "teams"),
    (snap) => {
      onData(snap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() })));
    },
    onError
  );
}

export async function submitVote({ teamId, teamName, categoryId, mobileNumber }) {
  const voteRef = collection(db, "votes");
  const existingVote = await getDocs(query(voteRef, where("mobileNumber", "==", mobileNumber), limit(1)));

  if (!existingVote.empty) {
    throw new Error("This mobile number has already voted.");
  }

  await runTransaction(db, async (transaction) => {
    const teamRef = doc(db, "teams", teamId);
    const teamSnap = await transaction.get(teamRef);

    if (!teamSnap.exists()) {
      throw new Error("Selected team does not exist.");
    }

    transaction.update(teamRef, {
      votes: increment(1),
      updatedAt: serverTimestamp()
    });

    const newVoteRef = doc(voteRef);
    transaction.set(newVoteRef, {
      teamId,
      teamName,
      categoryId,
      mobileNumber,
      createdAt: serverTimestamp()
    });
  });
}
