import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
} from "https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js";
import {
  buildInternationalPhoneNumber,
  getCurrentUser,
  resetRecaptcha,
  sanitizePhoneDigits,
  sendPhoneOtp,
  SUPPORTED_PHONE_COUNTRIES,
  subscribeAuthState,
  verifyPhoneOtp,
} from "../services/authService.js";
import {
  fetchContacts,
  fetchRegistrations,
  fetchSponsorLeads,
  fetchTeams,
  fetchVoteTallies,
} from "../services/adminService.js";
import { subscribeCategories } from "../services/categoryService.js";
import { db } from "../services/firebase.js";
import { submitContactMessage, submitRegistration, submitRegistrationInterest, submitSponsorEnquiry } from "../services/formService.js";
import { subscribeHomeContent } from "../services/homeService.js";
import {
  CASHFREE_CONFIG,
  createCashfreeOrder,
  loadCashfreeConfig,
  verifyCashfreeOrder,
} from "../services/paymentService.js";
import {
  setLeaderboardVisibility,
  setVoteVisibility,
  subscribeEventSignals,
  subscribeSettings,
  subscribeUiControls,
  triggerPartyBlast,
} from "../services/settingsService.js";
import { submitVote, subscribeTeams, subscribeVoteTallies } from "../services/teamService.js";

const THEME_KEY = "botd-theme";
const DEVICE_ID_KEY = "botd-device-id";
const LOGO_PATH = "assets/images/logo/Final_BOTD_Logo.png";
const CONTENT_COLLECTION = "adminContent";
const JUDGES_COLLECTION = "judges";
const SPONSORS_COLLECTION = "sponsors";
const POSTERS_COLLECTION = "posters";
const VIDEOS_COLLECTION = "videos";
const CACHE_TTL_MS = 1000 * 60 * 30;
const LOADING_TIMEOUT_MS = 2400;
const FALLBACK_ABOUT_VIDEOS = [
  "assets/video/WhatPeopleSay/wps.mp4",
];
const FALLBACK_EVENT_POSTERS = [
  "assets/images/posters/poster1.webp",
  "assets/images/posters/poster2.webp",
  "assets/images/posters/poster3.webp",
  "assets/images/posters/poster4.webp",
  "assets/images/posters/poster5.webp",
  "assets/images/posters/poster6.webp",
  "assets/images/posters/poster7.webp",
  "assets/images/posters/poster8.webp",
];

const CONTENT_DOCS = {
  season: "seasonPage",
  events: "eventsPage",
  voting: "votingPage",
  rules: "rulesPage",
};
const JUDGE_MAPPINGS = [
  { docId: "judge-a", prefix: "judge1" },
  { docId: "judge-b", prefix: "judge2" },
  { docId: "judge-c", prefix: "judge3" },
];
const confirmBox = document.getElementById("confirm-box");
const confirmTeamName = document.getElementById("confirm-team-name");
const confirmVoteBtn = document.getElementById("confirm-vote");
const changeSelectionBtn = document.getElementById("change-selection");

let isConfirmed = false;

const body = document.body;
const root = document.documentElement;
const themeToggle = document.getElementById("theme-toggle");
const themeLabel = themeToggle?.querySelector(".theme-toggle-label");
const menuToggle = document.getElementById("menu-toggle");
const siteNav = document.getElementById("site-nav");
const topbar = document.querySelector(".topbar");
const hero = document.querySelector(".hero");
const cinematicScenes = document.querySelectorAll(".cinematic-scene");
const parallaxLayers = document.querySelectorAll(".poster-card");
const interactiveCards = document.querySelectorAll(
  ".highlight-card, .glass-card, .concept-card, .step-card, .vote-card, .category-card, .benefit-card, .cta-panel, .instruction-card, .contact-info-card, .sponsor-logo-card, .founder-card, .title-sponsor-banner, .powered-sponsor-card, .season-banner"
);
const revealItems = document.querySelectorAll(".reveal");
const registrationForm = document.getElementById("registration-form");
const pageSubscriptions = [];

let scrollTicking = false;
let loadingScreen = null;
let modalRoot = null;
let modalTitle = null;
let modalText = null;
let modalPrimary = null;
let modalSecondary = null;
let modalClose = null;
let activeModalResolver = null;
let liveVotingOpen = true;
let liveVotingClosedMessage = "";
let liveVotingTeams = [];
let liveVotingCategories = [];
let liveVoteTallies = {};
let liveUiControls = {
  showVotes: false,
  showLeaderboard: true,
  registrationOpen: true,
  showInterestButton: true,
  registrationClosedMessage: "AUDITIONS OPEN ON 20th APRIL",
};
let currentVoteConfirmation = null;
let activeUser = null;
let lastPartyBlastValue = null;
let registrationPortalController = null;
let eventPosterScrollFrame = null;
const lastRenderedVoteCounts = {};
const animatedCountState = {};
const votingUiState = {
  selectedTeamId: "",
  selectedContestant: "",
  isConfirmed: false,
};
const OTP_LENGTH = 6;

function setElementText(id, value) {
  const element = document.getElementById(id);

  if (!element || value === undefined || value === null || value === "") {
    return;
  }

  element.textContent = String(value);
}

function setElementHref(id, value) {
  const element = document.getElementById(id);

  if (!element || !value) {
    return;
  }

  element.setAttribute("href", value);
}

function setElementImage(id, src, alt) {
  const element = document.getElementById(id);

  if (!element || !src) {
    return;
  }

  element.setAttribute("src", src);

  if (alt) {
    element.setAttribute("alt", alt);
  }
}

function getMetaValue(metaItems, matchers = []) {
  if (!Array.isArray(metaItems) || !metaItems.length) {
    return "";
  }

  const normalizedMatchers = matchers.map((item) => String(item).toLowerCase());
  const matchedItem = metaItems.find((item) => {
    const id = String(item?.id || "").toLowerCase();
    const label = String(item?.label || "").toLowerCase();
    return normalizedMatchers.includes(id) || normalizedMatchers.includes(label);
  });

  return matchedItem?.value || "";
}

function renderList(containerId, items = []) {
  const container = document.getElementById(containerId);

  if (!container || !Array.isArray(items) || !items.length) {
    return;
  }

  container.innerHTML = items.map((item) => `<li>${item}</li>`).join("");
}

function renderRulesLayout(htmlContent) {
  const container = document.getElementById("season-rules-content");

  if (!container || !htmlContent) {
    return;
  }

  const tempRoot = document.createElement("div");
  tempRoot.innerHTML = htmlContent;

  let currentBlock = null;
  const blockMarkup = [];

  Array.from(tempRoot.children).forEach((node) => {
    if (node.tagName === "H3") {
      if (currentBlock) {
        blockMarkup.push(currentBlock);
      }

      currentBlock = `<article class="rules-block">${node.outerHTML}`;
      return;
    }

    if (!currentBlock) {
      currentBlock = '<article class="rules-block">';
    }

    currentBlock += node.outerHTML;
  });

  if (currentBlock) {
    blockMarkup.push(currentBlock);
  }

  container.innerHTML = blockMarkup.map((block) => `${block}</article>`).join("");
}

function applySeasonContent(content) {
  if (!content) {
    return;
  }

  setElementText("season-hero-eyebrow", content.hero?.eyebrow);
  setElementText("season-hero-title", content.hero?.title);
  setElementText("season-hero-subtitle", content.hero?.subtitle);
  setElementImage("season-hero-image", content.hero?.bannerImage, content.hero?.title || "BOTD season banner");
  setElementHref("season-hero-cta", content.hero?.ctaHref);
  setElementText("season-hero-cta", content.hero?.ctaLabel);

  const heroMeta = content.hero?.meta || [];
  setElementText("season-meta-location", getMetaValue(heroMeta, ["location"]));
  setElementText("season-meta-date", getMetaValue(heroMeta, ["date"]));
  setElementText("season-meta-venue", getMetaValue(heroMeta, ["venue"]));
  setElementText("season-meta-prize", getMetaValue(heroMeta, ["prize", "cash prize"]));

  setElementText("season-dashboard-eyebrow", content.dashboardHeading?.eyebrow);
  setElementText("season-dashboard-title", content.dashboardHeading?.title);
  setElementText("season-dashboard-description", content.dashboardHeading?.description);

  setElementText("season-about-title", content.aboutBox?.title);
  setElementText("season-about-content", content.aboutBox?.content);

  if (Array.isArray(content.categoryFeeBoxes)) {
    const [soloBox, groupBox, eligibilityBox] = content.categoryFeeBoxes;

    if (soloBox) {
      setElementText("season-fee-solo-title", soloBox.title);
      renderList("season-fee-solo-list", soloBox.items);
    }

    if (groupBox) {
      setElementText("season-fee-group-title", groupBox.title);
      renderList("season-fee-group-list", groupBox.items);
    }

    if (eligibilityBox) {
      setElementText("season-fee-eligibility-title", eligibilityBox.title);
      setElementText("season-fee-eligibility-description", eligibilityBox.description);
    }
  }
}

function applyRulesContent(content) {
  if (!content) {
    return;
  }

  setElementText("season-rules-title", content.title);
  renderRulesLayout(content.content);
  setElementHref("season-rulebook-link", content.rulebookUrl);
}

function getStatusClass(status) {
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedStatus === "open") {
    return "status-open";
  }

  if (normalizedStatus === "closed") {
    return "status-closed";
  }

  return "status-upcoming";
}

function renderEventStages(stages = []) {
  const timelineContainer = document.getElementById("events-timeline");
  const cardsContainer = document.getElementById("events-stage-cards");
  const enabledStages = stages
    .filter((stage) => stage?.enabled !== false)
    .sort((left, right) => Number(left?.order || 0) - Number(right?.order || 0));

  if (timelineContainer && enabledStages.length) {
    timelineContainer.innerHTML = enabledStages.map((stage, index) => `
      <article class="timeline-item reveal is-visible">
        <div class="timeline-marker">
          <span class="timeline-step">${index + 1}</span>
        </div>
        <div class="timeline-card">
          <div class="timeline-header">
            <h3>${stage.title || `Stage ${index + 1}`}</h3>
            <span class="status-badge ${getStatusClass(stage.status)}">${stage.status || "Upcoming"}</span>
          </div>
          <p>${stage.description || ""}</p>
        </div>
      </article>
    `).join("");
  }

  if (cardsContainer && enabledStages.length) {
    cardsContainer.innerHTML = enabledStages.map((stage, index) => `
      <article class="event-stage-card reveal is-visible">
        <div class="event-stage-top">
          <h3>${stage.title || `Stage ${index + 1}`}</h3>
          <span class="status-badge ${getStatusClass(stage.status)}">${stage.status || "Upcoming"}</span>
        </div>
        <p>${stage.description || ""}</p>
        ${index === 0 ? '<a class="button button-primary" href="register.html">Register Now</a>' : ""}
      </article>
    `).join("");
  }
}

function normalizePosterItem(item = {}, index = 0) {
  return {
    id: item.id || `poster-${index + 1}`,
    imageUrl: item.imageUrl || item.image || item.url || "",
    isActive: item.isActive !== false,
    order: Number(item.order ?? item.sortOrder ?? index + 1),
  };
}

function getFallbackPosters() {
  return FALLBACK_EVENT_POSTERS.map((imageUrl, index) => ({
    id: `fallback-poster-${index + 1}`,
    imageUrl,
    isActive: true,
    order: index + 1,
  }));
}

function renderEventPosterSlider(posters = []) {
  const track = document.getElementById("events-poster-track");

  if (!track) {
    return;
  }

  const activePosters = posters
    .map(normalizePosterItem)
    .filter((poster) => poster.isActive && poster.imageUrl)
    .sort((left, right) => left.order - right.order);
  const displayPosters = activePosters.length ? activePosters : getFallbackPosters();
  const posterMarkup = displayPosters.map((poster, index) => `
    <figure class="vertical-poster-card">
      <img
        src="${poster.imageUrl}"
        alt="BOTD event poster ${index + 1}"
        loading="lazy"
        decoding="async"
      >
    </figure>
  `).join("");

  track.innerHTML = `
    <div class="vertical-poster-set">${posterMarkup}</div>
    <div class="vertical-poster-set" aria-hidden="true">${posterMarkup}</div>
  `;

  window.requestAnimationFrame(() => startEventPosterAutoScroll(track));
}

function startEventPosterAutoScroll(track) {
  const slider = document.getElementById("events-poster-slider");

  if (!track || !slider) {
    return;
  }

  if (eventPosterScrollFrame) {
    window.cancelAnimationFrame(eventPosterScrollFrame);
    eventPosterScrollFrame = null;
  }

  let offset = 0;
  let lastTime = window.performance.now();
  const speed = Number.parseFloat(slider.dataset.speed || "34");

  track.style.animation = "none";
  track.style.willChange = "transform";

  if (slider.dataset.posterScrollBound !== "true") {
    slider.addEventListener("pointerenter", () => {
      slider.dataset.posterPaused = "true";
    });
    slider.addEventListener("pointerleave", () => {
      slider.dataset.posterPaused = "false";
    });
    slider.addEventListener("focusin", () => {
      slider.dataset.posterPaused = "true";
    });
    slider.addEventListener("focusout", () => {
      slider.dataset.posterPaused = "false";
    });
    slider.dataset.posterScrollBound = "true";
  }

  function getLoopDistance() {
    const firstSet = track.querySelector(".vertical-poster-set");
    return Math.max(1, Number(firstSet?.offsetHeight || 0));
  }

  function tick(now) {
    const elapsed = Math.min(64, now - lastTime);
    lastTime = now;

    if (slider.dataset.posterPaused !== "true") {
      const loopDistance = getLoopDistance();
      offset = (offset + ((elapsed / 1000) * speed)) % loopDistance;
      track.style.transform = `translate3d(0, -${offset}px, 0)`;
    }

    eventPosterScrollFrame = window.requestAnimationFrame(tick);
  }

  eventPosterScrollFrame = window.requestAnimationFrame(tick);
}

function loadEventPosters() {
  const track = document.getElementById("events-poster-track");

  if (!track) {
    return;
  }

  renderEventPosterSlider(getFallbackPosters());

  try {
    const postersRef = collection(db, POSTERS_COLLECTION);
    registerSubscription(
      onSnapshot(
        postersRef,
        (snapshot) => {
          const posters = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
          renderEventPosterSlider(posters);
        },
        (error) => {
          console.error("[BOTD] Failed to load event posters", error);
          renderEventPosterSlider(getFallbackPosters());
        }
      )
    );
  } catch (error) {
    console.error("[BOTD] Event poster listener failed", error);
    renderEventPosterSlider(getFallbackPosters());
  }
}

