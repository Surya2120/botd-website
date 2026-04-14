import {
  addDoc,
  collection,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  getDownloadURL,
  ref,
  uploadBytes,
  uploadBytesResumable,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-storage.js";
import { jsPDF } from "https://cdn.jsdelivr.net/npm/jspdf@2.5.1/+esm";
import { db, storage } from "./firebase.js";

const REGISTRATION_ROOT = "BOTD/season_1";
const PDF_TITLE = "BOTD Consent & Registration Form";
const BOTD_LOGO_PATH = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, "/")}assets/images/Final_BOTD_Logo.png`;
const PRESENTED_BY_LOGO_PATH = `${window.location.origin}${window.location.pathname.replace(/\/[^/]*$/, "/")}assets/images/studiozlogo.webp`;
const imageDataCache = new Map();

function pad(value) {
  return String(value).padStart(2, "0");
}

function buildTimestampParts(date = new Date()) {
  return {
    compact: [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join(""),
    iso: date.toISOString(),
  };
}

function sanitizeFileName(fileName = "file") {
  return String(fileName)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9._-]/g, "")
    || "file";
}

function getFileExtension(fileName = "", fallback = "bin") {
  const safeName = sanitizeFileName(fileName);
  const dotIndex = safeName.lastIndexOf(".");
  return dotIndex > -1 ? safeName.slice(dotIndex + 1) : fallback;
}

function getMimeType(file, fallbackType) {
  if (file?.type) {
    return file.type;
  }

  const extension = getFileExtension(file?.name || "", "");
  if (extension === "pdf") return "application/pdf";
  if (extension === "mp4") return "video/mp4";
  if (extension === "mp3") return "audio/mp3";
  if (extension === "wav") return "audio/wav";
  if (extension === "doc") return "application/msword";
  if (extension === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (["jpg", "jpeg"].includes(extension)) return "image/jpeg";
  if (extension === "png") return "image/png";
  return fallbackType || "application/octet-stream";
}

function buildStoragePath(folderName, fileName) {
  return `${REGISTRATION_ROOT}/${folderName}/${fileName}`;
}

function normalizeValue(value) {
  if (value === undefined || value === null || value === "") {
    return "-";
  }
  return String(value);
}

function yesNo(value) {
  return value ? "Yes" : "No";
}

async function blobToOptimizedDataUrl(blob, options = {}) {
  const {
    maxWidth = 640,
    maxHeight = 640,
    quality = 0.82,
  } = options;

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width;
      const sourceHeight = image.naturalHeight || image.height;
      const scale = Math.min(1, maxWidth / sourceWidth, maxHeight / sourceHeight);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(sourceWidth * scale));
      canvas.height = Math.max(1, Math.round(sourceHeight * scale));
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    image.onerror = (error) => {
      URL.revokeObjectURL(objectUrl);
      reject(error);
    };
    image.src = objectUrl;
  });
}

async function imageSourceToDataUrl(source) {
  if (!source) {
    return "";
  }

  if (typeof source === "string" && imageDataCache.has(source)) {
    return imageDataCache.get(source);
  }

  if (source instanceof Blob || source instanceof File) {
    return blobToOptimizedDataUrl(source, {
      maxWidth: 420,
      maxHeight: 420,
      quality: 0.76,
    });
  }

  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to load image asset: ${source}`);
  }
  const blob = await response.blob();
  const dataUrl = await blobToOptimizedDataUrl(blob, {
    maxWidth: 480,
    maxHeight: 240,
    quality: 0.86,
  });
  imageDataCache.set(source, dataUrl);
  return dataUrl;
}

function safeAddImage(doc, imageData, format, x, y, width, height, label) {
  if (!imageData) {
    return false;
  }

  try {
    doc.addImage(imageData, format, x, y, width, height);
    return true;
  } catch (error) {
    console.warn(`[BOTD] Failed to render PDF image: ${label}`, error);
    return false;
  }
}

export function formatName(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    || "registration";
}

