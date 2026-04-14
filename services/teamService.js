import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import { db } from "./firebase.js";

function normalizePhoneKey(phoneNumber) {
  return String(phoneNumber || "").replace(/\D/g, "");
}

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

export async function submitVote({ participantId, userId, phoneNumber, deviceId }) {
  await runTransaction(db, async (transaction) => {
    const voteDocRef = doc(db, "votes", participantId);
    const teamRef = doc(db, "teams", participantId);
    const seasonVoteRef = doc(db, "seasonVotes", userId);
    const deviceVoteRef = deviceId ? doc(db, "seasonVoteDevices", deviceId) : null;
    const phoneVoteRef = normalizePhoneKey(phoneNumber) ? doc(db, "seasonVotePhones", normalizePhoneKey(phoneNumber)) : null;
    const userRef = doc(db, "users", userId);
    const voteSnap = await transaction.get(voteDocRef);
    const teamSnap = await transaction.get(teamRef);
    const seasonVoteSnap = await transaction.get(seasonVoteRef);
    const deviceVoteSnap = deviceVoteRef ? await transaction.get(deviceVoteRef) : null;
    const phoneVoteSnap = phoneVoteRef ? await transaction.get(phoneVoteRef) : null;
    const voteData = voteSnap.exists() ? voteSnap.data() : {};
    const existingVoters = Array.isArray(voteData.voters) ? voteData.voters : [];

    if (
      existingVoters.includes(userId)
      || seasonVoteSnap.exists()
      || deviceVoteSnap?.exists()
      || phoneVoteSnap?.exists()
    ) {
      throw new Error("You have already voted");
    }

    if (!teamSnap.exists()) {
      throw new Error("Selected team does not exist.");
    }

    const nextVoteCount = Number(voteData.voteCount || 0) + 1;
    transaction.set(voteDocRef, {
      voteCount: nextVoteCount,
      voters: [...existingVoters, userId],
      createdAt: voteSnap.exists() ? voteData.createdAt || serverTimestamp() : serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    transaction.set(seasonVoteRef, {
      participantId,
      userId,
      phoneNumber: phoneNumber || "",
      deviceId: deviceId || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });

    if (deviceVoteRef) {
      transaction.set(deviceVoteRef, {
        participantId,
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }

    if (phoneVoteRef) {
      transaction.set(phoneVoteRef, {
        participantId,
        userId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }

    transaction.set(teamRef, {
      votes: nextVoteCount,
      updatedAt: serverTimestamp()
    }, { merge: true });

    transaction.set(userRef, {
      hasSeasonVote: true,
      votedTeamId: participantId,
      votedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  });
}
