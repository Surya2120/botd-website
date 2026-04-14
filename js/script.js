import {
  collection,
  doc,
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
import { submitContactMessage, submitRegistration, submitSponsorEnquiry } from "../services/formService.js";
import { subscribeHomeContent } from "../services/homeService.js";
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
const LOGO_PATH = "assets/images/Final_BOTD_Logo.png";
const CONTENT_COLLECTION = "adminContent";
const JUDGES_COLLECTION = "judges";
const SPONSORS_COLLECTION = "sponsors";

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
const themeToggle = document.getElementById("theme-toggle");
const themeLabel = themeToggle?.querySelector(".theme-toggle-label");
const menuToggle = document.getElementById("menu-toggle");
const siteNav = document.getElementById("site-nav");
const topbar = document.querySelector(".topbar");
const hero = document.querySelector(".hero");
const parallaxLayers = document.querySelectorAll(".poster-card");
const interactiveCards = document.querySelectorAll(
  ".highlight-card, .glass-card, .concept-card, .step-card, .vote-card, .category-card, .benefit-card, .cta-panel, .instruction-card, .contact-info-card, .sponsor-logo-card, .founder-card, .contact-form-card, .registration-card, .voting-form-card, .title-sponsor-banner, .powered-sponsor-card, .season-banner"
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
};
let currentVoteConfirmation = null;
let activeUser = null;
let lastPartyBlastValue = null;
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
  };
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
  if (input === "adult-group" || input === "adultgroup") return "adult-group";
  if (input === "kids-group" || input === "kidsgroup") return "kids-group";
  if (input === "kids-solo" || input === "kidssolo") return "kids-solo";
  if (input === "open-solo" || input === "opensolo") return "open-solo";
  return input;
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
      .filter((team) => team.isVisible !== false)
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
      console.log(`[BOTD Admin] Vote visibility set to ${Boolean(showVotes)}`);
    },
    async setLeaderboardVisibility(showLeaderboard) {
      await setLeaderboardVisibility(showLeaderboard);
      console.log(`[BOTD Admin] Leaderboard visibility set to ${Boolean(showLeaderboard)}`);
    },
    async triggerPartyBlast() {
      await triggerPartyBlast();
      console.log("[BOTD Admin] Party blast triggered");
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
    const unsubscribe = onSnapshot(
      doc(db, collectionName, documentId),
      (snapshot) => {
        if (!snapshot.exists()) {
          console.warn(`[BOTD] Missing document: ${collectionName}/${documentId}`);
          return;
        }

        console.log(`[BOTD] Realtime update: ${collectionName}/${documentId}`);
        onData(snapshot.data());
      },
      (error) => {
        console.error(`Failed to read ${collectionName}/${documentId}`, error);
      }
    );

    pageSubscriptions.push(unsubscribe);
  } catch (error) {
    console.error(`Failed to subscribe to ${collectionName}/${documentId}`, error);
  }
}

function registerSubscription(unsubscribe) {
  if (typeof unsubscribe === "function") {
    pageSubscriptions.push(unsubscribe);
  }
}