function normalizeVideoItem(item = {}, index = 0) {
  return {
    id: item.id || `video-${index + 1}`,
    videoUrl: item.videoUrl || item.url || "",
    isActive: item.isActive !== false,
    order: Number(item.order ?? item.sortOrder ?? index + 1),
  };
}

function getFallbackAboutVideos() {
  return FALLBACK_ABOUT_VIDEOS.map((videoUrl, index) => ({
    id: `fallback-video-${index + 1}`,
    videoUrl,
    isActive: true,
    order: index + 1,
  }));
}

function renderAboutVideoSlider(videos = []) {
  const track = document.getElementById("about-video-track");
  const slider = document.getElementById("about-video-slider");

  if (!track || !slider) {
    return;
  }

  const activeVideos = videos
    .map(normalizeVideoItem)
    .filter((video) => video.isActive && video.videoUrl)
    .sort((left, right) => left.order - right.order);
  const displayVideos = activeVideos.length ? activeVideos : getFallbackAboutVideos();

  track.innerHTML = displayVideos.map((video, index) => `
    <article class="about-video-slide" data-video-index="${index}">
      <div class="about-video-frame">
        <video preload="metadata" playsinline controls poster="assets/images/posters/poster1.webp">
          <source src="${video.videoUrl}" type="video/mp4">
        </video>
        <span class="about-video-play" aria-hidden="true"></span>
      </div>
    </article>
  `).join("");
  slider.dataset.totalVideos = String(displayVideos.length);
  slider.dataset.activeVideo = "0";
  setupAboutVideoSlider();
}

function setupAboutVideoSlider() {
  const slider = document.getElementById("about-video-slider");
  const track = document.getElementById("about-video-track");
  const previousButton = document.getElementById("about-video-prev");
  const nextButton = document.getElementById("about-video-next");

  if (!slider || !track || !previousButton || !nextButton) {
    return;
  }

  function pauseInactiveVideos() {
    track.querySelectorAll("video").forEach((video) => {
      video.pause();
    });
  }

  function updateSlider(nextIndex) {
    const currentTotal = Number(slider.dataset.totalVideos || 0);

    if (!currentTotal) {
      return;
    }

    const nextActiveIndex = (nextIndex + currentTotal) % currentTotal;
    slider.dataset.activeVideo = String(nextActiveIndex);
    track.style.transform = `translate3d(-${nextActiveIndex * 100}%, 0, 0)`;
    previousButton.disabled = currentTotal <= 1;
    nextButton.disabled = currentTotal <= 1;
    pauseInactiveVideos();
  }

  previousButton.onclick = () => {
    updateSlider(Number(slider.dataset.activeVideo || 0) - 1);
  };
  nextButton.onclick = () => {
    updateSlider(Number(slider.dataset.activeVideo || 0) + 1);
  };

  if (slider.dataset.videoSliderBound !== "true") {
    let swipeStartX = 0;
    let swipeStartY = 0;

    slider.addEventListener("touchstart", (event) => {
      const touch = event.touches?.[0];
      swipeStartX = touch?.clientX || 0;
      swipeStartY = touch?.clientY || 0;
    }, { passive: true });

    slider.addEventListener("touchend", (event) => {
      const touch = event.changedTouches?.[0];
      const deltaX = (touch?.clientX || 0) - swipeStartX;
      const deltaY = (touch?.clientY || 0) - swipeStartY;

      if (Math.abs(deltaX) > 48 && Math.abs(deltaX) > Math.abs(deltaY)) {
        updateSlider(Number(slider.dataset.activeVideo || 0) + (deltaX < 0 ? 1 : -1));
      }
    }, { passive: true });

    slider.dataset.videoSliderBound = "true";
  }

  updateSlider(Number(slider.dataset.activeVideo || 0));
}

function loadAboutVideos() {
  const track = document.getElementById("about-video-track");

  if (!track) {
    return;
  }

  renderAboutVideoSlider(getFallbackAboutVideos());

  try {
    const videosRef = collection(db, VIDEOS_COLLECTION);
    registerSubscription(
      onSnapshot(
        videosRef,
        (snapshot) => {
          const videos = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
          renderAboutVideoSlider(videos);
        },
        (error) => {
          console.error("[BOTD] Failed to load about videos", error);
          renderAboutVideoSlider(getFallbackAboutVideos());
        }
      )
    );
  } catch (error) {
    console.error("[BOTD] About video listener failed", error);
    renderAboutVideoSlider(getFallbackAboutVideos());
  }
}

function applyEventsContent(content) {
  if (!content) {
    return;
  }

  setElementText("events-hero-eyebrow", content.hero?.eyebrow);
  setElementText("events-hero-title", content.hero?.title);
  setElementText("events-hero-subtitle", content.hero?.subtitle);
  setElementText("events-hero-description", content.hero?.description);
  setElementImage("events-hero-image", content.hero?.image, content.hero?.title || "BOTD events banner");

  setElementText("events-banner-eyebrow", content.banner?.eyebrow);
  setElementText("events-banner-title", content.banner?.title);
  setElementText("events-banner-description", content.banner?.description);
  setElementText("events-banner-location", getMetaValue(content.banner?.meta, ["location"]));
  setElementText("events-banner-date", getMetaValue(content.banner?.meta, ["date"]));
  setElementText("events-banner-venue", getMetaValue(content.banner?.meta, ["venue"]));
  setElementHref("events-banner-cta", content.banner?.buttonHref);
  setElementText("events-banner-cta", content.banner?.buttonLabel);

  renderEventStages(content.stages);
  renderList("events-notes-list", content.notes);
}

function setVotingAnnouncement(message = "") {
  const announcement = document.getElementById("voting-announcement");

  if (!announcement) {
    return;
  }

  announcement.innerHTML = message ? `<span class="announcement-text"></span>` : "";
  const textNode = announcement.querySelector(".announcement-text");
  if (textNode) {
    textNode.textContent = message;
  }
  announcement.hidden = !message;
  announcement.classList.toggle("is-visible", Boolean(message));
}

function getPersistentDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY);

  if (existing) {
    return existing;
  }

  const nextId = `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  localStorage.setItem(DEVICE_ID_KEY, nextId);
  return nextId;
}

function setVotingAvailability(isOpen, closedMessage) {
  liveVotingOpen = isOpen;
  liveVotingClosedMessage = closedMessage || "";
  const closedLabel = "VOTING WILL OPEN SOON";

  const notice = document.getElementById("voting-availability-message");
  const votingShell = document.querySelector("[data-voting]");
  const closedState = document.getElementById("voting-closed-state");

  if (notice) {
    notice.textContent = isOpen ? "" : closedLabel;
    notice.hidden = isOpen;
  }

  votingShell?.classList.toggle("is-closed", !isOpen);

  if (closedState) {
    closedState.hidden = isOpen;
    closedState.textContent = isOpen ? "" : closedLabel;
  }
}

function applyVotingContent(content) {
  if (!content) {
    return;
  }

  setElementText("voting-hero-title", content.title);
  setElementText("voting-hero-subtitle", content.subtitle);
  setElementText("voting-season-label", content.seasonLabel);
  setElementText("voting-season-value", content.seasonValue);
  setElementText("voting-intro-text", content.introText);
  setElementText("voting-rules-text", content.rulesText);
  setVotingAnnouncement(content.announcement);
  setVotingAvailability(Boolean(content.votingOpen), content.closedMessage);
}

function setUiControlsState(settings = {}) {
  liveUiControls = {
    showVotes: Boolean(settings?.showVotes),
    showLeaderboard: settings?.showLeaderboard !== false,
    registrationOpen: settings?.registrationOpen !== false,
    showInterestButton: settings?.showInterestButton !== false,
    registrationClosedMessage: String(settings?.registrationClosedMessage || "AUDITIONS OPEN ON 20th APRIL"),
  };
  registrationPortalController?.applyAvailability?.(liveUiControls);
  renderVotingShell();
  renderLeaderboard();
}

function getVoteCountForTeam(teamId) {
  if (!teamId) {
    return 0;
  }

  const liveVoteDoc = liveVoteTallies[teamId];
  if (liveVoteDoc && Number.isFinite(Number(liveVoteDoc.voteCount))) {
    return Number(liveVoteDoc.voteCount);
  }

  const fallbackTeam = liveVotingTeams.find((team) => team.id === teamId);
  return Number(fallbackTeam?.votes || 0);
}

function isPublicContestant(team) {
  return team?.approved !== false && team?.visible !== false;
}

function animateCountValue(target, teamId, nextValue) {
  if (!target) {
    return;
  }

  const previousValue = Number(animatedCountState[teamId] ?? nextValue);
  const finalValue = Number(nextValue || 0);
  animatedCountState[teamId] = finalValue;

  if (previousValue === finalValue) {
    target.textContent = String(finalValue);
    return;
  }

  const duration = 420;
  const startTime = performance.now();

  const tick = (timestamp) => {
    const progress = Math.min((timestamp - startTime) / duration, 1);
    const currentValue = Math.round(previousValue + ((finalValue - previousValue) * progress));
    target.textContent = String(currentValue);

    if (progress < 1) {
      window.requestAnimationFrame(tick);
    }
  };

  window.requestAnimationFrame(tick);
}

function getVoteAnimationClass(teamId, nextCount) {
  const previousCount = lastRenderedVoteCounts[teamId];
  lastRenderedVoteCounts[teamId] = nextCount;

  if (typeof previousCount === "number" && nextCount > previousCount) {
    return " vote-count-bump";
  }

  return "";
}

function triggerPartyBlastEffect() {
  const blastRoot = document.createElement("div");
  blastRoot.className = "party-blast";
  blastRoot.setAttribute("aria-hidden", "true");

  const colors = ["#ffcf63", "#ff8f4c", "#ffffff", "#7fd48b"];
  for (let index = 0; index < 72; index += 1) {
    const particle = document.createElement("span");
    particle.className = "party-blast-particle";
    particle.style.setProperty("--party-x", `${Math.random() * 100}%`);
    particle.style.setProperty("--party-delay", `${Math.random() * 0.35}s`);
    particle.style.setProperty("--party-duration", `${3.4 + Math.random() * 1.8}s`);
    particle.style.setProperty("--party-rotate", `${(Math.random() * 360) - 180}deg`);
    particle.style.setProperty("--party-color", colors[index % colors.length]);
    particle.style.setProperty("--party-size", `${10 + Math.random() * 16}px`);
    blastRoot.appendChild(particle);
  }

  document.body.appendChild(blastRoot);
  window.setTimeout(() => blastRoot.remove(), 5200);
}

function handlePartyBlastSignal(partyBlastValue) {
  if (!partyBlastValue || partyBlastValue === lastPartyBlastValue) {
    return;
  }

  lastPartyBlastValue = partyBlastValue;
  triggerPartyBlastEffect();
}

const LEADERBOARD_CATEGORY_ORDER = [
  { id: "adult-group", label: "Adult Group" },
  { id: "kids-group", label: "Kids Group" },
  { id: "kids-solo", label: "Kids Solo" },
  { id: "open-solo", label: "Open Solo" }
];

function normalizeLeaderboardCategory(value) {
  const input = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-");

  if (!input) return "";
  if (input === "ag" || input === "adult-groups" || input === "adult-group" || input === "adultgroup") return "adult-group";
  if (input === "kg" || input === "kids-groups" || input === "kids-group" || input === "kidsgroup") return "kids-group";
  if (input === "ks" || input === "kids-solos" || input === "kids-solo" || input === "kidssolo") return "kids-solo";
  if (input === "os" || input === "open-solos" || input === "open-solo" || input === "opensolo") return "open-solo";
  if (input === "adult-group" || input === "adultgroup") return "adult-group";
  if (input === "kids-group" || input === "kidsgroup") return "kids-group";
  if (input === "kids-solo" || input === "kidssolo") return "kids-solo";
  if (input === "open-solo" || input === "opensolo") return "open-solo";
  return input;
}

function getCategoryCode(category = {}) {
  return String(category.code || category.id || category.name || "").trim();
}

function categoryMatchesTeam(team, category) {
  const teamCategory = normalizeLeaderboardCategory(team.categoryId || team.category);
  const categoryCode = String(category.code || "").trim().toUpperCase();
  const categoryId = normalizeLeaderboardCategory(category.id || category.name || category.code);
  const rawTeamCategory = String(team.categoryId || team.category || "").trim().toUpperCase();

  return teamCategory === categoryId || (categoryCode && rawTeamCategory === categoryCode);
}

function renderLeaderboard() {
  const section = document.getElementById("leaderboard-section");
  const grid = document.getElementById("leaderboard-grid");

  if (!section || !grid) {
    return;
  }

  section.hidden = !liveUiControls.showLeaderboard || !liveVotingOpen;

  if (!liveUiControls.showLeaderboard || !liveVotingOpen) {
    return;
  }

  const groupedTeams = LEADERBOARD_CATEGORY_ORDER.map((category) => {
    const teams = liveVotingTeams
      .filter(isPublicContestant)
      .filter((team) => normalizeLeaderboardCategory(team.categoryId) === category.id)
      .sort((left, right) => {
        const voteDifference = getVoteCountForTeam(right.id) - getVoteCountForTeam(left.id);
        if (voteDifference !== 0) {
          return voteDifference;
        }
        return String(left.name || "").localeCompare(String(right.name || ""));
      });

    return { ...category, teams };
  });

  const hasTeams = groupedTeams.some((category) => category.teams.length);

  if (!hasTeams) {
    grid.innerHTML = "<p class=\"leaderboard-empty\">Leaderboard will be updated soon.</p>";
    return;
  }

  const rowCount = Math.max(...groupedTeams.map((category) => category.teams.length));
  const headerMarkup = groupedTeams.map((category) => `
    <div class="leaderboard-table-head">${category.label}</div>
  `).join("");

  const rowMarkup = Array.from({ length: rowCount }, (_, index) => {
    const rank = index + 1;
    const topRowClass = rank <= 3 ? ` leaderboard-row-top leaderboard-row-top-${rank}` : "";
    const cells = groupedTeams.map((category) => {
      const team = category.teams[index];

      if (!team) {
        return `
          <div class="leaderboard-team-cell is-empty">
            <span class="leaderboard-team-name">-</span>
          </div>
        `;
      }

      const voteCount = getVoteCountForTeam(team.id);
      return `
        <div class="leaderboard-team-cell" data-leaderboard-team="${team.id}">
          <span class="leaderboard-team-name">${team.name || "Unnamed contestant"}</span>
          <span class="leaderboard-team-meta">${team.city || "Bangalore"}</span>
          <strong class="leaderboard-team-votes" data-animated-count="${team.id}">${voteCount}</strong>
        </div>
      `;
    }).join("");

    return `
      <div class="leaderboard-table-row${topRowClass}" style="--leaderboard-delay: ${index * 90}ms">
        <div class="leaderboard-rank-cell">
          <span class="leaderboard-rank-badge">#${rank}</span>
        </div>
        ${cells}
      </div>
    `;
  }).join("");

  grid.innerHTML = `
    <div class="leaderboard-table-wrap">
      <div class="leaderboard-table">
        <div class="leaderboard-table-header">
          <div class="leaderboard-rank-head">Rank</div>
          ${headerMarkup}
        </div>
        ${rowMarkup}
      </div>
    </div>
  `;

  grid.querySelectorAll("[data-animated-count]").forEach((node) => {
    animateCountValue(node, node.getAttribute("data-animated-count"), Number(node.textContent || 0));
  });
}

function initializeAdminConsole() {
  window.botdAdmin = {
    async setVoteVisibility(showVotes) {
      await setVoteVisibility(showVotes);
      console.log(`[BOTD Controls] Vote visibility set to ${Boolean(showVotes)}`);
    },
    async setLeaderboardVisibility(showLeaderboard) {
      await setLeaderboardVisibility(showLeaderboard);
      console.log(`[BOTD Controls] Leaderboard visibility set to ${Boolean(showLeaderboard)}`);
    },
    async triggerPartyBlast() {
      await triggerPartyBlast();
      console.log("[BOTD Controls] Party blast triggered");
    },
    async registrations() {
      const items = await fetchRegistrations();
      console.table(items);
      return items;
    },
    async contacts() {
      const items = await fetchContacts();
      console.table(items);
      return items;
    },
    async sponsorLeads() {
      const items = await fetchSponsorLeads();
      console.table(items);
      return items;
    },
    async votes() {
      const items = await fetchVoteTallies();
      console.table(items);
      return items;
    },
    async teams() {
      const items = await fetchTeams();
      console.table(items);
      return items;
    },
  };
}

function subscribeToDocument(collectionName, documentId, onData) {
  try {
    const cached = readCachedPayload(collectionName, documentId);
if (cached) {
  console.log("⚡ Loaded from cache:", collectionName, documentId);
  onData(cached);
}

    getDoc(doc(db, collectionName, documentId))
      .then((snapshot) => {
        if (!snapshot.exists()) {
          return;
        }
        const data = snapshot.data();
        writeCachedPayload(collectionName, documentId, data);
        onData(data);
      })
      .catch((error) => {
        console.error(`Failed to prime ${collectionName}/${documentId}`, error);
      });
  } catch (error) {
    console.error(`Failed to subscribe to ${collectionName}/${documentId}`, error);
  }
}

function registerSubscription(unsubscribe) {
  if (typeof unsubscribe === "function") {
    pageSubscriptions.push(unsubscribe);
  }
}

function getCacheKey(scope, key) {
  return `botd-cache:${scope}:${key}`;
}

function readCachedPayload(scope, key) {
  try {
    const rawValue = localStorage.getItem(getCacheKey(scope, key));
    if (!rawValue) {
      return null;
    }

    const parsed = JSON.parse(rawValue);
    if (!parsed?.timestamp || !parsed?.data) {
      return null;
    }

    if ((Date.now() - parsed.timestamp) > CACHE_TTL_MS) {
      localStorage.removeItem(getCacheKey(scope, key));
      return null;
    }

    return parsed.data;
  } catch (error) {
    console.warn("[BOTD] Failed to read cache", scope, key, error);
    return null;
  }
}

function writeCachedPayload(scope, key, data) {
  try {
    localStorage.setItem(getCacheKey(scope, key), JSON.stringify({
      timestamp: Date.now(),
      data,
    }));
  } catch (error) {
    console.warn("[BOTD] Failed to write cache", scope, key, error);
  }
}

function subscribeToCollection(collectionName, onData) {
  try {
    const cached = readCachedPayload("collection", collectionName);
    if (cached) {
      console.log("Loaded cached collection:", collectionName);
      onData(cached);
    }

    registerSubscription(
      onSnapshot(
        collection(db, collectionName),
        (snapshot) => {
        const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        writeCachedPayload("collection", collectionName, items);
        onData(items);
        },
        (error) => {
          console.error(`Failed to subscribe to collection ${collectionName}`, error);
        }
      )
    );
  } catch (error) {
    console.error(`Failed to subscribe to collection ${collectionName}`, error);
  }
}

function applyHomeContent(content) {
  if (!content) {
    return;
  }

  setElementText("home-hero-title", content.title);
  setElementText("home-hero-subtitle", content.subtitle);
  setElementText("home-highlight-prize", content.prizeText);

  if (content.bannerImage) {
    const backdrop = document.querySelector(".home-hero-backdrop");
    if (backdrop) {
      backdrop.style.backgroundImage = `linear-gradient(90deg, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0.74) 48%, rgba(5,5,5,0.48) 100%), url('${content.bannerImage}')`;
      backdrop.style.backgroundSize = "cover";
      backdrop.style.backgroundPosition = "center";
    }
  }
}

function renderSeasonContestants() {
  const host = document.querySelector(".contestant-tabs[data-tabs]");

  if (!host || !liveVotingCategories.length) {
    return;
  }

  const activeCategories = liveVotingCategories.filter((item) => item.isActive !== false);

  if (!activeCategories.length) {
    host.innerHTML = "<p>No contestant data available right now.</p>";
    return;
  }

  const activeCode = normalizeLeaderboardCategory(getCategoryCode(activeCategories[0]));

  host.innerHTML = `
    <div class="tab-list" role="tablist" aria-label="Contestant categories">
      ${activeCategories.map((category, index) => {
        const code = getCategoryCode(category);
        const target = normalizeLeaderboardCategory(code);
        const count = liveVotingTeams.filter((team) => categoryMatchesTeam(team, category) && isPublicContestant(team)).length;
        return `<button class="tab-button ${index === 0 ? "is-active" : ""}" type="button" role="tab" aria-selected="${index === 0}" data-tab-target="${target}">${category.name || code} (${count})</button>`;
      }).join("")}
    </div>
    ${activeCategories.map((category, index) => {
      const code = getCategoryCode(category);
      const target = normalizeLeaderboardCategory(code);
      const teams = liveVotingTeams.filter((team) => categoryMatchesTeam(team, category) && isPublicContestant(team));
      return `
        <div class="tab-panel ${target === activeCode && index === 0 ? "is-active" : ""}" id="${target}" role="tabpanel">
          <p class="contestant-meta">${teams.length ? `${teams.length} contestants available in ${category.name || code}.` : "Contestants will be announcing soon."}</p>
          <div class="contestant-grid">
            ${teams.map((team) => `
              <article class="contestant-card">
                <img src="${team.image || "assets/images/poster1.jpg"}" alt="${team.name || "BOTD contestant"}">
                <h3 class="season-graffiti-name">${team.name || "Unnamed contestant"}</h3>
                <p>${team.city || "Bangalore"}</p>
              </article>
            `).join("")}
          </div>
        </div>
      `;
    }).join("")}
  `;

  host.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.tabTarget;
      host.querySelectorAll(".tab-button").forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });
      host.querySelectorAll(".tab-panel").forEach((panel) => {
        panel.classList.toggle("is-active", panel.id === targetId);
      });
      replaySeasonGraffitiPaintGroup(host.querySelector(`#${targetId}`) || host);
    });
  });

  replaySeasonGraffitiPaintGroup(host);
}

