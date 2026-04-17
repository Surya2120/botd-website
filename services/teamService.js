import {
  collection,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  get,
  increment as realtimeIncrement,
  onValue,
  ref as realtimeRef,
  update as realtimeUpdate,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { db, realtimeDb } from "./firebase.js";

const CONTESTANTS_PATH = "contestants";

function normalizeContestant(id, value = {}) {
  const visible = value.visible ?? value.isVisible ?? true;
  const approved = value.approved ?? true;

  return {
    ...value,
    id,
    visible: visible !== false,
    approved: approved !== false,
    categoryId: value.categoryId || value.category || "",
    votes: Number(value.votes || 0),
  };
}

function normalizePhoneKey(phoneNumber) {
  return String(phoneNumber || "").replace(/\D/g, "");
}

export function subscribeTeams(onData, onError) {
  const contestantsRef = realtimeRef(realtimeDb, CONTESTANTS_PATH);

  return onValue(
    contestantsRef,
    (snapshot) => {
      const value = snapshot.val() || {};
      const items = Object.entries(value)
        .map(([id, contestant]) => normalizeContestant(id, contestant))
        .sort((left, right) => {
          const orderDifference = Number(left.sortOrder || 0) - Number(right.sortOrder || 0);
          if (orderDifference !== 0) return orderDifference;
          return String(left.name || "").localeCompare(String(right.name || ""));
        });

      onData(items);
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
  const contestantSnap = await get(realtimeRef(realtimeDb, `${CONTESTANTS_PATH}/${participantId}`));
  if (!contestantSnap.exists()) {
    throw new Error("Selected contestant does not exist.");
  }

  await runTransaction(db, async (transaction) => {
    const voteDocRef = doc(db, "votes", participantId);
    const teamRef = doc(db, "teams", participantId);
    const seasonVoteRef = doc(db, "seasonVotes", userId);
    const deviceVoteRef = deviceId ? doc(db, "seasonVoteDevices", deviceId) : null;
    const phoneVoteRef = normalizePhoneKey(phoneNumber) ? doc(db, "seasonVotePhones", normalizePhoneKey(phoneNumber)) : null;
    const userRef = doc(db, "users", userId);
    const voteSnap = await transaction.get(voteDocRef);
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

  await realtimeUpdate(realtimeRef(realtimeDb, `${CONTESTANTS_PATH}/${participantId}`), {
    votes: realtimeIncrement(1),
  });
}
