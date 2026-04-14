import {
  collection,
  doc,
  serverTimestamp,
  setDoc,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getDownloadURL,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { db, storage } from "./firebase.js";

function sanitizeFileName(fileName) {
  return String(fileName || "file").replace(/[^a-zA-Z0-9._-]/g, "-");
}

async function uploadRegistrationAsset(registrationId, bucketName, file) {
  const safeName = `${Date.now()}-${sanitizeFileName(file.name)}`;
  const storageRef = ref(storage, `registrations/${registrationId}/${bucketName}/${safeName}`);
  const snapshot = await uploadBytes(storageRef, file);
  const downloadURL = await getDownloadURL(snapshot.ref);

  return {
    name: file.name,
    size: file.size,
    type: file.type || "application/octet-stream",
    url: downloadURL,
    fullPath: snapshot.ref.fullPath,
  };
}

export async function submitRegistration(payload) {
  const registrationRef = doc(collection(db, "registrations"));

  try {
    const files = payload.files || {};
    const uploadedFiles = {
      video: files.video ? await uploadRegistrationAsset(registrationRef.id, "videos", files.video) : null,
      audio: files.audio ? await uploadRegistrationAsset(registrationRef.id, "audio", files.audio) : null,
      photos: Array.isArray(files.photos)
        ? await Promise.all(files.photos.map((file) => uploadRegistrationAsset(registrationRef.id, "photos", file)))
        : [],
      documents: Array.isArray(files.documents)
        ? await Promise.all(files.documents.map((file) => uploadRegistrationAsset(registrationRef.id, "documents", file)))
        : [],
    };

    await setDoc(registrationRef, {
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      teamName: payload.teamName,
      danceStyle: payload.danceStyle,
      city: payload.city,
      category: payload.category || "",
      age: payload.age || "",
      memberCount: payload.memberCount || "",
      experienceLevel: payload.experienceLevel || "",
      videoLink: payload.videoLink,
      paymentStatus: payload.paymentStatus || "disabled",
      paymentReference: payload.paymentReference || "",
      videoUrl: uploadedFiles.video?.url || "",
      audioUrl: uploadedFiles.audio?.url || "",
      media: uploadedFiles,
      submissionStatus: "complete",
      uploadDebug: {
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        paymentEnabled: Boolean(payload.paymentEnabled),
        uploadedVideo: Boolean(uploadedFiles.video),
        uploadedAudio: Boolean(uploadedFiles.audio),
        uploadedPhotos: uploadedFiles.photos.length,
        uploadedDocuments: uploadedFiles.documents.length,
      },
      details: payload.details || {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return {
      id: registrationRef.id,
      uploadedFiles,
    };
  } catch (error) {
    await setDoc(registrationRef, {
      name: payload.name,
      phone: payload.phone,
      email: payload.email,
      teamName: payload.teamName,
      danceStyle: payload.danceStyle,
      city: payload.city,
      category: payload.category || "",
      age: payload.age || "",
      memberCount: payload.memberCount || "",
      experienceLevel: payload.experienceLevel || "",
      videoLink: payload.videoLink,
      paymentStatus: payload.paymentStatus || "disabled",
      paymentReference: payload.paymentReference || "",
      submissionStatus: "failed",
      uploadDebug: {
        startedAt: new Date().toISOString(),
        failedAt: new Date().toISOString(),
        paymentEnabled: Boolean(payload.paymentEnabled),
        error: error.message || "Upload failed",
      },
      details: payload.details || {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
    throw error;
  }
}

export async function submitSponsorEnquiry(payload) {
  await addDoc(collection(db, "sponsors"), {
    companyName: payload.companyName,
    company: payload.companyName,
    contactPerson: payload.contactPerson,
    phone: payload.phone,
    email: payload.email,
    category: payload.category,
    interest: payload.category,
    createdAt: serverTimestamp(),
    recordType: "lead",
    visible: false,
    message: payload.message || "",
  });
}

export async function submitContactMessage(payload) {
  await addDoc(collection(db, "contacts"), {
    name: payload.name,
    email: payload.email,
    message: payload.message,
    createdAt: serverTimestamp(),
    phone: payload.phone || "",
    subject: payload.subject || "",
  });
}