function loadHomeContent() {
  registerSubscription(
    subscribeHomeContent(
      (content) => applyHomeContent(content),
      (error) => console.error("[BOTD] Failed to load home content", error)
    )
  );
}

function loadSeasonContent() {
  subscribeToDocument(CONTENT_COLLECTION, CONTENT_DOCS.season, applySeasonContent);
  subscribeToDocument(CONTENT_COLLECTION, CONTENT_DOCS.rules, applyRulesContent);
}

function loadEventsContent() {
  subscribeToDocument(CONTENT_COLLECTION, CONTENT_DOCS.events, applyEventsContent);
}

function loadVotingContent() {
  subscribeToDocument(CONTENT_COLLECTION, CONTENT_DOCS.voting, applyVotingContent);
}

function loadVotingSettings() {
  registerSubscription(
    subscribeSettings(
      (settings) => {
        if (!settings) return;
        setElementText("voting-rules-text", settings.rulesText);
        setVotingAnnouncement(settings.announcement);
        setVotingAvailability(Boolean(settings.votingOpen), settings.closedMessage);
      },
      (error) => console.error("[BOTD] Failed to load voting settings", error)
    )
  );
}

function loadUiControlSettings() {
  registerSubscription(
    subscribeUiControls(
      (settings) => {
        setUiControlsState(settings);
      },
      (error) => console.error("[BOTD] Failed to load UI controls", error)
    )
  );
}

function loadPartyBlastSignals() {
  registerSubscription(
    subscribeEventSignals(
      (settings) => {
        handlePartyBlastSignal(settings?.partyBlast || null);
      },
      (error) => console.error("[BOTD] Failed to load event controls", error)
    )
  );
}

function loadVoteTalliesRealtime() {
  registerSubscription(
    subscribeVoteTallies(
      (items) => {
        liveVoteTallies = items || {};
        renderVotingShell();
      },
      (error) => console.error("[BOTD] Failed to load vote tallies", error)
    )
  );
}

function loadAuthSession() {
  registerSubscription(
    subscribeAuthState(
      (user) => {
        activeUser = user || null;
      },
      (error) => console.error("[BOTD] Auth state failed", error)
    )
  );
}

function loadJudgesRealtime() {
  JUDGE_MAPPINGS.forEach(({ docId, prefix }) => {
    subscribeToDocument(JUDGES_COLLECTION, docId, (judge) => {
      setElementText(`${prefix}-name`, judge.name || "Judge");
      setElementText(`${prefix}-role`, judge.designation || judge.role || "BOTD Judge");
      setElementImage(`${prefix}-image`, judge.image, judge.name || "BOTD Judge");
      replayJudgeNamePaint(`${prefix}-name`);
    });
  });
}

function replayJudgeNamePaint(elementId) {
  const nameElement = document.getElementById(elementId);

  replayJudgeNamePaintElement(nameElement);
}

function replayJudgeNamePaintElement(nameElement) {
  replaySeasonGraffitiPaintElement(nameElement);
}

function replaySeasonGraffitiPaintElement(nameElement) {
  if (!nameElement) {
    return;
  }

  nameElement.classList.remove("is-painted");
  void nameElement.offsetWidth;
  nameElement.classList.add("is-painted");
}

function replayJudgeNamePaintGroup(root = document) {
  root.querySelectorAll?.(".judge-profile-card h3").forEach((nameElement) => {
    replaySeasonGraffitiPaintElement(nameElement);
  });
}

function replaySeasonGraffitiPaintGroup(root = document) {
  root.querySelectorAll?.(".season-graffiti-name").forEach((nameElement) => {
    replaySeasonGraffitiPaintElement(nameElement);
  });
}

