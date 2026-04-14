import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
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

export function subscribeVoteTallies(onData, onError) {
  return onSnapshot(
    collection(db, "votes"),
    (snap) => {
      const tallies = {};
      snap.forEach((docItem) => {
        tallies[docItem.id] = docItem.data();
      });
      onData(tallies);
    },
    onError
  );
}

export async function submitVote({ participantId, userId }) {
  await runTransaction(db, async (transaction) => {
    const voteDocRef = doc(db, "votes", participantId);
    const teamRef = doc(db, "teams", participantId);
    const voteSnap = await transaction.get(voteDocRef);
    const teamSnap = await transaction.get(teamRef);
    const voteData = voteSnap.exists() ? voteSnap.data() : {};
    const existingVoters = Array.isArray(voteData.voters) ? voteData.voters : [];

    if (existingVoters.includes(userId)) {
      throw new Error("You have already voted");
    }

    if (!teamSnap.exists()) {
      throw new Error("Selected team does not exist.");
    }

    const nextVoteCount = Number(voteData.voteCount || 0) + 1;
    transaction.set(voteDocRef, {
      voteCount: nextVoteCount,
      voters: [...existingVoters, userId],
      updatedAt: serverTimestamp(),
    }, { merge: true });

    transaction.set(teamRef, {
      votes: nextVoteCount,
      updatedAt: serverTimestamp()
    }, { merge: true });
  });
}