export async function generatePDF(payload) {
  const doc = new jsPDF({
    unit: "pt",
    format: "a4",
  });
  const marginLeft = 46;
  const contentWidth = doc.internal.pageSize.getWidth() - (marginLeft * 2);
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  let cursorY = 292;
  const botdLogoPromise = imageSourceToDataUrl(BOTD_LOGO_PATH).catch((error) => {
    console.warn("[BOTD] BOTD logo skipped in PDF", error);
    return "";
  });
  const presentedLogoPromise = imageSourceToDataUrl(PRESENTED_BY_LOGO_PATH).catch((error) => {
    console.warn("[BOTD] Presented-by logo skipped in PDF", error);
    return "";
  });
  const displayPhotoPromise = payload.files?.photos?.[0]
    ? imageSourceToDataUrl(payload.files.photos[0]).catch((error) => {
        console.warn("[BOTD] Display photo skipped in PDF", error);
        return "";
      })
    : Promise.resolve("");
  const [botdLogo, presentedLogo, displayPhoto] = await Promise.all([
    botdLogoPromise,
    presentedLogoPromise,
    displayPhotoPromise,
  ]);

  const fields = [
    ["Full Name", payload.name],
    ["Age", payload.age],
    ["Minor Participant", yesNo(payload.isMinor)],
    ["Email", payload.email],
    ["Phone", payload.phone],
    ["City", payload.city],
    ["Category", payload.category],
    ["Team Name", payload.teamName],
    ["Dance Style", payload.danceStyle],
    ["How u got to know about BOTD", payload.discoverySource],
    ["Member Count", payload.memberCount],
    ["Payment Status", payload.paymentStatus],
    ["Submitted At", new Date().toLocaleString()],
  ];

  doc.setFillColor(17, 17, 17);
  doc.rect(0, 0, pageWidth, 128, "F");
  const hasBotdLogo = safeAddImage(doc, botdLogo, "JPEG", marginLeft, 20, 132, 58, "BOTD logo");
  doc.setTextColor(246, 182, 60);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(28);
  doc.text(PDF_TITLE, hasBotdLogo ? marginLeft + 150 : marginLeft, 52);
  doc.setFontSize(11);
  doc.text("Season 1 audition registration record", hasBotdLogo ? marginLeft + 150 : marginLeft, 74);
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text("Presented by Bee Infinity Groups", pageWidth - 250, 34);
  safeAddImage(doc, presentedLogo, "JPEG", pageWidth - 156, 48, 96, 38, "Presented by logo");
  doc.setDrawColor(246, 182, 60);
  doc.setLineWidth(1.1);
  doc.line(marginLeft, 96, pageWidth - marginLeft, 96);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(70, 70, 70);
  doc.text("Battle Of The Dance audition registration summary", marginLeft, 118);

  if (displayPhoto) {
    doc.setDrawColor(231, 235, 240);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(marginLeft, 144, 128, 132, 16, 16, "FD");
    if (safeAddImage(doc, displayPhoto, "JPEG", marginLeft + 12, 156, 104, 92, "Display picture")) {
      doc.setTextColor(112, 112, 112);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("DISPLAY PICTURE", marginLeft + 14, 264);
    }
  }

  doc.setDrawColor(231, 235, 240);
  doc.setFillColor(250, 250, 250);
  doc.roundedRect(marginLeft + 146, 144, contentWidth - 146, 132, 16, 16, "FD");
  doc.setTextColor(112, 112, 112);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("REGISTRATION OVERVIEW", marginLeft + 164, 170);
  doc.setTextColor(34, 34, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  const overviewLines = [
    `Category: ${normalizeValue(payload.category)}`,
    `Dance Style: ${normalizeValue(payload.danceStyle)}`,
    `Source: ${normalizeValue(payload.discoverySource)}`,
    `Digital Signature: ${normalizeValue(payload.digitalSignature)}`,
  ];
  doc.text(overviewLines, marginLeft + 164, 196);

  fields.forEach(([label, value]) => {
    const lines = doc.splitTextToSize(normalizeValue(value), contentWidth - 30);
    const blockHeight = 42 + (Math.max(lines.length - 1, 0) * 14);

    if (cursorY + blockHeight > pageHeight - 54) {
      doc.addPage();
      cursorY = 52;
    }

    doc.setDrawColor(231, 235, 240);
    doc.setFillColor(250, 250, 250);
    doc.roundedRect(marginLeft, cursorY - 20, contentWidth, blockHeight, 12, 12, "FD");

    doc.setTextColor(112, 112, 112);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(label.toUpperCase(), marginLeft + 16, cursorY);

    doc.setTextColor(20, 20, 20);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.text(lines, marginLeft + 16, cursorY + 18);
    cursorY += blockHeight + 12;
  });

  if (payload.isMinor) {
    const guardianLines = [
      `Parent / Guardian Name: ${normalizeValue(payload.parentName)}`,
      `Parent / Guardian Phone: ${normalizeValue(payload.parentPhone)}`,
      `Parent / Guardian Email: ${normalizeValue(payload.parentEmail)}`,
      `Relationship: ${normalizeValue(payload.relationship)}`,
      `Guardian Consent Given: ${yesNo(payload.details?.guardianConsentAccepted)}`,
    ];

    const guardianBlockHeight = 54 + (guardianLines.length * 14);
    if (cursorY + guardianBlockHeight > pageHeight - 54) {
      doc.addPage();
      cursorY = 52;
    }

    doc.setDrawColor(231, 235, 240);
    doc.setFillColor(248, 252, 248);
    doc.roundedRect(marginLeft, cursorY, contentWidth, guardianBlockHeight, 14, 14, "FD");
    doc.setTextColor(92, 120, 92);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("PARENT / GUARDIAN CONSENT", marginLeft + 16, cursorY + 20);
    doc.setTextColor(28, 28, 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(guardianLines, marginLeft + 16, cursorY + 44);
    cursorY += guardianBlockHeight + 14;
  }

  const legalClauses = [
    "Declaration of accuracy: All details submitted are true and complete.",
    "Media release: BOTD may use approved names, photos, audio, and video for judging, promotions, publicity, and digital publishing.",
    "Liability waiver: BOTD is not responsible for injury, accident, technical loss, or personal/property damage related to participation.",
    "Non-refundable policy: Registration fees, if enabled and collected, are non-refundable after successful submission.",
    "Rules acceptance: BOTD rules, judging criteria, and decisions are final.",
    "Disqualification rights: BOTD may reject or disqualify incomplete, misleading, duplicate, offensive, or rule-violating entries.",
    "Schedule flexibility: BOTD may revise dates, stages, or timelines whenever operationally necessary.",
    "Jurisdiction clause: Any dispute relating to this registration is subject to BOTD-designated applicable jurisdiction.",
    "By signing, I agree this is a legally binding digital consent.",
  ];
  const legalText = legalClauses.join(" ");
  const termsTitleHeight = 18;
  const termsLines = doc.splitTextToSize(legalText, contentWidth - 32);
  const termsBlockHeight = 48 + (termsLines.length * 14);
  const signBlockHeight = payload.isMinor ? 130 : 82;

  if (cursorY + termsBlockHeight + signBlockHeight > pageHeight - 54) {
    doc.addPage();
    cursorY = 52;
  }

  doc.setDrawColor(231, 235, 240);
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(marginLeft, cursorY, contentWidth, termsBlockHeight, 14, 14, "FD");
  doc.setTextColor(112, 112, 112);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("TERMS & CONDITIONS", marginLeft + 16, cursorY + termsTitleHeight);
  doc.setTextColor(28, 28, 28);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.text(termsLines, marginLeft + 16, cursorY + 42);
  cursorY += termsBlockHeight + 14;

  doc.setFillColor(255, 252, 246);
  doc.roundedRect(marginLeft, cursorY, contentWidth, signBlockHeight, 14, 14, "FD");
  doc.setTextColor(112, 112, 112);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(payload.isMinor ? "SIGNATURES" : "PARTICIPANT E-SIGNATURE", marginLeft + 16, cursorY + 18);
  doc.setDrawColor(215, 189, 132);
  doc.line(marginLeft + 16, cursorY + 56, pageWidth - marginLeft - 16, cursorY + 56);
  doc.setTextColor(28, 28, 28);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(normalizeValue(payload.digitalSignature), marginLeft + 16, cursorY + 48);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(112, 112, 112);
  doc.text(`Signed on ${new Date().toLocaleString()}`, marginLeft + 16, cursorY + 72);

  if (payload.isMinor) {
    doc.setDrawColor(182, 194, 214);
    doc.line(marginLeft + 16, cursorY + 100, pageWidth - marginLeft - 16, cursorY + 100);
    doc.setTextColor(28, 28, 28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text(normalizeValue(payload.guardianSignature), marginLeft + 16, cursorY + 92);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(112, 112, 112);
    doc.text(`Parent / Guardian signature`, marginLeft + 16, cursorY + 114);
  }

  return doc.output("blob");
}

export async function uploadPDF({ folderName, fileName, blob }) {
  const storageRef = ref(storage, buildStoragePath(folderName, fileName));
  const snapshot = await uploadBytes(storageRef, blob, {
    contentType: "application/pdf",
    cacheControl: "public,max-age=3600",
  });
  const url = await getDownloadURL(snapshot.ref);

  return {
    name: fileName,
    url,
    fullPath: snapshot.ref.fullPath,
    contentType: "application/pdf",
  };
}

function createProgressTracker(totalBytes = 0, onProgress) {
  const transferredMap = new Map();

  return (key, transferredBytes) => {
    if (typeof onProgress !== "function" || totalBytes <= 0) {
      return;
    }

    transferredMap.set(key, transferredBytes);
    const transferredTotal = Array.from(transferredMap.values()).reduce((sum, value) => sum + value, 0);
    const progress = Math.min(100, Math.round((transferredTotal / totalBytes) * 100));
    onProgress(progress);
  };
}

async function uploadMediaResumable({ folderName, file, fileName, fallbackContentType, progressKey, reportProgress }) {
  const contentType = getMimeType(file, fallbackContentType);
  const storageRef = ref(storage, buildStoragePath(folderName, fileName));
  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType,
    cacheControl: "public,max-age=3600",
  });

  const snapshot = await new Promise((resolve, reject) => {
    uploadTask.on(
      "state_changed",
      (taskSnapshot) => {
        reportProgress?.(progressKey, taskSnapshot.bytesTransferred);
      },
      reject,
      () => resolve(uploadTask.snapshot)
    );
  });
  const url = await getDownloadURL(snapshot.ref);

  return {
    name: fileName,
    originalName: file.name,
    size: file.size,
    contentType,
    url,
    fullPath: snapshot.ref.fullPath,
  };
}

export async function submitRegistration(payload) {
  const folderName = formatName(payload.name);
  const stamp = buildTimestampParts();
  const videoFile = payload.files?.video || null;
  const audioFile = payload.files?.audio || null;
  const photoFiles = Array.isArray(payload.files?.photos) ? payload.files.photos : [];
  const documentFiles = Array.isArray(payload.files?.documents) ? payload.files.documents : [];
  let pdfBlob;

  try {
    pdfBlob = await generatePDF(payload);
  } catch (error) {
    console.error("[BOTD] PDF generation failed", error);
    throw new Error("PDF generation failed before upload.");
  }

  const pdfFileName = `registration_${stamp.compact}.pdf`;
  const totalBytes = [
    pdfBlob.size || 0,
    videoFile?.size || 0,
    audioFile?.size || 0,
    ...photoFiles.map((file) => file.size || 0),
    ...documentFiles.map((file) => file.size || 0),
  ].reduce((sum, value) => sum + value, 0);
  const reportProgress = createProgressTracker(totalBytes, payload.onProgress);

  try {
    const [pdfAsset, videoAsset, audioAsset, photoAssets, documentAssets] = await Promise.all([
      uploadPDF({ folderName, fileName: pdfFileName, blob: pdfBlob }).then((result) => {
        reportProgress("pdf", pdfBlob.size || 0);
        return result;
      }),
      videoFile
        ? uploadMediaResumable({
            folderName,
            file: videoFile,
            fileName: `dance_video_${stamp.compact}.${getFileExtension(videoFile.name, "mp4")}`,
            fallbackContentType: "video/mp4",
            progressKey: "video",
            reportProgress,
          })
        : Promise.resolve(null),
      audioFile
        ? uploadMediaResumable({
            folderName,
            file: audioFile,
            fileName: `audio_${stamp.compact}.${getFileExtension(audioFile.name, "mp3")}`,
            fallbackContentType: "audio/mp3",
            progressKey: "audio",
            reportProgress,
          })
        : Promise.resolve(null),
      Promise.all(
        photoFiles.map((file, index) =>
          uploadMediaResumable({
            folderName,
            file,
            fileName: `photo_${stamp.compact}_${index + 1}.${getFileExtension(file.name, "jpg")}`,
            fallbackContentType: "image/jpeg",
            progressKey: `photo-${index}`,
            reportProgress,
          })
        )
      ),
      Promise.all(
        documentFiles.map((file, index) =>
          uploadMediaResumable({
            folderName,
            file,
            fileName: `document_${stamp.compact}_${index + 1}.${getFileExtension(file.name, "bin")}`,
            fallbackContentType: "application/octet-stream",
            progressKey: `document-${index}`,
            reportProgress,
          })
        )
      ),
    ]);

    payload.onProgress?.(100);

    const registrationDoc = {
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      isMinor: Boolean(payload.isMinor),
      city: payload.city,
      teamName: payload.teamName,
      category: payload.category || "",
      danceStyle: payload.danceStyle || "",
      age: payload.age || "",
      memberCount: payload.memberCount || "",
      discoverySource: payload.discoverySource || "",
      digitalSignature: payload.digitalSignature || "",
      parentName: payload.parentName || "",
      parentPhone: payload.parentPhone || "",
      parentEmail: payload.parentEmail || "",
      relationship: payload.relationship || "",
      guardianSignature: payload.guardianSignature || "",
      paymentStatus: payload.paymentStatus || "disabled",
      paymentReference: payload.paymentReference || "",
      status: "pending",
      submissionStatus: "complete",
      seasonKey: "season_1",
      folderName,
      folderPath: `${REGISTRATION_ROOT}/${folderName}`,
      pdfUrl: pdfAsset.url,
      pdfName: pdfAsset.name,
      videoUrl: videoAsset?.url || "",
      audioUrl: audioAsset?.url || "",
      media: {
        pdf: pdfAsset,
        video: videoAsset,
        audio: audioAsset,
        photos: photoAssets,
        documents: documentAssets,
      },
      uploadDebug: {
        startedAt: stamp.iso,
        completedAt: new Date().toISOString(),
        paymentEnabled: Boolean(payload.paymentEnabled),
        uploadedVideo: Boolean(videoAsset),
        uploadedAudio: Boolean(audioAsset),
        uploadedPhotos: photoAssets.length,
        uploadedDocuments: documentAssets.length,
        pdfGenerated: true,
      },
      details: payload.details || {},
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const registrationRef = await addDoc(collection(db, "registrations"), registrationDoc);

    return {
      id: registrationRef.id,
      folderName,
      uploadedFiles: registrationDoc.media,
      pdfAsset,
    };
  } catch (error) {
    console.error("[BOTD] submitRegistration failed", error);
    throw error;
  }
}

export async function submitSponsorEnquiry(payload) {
  return addDoc(collection(db, "sponsors"), {
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
  return addDoc(collection(db, "contacts"), {
    name: payload.name,
    email: payload.email,
    message: payload.message,
    createdAt: serverTimestamp(),
    phone: payload.phone || "",
    subject: payload.subject || "",
  });
}