function renderSponsors(items = []) {
  const host = document.getElementById("sponsors-live-list");
  const featuredHost = document.getElementById("sponsor-featured-banner");

  if (!host && !featuredHost) {
    return;
  }

  const visibleItems = items
    .filter((item) => item.recordType !== "lead")
    .filter((item) => (item.isVisible ?? item.visible) !== false)
    .sort((left, right) => Number(left.order ?? left.sortOrder ?? 0) - Number(right.order ?? right.sortOrder ?? 0));

  const featuredSponsor = visibleItems.find((item) => String(item.name || "").toLowerCase().includes("bee infinity"))
    || visibleItems[0]
    || null;
  const gridSponsors = visibleItems.filter((item) => item.id !== featuredSponsor?.id);

  if (featuredHost) {
    if (featuredSponsor) {
      const name = "BEE INFINITY GROUPS";
      const logo = "assets/images/sponsors/bie.jpg";
      const website = featuredSponsor.website || featuredSponsor.link || "";
      const logoMarkup = `<img src="${logo}" alt="Bee Infinity Groups logo" loading="lazy" decoding="async">`;

      featuredHost.innerHTML = `
        <div class="presented-banner reveal is-visible">
          <div class="presented-banner-copy">
            <p class="sponsor-tier-label">Presented By</p>
            <h2>${name}</h2>
            <p>The headline partner leading the BOTD experience across digital presence, stage energy, and audience trust.</p>
          </div>
          <div class="presented-banner-brand">
            ${website ? `<a href="${website}" target="_blank" rel="noreferrer" aria-label="Visit ${name} website">${logoMarkup}</a>` : logoMarkup}
            <span>Presented by Bee Infinity Groups</span>
          </div>
        </div>
      `;
    } else {
      featuredHost.innerHTML = "";
    }
  }

  if (!host) {
    return;
  }

  if (!gridSponsors.length) {
    host.innerHTML = `
      <div class="sponsors-empty-state reveal is-visible">
        <p class="eyebrow">Sponsor Network</p>
        <h3>${featuredSponsor ? "More sponsors will be announced soon." : "Sponsors will be announced soon."}</h3>
        <p>${featuredSponsor ? "Additional partner logos will appear here as collaborations are announced." : "BOTD partner logos will appear here as collaborations are announced."}</p>
        <a class="button button-primary sponsor-empty-cta" href="#sponsor-form">Want to become a sponsor?</a>
      </div>
    `;
    return;
  }

  host.innerHTML = `
    <div class="dynamic-sponsors-grid">
      ${gridSponsors.map((item, index) => {
        const name = item.name || "BOTD Sponsor";
        const logo = item.logo || item.image || "";
        const website = item.website || item.link || "";
        const initials = String(name).split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "SP";
        const logoMarkup = logo
          ? `<img src="${logo}" alt="${name} logo" class="sponsor-logo-image" loading="lazy" decoding="async">`
          : `<div class="sponsor-placeholder sponsor-placeholder-md">${initials}</div>`;

        return `
          <article class="dynamic-sponsor-card reveal is-visible" style="--sponsor-delay: ${Math.min(index * 45, 360)}ms">
            ${website ? `<a class="dynamic-sponsor-link" href="${website}" target="_blank" rel="noreferrer" aria-label="Visit ${name} website">` : '<div class="dynamic-sponsor-link">'}
              <div class="dynamic-sponsor-logo">${logoMarkup}</div>
              <p>${name}</p>
            ${website ? "</a>" : "</div>"}
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function loadSponsorsRealtime() {
  subscribeToCollection(SPONSORS_COLLECTION, renderSponsors);
}

function loadCategoriesRealtime() {
  registerSubscription(
    subscribeCategories(
      (items) => {
        liveVotingCategories = items;
        renderSeasonContestants();
        renderVotingShell();
      },
      (error) => console.error("[BOTD] Failed to load categories", error)
    )
  );
}

function loadTeamsRealtime() {
  registerSubscription(
    subscribeTeams(
      (items) => {
        liveVotingTeams = items;
        renderSeasonContestants();
        renderVotingShell();
      },
      (error) => console.error("[BOTD] Failed to load teams", error)
    )
  );
}

function prepareMediaLoading() {
  document.querySelectorAll("img").forEach((image, index) => {
    if (!image.hasAttribute("loading")) {
      image.setAttribute("loading", index < 4 ? "eager" : "lazy");
    }
    if (!image.hasAttribute("decoding")) {
      image.setAttribute("decoding", "async");
    }
  });
}

function createPopup() {
  if (document.querySelector(".site-modal")) {
    modalRoot = document.querySelector(".site-modal");
    modalTitle = modalRoot.querySelector(".site-modal-title");
    modalText = modalRoot.querySelector(".site-modal-text");
    modalPrimary = modalRoot.querySelector("[data-modal-primary]");
    modalSecondary = modalRoot.querySelector("[data-modal-secondary]");
    modalClose = modalRoot.querySelector(".site-modal-close");
    return;
  }

  const modal = document.createElement("div");
  modal.className = "site-modal";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="site-modal-panel" role="dialog" aria-modal="true" aria-labelledby="site-modal-title">
      <button class="site-modal-close" type="button" aria-label="Close popup">&times;</button>
      <img class="site-modal-logo" src="${LOGO_PATH}" alt="BOTD logo">
      <h2 class="site-modal-title" id="site-modal-title"></h2>
      <p class="site-modal-text"></p>
      <div class="site-modal-actions">
        <button class="button button-secondary" type="button" data-modal-secondary hidden>Close</button>
        <button class="button button-primary" type="button" data-modal-primary>Continue</button>
      </div>
    </div>
  `;

  body.append(modal);

  modalRoot = modal;
  modalTitle = modal.querySelector(".site-modal-title");
  modalText = modal.querySelector(".site-modal-text");
  modalPrimary = modal.querySelector("[data-modal-primary]");
  modalSecondary = modal.querySelector("[data-modal-secondary]");
  modalClose = modal.querySelector(".site-modal-close");

  modal.addEventListener("click", (event) => {
    if (event.target === modalRoot) {
      closePopup(false);
    }
  });

  modalClose?.addEventListener("click", () => closePopup(false));
  modalPrimary?.addEventListener("click", () => closePopup(true));
  modalSecondary?.addEventListener("click", () => closePopup(false));

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modalRoot?.classList.contains("is-open")) {
      closePopup(false);
    }
  });
}

function closePopup(result = false) {
  if (!modalRoot) {
    return;
  }

  modalRoot.classList.remove("is-open");
  modalRoot.setAttribute("aria-hidden", "true");

  if (typeof activeModalResolver === "function") {
    activeModalResolver(result);
    activeModalResolver = null;
  }
}

function showPopup({ title, text, primaryText = "Continue", secondaryText = "" } = {}) {
  createPopup();

  if (!modalRoot || !modalTitle || !modalText || !modalPrimary || !modalSecondary) {
    return Promise.resolve(true);
  }

  modalTitle.textContent = title || "BOTD";
  modalText.textContent = text || "";
  modalPrimary.textContent = primaryText;
  modalSecondary.hidden = !secondaryText;
  modalSecondary.textContent = secondaryText || "Close";
  modalRoot.classList.add("is-open");
  modalRoot.setAttribute("aria-hidden", "false");

  return new Promise((resolve) => {
    activeModalResolver = resolve;
    window.setTimeout(() => modalPrimary.focus(), 40);
  });
}

function applyTheme(theme) {
  const selectedTheme = theme === "light" ? "light" : "dark";
  body.setAttribute("data-theme", selectedTheme);
  root.setAttribute("data-theme", selectedTheme);
  body.classList.toggle("theme-light", selectedTheme === "light");
  body.classList.toggle("theme-dark", selectedTheme === "dark");
  root.classList.toggle("theme-light", selectedTheme === "light");
  root.classList.toggle("theme-dark", selectedTheme === "dark");

  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(selectedTheme === "light"));
    themeToggle.dataset.theme = selectedTheme;
  }

  if (themeLabel) {
    themeLabel.textContent = selectedTheme === "light" ? "Dark" : "Light";
  }
}

function loadTheme() {
  applyTheme(localStorage.getItem(THEME_KEY) || "dark");
}

function toggleTheme() {
  const nextTheme = body.getAttribute("data-theme") === "light" ? "dark" : "light";
  applyTheme(nextTheme);
  localStorage.setItem(THEME_KEY, nextTheme);
}

function closeMenu() {
  if (!menuToggle || !siteNav) {
    return;
  }

  menuToggle.setAttribute("aria-expanded", "false");
  menuToggle.setAttribute("aria-label", "Open menu");
  siteNav.classList.remove("is-open");
}

function toggleMenu() {
  if (!menuToggle || !siteNav) {
    return;
  }

  const isExpanded = menuToggle.getAttribute("aria-expanded") === "true";
  menuToggle.setAttribute("aria-expanded", String(!isExpanded));
  menuToggle.setAttribute("aria-label", isExpanded ? "Open menu" : "Close menu");
  siteNav.classList.toggle("is-open", !isExpanded);
}

function setupGlobalControls() {
  if (themeToggle && themeToggle.dataset.bound !== "true") {
    themeToggle.addEventListener("click", toggleTheme);
    themeToggle.dataset.bound = "true";
  }

  if (menuToggle && menuToggle.dataset.bound !== "true") {
    menuToggle.addEventListener("click", toggleMenu);
    menuToggle.dataset.bound = "true";
  }

  document.querySelectorAll(".nav-link").forEach((link) => {
    if (link.dataset.bound === "true") {
      return;
    }

    link.addEventListener("click", closeMenu);
    link.dataset.bound = "true";
  });
}

function setupRevealAnimations() {
  revealItems.forEach((item, index) => {
    if (!item.classList.contains("reveal-delay-1") && !item.classList.contains("reveal-delay-2")) {
      item.style.setProperty("--reveal-delay", `${(index % 4) * 70}ms`);
    }
  });

  if (!("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14, rootMargin: "0px 0px -6% 0px" });

  revealItems.forEach((item) => observer.observe(item));
}

function syncHeaderState() {
  if (topbar) {
    topbar.classList.toggle("is-scrolled", window.scrollY > 18);
  }
}

function syncScrollEffects() {
  if (hero) {
    const heroRect = hero.getBoundingClientRect();
    const heroProgress = Math.max(-0.12, Math.min(1, -heroRect.top / Math.max(heroRect.height, 1)));
    hero.style.setProperty("--hero-shift", `${Math.round(heroProgress * 28)}px`);
  }

  cinematicScenes.forEach((scene) => {
    const sceneRect = scene.getBoundingClientRect();
    const viewportHeight = window.innerHeight || 1;
    const sceneProgress = Math.max(
      -1,
      Math.min(1, ((viewportHeight * 0.5) - sceneRect.top) / Math.max(sceneRect.height, 1))
    );
    scene.style.setProperty("--cinema-shift", `${Math.round(sceneProgress * 34)}px`);
  });

  scrollTicking = false;
}

function setupHeroParallax() {
  if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return;
  }

  hero.addEventListener("pointermove", (event) => {
    const bounds = hero.getBoundingClientRect();
    const offsetX = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const offsetY = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;

    parallaxLayers.forEach((layer, index) => {
      const depth = [18, 28, 22][index] || 16;
      const rotate = index === 1 ? -8 : index === 2 ? 8 : 0;
      layer.style.transform = `translate3d(${offsetX * depth}px, ${offsetY * depth * 0.55}px, 0) rotate(${rotate}deg)`;
    });
  });

  hero.addEventListener("pointerleave", () => {
    parallaxLayers.forEach((layer, index) => {
      const rotate = index === 1 ? -8 : index === 2 ? 8 : 0;
      layer.style.transform = `translate3d(0, 0, 0) rotate(${rotate}deg)`;
    });
  });
}

function setupInteractiveCards() {
  if (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || !window.matchMedia("(hover: hover) and (pointer: fine)").matches
  ) {
    return;
  }

  interactiveCards.forEach((card) => {
    card.addEventListener("pointermove", (event) => {
      const bounds = card.getBoundingClientRect();
      const rotateX = ((event.clientY - bounds.top) / bounds.height - 0.5) * -5;
      const rotateY = ((event.clientX - bounds.left) / bounds.width - 0.5) * 7;
      card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateY(-8px)`;
    });

    card.addEventListener("pointerleave", () => {
      card.style.transform = "";
    });
  });
}

function setupAccordions() {
  document.querySelectorAll("[data-accordion]").forEach((accordion) => {
    accordion.querySelectorAll(".accordion-item").forEach((item) => {
      const trigger = item.querySelector(".accordion-trigger");
      const panel = item.querySelector(".accordion-panel");

      if (!trigger || !panel) {
        return;
      }

      const isInitiallyOpen = trigger.getAttribute("aria-expanded") === "true" || panel.classList.contains("is-open");
      trigger.setAttribute("aria-expanded", String(isInitiallyOpen));
      item.classList.toggle("is-open", isInitiallyOpen);
      panel.classList.toggle("is-open", isInitiallyOpen);

      if (trigger.dataset.bound === "true") {
        return;
      }

      trigger.addEventListener("click", () => {
        const isOpen = trigger.getAttribute("aria-expanded") === "true";
        trigger.setAttribute("aria-expanded", String(!isOpen));
        item.classList.toggle("is-open", !isOpen);
        panel.classList.toggle("is-open", !isOpen);

        if (!isOpen) {
          replaySeasonGraffitiPaintGroup(panel);
        }
      });

      trigger.dataset.bound = "true";
    });
  });
}

function setupTabs() {
  document.querySelectorAll("[data-tabs]").forEach((tabGroup) => {
    const buttons = tabGroup.querySelectorAll(".tab-button");
    const panels = tabGroup.querySelectorAll(".tab-panel");

    buttons.forEach((button) => {
      button.addEventListener("click", () => {
        const targetId = button.dataset.tabTarget;

        buttons.forEach((item) => {
          const isActive = item === button;
          item.classList.toggle("is-active", isActive);
          item.setAttribute("aria-selected", String(isActive));
        });

        panels.forEach((panel) => {
          panel.classList.toggle("is-active", panel.id === targetId);
        });
      });
    });
  });
}