function subscribeToCollection(collectionName, onData) {
  try {
    const unsubscribe = onSnapshot(
      query(collection(db, collectionName)),
      (snapshot) => {
        const items = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
        console.log(`[BOTD] Realtime update: ${collectionName}`, items.length);
        onData(items);
      },
      (error) => {
        console.error(`Failed to read collection ${collectionName}`, error);
      }
    );

    registerSubscription(unsubscribe);
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

  const activeCode = String(activeCategories[0].code || "").toUpperCase();

  host.innerHTML = `
    <div class="tab-list" role="tablist" aria-label="Contestant categories">
      ${activeCategories.map((category, index) => {
        const code = String(category.code || "").toUpperCase();
        const count = liveVotingTeams.filter((team) => String(team.categoryId || "").toUpperCase() === code && team.isVisible !== false).length;
        return `<button class="tab-button ${index === 0 ? "is-active" : ""}" type="button" role="tab" aria-selected="${index === 0}" data-tab-target="${code.toLowerCase()}">${category.name || code} (${count})</button>`;
      }).join("")}
    </div>
    ${activeCategories.map((category, index) => {
      const code = String(category.code || "").toUpperCase();
      const teams = liveVotingTeams.filter((team) => String(team.categoryId || "").toUpperCase() === code && team.isVisible !== false);
      return `
        <div class="tab-panel ${code === activeCode && index === 0 ? "is-active" : ""}" id="${code.toLowerCase()}" role="tabpanel">
          <p class="contestant-meta">${teams.length ? `${teams.length} contestants available in ${category.name || code}.` : "No contestants available right now."}</p>
          <div class="contestant-grid">
            ${teams.map((team) => `
              <article class="contestant-card">
                <img src="${team.image || "assets/images/poster1.jpg"}" alt="${team.name || "BOTD contestant"}">
                <h3>${team.name || "Unnamed contestant"}</h3>
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
    });
  });
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
    });
  });
}

function renderSponsors(items = []) {
  const host = document.getElementById("sponsors-live-list");

  if (!host) {
    return;
  }

  const visibleItems = items
    .filter((item) => item.visible !== false)
    .sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0));

  if (!visibleItems.length) {
    host.innerHTML = "<p>No sponsors available right now.</p>";
    return;
  }

  const grouped = visibleItems.reduce((accumulator, item) => {
    const tier = String(item.tier || item.category || "Sponsors");
    if (!accumulator[tier]) {
      accumulator[tier] = [];
    }
    accumulator[tier].push(item);
    return accumulator;
  }, {});

  host.innerHTML = Object.entries(grouped).map(([tier, tierItems], index) => `
    <div class="sponsor-category reveal is-visible ${index % 3 === 1 ? "reveal-delay-1" : index % 3 === 2 ? "reveal-delay-2" : ""}">
      <div class="sponsor-category-head">
        <h3>${tier} Sponsors</h3>
      </div>
      <div class="sponsor-grid sponsor-grid-silver">
        ${tierItems.map((item) => `
          <article class="sponsor-logo-card sponsor-logo-card-silver">
            ${item.link ? `<a href="${item.link}" target="_blank" rel="noreferrer">` : ""}
              ${item.image ? `<img src="${item.image}" alt="${item.name}" style="width:100%;height:120px;object-fit:cover;border-radius:12px;">` : `<div class="sponsor-placeholder sponsor-placeholder-md">${item.name.slice(0, 3).toUpperCase()}</div>`}
            ${item.link ? "</a>" : ""}
            <p>${item.name}</p>
          </article>
        `).join("")}
      </div>
    </div>
  `).join("");
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

function createLoadingScreen() {
  if (document.querySelector(".loading-screen")) {
    loadingScreen = document.querySelector(".loading-screen");
    return;
  }

  const screen = document.createElement("div");
  screen.className = "loading-screen";
  screen.setAttribute("aria-hidden", "true");
  screen.innerHTML = `
    <div class="loading-screen-panel">
      <div class="loading-screen-logo-wrap">
        <img src="${LOGO_PATH}" alt="BOTD logo">
      </div>
      <p>Loading...</p>
    </div>
  `;

  body.append(screen);
  loadingScreen = screen;
}

function hideLoadingScreen() {
  if (!loadingScreen) {
    return;
  }

  window.setTimeout(() => {
    loadingScreen.classList.add("is-hidden");
    window.setTimeout(() => loadingScreen?.remove(), 500);
  }, 260);
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

  if (themeToggle) {
    themeToggle.setAttribute("aria-pressed", String(selectedTheme === "light"));
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
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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

      trigger.addEventListener("click", () => {
        const isOpen = trigger.getAttribute("aria-expanded") === "true";
        trigger.setAttribute("aria-expanded", String(!isOpen));
        panel.classList.toggle("is-open", !isOpen);
      });
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

function setupTermsModal(agreementInput) {
  const modal = document.getElementById("terms-modal");
  const openButton = document.getElementById("open-terms-modal");
  const closeButton = document.getElementById("close-terms-modal");
  const dismissButton = document.getElementById("dismiss-terms-modal");
  const acceptButton = document.getElementById("accept-terms-modal");

  if (!modal || !openButton) {
    return;
  }

  const closeModal = () => {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
  };

  const openModal = () => {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  };

  openButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openModal();
  });
  closeButton?.addEventListener("click", closeModal);
  dismissButton?.addEventListener("click", closeModal);
  acceptButton?.addEventListener("click", () => {
    if (agreementInput) {
      agreementInput.checked = true;
      agreementInput.dispatchEvent(new Event("change", { bubbles: true }));
    }
    closeModal();
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeModal();
    }
  });
}

function setupRegistrationForm() {
  if (!registrationForm) {
    return;
  }

  const PAYMENT_ENABLED = false;
  const categorySelect = registrationForm.querySelector("#category-select");
  const groupFields = registrationForm.querySelector("#group-fields");
  const teamNameInput = registrationForm.querySelector('input[name="teamName"]');
  const memberCountInput = registrationForm.querySelector('input[name="memberCount"]');
  const videoInput = registrationForm.querySelector("#video-file");
  const audioInput = registrationForm.querySelector("#audio-file");
  const photoInput = registrationForm.querySelector("#photo-files");
  const documentInput = registrationForm.querySelector("#document-files");
  const videoName = registrationForm.querySelector("#video-file-name");
  const audioName = registrationForm.querySelector("#audio-file-name");
  const photoName = registrationForm.querySelector("#photo-file-name");
  const documentName = registrationForm.querySelector("#document-file-name");
  const payButton = registrationForm.querySelector("#pay-submit");
  const statusMessage = registrationForm.querySelector("#form-status");
  const successMessage = registrationForm.querySelector("#success-message");
  const agreement = registrationForm.querySelector("#agreement");
  const razorpayKey = "rzp_test_Sak3fjFZSi65XA";

  setupTermsModal(agreement);

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

  function isFormReady() {
    return registrationForm.checkValidity() && Boolean(agreement?.checked);
  }

  function syncSubmitState() {
    if (payButton && !payButton.classList.contains("is-loading")) {
      payButton.disabled = !isFormReady();
    }
  }

  function collectFormData() {
    const videoLink = registrationForm.videoLink.value.trim();

    return {
      name: registrationForm.fullName.value.trim(),
      phone: registrationForm.phone.value.trim(),
      email: registrationForm.email.value.trim(),
      teamName: registrationForm.teamName.value.trim() || registrationForm.fullName.value.trim(),
      danceStyle: registrationForm.danceStyle.value,
      city: registrationForm.city.value.trim(),
      age: registrationForm.age.value.trim(),
      category: registrationForm.category.value,
      memberCount: registrationForm.memberCount.value.trim(),
      experienceLevel: registrationForm.experienceLevel.value,
      videoLink,
      paymentEnabled: PAYMENT_ENABLED,
      paymentStatus: PAYMENT_ENABLED ? "paid" : "disabled",
      paymentReference: "",
      details: {
        agreementAccepted: Boolean(agreement?.checked),
        paymentAmount: 99,
        paymentCurrency: "INR",
        paymentReference: "",
        optionalUploads: {
          videoFileName: videoInput?.files?.[0]?.name || "",
          audioFileName: audioInput?.files?.[0]?.name || "",
          photoFileNames: Array.from(photoInput?.files || []).map((file) => file.name),
          documentFileNames: Array.from(documentInput?.files || []).map((file) => file.name),
        },
      },
      files: {
        video: videoInput?.files?.[0] || null,
        audio: audioInput?.files?.[0] || null,
        photos: Array.from(photoInput?.files || []),
        documents: Array.from(documentInput?.files || []),
      },
    };
  }

  async function finalizeSubmission(paymentReference) {
    const payload = collectFormData();
    payload.details.paymentReference = paymentReference;
    payload.paymentReference = paymentReference;
    payload.paymentStatus = PAYMENT_ENABLED ? "paid" : "disabled";

    try {
      const result = await submitRegistration(payload);
      console.log("[BOTD] Registration saved to Firestore and Storage", {
        registrationId: result.id,
        uploadSummary: result.uploadedFiles,
      });
      successMessage?.classList.remove("is-hidden");
      setStatus(PAYMENT_ENABLED ? "Payment successful. Your registration has been submitted." : "Registration submitted successfully.", "is-success");
      registrationForm.reset();
      syncGroupFields();
      updateUploadState(videoInput, videoName);
      updateUploadState(audioInput, audioName);
      updateUploadState(photoInput, photoName);
      updateUploadState(documentInput, documentName);
      registrationForm.querySelectorAll(".field").forEach((field) => field.classList.remove("is-filled", "is-success", "is-error"));
      syncSubmitState();

      await showPopup({
        title: "Registration Confirmed",
        text: "Thank you for registering. Your audition entry has been recorded successfully.",
        primaryText: "Continue",
      });
    } catch (error) {
      console.error("[BOTD] Registration submit failed", error);
      setStatus("Registration upload failed. Please try again or contact BOTD support.", "is-error");
    }
  }

  function startPayment() {
    registrationForm.querySelectorAll(".field").forEach((field) => markFieldValidity(field, true));

    if (!registrationForm.reportValidity()) {
      setStatus("Please complete all required fields before continuing.", "is-error");
      syncSubmitState();
      return;
    }

    if (!agreement?.checked) {
      setStatus("Please accept the Terms & Conditions before continuing.", "is-error");
      syncSubmitState();
      return;
    }

    successMessage?.classList.add("is-hidden");
    setStatus(PAYMENT_ENABLED ? "Preparing your payment..." : "Submitting your registration...", "");
    setButtonLoading(payButton, true, PAYMENT_ENABLED ? "Processing" : "Submitting");

    if (!PAYMENT_ENABLED) {
      finalizeSubmission("payment-disabled")
        .finally(() => {
          setButtonLoading(payButton, false, "Submit Registration");
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
        await finalizeSubmission(response.razorpay_payment_id || "demo-success");
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
      setStatus("Razorpay SDK failed to load. Please refresh and try again.", "is-error");
      setButtonLoading(payButton, false, "Pay & Submit");
      syncSubmitState();
      return;
    }

    if (!hasValidTestKey) {
      setStatus("Add your Razorpay test key in js/script.js to open the checkout popup.", "is-error");
      setButtonLoading(payButton, false, "Pay & Submit");
      syncSubmitState();
      return;
    }

    const razorpay = new window.Razorpay(paymentOptions);
    razorpay.on("payment.failed", () => {
      setStatus("Payment failed. Please try again.", "is-error");
      setButtonLoading(payButton, false, "Pay & Submit");
      syncSubmitState();
    });
    razorpay.open();
  }

  registrationForm.addEventListener("input", syncSubmitState);
  registrationForm.addEventListener("change", syncSubmitState);
  categorySelect?.addEventListener("change", () => {
    syncGroupFields();
    syncSubmitState();
  });
  videoInput?.addEventListener("change", () => updateUploadState(videoInput, videoName));
  audioInput?.addEventListener("change", () => updateUploadState(audioInput, audioName));
  photoInput?.addEventListener("change", () => updateUploadState(photoInput, photoName));
  documentInput?.addEventListener("change", () => updateUploadState(documentInput, documentName));
  payButton?.addEventListener("click", startPayment);

  if (!PAYMENT_ENABLED) {
    const paymentLabel = payButton?.querySelector(".payment-button-text");
    if (paymentLabel) {
      paymentLabel.textContent = "Submit Registration";
    }
  }

  syncGroupFields();
  updateUploadState(videoInput, videoName);
  updateUploadState(audioInput, audioName);
  updateUploadState(photoInput, photoName);
  updateUploadState(documentInput, documentName);
  syncSubmitState();
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
    return "reCAPTCHA verification failed. Please try again.";
  }

  if (errorCode.includes("billing-not-enabled")) {
    return "Firebase billing is not enabled for phone OTP.";
  }

  if (errorCode.includes("operation-not-allowed")) {
    return "Phone OTP sign-in is not enabled in Firebase.";
  }

  return error?.message || "Failed to send OTP. Please try again.";
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

  return error?.message || "OTP verification failed. Please try again.";
}

function getActiveVotingCategoryCode() {
  const activeButton = document.querySelector(".vote-tab-button.is-active");
  return String(activeButton?.dataset.voteTarget || "").toUpperCase();
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
    panelHost.innerHTML = "<p>No contestants available right now.</p>";
    return;
  }

  let activeCode = getActiveVotingCategoryCode() || String(activeCategories[0].code || "").toUpperCase();
  if (!activeCategories.some((item) => String(item.code || "").toUpperCase() === activeCode)) {
    activeCode = String(activeCategories[0].code || "").toUpperCase();
  }

  tabList.innerHTML = activeCategories.map((category) => {
    const code = String(category.code || "").toUpperCase();
    const isActive = code === activeCode;
    return `<button class="vote-tab-button ${isActive ? "is-active" : ""}" type="button" role="tab" aria-selected="${isActive}" data-vote-target="${code.toLowerCase()}">${category.name || code}</button>`;
  }).join("");

  panelHost.innerHTML = activeCategories.map((category) => {
    const code = String(category.code || "").toUpperCase();
    const isActive = code === activeCode;
    const teams = liveVotingTeams.filter((team) => String(team.categoryId || "").toUpperCase() === code && team.isVisible !== false);
    return `
      <div class="vote-tab-panel ${isActive ? "is-active" : ""}" id="${code.toLowerCase()}" role="tabpanel">
        <div class="contestant-vote-grid">
          ${teams.length ? teams.map((team) => `
            <article class="vote-card-item${votingUiState.selectedTeamId === team.id ? " is-selected" : ""}${getVoteAnimationClass(team.id, getVoteCountForTeam(team.id))}" data-team-id="${team.id}" data-contestant="${team.name}">
              <img src="${team.image || "assets/images/poster1.jpg"}" alt="${team.name || "BOTD contestant"}">
              <h3>${team.name || "Unnamed contestant"}</h3>
              <p>${team.city || "Bangalore"}</p>
              ${liveUiControls.showVotes ? `<div class="vote-count-badge" aria-live="polite"><span>Votes</span><strong data-animated-count="${team.id}">${getVoteCountForTeam(team.id)}</strong></div>` : ""}
            </article>
          `).join("") : "<p>No contestants available in this category.</p>"}
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
          status.textContent = "Submission failed. Please try again.";
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
  createLoadingScreen();
  createPopup();
  initializeAdminConsole();
  activeUser = getCurrentUser();
  loadAuthSession();
  loadHomeContent();
  loadSeasonContent();
  loadEventsContent();
  loadVotingContent();
  loadVotingSettings();
  loadUiControlSettings();
  loadPartyBlastSignals();
  loadVoteTalliesRealtime();
  loadJudgesRealtime();
  loadSponsorsRealtime();
  loadCategoriesRealtime();
  loadTeamsRealtime();
  loadTheme();
  prepareButtons();
  setupFieldStates();
  setupRevealAnimations();
  syncHeaderState();
  syncScrollEffects();
  setupHeroParallax();
  setupInteractiveCards();
  setupAccordions();
  setupTabs();
  setupRegistrationForm();
  setupVotingPage();
  setupSponsorForm();
  setupContactForm();

  themeToggle?.addEventListener("click", toggleTheme);
  menuToggle?.addEventListener("click", toggleMenu);

  document.querySelectorAll(".nav-link").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

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
    hideLoadingScreen();
  } else {
    window.addEventListener("load", hideLoadingScreen, { once: true });
  }

  window.addEventListener("beforeunload", () => {
    pageSubscriptions.forEach((unsubscribe) => {
      if (typeof unsubscribe === "function") {
        unsubscribe();
      }
    });
  }, { once: true });
}

initSite();