function prepareButtons() {
  document.querySelectorAll(".button").forEach((button) => {
    if (!button.querySelector(".button-spinner")) {
      const spinner = document.createElement("span");
      spinner.className = "button-spinner";
      spinner.setAttribute("aria-hidden", "true");
      button.append(spinner);
    }

    if (!button.querySelector(".button-label") && !button.querySelector(".payment-button-text")) {
      const label = document.createElement("span");
      label.className = "button-label";

      Array.from(button.childNodes).forEach((node) => {
        if (!(node instanceof HTMLElement && node.classList.contains("button-spinner"))) {
          label.append(node);
        }
      });

      button.prepend(label);
    }

    button.addEventListener("click", (event) => {
      if (button.disabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      const ripple = document.createElement("span");
      ripple.className = "button-ripple";
      ripple.style.left = `${event.offsetX}px`;
      ripple.style.top = `${event.offsetY}px`;
      button.append(ripple);
      window.setTimeout(() => ripple.remove(), 640);
    });
  });
}

function setButtonLoading(button, isLoading, loadingText) {
  if (!button) {
    return;
  }

  const label = button.querySelector(".payment-button-text, .button-label");

  if (!button.dataset.defaultLabel) {
    button.dataset.defaultLabel = label ? label.textContent.trim() : button.textContent.trim();
  }

  button.classList.toggle("is-loading", isLoading);
  button.disabled = isLoading;

  if (label) {
    label.textContent = isLoading ? loadingText : button.dataset.defaultLabel || label.textContent;
  } else {
    button.textContent = isLoading ? loadingText : button.dataset.defaultLabel || button.textContent;
  }
}

function updateFieldState(field) {
  const control = field?.querySelector("input, select, textarea");

  if (!field || !control) {
    return;
  }

  const hasValue = control.type === "file" ? Boolean(control.files?.length) : Boolean(control.value.trim());
  field.classList.toggle("is-filled", hasValue);
}

function markFieldValidity(field, forceValidate = false) {
  const control = field?.querySelector("input, select, textarea");

  if (!field || !control) {
    return;
  }

  updateFieldState(field);

  const shouldValidate = forceValidate || !control.matches(":focus");

  if (!shouldValidate || (!control.required && !control.value)) {
    field.classList.remove("is-error", "is-success");
    return;
  }

  if (!control.checkValidity()) {
    field.classList.add("is-error");
    field.classList.remove("is-success");
    return;
  }

  if (control.value || control.files?.length) {
    field.classList.add("is-success");
    field.classList.remove("is-error");
  } else {
    field.classList.remove("is-error", "is-success");
  }
}

function setupFieldStates(scope = document) {
  scope.querySelectorAll(".field").forEach((field) => {
    const control = field.querySelector("input, select, textarea");

    if (!control) {
      return;
    }

    updateFieldState(field);

    control.addEventListener("focus", () => {
      field.classList.add("is-focused");
      updateFieldState(field);
    });

    control.addEventListener("blur", () => {
      field.classList.remove("is-focused");
      markFieldValidity(field, true);
    });

    control.addEventListener("input", () => markFieldValidity(field));
    control.addEventListener("change", () => markFieldValidity(field, true));
  });
}

function setupRegistrationFormLegacyDisabled() {
  if (!registrationForm) {
    return;
  }

  const PAYMENT_ENABLED = false;
  const categorySelect = registrationForm.querySelector("#category-select");
  const ageInput = registrationForm.querySelector('input[name="age"]');
  const groupFields = registrationForm.querySelector("#group-fields");
  const guardianSection = registrationForm.querySelector("#guardian-section");
  const teamNameInput = registrationForm.querySelector('input[name="teamName"]');
  const memberCountInput = registrationForm.querySelector('input[name="memberCount"]');
  const parentNameInput = registrationForm.querySelector('input[name="parentName"]');
  const parentPhoneInput = registrationForm.querySelector('input[name="parentPhone"]');
  const parentEmailInput = registrationForm.querySelector('input[name="parentEmail"]');
  const relationshipInput = registrationForm.querySelector('input[name="relationship"]');
  const guardianConsentInput = registrationForm.querySelector("#guardian-consent");
  const guardianSignatureInput = registrationForm.querySelector('input[name="guardianSignature"]');
  const participantConsentInput = registrationForm.querySelector("#participant-consent");
  const videoInput = registrationForm.querySelector("#video-file");
  const audioInput = registrationForm.querySelector("#audio-file");
  const photoInput = registrationForm.querySelector("#photo-files");
  const videoName = registrationForm.querySelector("#video-file-name");
  const audioName = registrationForm.querySelector("#audio-file-name");
  const photoName = registrationForm.querySelector("#photo-file-name");
  const payButton = registrationForm.querySelector("#pay-submit");
  const interestPanel = registrationForm.querySelector("#registration-interest-panel");
  const interestButton = registrationForm.querySelector("#registration-interest-button");
  const interestStatus = registrationForm.querySelector("#registration-interest-status");
  const statusMessage = registrationForm.querySelector("#form-status");
  const successMessage = registrationForm.querySelector("#success-message");
  const uploadProgress = registrationForm.querySelector("#upload-progress");
  const uploadProgressBar = registrationForm.querySelector("#upload-progress-bar");
  const termsToggle = registrationForm.querySelector("#terms-inline-toggle");
  const termsFull = registrationForm.querySelector("#terms-inline-full");
  const razorpayKey = "rzp_test_Sak3fjFZSi65XA";

  function setStatus(message, tone) {
    if (!statusMessage) {
      return;
    }

    statusMessage.textContent = message;
    statusMessage.classList.remove("is-error", "is-success");

    if (tone) {
      statusMessage.classList.add(tone);
    }
  }

  function updateUploadState(input, label) {
    if (!input || !label) {
      return;
    }

    const wrapper = input.closest(".upload-field");
    const fileCount = Number(input.files?.length || 0);
    const hasFile = fileCount > 0;
    label.textContent = hasFile
      ? (fileCount === 1 ? input.files[0].name : `${fileCount} files selected`)
      : "No file selected";
    wrapper?.classList.toggle("is-success", hasFile);
    wrapper?.classList.remove("is-error");
  }

  function checkMinor() {
    const age = Number(ageInput?.value || 0);
    return age > 0 && age < 18;
  }

  function setUploadProgress(value) {
    if (!uploadProgress || !uploadProgressBar) {
      return;
    }

    const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    uploadProgress.classList.toggle("is-hidden", percent <= 0 || percent >= 100);
    uploadProgress.setAttribute("aria-hidden", percent <= 0 || percent >= 100 ? "true" : "false");
    uploadProgressBar.style.width = `${percent}%`;
  }

  function syncGroupFields() {
    const isGroupCategory = categorySelect && /Group/i.test(categorySelect.value);

    groupFields?.classList.toggle("is-hidden", !isGroupCategory);

    if (teamNameInput) {
      teamNameInput.required = Boolean(isGroupCategory);
      if (!isGroupCategory) {
        teamNameInput.value = "";
        teamNameInput.closest(".field")?.classList.remove("is-filled", "is-error", "is-success");
      }
    }

    if (memberCountInput) {
      memberCountInput.required = Boolean(isGroupCategory);
      if (!isGroupCategory) {
        memberCountInput.value = "";
        memberCountInput.closest(".field")?.classList.remove("is-filled", "is-error", "is-success");
      }
    }
  }

  function syncGuardianFields() {
    const isMinor = checkMinor();
    guardianSection?.classList.toggle("is-hidden", !isMinor);

    [
      parentNameInput,
      parentPhoneInput,
      parentEmailInput,
      relationshipInput,
      guardianSignatureInput,
    ].forEach((control) => {
      if (!control) {
        return;
      }

      control.required = isMinor;
      if (!isMinor) {
        control.value = "";
        control.closest(".field")?.classList.remove("is-filled", "is-error", "is-success");
      }
    });

    if (guardianConsentInput) {
      if (!isMinor) {
        guardianConsentInput.checked = false;
      }
    }
  }

  function validateForm() {
    if (!registrationForm.reportValidity()) {
      return { valid: false, message: "Please complete all required fields before continuing." };
    }

    if (!participantConsentInput?.checked) {
      return { valid: false, message: "Please accept the BOTD legal consent clauses before continuing." };
    }

    if (checkMinor()) {
      if (!guardianConsentInput?.checked) {
        return { valid: false, message: "Parent or legal guardian consent is required for minors." };
      }

      if (!guardianSignatureInput?.value.trim()) {
        return { valid: false, message: "Parent or legal guardian digital signature is required for minors." };
      }
    }

    return { valid: true };
  }

  function isFormReady() {
    if (!registrationForm.checkValidity()) {
      return false;
    }

    if (!participantConsentInput?.checked) {
      return false;
    }

    if (!checkMinor()) {
      return true;
    }

    return Boolean(guardianConsentInput?.checked) && Boolean(guardianSignatureInput?.value.trim());
  }

  function syncSubmitState() {
    if (payButton && !payButton.classList.contains("is-loading")) {
      payButton.disabled = !isFormReady();
    }
  }

  function collectFormData() {
    const termsCopyRoot = registrationForm.querySelector(".terms-embed-copy");
    const termsText = termsCopyRoot
      ? Array.from(termsCopyRoot.querySelectorAll("p")).map((item) => item.textContent.trim()).join(" ")
      : "";
    const isMinor = checkMinor();

    return {
      name: registrationForm.fullName.value.trim(),
      phone: registrationForm.phone.value.trim(),
      email: registrationForm.email.value.trim(),
      isMinor,
      teamName: registrationForm.teamName.value.trim() || registrationForm.fullName.value.trim(),
      danceStyle: registrationForm.danceStyle.value,
      city: registrationForm.city.value.trim(),
      age: registrationForm.age.value.trim(),
      category: registrationForm.category.value,
      memberCount: registrationForm.memberCount.value.trim(),
      discoverySource: registrationForm.discoverySource.value,
      digitalSignature: registrationForm.digitalSignature.value.trim(),
      signatureType: "typed",
      signedAt: new Date().toISOString(),
      parentName: isMinor ? parentNameInput?.value.trim() || "" : "",
      parentPhone: isMinor ? parentPhoneInput?.value.trim() || "" : "",
      parentEmail: isMinor ? parentEmailInput?.value.trim() || "" : "",
      relationship: isMinor ? relationshipInput?.value.trim() || "" : "",
      guardianSignature: isMinor ? guardianSignatureInput?.value.trim() || "" : "",
      paymentEnabled: PAYMENT_ENABLED,
      paymentStatus: PAYMENT_ENABLED ? "PENDING" : "DISABLED",
      paymentReference: "",
      status: "PENDING",
      details: {
        agreementAccepted: Boolean(participantConsentInput?.checked),
        guardianConsentAccepted: Boolean(guardianConsentInput?.checked),
        digitalSignature: registrationForm.digitalSignature.value.trim(),
        guardianSignature: guardianSignatureInput?.value.trim() || "",
        termsAcceptedText: termsText,
        paymentAmount: 99,
        paymentCurrency: "INR",
        paymentReference: "",
        optionalUploads: {
          videoFileName: videoInput?.files?.[0]?.name || "",
          audioFileName: audioInput?.files?.[0]?.name || "",
          photoFileNames: Array.from(photoInput?.files || []).map((file) => file.name),
        },
      },
      files: {
        video: videoInput?.files?.[0] || null,
        audio: audioInput?.files?.[0] || null,
        photos: Array.from(photoInput?.files || []),
        documents: [],
      },
    };
  }

  async function finalizeSubmission(paymentReference) {
    const payload = collectFormData();
    payload.details.paymentReference = paymentReference;
    payload.paymentReference = paymentReference;
    payload.paymentStatus = PAYMENT_ENABLED ? "paid" : "disabled";
    payload.onProgress = (progress) => {
      setUploadProgress(progress);
      setStatus(progress > 0 ? `Uploading files... ${progress}%` : "Preparing your registration PDF...", "");
      if (progress > 0 && progress < 100) {
        setButtonLoading(payButton, true, `Uploading ${progress}%`);
      }
    };

    try {
      const result = await submitRegistration(payload);
      console.log("[BOTD] Registration saved to Firestore and Storage", {
        registrationId: result.id,
        folderName: result.folderName,
        pdfUrl: result.pdfAsset?.url || "",
        uploadSummary: result.uploadedFiles,
      });
      setUploadProgress(100);
      successMessage?.classList.remove("is-hidden");
      setStatus(
        PAYMENT_ENABLED
          ? "Payment successful. Your consent form and uploads were saved."
          : "Consent form submitted. PDF and uploads saved successfully.",
        "is-success"
      );
      registrationForm.reset();
      syncGroupFields();
      syncGuardianFields();
      updateUploadState(videoInput, videoName);
      updateUploadState(audioInput, audioName);
      updateUploadState(photoInput, photoName);
      if (termsToggle) {
        termsToggle.setAttribute("aria-expanded", "false");
      }
      termsFull?.classList.add("is-hidden");
      registrationForm.querySelectorAll(".field").forEach((field) => field.classList.remove("is-filled", "is-success", "is-error"));
      syncSubmitState();

      await showPopup({
        title: "Registration Confirmed",
        text: "Your BOTD consent form has been recorded successfully.",
        primaryText: "Continue",
      });
    } catch (error) {
      console.error("[BOTD] Registration submit failed", error);
      setUploadProgress(0);
      setStatus("Registration could not be completed. Please try again or contact BOTD support.", "is-error");
    }
  }

  function startPayment() {
    registrationForm.querySelectorAll(".field").forEach((field) => markFieldValidity(field, true));

    const validation = validateForm();
    if (!validation.valid) {
      setStatus(validation.message, "is-error");
      syncSubmitState();
      return;
    }

    successMessage?.classList.add("is-hidden");
    setStatus(PAYMENT_ENABLED ? "Preparing your payment..." : "Submitting your registration...", "");
    setButtonLoading(payButton, true, PAYMENT_ENABLED ? "Processing" : "Submitting");

      if (!PAYMENT_ENABLED) {
        finalizeSubmission("payment-disabled")
          .finally(() => {
            setUploadProgress(0);
            setButtonLoading(payButton, false, "Proceed to Payment");
            syncSubmitState();
          });
      return;
    }

    const paymentOptions = {
      key: razorpayKey,
      amount: 9900,
      currency: "INR",
      name: "Battle Of The Dance",
      description: "First Audition Round Registration",
      async handler(response) {
        await finalizeSubmission(response.razorpay_payment_id || "payment-confirmed");
        setButtonLoading(payButton, false, "Pay & Submit");
        syncSubmitState();
      },
      prefill: {
        name: registrationForm.fullName.value.trim(),
        email: registrationForm.email.value.trim(),
        contact: registrationForm.phone.value.trim(),
      },
      theme: {
        color: "#f6b63c",
      },
      modal: {
        ondismiss() {
          setStatus("Payment was cancelled. Your form details are still on the page.", "is-error");
          setButtonLoading(payButton, false, "Pay & Submit");
          syncSubmitState();
        },
      },
    };

    const hasValidTestKey = typeof razorpayKey === "string"
      && razorpayKey.startsWith("rzp_test_")
      && !razorpayKey.includes("YOUR_KEY_HERE");

    if (typeof window.Razorpay !== "function") {
      setStatus("Payment window could not open. Please refresh and try again.", "is-error");
      setButtonLoading(payButton, false, "Pay & Submit");
      syncSubmitState();
      return;
    }

    if (!hasValidTestKey) {
      setStatus("Payment setup is not ready. Please contact BOTD support.", "is-error");
      setButtonLoading(payButton, false, "Pay & Submit");
      syncSubmitState();
      return;
    }

    const razorpay = new window.Razorpay(paymentOptions);
    razorpay.on("payment.failed", () => {
      setStatus("Payment was not completed. Please try again.", "is-error");
      setButtonLoading(payButton, false, "Pay & Submit");
      syncSubmitState();
    });
    razorpay.open();
  }

  registrationForm.addEventListener("input", syncSubmitState);
  registrationForm.addEventListener("change", syncSubmitState);
  ageInput?.addEventListener("input", () => {
    syncGuardianFields();
    syncSubmitState();
  });
  categorySelect?.addEventListener("change", () => {
    syncGroupFields();
    syncSubmitState();
  });
  videoInput?.addEventListener("change", () => updateUploadState(videoInput, videoName));
  audioInput?.addEventListener("change", () => updateUploadState(audioInput, audioName));
  photoInput?.addEventListener("change", () => updateUploadState(photoInput, photoName));
  termsToggle?.addEventListener("click", () => {
    const nextExpanded = termsToggle.getAttribute("aria-expanded") !== "true";
    termsToggle.setAttribute("aria-expanded", String(nextExpanded));
    termsFull?.classList.toggle("is-hidden", !nextExpanded);
  });
  payButton?.addEventListener("click", startPayment);

  if (!PAYMENT_ENABLED) {
    const paymentLabel = payButton?.querySelector(".payment-button-text");
    if (paymentLabel) {
      paymentLabel.textContent = "Proceed to Payment";
    }
  }

  syncGroupFields();
  syncGuardianFields();
  updateUploadState(videoInput, videoName);
  updateUploadState(audioInput, audioName);
  updateUploadState(photoInput, photoName);
  syncSubmitState();
}

function setupRegistrationForm() {
  if (!registrationForm) {
    return;
  }

  const PAYMENT_ENABLED = Boolean(CASHFREE_CONFIG.enabled);
  const defaultClosed = registrationForm.dataset.registrationClosed === "true";
  const categorySelect = registrationForm.querySelector("#category-select");
  const ageInput = registrationForm.querySelector('input[name="age"]');
  const groupFields = registrationForm.querySelector("#group-fields");
  const guardianSection = registrationForm.querySelector("#guardian-section");
  const teamNameInput = registrationForm.querySelector('input[name="teamName"]');
  const memberCountInput = registrationForm.querySelector('input[name="memberCount"]');
  const parentNameInput = registrationForm.querySelector('input[name="parentName"]');
  const parentPhoneInput = registrationForm.querySelector('input[name="parentPhone"]');
  const parentEmailInput = registrationForm.querySelector('input[name="parentEmail"]');
  const relationshipInput = registrationForm.querySelector('input[name="relationship"]');
  const guardianConsentInput = registrationForm.querySelector("#guardian-consent");
  const guardianConsentWrap = registrationForm.querySelector("#guardian-consent-wrap");
  const guardianSignatureInput = registrationForm.querySelector('input[name="guardianSignature"]');
  const participantConsentInput = registrationForm.querySelector("#participant-consent");
  const participantConsentWrap = registrationForm.querySelector("#participant-consent-wrap");
  const videoInput = registrationForm.querySelector("#video-file");
  const audioInput = registrationForm.querySelector("#audio-file");
  const photoInput = registrationForm.querySelector("#photo-files");
  const videoName = registrationForm.querySelector("#video-file-name");
  const audioName = registrationForm.querySelector("#audio-file-name");
  const photoName = registrationForm.querySelector("#photo-file-name");
  const payButton = registrationForm.querySelector("#pay-submit");
  const interestPanel = registrationForm.querySelector("#registration-interest-panel");
  const interestButton = registrationForm.querySelector("#registration-interest-button");
  const interestStatus = registrationForm.querySelector("#registration-interest-status");
  const statusMessage = registrationForm.querySelector("#form-status");
  const successMessage = registrationForm.querySelector("#success-message");
  const uploadProgress = registrationForm.querySelector("#upload-progress");
  const uploadProgressBar = registrationForm.querySelector("#upload-progress-bar");
  const honeypotInput = registrationForm.querySelector('input[name="website"]');
  const termsCollapseToggle = registrationForm.querySelector("#terms-collapse-toggle");
  const termsEmbedCopy = registrationForm.querySelector("#terms-embed-copy");
  const disabledBanner = document.getElementById("registration-disabled-banner");
  const disabledTitle = document.getElementById("registration-disabled-title");
  const disabledCopy = document.getElementById("registration-disabled-copy");
  const heroStatus = document.getElementById("registration-hero-status");
  const heroCopy = document.getElementById("registration-hero-copy") || document.querySelector(".register-hero-highlight p");
  const allControls = Array.from(registrationForm.querySelectorAll("input, select, textarea, button"));
  let registrationOpen = !defaultClosed;

  function setInterestStatus(message, tone) {
    if (!interestStatus) {
      return;
    }

    interestStatus.textContent = message;
    interestStatus.classList.remove("is-error", "is-success");
    if (tone) {
      interestStatus.classList.add(tone);
    }
  }

  function setStatus(message, tone) {
    if (!statusMessage) {
      return;
    }

    statusMessage.textContent = message;
    statusMessage.classList.remove("is-error", "is-success");
    if (tone) {
      statusMessage.classList.add(tone);
    }
  }

  function setUploadProgress(value) {
    if (!uploadProgress || !uploadProgressBar) {
      return;
    }

    const percent = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
    uploadProgress.classList.toggle("is-hidden", percent <= 0 || percent >= 100);
    uploadProgress.setAttribute("aria-hidden", percent <= 0 || percent >= 100 ? "true" : "false");
    uploadProgressBar.style.width = `${percent}%`;
  }

  function checkMinor() {
    const age = Number(ageInput?.value || 0);
    return age > 0 && age < 18;
  }

  function updateUploadState(input, label, forceValidate = false) {
    if (!input || !label) {
      return;
    }

    const wrapper = input.closest(".upload-field");
    const fileCount = Number(input.files?.length || 0);
    const hasFile = fileCount > 0;
    const validationMessage = getUploadValidationMessage(input);
    label.textContent = hasFile
      ? (fileCount === 1 ? input.files[0].name : `${fileCount} files selected`)
      : "No file selected";
    wrapper?.classList.toggle("is-success", hasFile && !validationMessage);
    wrapper?.classList.toggle("is-error", Boolean(forceValidate || input.required) && Boolean(validationMessage));
    input.setCustomValidity(validationMessage);
  }

  function getUploadValidationMessage(input) {
    if (!input?.required && !input?.files?.length) {
      return "";
    }

    const file = input?.files?.[0] || null;
    if (!file) {
      return "This upload is required.";
    }

    const fileName = String(file.name || "").toLowerCase();
    const fileType = String(file.type || "").toLowerCase();

    if (input === videoInput && fileType !== "video/mp4" && !fileName.endsWith(".mp4")) {
      return "Upload a valid MP4 video file.";
    }

    if (input === audioInput && !["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"].includes(fileType) && !/\.(mp3|wav)$/.test(fileName)) {
      return "Upload a valid MP3 or WAV audio file.";
    }

    if (input === photoInput && !fileType.startsWith("image/")) {
      return "Upload a valid display photo.";
    }

    return "";
  }

  function validateRequiredUploads(forceValidate = false) {
    const uploadEntries = [
      [videoInput, videoName],
      [audioInput, audioName],
      [photoInput, photoName],
    ];

    uploadEntries.forEach(([input, label]) => updateUploadState(input, label, forceValidate));
    return uploadEntries.every(([input]) => !getUploadValidationMessage(input));
  }

  function syncTermsCollapse(forceExpanded) {
    if (!termsCollapseToggle || !termsEmbedCopy) {
      return;
    }

    const shouldExpand = typeof forceExpanded === "boolean"
      ? forceExpanded
      : termsCollapseToggle.getAttribute("aria-expanded") !== "true";

    termsCollapseToggle.setAttribute("aria-expanded", String(shouldExpand));
    termsEmbedCopy.classList.toggle("is-collapsed", !shouldExpand);
  }

  function syncConsentState() {
    participantConsentWrap?.classList.toggle("is-error", !participantConsentInput?.checked);
    participantConsentWrap?.classList.toggle("is-success", Boolean(participantConsentInput?.checked));

    const isMinor = checkMinor();
    guardianConsentWrap?.classList.toggle("is-error", isMinor && !guardianConsentInput?.checked);
    guardianConsentWrap?.classList.toggle("is-success", !isMinor || Boolean(guardianConsentInput?.checked));
  }

  function syncGroupFields() {
    const isGroupCategory = categorySelect && /Group/i.test(categorySelect.value);
    groupFields?.classList.toggle("is-hidden", !isGroupCategory);

    [teamNameInput, memberCountInput].forEach((control) => {
      if (!control) {
        return;
      }

      control.required = Boolean(isGroupCategory);
      if (!isGroupCategory) {
        control.value = "";
        control.closest(".field")?.classList.remove("is-filled", "is-error", "is-success");
      }
    });
  }

  function syncGuardianFields() {
    const isMinor = checkMinor();
    guardianSection?.classList.toggle("is-hidden", !isMinor);

    [parentNameInput, parentPhoneInput, parentEmailInput, relationshipInput, guardianSignatureInput].forEach((control) => {
      if (!control) {
        return;
      }

      control.required = isMinor;
      if (!isMinor) {
        control.value = "";
        control.closest(".field")?.classList.remove("is-filled", "is-error", "is-success");
      }
    });

    if (guardianConsentInput && !isMinor) {
      guardianConsentInput.checked = false;
    }
  }

  function isFormReady() {
    if (!registrationOpen) {
      return false;
    }

    if (!registrationForm.checkValidity()) {
      return false;
    }

    if (!validateRequiredUploads()) {
      return false;
    }

    if (!participantConsentInput?.checked) {
      return false;
    }

    if (!checkMinor()) {
      return true;
    }

    return Boolean(guardianConsentInput?.checked) && Boolean(guardianSignatureInput?.value.trim());
  }

  function syncSubmitState() {
    if (payButton && !payButton.classList.contains("is-loading")) {
      payButton.disabled = !isFormReady();
    }
  }

  function applyRegistrationAvailability(settings = {}) {
    registrationOpen = settings?.registrationOpen !== false;
    const closedMessage = String(settings?.registrationClosedMessage || "AUDITIONS OPEN ON 20th APRIL");

    registrationForm.classList.toggle("is-disabled", !registrationOpen);
    registrationForm.dataset.registrationClosed = registrationOpen ? "false" : "true";

    if (disabledBanner) {
      disabledBanner.hidden = registrationOpen;
    }

    const showInterestButton = settings?.showInterestButton !== false;
    if (interestPanel) {
      interestPanel.hidden = !showInterestButton;
    }

    allControls.forEach((control) => {
      if (control.dataset.keepActive === "true") {
        control.disabled = !showInterestButton;
        return;
      }

      control.disabled = !registrationOpen;
    });

    if (heroStatus) {
      heroStatus.textContent = registrationOpen ? "REGISTRATION IS LIVE" : closedMessage;
    }

    if (heroCopy) {
      heroCopy.textContent = registrationOpen
        ? "Complete your form, upload your media, and continue to secure checkout."
        : "Registrations are temporarily disabled on the website until auditions officially open.";
    }

    if (disabledTitle) {
      disabledTitle.textContent = registrationOpen ? "Registration is live" : closedMessage.replace("OPEN", "Open");
    }

    if (disabledCopy) {
      disabledCopy.textContent = registrationOpen
        ? "The portal is now active."
        : "The form is temporarily disabled right now. Once registration opens, media upload and submission will be enabled again from this same page.";
    }

    if (!registrationOpen) {
      successMessage?.classList.add("is-hidden");
      setUploadProgress(0);
      setStatus("Registration is currently disabled.", "");
    } else if (!statusMessage?.textContent || statusMessage.textContent.includes("currently disabled")) {
      setStatus("Registration is open. Complete the form to continue.", "");
    }

    syncSubmitState();
  }

  async function handleRegistrationInterest() {
    if (!interestButton || interestButton.disabled) {
      return;
    }

    const previousText = interestButton.textContent;
    interestButton.disabled = true;
    interestButton.textContent = "Saving...";
    setInterestStatus("Recording your interest...", "");

    try {
      const payload = {
        deviceId: getPersistentDeviceId(),
        name: registrationForm.fullName?.value.trim() || "",
        phone: sanitizePhoneDigits(registrationForm.phone?.value.trim() || ""),
        email: registrationForm.email?.value.trim() || "",
        category: registrationForm.category?.value || "",
        source: "register_page",
        page: window.location.pathname,
      };

      await submitRegistrationInterest(payload);
      window.localStorage?.setItem("botd-registration-interest-recorded", "true");
      interestButton.textContent = "Interest Recorded";
      setInterestStatus("Interest recorded. BOTD will keep you posted.", "is-success");
    } catch (error) {
      console.error("[BOTD] Registration interest save failed", error);
      interestButton.disabled = false;
      interestButton.textContent = previousText || "I'm Interested";
      setInterestStatus("Unable to record interest right now. Please try again.", "is-error");
    }
  }

  function validateForm() {
    if (!registrationOpen) {
      return { valid: false, message: "Registration is currently disabled." };
    }

    if (!registrationForm.reportValidity()) {
      return { valid: false, message: "Please complete all required fields before continuing." };
    }

    if (!validateRequiredUploads(true)) {
      return { valid: false, message: "Upload your video, audio track, and display picture before continuing." };
    }

    if (!participantConsentInput?.checked) {
      syncTermsCollapse(true);
      return { valid: false, message: "Please accept the BOTD legal consent clauses before continuing." };
    }

    if (checkMinor()) {
      if (!guardianConsentInput?.checked) {
        return { valid: false, message: "Parent or legal guardian consent is required for minors." };
      }

      if (!guardianSignatureInput?.value.trim()) {
        return { valid: false, message: "Parent or legal guardian digital signature is required for minors." };
      }
    }

    return { valid: true };
  }

  function collectFormData() {
    const termsText = termsEmbedCopy
      ? Array.from(termsEmbedCopy.querySelectorAll("p")).map((item) => item.textContent.trim()).join(" ")
      : "";
    const isMinor = checkMinor();

    return {
      name: registrationForm.fullName.value.trim(),
      phone: sanitizePhoneDigits(registrationForm.phone.value.trim()).slice(0, 10),
      email: registrationForm.email.value.trim(),
      isMinor,
      teamName: registrationForm.teamName.value.trim() || registrationForm.fullName.value.trim(),
      danceStyle: registrationForm.danceStyle.value,
      city: registrationForm.city.value.trim(),
      age: registrationForm.age.value.trim(),
      category: registrationForm.category.value,
      memberCount: registrationForm.memberCount.value.trim(),
      discoverySource: registrationForm.discoverySource.value,
      digitalSignature: registrationForm.digitalSignature.value.trim(),
      signatureType: "typed",
      signedAt: new Date().toISOString(),
      parentName: isMinor ? parentNameInput?.value.trim() || "" : "",
      parentPhone: isMinor ? sanitizePhoneDigits(parentPhoneInput?.value.trim() || "").slice(0, 10) : "",
      parentEmail: isMinor ? parentEmailInput?.value.trim() || "" : "",
      relationship: isMinor ? relationshipInput?.value.trim() || "" : "",
      guardianSignature: isMinor ? guardianSignatureInput?.value.trim() || "" : "",
      paymentEnabled: PAYMENT_ENABLED,
      paymentStatus: PAYMENT_ENABLED ? "PENDING" : "DISABLED",
      paymentReference: "",
      status: "PENDING",
      details: {
        agreementAccepted: Boolean(participantConsentInput?.checked),
        guardianConsentAccepted: Boolean(guardianConsentInput?.checked),
        digitalSignature: registrationForm.digitalSignature.value.trim(),
        guardianSignature: guardianSignatureInput?.value.trim() || "",
        termsAcceptedText: termsText,
        paymentAmount: CASHFREE_CONFIG.amount,
        paymentCurrency: CASHFREE_CONFIG.currency,
        paymentReference: "",
        paymentStatus: PAYMENT_ENABLED ? "PENDING" : "DISABLED",
        paymentGateway: "cashfree",
        optionalUploads: {
          videoFileName: videoInput?.files?.[0]?.name || "",
          audioFileName: audioInput?.files?.[0]?.name || "",
          photoFileNames: Array.from(photoInput?.files || []).map((file) => file.name),
        },
      },
      files: {
        video: videoInput?.files?.[0] || null,
        audio: audioInput?.files?.[0] || null,
        photos: Array.from(photoInput?.files || []),
        documents: [],
      },
    };
  }

  async function finalizeSubmission(paymentReference) {
    const payload = collectFormData();
    const paymentResult = typeof paymentReference === "object" && paymentReference !== null
      ? paymentReference
      : { orderId: paymentReference, paymentId: "", orderStatus: PAYMENT_ENABLED ? "PAID" : "DISABLED" };
    const paymentDetails = {
      gateway: "cashfree",
      orderId: paymentResult.orderId || "",
      cfOrderId: paymentResult.cfOrderId || "",
      paymentId: paymentResult.paymentId || paymentResult.cfPaymentId || "",
      status: PAYMENT_ENABLED ? "SUCCESS" : "DISABLED",
      orderStatus: paymentResult.orderStatus || (PAYMENT_ENABLED ? "PAID" : "DISABLED"),
      amount: Number(paymentResult.amount || CASHFREE_CONFIG.amount || 0),
      currency: paymentResult.currency || CASHFREE_CONFIG.currency || "INR",
      timestamp: paymentResult.paymentTime || paymentResult.timestamp || new Date().toISOString(),
      raw: paymentResult.paymentDetails || null,
    };
    payload.details.paymentReference = paymentDetails.paymentId || paymentDetails.orderId || "payment-disabled";
    payload.details.paymentStatus = paymentDetails.status;
    payload.details.paymentDetails = paymentDetails;
    payload.paymentReference = payload.details.paymentReference;
    payload.paymentStatus = paymentDetails.status;
    payload.paymentDetails = paymentDetails;
    payload.status = "SUCCESS";
    payload.onProgress = (progress) => {
      setUploadProgress(progress);
      setStatus(progress > 0 ? `Uploading files... ${progress}%` : "Preparing your registration PDF...", "");
      if (progress > 0 && progress < 100) {
        setButtonLoading(payButton, true, `Uploading ${progress}%`);
      }
    };

    try {
      const result = await submitRegistration(payload);
      console.log("[BOTD] Registration saved to Firestore and Storage", {
        registrationId: result.id,
        folderName: result.folderName,
        pdfUrl: result.pdfAsset?.url || "",
        uploadSummary: result.uploadedFiles,
      });

      setUploadProgress(100);
      successMessage?.classList.remove("is-hidden");
      setStatus("Payment successful. Your consent form and uploads were saved.", "is-success");
      registrationForm.reset();
      registrationForm.querySelectorAll(".field").forEach((field) => field.classList.remove("is-filled", "is-success", "is-error"));
      syncGroupFields();
      syncGuardianFields();
      updateUploadState(videoInput, videoName);
      updateUploadState(audioInput, audioName);
      updateUploadState(photoInput, photoName);
      syncTermsCollapse(false);
      syncConsentState();
      setButtonLoading(payButton, false, "Register & Continue Payment");
      syncSubmitState();

      const shouldDownloadPdf = await showPopup({
        title: "Registration Successful",
        text: "All the Best for BOTD!",
        primaryText: result.pdfAsset?.url ? "Download PDF" : "Continue",
        secondaryText: result.pdfAsset?.url ? "Close" : "",
      });

      if (shouldDownloadPdf && result.pdfAsset?.url) {
        window.open(result.pdfAsset.url, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      console.error("[BOTD] Registration submit failed", error);
      setUploadProgress(0);
      setStatus("Registration could not be completed. Please try again or contact BOTD support.", "is-error");
      setButtonLoading(payButton, false, "Register & Continue Payment");
      syncSubmitState();
    }
  }

  async function verifyCashfreeOrderWithRetry(orderId, attempts = 4) {
    let lastError = null;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await verifyCashfreeOrder(orderId);
      } catch (error) {
        lastError = error;
        if (attempt < attempts - 1) {
          await new Promise((resolve) => window.setTimeout(resolve, 1200));
        }
      }
    }

    throw lastError || new Error("Payment confirmation could not be completed.");
  }

  async function startPayment() {
    registrationForm.querySelectorAll(".field").forEach((field) => markFieldValidity(field, true));
    validateRequiredUploads(true);
    syncConsentState();

    const validation = validateForm();
    if (!validation.valid) {
      setStatus(validation.message, "is-error");
      syncSubmitState();
      return;
    }

    if (honeypotInput?.value.trim()) {
      setStatus("Unable to submit right now.", "is-error");
      syncSubmitState();
      return;
    }

    successMessage?.classList.add("is-hidden");
    setStatus(PAYMENT_ENABLED ? "Preparing secure checkout..." : "Submitting your registration...", "");
    setButtonLoading(payButton, true, PAYMENT_ENABLED ? "Processing" : "Submitting");

    if (!PAYMENT_ENABLED) {
      await finalizeSubmission("payment-disabled");
      return;
    }

    let cashfreeConfig;
    let orderContext;

    try {
      cashfreeConfig = await loadCashfreeConfig();
      orderContext = await createCashfreeOrder(collectFormData());
    } catch (error) {
      console.error("[BOTD] Cashfree bootstrap failed", error);
      setStatus("Payment could not start. Please try again.", "is-error");
      setButtonLoading(payButton, false, "Register & Continue Payment");
      syncSubmitState();
      return;
    }

    if (typeof window.Cashfree !== "function") {
      setStatus("Payment window could not open. Please refresh and try again.", "is-error");
      setButtonLoading(payButton, false, "Register & Continue Payment");
      syncSubmitState();
      return;
    }

    try {
      const cashfree = window.Cashfree({
        mode: cashfreeConfig.mode || "sandbox",
      });

      const checkoutResult = await cashfree.checkout({
        paymentSessionId: orderContext.paymentSessionId,
        redirectTarget: "_modal",
      });

      if (checkoutResult?.error) {
        throw new Error("Payment was not completed.");
      }

      setStatus("Verifying payment...", "");
      const verification = await verifyCashfreeOrderWithRetry(orderContext.orderId);
      await finalizeSubmission({
        ...orderContext,
        ...verification,
        amount: verification.amount || orderContext.amount,
        currency: verification.currency || orderContext.currency,
      });
    } catch (error) {
      console.error("[BOTD] Cashfree checkout failed", error);
      setStatus("Payment was not completed. Please try again.", "is-error");
      setButtonLoading(payButton, false, "Register & Continue Payment");
      syncSubmitState();
      await showPopup({
        title: "Payment Failed",
        text: "Payment was not completed. Please try again.",
        primaryText: "Try Again",
      });
    }
  }

  registrationPortalController = {
    applyAvailability(settings = {}) {
      applyRegistrationAvailability({
        registrationOpen: settings?.registrationOpen !== false,
        showInterestButton: settings?.showInterestButton !== false,
        registrationClosedMessage: String(settings?.registrationClosedMessage || "AUDITIONS OPEN ON 20th APRIL"),
      });
    },
  };

  registrationForm.addEventListener("input", syncSubmitState);
  registrationForm.addEventListener("change", () => {
    syncConsentState();
    syncSubmitState();
  });
  ageInput?.addEventListener("input", () => {
    syncGuardianFields();
    syncSubmitState();
  });
  categorySelect?.addEventListener("change", () => {
    syncGroupFields();
    syncSubmitState();
  });
  videoInput?.addEventListener("change", () => updateUploadState(videoInput, videoName, true));
  audioInput?.addEventListener("change", () => updateUploadState(audioInput, audioName, true));
  photoInput?.addEventListener("change", () => updateUploadState(photoInput, photoName, true));
  participantConsentInput?.addEventListener("change", syncConsentState);
  guardianConsentInput?.addEventListener("change", syncConsentState);
  termsCollapseToggle?.addEventListener("click", () => syncTermsCollapse());
  payButton?.addEventListener("click", startPayment);
  interestButton?.addEventListener("click", handleRegistrationInterest);

  const paymentLabel = payButton?.querySelector(".payment-button-text");
  if (paymentLabel) {
    paymentLabel.textContent = "Register & Continue Payment";
  }

  syncGroupFields();
  syncGuardianFields();
  syncTermsCollapse(false);
  validateRequiredUploads();
  syncConsentState();
  applyRegistrationAvailability({
    registrationOpen: liveUiControls.registrationOpen,
    showInterestButton: liveUiControls.showInterestButton !== false,
    registrationClosedMessage: liveUiControls.registrationClosedMessage || "AUDITIONS OPEN ON 20th APRIL",
  });
}

function setVoteStatus(message, tone) {
  const voteStatus = document.getElementById("vote-status");

  if (!voteStatus) {
    return;
  }

  voteStatus.textContent = message;
  voteStatus.classList.remove("is-error", "is-success");

  if (tone) {
    voteStatus.classList.add(tone);
  }
}

function triggerVoteFieldAlert(fieldId) {
  const field = document.getElementById(fieldId)?.closest(".field");

  if (!field) {
    return;
  }

  field.classList.remove("is-alert");
  void field.offsetWidth;
  field.classList.add("is-alert", "is-error");

  window.setTimeout(() => {
    field.classList.remove("is-alert");
  }, 900);
}

function getFriendlyPhoneAuthMessage(error) {
  const errorCode = String(error?.code || "").toLowerCase();
  const errorMessage = String(error?.message || "");

  if (errorMessage.includes("Enter a valid phone number.")) {
    return "Enter a valid phone number.";
  }

  if (errorMessage.includes("Select a valid country code.")) {
    return "Select a valid country code.";
  }

  if (
    errorCode.includes("invalid-phone-number")
    || errorCode.includes("too-short")
    || errorCode.includes("too-long")
    || errorMessage.toLowerCase().includes("invalid-phone-number")
    || errorMessage.toLowerCase().includes("too_short")
    || errorMessage.toLowerCase().includes("too-long")
  ) {
    return "Enter a valid phone number.";
  }

  if (errorCode.includes("quota-exceeded")) {
    return "OTP limit reached. Please try again later.";
  }

  if (errorCode.includes("captcha-check-failed")) {
    return "Security check could not be completed. Please try again.";
  }

  if (errorCode.includes("billing-not-enabled")) {
    return "OTP service is not ready right now. Please contact BOTD support.";
  }

  if (errorCode.includes("operation-not-allowed")) {
    return "OTP service is not ready right now. Please contact BOTD support.";
  }

  return "OTP could not be sent. Please try again.";
}

function getFriendlyOtpVerificationMessage(error) {
  const errorCode = String(error?.code || "").toLowerCase();

  if (errorCode.includes("invalid-verification-code")) {
    return "The OTP you entered is invalid. Please try again.";
  }

  if (errorCode.includes("code-expired") || errorCode.includes("session-expired")) {
    return "This OTP has expired. Please request a new code.";
  }

  if (errorCode.includes("too-many-requests")) {
    return "Too many attempts. Please wait a moment and try again.";
  }

  return "OTP could not be verified. Please try again.";
}

function getActiveVotingCategoryCode() {
  const activeButton = document.querySelector(".vote-tab-button.is-active");
  return normalizeLeaderboardCategory(activeButton?.dataset.voteTarget || "");
}

function isPhoneEntryValid(countryCode, localPhoneNumber) {
  try {
    buildInternationalPhoneNumber(countryCode, localPhoneNumber);
    return true;
  } catch (error) {
    return false;
  }
}

function syncVoteState() {
  const countryCodeSelect = document.getElementById("vote-country-code");
  const mobileInput = document.getElementById("vote-mobile");
  const otpInput = document.getElementById("otp-input");
  const sendOtpButton = document.getElementById("send-otp");
  const verifyVoteButton = document.getElementById("verify-vote");
  const mobileValid = isPhoneEntryValid(countryCodeSelect?.value, mobileInput?.value.trim() || "");
  const otpValid = Boolean(otpInput?.value.trim().match(new RegExp(`^\\d{${OTP_LENGTH}}$`)));
  const canContinue = liveVotingOpen && votingUiState.selectedTeamId && votingUiState.isConfirmed && mobileValid;

  if (sendOtpButton && !sendOtpButton.classList.contains("is-loading")) {
    sendOtpButton.disabled = !canContinue;
  }

  if (verifyVoteButton && !verifyVoteButton.classList.contains("is-loading")) {
    verifyVoteButton.disabled = !(canContinue && otpValid);
  }
}

function resetVotingFlow(clearMobile = false) {
  votingUiState.selectedTeamId = "";
  votingUiState.selectedContestant = "";
  votingUiState.isConfirmed = false;
  currentVoteConfirmation = null;
  isConfirmed = false;

  document.querySelectorAll(".vote-card-item").forEach((card) => card.classList.remove("is-selected"));

  const selectedLabel = document.getElementById("selected-contestant-label");
  const mobileInput = document.getElementById("vote-mobile");
  const otpInput = document.getElementById("otp-input");
  const otpSection = document.getElementById("otp-section");

  if (selectedLabel) {
    selectedLabel.textContent = "Voting for: None selected";
  }

  if (clearMobile && mobileInput) {
    mobileInput.value = "";
    mobileInput.closest(".field")?.classList.remove("is-filled", "is-success", "is-error");
  }

  if (otpInput) {
    otpInput.value = "";
    otpInput.closest(".field")?.classList.remove("is-filled", "is-success", "is-error");
  }

  confirmBox?.classList.add("is-hidden");
  otpSection?.classList.add("is-hidden");
  setVoteStatus("", "");
  syncVoteState();
}

function renderVotingShell() {
  const votingShell = document.querySelector("[data-voting]");
  const tabList = votingShell?.querySelector(".vote-tab-list");
  const panelHost = document.getElementById("voting-panels");

  if (!votingShell || !tabList || !panelHost || !liveVotingCategories.length) {
    return;
  }

  const activeCategories = liveVotingCategories.filter((item) => item.isActive !== false);

  if (!activeCategories.length) {
    tabList.innerHTML = "<p>No categories available.</p>";
    panelHost.innerHTML = "<p class=\"contestant-empty-state\">Contestants will be announcing soon.</p>";
    return;
  }

  let activeCode = getActiveVotingCategoryCode() || normalizeLeaderboardCategory(getCategoryCode(activeCategories[0]));
  if (!activeCategories.some((item) => normalizeLeaderboardCategory(getCategoryCode(item)) === activeCode)) {
    activeCode = normalizeLeaderboardCategory(getCategoryCode(activeCategories[0]));
  }

  tabList.innerHTML = activeCategories.map((category) => {
    const code = getCategoryCode(category);
    const target = normalizeLeaderboardCategory(code);
    const isActive = target === activeCode;
    return `<button class="vote-tab-button ${isActive ? "is-active" : ""}" type="button" role="tab" aria-selected="${isActive}" data-vote-target="${target}">${category.name || code}</button>`;
  }).join("");

  panelHost.innerHTML = activeCategories.map((category) => {
    const code = getCategoryCode(category);
    const target = normalizeLeaderboardCategory(code);
    const isActive = target === activeCode;
    const teams = liveVotingTeams.filter((team) => categoryMatchesTeam(team, category) && isPublicContestant(team));
    return `
      <div class="vote-tab-panel ${isActive ? "is-active" : ""}" id="${target}" role="tabpanel">
        <div class="contestant-vote-grid">
          ${teams.length ? teams.map((team) => `
            <article class="vote-card-item${votingUiState.selectedTeamId === team.id ? " is-selected" : ""}${getVoteAnimationClass(team.id, getVoteCountForTeam(team.id))}" data-team-id="${team.id}" data-contestant="${team.name}">
              <img src="${team.image || "assets/images/poster1.jpg"}" alt="${team.name || "BOTD contestant"}">
              <h3>${team.name || "Unnamed contestant"}</h3>
              <p>${team.city || "Bangalore"}</p>
              ${liveUiControls.showVotes ? `<div class="vote-count-badge" aria-live="polite"><span>Votes</span><strong data-animated-count="${team.id}">${getVoteCountForTeam(team.id)}</strong></div>` : ""}
            </article>
          `).join("") : "<p class=\"contestant-empty-state\">Contestants will be announcing soon.</p>"}
        </div>
      </div>
    `;
  }).join("");

  tabList.querySelectorAll(".vote-tab-button").forEach((button) => {
    button.addEventListener("click", () => {
      tabList.querySelectorAll(".vote-tab-button").forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });

      panelHost.querySelectorAll(".vote-tab-panel").forEach((panel) => {
        panel.classList.toggle("is-active", panel.id === button.dataset.voteTarget);
      });

      resetVotingFlow(true);
    });
  });

  panelHost.querySelectorAll(".vote-card-item").forEach((card) => {
    card.addEventListener("click", () => {
      panelHost.querySelectorAll(".vote-card-item").forEach((item) => item.classList.remove("is-selected"));
      card.classList.add("is-selected");

      votingUiState.selectedTeamId = card.dataset.teamId || "";
      votingUiState.selectedContestant = card.dataset.contestant || "";
      votingUiState.isConfirmed = false;
      isConfirmed = false;

      if (confirmTeamName) {
        confirmTeamName.textContent = votingUiState.selectedContestant || "None";
      }

      confirmBox?.classList.remove("is-hidden");
      setElementText("selected-contestant-label", "Voting for: Not confirmed");
      syncVoteState();
    });
  });

  panelHost.querySelectorAll("[data-animated-count]").forEach((node) => {
    animateCountValue(node, node.getAttribute("data-animated-count"), Number(node.textContent || 0));
  });

  syncVoteState();
  renderLeaderboard();
}

function populateCountryCodeOptions(selectElement) {
  if (!selectElement) {
    return;
  }

  selectElement.innerHTML = SUPPORTED_PHONE_COUNTRIES.map((country) => `
    <option value="${country.dialCode}" ${country.dialCode === "+91" ? "selected" : ""}>
      ${country.label} (${country.dialCode})
    </option>
  `).join("");
}

function setupVotingPage() {
  const votingShell = document.querySelector("[data-voting]");

  if (!votingShell) {
    return;
  }

  const countryCodeSelect = document.getElementById("vote-country-code");
  const mobileInput = document.getElementById("vote-mobile");
  const sendOtpButton = document.getElementById("send-otp");
  const otpSection = document.getElementById("otp-section");
  const otpInput = document.getElementById("otp-input");
  const verifyVoteButton = document.getElementById("verify-vote");
  const recaptchaContainerId = "voting-recaptcha";
  const deviceId = getPersistentDeviceId();

  populateCountryCodeOptions(countryCodeSelect);

  confirmVoteBtn?.addEventListener("click", () => {
    if (!votingUiState.selectedContestant) {
      setVoteStatus("Please select a contestant first.", "is-error");
      return;
    }

    votingUiState.isConfirmed = true;
    isConfirmed = true;
    confirmBox?.classList.remove("error");
    setElementText("selected-contestant-label", `Voting for: ${votingUiState.selectedContestant}`);
    syncVoteState();
  });

  changeSelectionBtn?.addEventListener("click", () => {
    resetVotingFlow(false);
  });

  countryCodeSelect?.addEventListener("change", () => {
    currentVoteConfirmation = null;
    otpSection?.classList.add("is-hidden");
    syncVoteState();
  });

  mobileInput?.addEventListener("input", () => {
    currentVoteConfirmation = null;
    otpSection?.classList.add("is-hidden");
    mobileInput.closest(".field")?.classList.remove("is-alert", "is-error");
    mobileInput.value = sanitizePhoneDigits(mobileInput.value).slice(0, 15);
    syncVoteState();
  });
  otpInput?.addEventListener("input", syncVoteState);

  sendOtpButton?.addEventListener("click", async () => {
    if (!liveVotingOpen) {
      setVoteStatus(liveVotingClosedMessage || "Voting is currently closed. Please check back later.", "is-error");
      return;
    }

    if (!votingUiState.isConfirmed) {
      confirmBox?.classList.add("error");
      setVoteStatus("Please confirm your team before proceeding.", "is-error");
      window.setTimeout(() => confirmBox?.classList.remove("error"), 1200);
      return;
    }

    const rawPhoneNumber = mobileInput?.value.trim() || "";

    if (!isPhoneEntryValid(countryCodeSelect?.value, rawPhoneNumber)) {
      triggerVoteFieldAlert("vote-mobile");
      setVoteStatus("Enter a valid phone number.", "is-error");
      return;
    }

    setButtonLoading(sendOtpButton, true, "Sending");
    currentVoteConfirmation = null;

    try {
      const otpSession = await sendPhoneOtp(rawPhoneNumber, recaptchaContainerId, {
        countryCode: countryCodeSelect?.value || "+91",
      });
      currentVoteConfirmation = otpSession.confirmationResult;
      otpSection?.classList.remove("is-hidden");
      setVoteStatus(`OTP sent to ${otpSession.phoneNumber}.`, "is-success");
      setButtonLoading(sendOtpButton, false, "Send OTP");
      syncVoteState();
    } catch (error) {
      console.error("[BOTD] OTP send failed", error);
      resetRecaptcha();
      setButtonLoading(sendOtpButton, false, "Send OTP");
      const friendlyMessage = getFriendlyPhoneAuthMessage(error);
      if (friendlyMessage.toLowerCase().includes("phone number")) {
        triggerVoteFieldAlert("vote-mobile");
      }
      setVoteStatus(friendlyMessage, "is-error");
      syncVoteState();
    }
  });

  verifyVoteButton?.addEventListener("click", async () => {
    if (!liveVotingOpen) {
      setVoteStatus(liveVotingClosedMessage || "Voting is currently closed. Please check back later.", "is-error");
      return;
    }

    const mobileNumber = mobileInput?.value.trim() || "";
    const selectedTeam = liveVotingTeams.find((team) => team.id === votingUiState.selectedTeamId);
    const enteredOtp = otpInput?.value.trim() || "";

    if (!selectedTeam) {
      setVoteStatus("Selected contestant could not be found. Please reselect and try again.", "is-error");
      return;
    }

    if (!currentVoteConfirmation) {
      setVoteStatus("OTP session expired. Please send OTP again.", "is-error");
      return;
    }

    if (!enteredOtp.match(new RegExp(`^\\d{${OTP_LENGTH}}$`))) {
      setVoteStatus(`Please enter the ${OTP_LENGTH}-digit OTP.`, "is-error");
      return;
    }

    setButtonLoading(verifyVoteButton, true, "Submitting");

    try {
      const user = await verifyPhoneOtp(currentVoteConfirmation, enteredOtp);
      activeUser = user;
      await submitVote({
        participantId: selectedTeam.id,
        userId: user.uid,
        phoneNumber: user.phoneNumber || mobileNumber,
        deviceId,
      });

      console.log("[BOTD] Vote submitted", {
        participantId: selectedTeam.id,
        userId: user.uid,
        mobileNumber,
      });

      setVoteStatus("Vote submitted successfully.", "is-success");
      triggerPartyBlastEffect();
      resetVotingFlow(true);
    } catch (error) {
      console.error("[BOTD] Vote submit failed", error);
      resetRecaptcha();
      const failureMessage = (error.message || "").toLowerCase().includes("already voted")
        ? "You have already voted"
        : getFriendlyOtpVerificationMessage(error);
      setVoteStatus(failureMessage, "is-error");

      if (failureMessage.toLowerCase().includes("expired")) {
        currentVoteConfirmation = null;
        otpSection?.classList.add("is-hidden");
      }

      if (!(error.message || "").toLowerCase().includes("already voted")) {
        triggerVoteFieldAlert("otp-input");
      }
    } finally {
      setButtonLoading(verifyVoteButton, false, "Verify & Submit Vote");
      syncVoteState();
    }
  });

  resetVotingFlow(true);
}


function setupSimpleForm({
  formId,
  statusId,
  submitAction,
  payloadBuilder,
  invalidMessage,
  successMessage,
  popupTitle,
  popupText,
  loadingText,
}) {
  const form = document.getElementById(formId);

  if (!form) {
    return;
  }

  const status = document.getElementById(statusId);
  const submitButton = form.querySelector('button[type="submit"]');

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (status) {
      status.classList.remove("is-success", "is-error");
    }

    form.querySelectorAll(".field").forEach((field) => markFieldValidity(field, true));

    if (!form.reportValidity()) {
      if (status) {
        status.textContent = invalidMessage;
        status.classList.add("is-error");
      }
      return;
    }

    setButtonLoading(submitButton, true, loadingText);

    window.setTimeout(async () => {
      const payload = payloadBuilder(form);
      try {
        await submitAction(payload);
        console.log(`[BOTD] ${formId} submission saved`, payload);

        form.reset();
        form.querySelectorAll(".field").forEach((field) => field.classList.remove("is-filled", "is-success", "is-error"));

        if (status) {
          status.textContent = successMessage;
          status.classList.add("is-success");
        }

        await showPopup({
          title: popupTitle,
          text: popupText,
          primaryText: "Continue",
        });
      } catch (error) {
        console.error(`[BOTD] ${formId} submission failed`, error);
        if (status) {
          status.textContent = "Your message could not be submitted. Please try again.";
          status.classList.add("is-error");
        }
      } finally {
        setButtonLoading(submitButton, false, loadingText);
      }
    }, 520);
  });
}

function setupSponsorForm() {
  setupSimpleForm({
    formId: "sponsor-form",
    statusId: "sponsor-form-status",
    submitAction: submitSponsorEnquiry,
    invalidMessage: "Please complete all required fields before submitting.",
    successMessage: "Thank you. Your enquiry has been recorded and the BOTD team can follow up from here.",
    popupTitle: "Enquiry Submitted",
    popupText: "Thank you for your interest in partnering with BOTD. The team can now follow up with you.",
    loadingText: "Submitting",
    payloadBuilder(form) {
      return {
        contactPerson: form.name.value.trim(),
        companyName: form.company.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email.value.trim(),
        category: form.interest.value,
        message: form.message.value.trim(),
      };
    },
  });
}

function setupContactForm() {
  setupSimpleForm({
    formId: "contact-form",
    statusId: "contact-form-status",
    submitAction: submitContactMessage,
    invalidMessage: "Please complete all required fields before sending your message.",
    successMessage: "Thank you! We'll get back to you soon.",
    popupTitle: "Message Sent",
    popupText: "Thank you! We'll get back to you soon.",
    loadingText: "Sending",
    payloadBuilder(form) {
      return {
        name: form.name.value.trim(),
        email: form.email.value.trim(),
        message: form.message.value.trim(),
        phone: form.phone.value.trim(),
        subject: form.subject.value,
      };
    },
  });
}

function initSite() {
  createPopup();
  prepareMediaLoading();
  initializeAdminConsole();
  loadTheme();
  setupGlobalControls();
  syncHeaderState();
  prepareButtons();
  setupFieldStates();
  setupRevealAnimations();
  setupAccordions();
  setupTabs();
  setupRegistrationForm();
  setupVotingPage();
  setupSponsorForm();
  setupContactForm();
  activeUser = getCurrentUser();
  loadHomeContent();
  loadVotingContent();
  loadAboutVideos();
  loadEventPosters();
  loadCategoriesRealtime();
  loadTeamsRealtime();
  loadAuthSession();
  loadUiControlSettings();

setTimeout(() => {
  syncScrollEffects();
}, 300);

setTimeout(() => {
  setupHeroParallax();
  setupInteractiveCards();
}, 500);
setTimeout(() => {
  loadSeasonContent();
  loadEventsContent();
  loadVoteTalliesRealtime();
  loadJudgesRealtime();
  loadSponsorsRealtime();
}, 1500);
setTimeout(() => {
  loadVotingSettings();
  loadPartyBlastSignals();
}, 2000);

  window.addEventListener("resize", () => {
    if (window.innerWidth > 820) {
      closeMenu();
    }
  });

  window.addEventListener("scroll", () => {
    syncHeaderState();

    if (!scrollTicking) {
      window.requestAnimationFrame(syncScrollEffects);
      scrollTicking = true;
    }
  }, { passive: true });

  if (document.readyState === "complete") {
  } else {
  }

  window.addEventListener("beforeunload", () => {
    pageSubscriptions.forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    });
  }, { once: true });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSite, { once: true });
} else {
  initSite();
}
