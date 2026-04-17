import { subscribeCategories } from "../../services/categoryService.js";
import { submitContactMessage, submitRegistration, submitSponsorEnquiry } from "../../services/formService.js";
import { subscribeHomeContent } from "../../services/homeService.js";
import { subscribeSponsors } from "../../services/sponsorService.js";
import { submitVote, subscribeTeams } from "../../services/teamService.js";
import { ensureSettingsDocument, subscribeSettings } from "../../services/settingsService.js";

function showState(target, message, type = "info") {
  if (!target) return;
  target.textContent = message;
  target.classList.remove("is-error", "is-success");
  if (type === "error") target.classList.add("is-error");
  if (type === "success") target.classList.add("is-success");
}

function isPublicContestant(team) {
  return team?.approved !== false && team?.visible !== false;
}

function mountHomeContent() {
  const titleNode = document.querySelector(".hero-copy h1");
  const subtitleNode = document.querySelector(".hero-subtitle");
  const descNode = document.querySelector(".hero-text, [data-home-live-flag]");
  const firstHighlight = document.querySelector(".hero-highlights .highlight-card .highlight-value");

  if (!titleNode && !subtitleNode && !descNode) return () => {};

  return subscribeHomeContent(
    (data) => {
      console.log("[BOTD] home content loaded:", data ? "ok" : "empty");
      if (!data) return;
      if (titleNode && data.title) titleNode.textContent = data.title;
      if (subtitleNode && data.subtitle) subtitleNode.textContent = data.subtitle;
      if (firstHighlight && data.prizeText) firstHighlight.textContent = data.prizeText;
      if (descNode) {
        descNode.textContent = data.isLive ? "Live Now" : "Coming Soon";
      }

      if (data.bannerImage) {
        const backdrop = document.querySelector(".hero-backdrop");
        if (backdrop) {
          backdrop.style.backgroundImage = `linear-gradient(90deg, rgba(5,5,5,0.95) 0%, rgba(5,5,5,0.74) 48%, rgba(5,5,5,0.48) 100%), url('${data.bannerImage}')`;
          backdrop.style.backgroundSize = "cover";
          backdrop.style.backgroundPosition = "center";
        }
      }
    },
    (error) => console.error("[BOTD] home content load failed", error)
  );
}

function mountAnnouncementFeed() {
  const hosts = document.querySelectorAll("[data-announcements]");
  if (hosts.length === 0) return () => {};

  return subscribeSettings(
    (settings) => {
      const message = String(settings?.announcement || "").trim();
      hosts.forEach((host) => {
        host.innerHTML = message ? `<ul class="simple-list"><li>${message}</li></ul>` : "<p>BOTD updates will appear here soon.</p>";
      });
    },
    (error) => {
      console.error("[BOTD] settings announcement load failed", error);
      hosts.forEach((host) => { host.innerHTML = "<p>Unable to load updates. Please try again.</p>"; });
    }
  );
}

function mountSponsors() {
  const host = document.querySelector("[data-sponsors-live]");
  if (!host) return () => {};

  return subscribeSponsors(
    (items) => {
      console.log("[BOTD] sponsors loaded:", items.length);
      if (!items.length) {
        host.innerHTML = "<p>BOTD partners will be announced soon.</p>";
        return;
      }
      const groups = items.reduce((acc, item) => {
        const key = item.category || "General";
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
      }, {});

      host.innerHTML = Object.keys(groups).map((category) => `
        <div class="sponsor-category reveal">
          <div class="sponsor-category-head"><h3>${category}</h3></div>
          <div class="sponsor-grid sponsor-grid-silver">
            ${groups[category].map((item) => `
              <article class="sponsor-logo-card sponsor-logo-card-silver">
                <img src="${item.image || "assets/images/poster1.jpg"}" alt="${item.name}" style="width:100%;height:120px;object-fit:cover;border-radius:12px;" />
                <p>${item.name}</p>
              </article>
            `).join("")}
          </div>
        </div>
      `).join("");
    },
    (error) => {
      console.error("[BOTD] sponsors load failed", error);
      host.innerHTML = "<p>Unable to load sponsors. Please try again.</p>";
    }
  );
}

function mountVotingPage() {
  const shell = document.querySelector("[data-voting-live='true']");
  if (!shell) return [];

  const tabList = shell.querySelector(".vote-tab-list");
  const panelHost = shell.querySelector("[data-voting-panels]");
  const selectedLabel = document.getElementById("selected-contestant-label");
  const mobileInput = document.getElementById("vote-mobile");
  const voteStatus = document.getElementById("vote-status");
  const countdownNode = document.querySelector("[data-vote-countdown]");

  let categories = [];
  let teams = [];
  let settings = { votingOpen: false, activeCategory: null, votingEndTime: null, announcement: "" };
  let activeCategory = null;
  let voteSubmitting = false;

  function updateCountdown() {
    if (!countdownNode) return;
    if (!settings.votingEndTime) {
      countdownNode.textContent = "Countdown: Not set";
      return;
    }

    const end = new Date(settings.votingEndTime).getTime();
    const now = Date.now();
    const diff = end - now;
    if (diff <= 0) {
      countdownNode.textContent = "Countdown: Ended";
      return;
    }

    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const s = Math.floor((diff % (1000 * 60)) / 1000);
    countdownNode.textContent = `Countdown: ${h}h ${m}m ${s}s`;
  }

  function syncVoteButtons() {
    const mobileValid = /^\d{10}$/.test(mobileInput?.value?.trim() || "");
    const buttons = panelHost?.querySelectorAll("[data-vote-team]") || [];
    buttons.forEach((btn) => {
      btn.disabled = voteSubmitting || !settings.votingOpen || !mobileValid;
      btn.textContent = settings.votingOpen ? (voteSubmitting ? "Submitting..." : "Vote") : "Voting Closed";
    });
  }

  function render() {
    const activeCats = categories.filter((item) => item.isActive);
    if (!activeCats.length) {
      if (tabList) tabList.innerHTML = "<p>Contestants will be announcing soon.</p>";
      if (panelHost) panelHost.innerHTML = "<p>Contestants will be announcing soon.</p>";
      if (selectedLabel) selectedLabel.textContent = "Voting for: None selected";
      syncVoteButtons();
      return;
    }

    if (!activeCategory) {
      activeCategory = String(settings.activeCategory || activeCats[0].code || "").toUpperCase();
    }

    if (!activeCats.some((item) => String(item.code || "").toUpperCase() === activeCategory)) {
      activeCategory = String(activeCats[0].code || "").toUpperCase();
    }

    tabList.innerHTML = activeCats.map((item) => {
      const code = String(item.code || "").toUpperCase();
      const isActive = code === activeCategory;
      return `<button class=\"vote-tab-button ${isActive ? "is-active" : ""}\" type=\"button\" data-live-category=\"${code}\" aria-selected=\"${isActive}\">${item.name || code}</button>`;
    }).join("");

    const filtered = teams.filter((team) => String(team.categoryId || team.category || "").toUpperCase() === activeCategory && isPublicContestant(team));
    panelHost.innerHTML = filtered.length
      ? `<div class=\"contestant-vote-grid\">${filtered.map((team) => `
          <article class=\"vote-card-item\" data-team-card=\"${team.id}\">
            <img src=\"${team.image || "assets/images/poster1.jpg"}\" alt=\"${team.name}\">
            <h3>${team.name}</h3>
            <p>${String(team.categoryId || team.category || "").toUpperCase()} | ${team.city || "-"} | Votes: ${Number(team.votes) || 0}</p>
            <button type=\"button\" class=\"button button-primary vote-submit-button\" data-vote-team=\"${team.id}\">Vote</button>
          </article>
        `).join("")}</div>`
      : "<p>Contestants will be announcing soon.</p>";

    tabList.querySelectorAll("[data-live-category]").forEach((button) => {
      button.addEventListener("click", () => {
        activeCategory = button.dataset.liveCategory;
        if (selectedLabel) selectedLabel.textContent = "Voting for: None selected";
        showState(voteStatus, "");
        render();
      });
    });

    panelHost.querySelectorAll("[data-vote-team]").forEach((button) => {
      button.addEventListener("click", async () => {
        const teamId = button.dataset.voteTeam;
        const selected = filtered.find((team) => team.id === teamId);
        const mobileNumber = mobileInput?.value?.trim() || "";

        if (!selected) {
          showState(voteStatus, "Please choose a BOTD team again.", "error");
          return;
        }

        if (!settings.votingOpen) {
          showState(voteStatus, "Voting is currently closed.", "error");
          return;
        }

        if (!/^\d{10}$/.test(mobileNumber)) {
          showState(voteStatus, "Enter a valid 10-digit mobile number.", "error");
          return;
        }

        try {
          voteSubmitting = true;
          if (selectedLabel) selectedLabel.textContent = `Voting for: ${selected.name}`;
          syncVoteButtons();
          await submitVote({
            teamId: selected.id,
            teamName: selected.name,
            categoryId: String(selected.categoryId || selected.category || "").toUpperCase(),
            mobileNumber
          });
          showState(voteStatus, "Vote submitted successfully.", "success");
          if (mobileInput) mobileInput.value = "";
          if (selectedLabel) selectedLabel.textContent = "Voting for: None selected";
        } catch (error) {
          showState(voteStatus, "Your vote could not be submitted. Please try again.", "error");
        } finally {
          voteSubmitting = false;
          syncVoteButtons();
        }
      });
    });

    syncVoteButtons();
  }

  mobileInput?.addEventListener("input", syncVoteButtons);

  const unsubCategories = subscribeCategories((items) => {
    categories = items;
    console.log("[BOTD] categories loaded:", items.length);
    render();
  }, (error) => {
    console.error("[BOTD] categories load failed", error);
    showState(voteStatus, "Unable to load voting categories. Please try again.", "error");
  });

  const unsubTeams = subscribeTeams((items) => {
    teams = items;
    render();
  }, (error) => {
    console.error("[BOTD] teams load failed", error);
    showState(voteStatus, "Unable to load contestants. Please try again.", "error");
  });

  const unsubSettings = subscribeSettings((value) => {
    settings = value;
    console.log("[BOTD] settings loaded:", value);
    if (value?.activeCategory) {
      activeCategory = String(value.activeCategory).toUpperCase();
    }
    render();
    updateCountdown();
  }, (error) => {
    console.error("[BOTD] settings load failed", error);
    showState(voteStatus, "Unable to load voting status. Please try again.", "error");
  });

  const timer = setInterval(updateCountdown, 1000);

  return [unsubCategories, unsubTeams, unsubSettings, () => clearInterval(timer)];
}

function mountSeasonContestants() {
  const host = document.querySelector(".contestant-tabs[data-season-live='true']");
  if (!host) return [];

  let categories = [];
  let teams = [];
  let activeCategory = null;

  function render() {
    const activeCats = categories.filter((item) => item.isActive);
    if (!activeCats.length) {
      host.innerHTML = "<p>Contestants will be announcing soon.</p>";
      return;
    }

    if (!activeCategory) activeCategory = String(activeCats[0].code || "").toUpperCase();
    if (!activeCats.some((item) => String(item.code || "").toUpperCase() === activeCategory)) {
      activeCategory = String(activeCats[0].code || "").toUpperCase();
    }

    host.innerHTML = `
      <div class="tab-list" role="tablist" aria-label="Contestant categories">
        ${activeCats.map((item) => {
          const code = String(item.code || "").toUpperCase();
          const count = teams.filter((team) => String(team.categoryId || team.category || "").toUpperCase() === code && isPublicContestant(team)).length;
          return `<button class="tab-button ${code === activeCategory ? "is-active" : ""}" type="button" data-season-cat="${code}" aria-selected="${code === activeCategory}">${item.name || code} (${count})</button>`;
        }).join("")}
      </div>
      ${activeCats.map((item) => {
        const code = String(item.code || "").toUpperCase();
        const list = teams.filter((team) => String(team.categoryId || team.category || "").toUpperCase() === code && isPublicContestant(team));
        return `
          <div class="tab-panel ${code === activeCategory ? "is-active" : ""}" id="${code.toLowerCase()}" role="tabpanel">
            <p class="contestant-meta">${list.length ? `${list.length} teams are available in ${item.name || code}.` : "Contestants will be announcing soon."}</p>
            <div class="contestant-grid">
              ${list.map((team) => `<article class="contestant-card"><img src="${team.image || "assets/images/poster1.jpg"}" alt="${team.name}"><h3>${team.name}</h3><p>${team.city || "-"} | Votes: ${Number(team.votes) || 0}</p></article>`).join("")}
            </div>
          </div>
        `;
      }).join("")}
    `;

    host.querySelectorAll("[data-season-cat]").forEach((button) => {
      button.addEventListener("click", () => {
        activeCategory = button.dataset.seasonCat;
        render();
      });
    });
  }

  const unsubCategories = subscribeCategories((items) => {
    categories = items;
    console.log("[BOTD] categories loaded (seasons):", items.length);
    render();
  });

  const unsubTeams = subscribeTeams((items) => {
    teams = items;
    render();
  });

  return [unsubCategories, unsubTeams];
}

function mountRegistrationForm() {
  const form = document.getElementById("registration-form");
  if (!form || form.dataset.liveFirebase !== "true") return;

  const status = document.getElementById("form-status");
  const button = document.getElementById("pay-submit");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
  });

  
  button?.addEventListener("click", async () => {
    if (!form.reportValidity()) {
      showState(status, "Please complete all required fields before submitting.", "error");
      return;
    }

    const videoFileName = document.getElementById("video-file")?.files?.[0]?.name || "";
    const audioFileName = document.getElementById("audio-file")?.files?.[0]?.name || "";
    const isGroup = /Group/i.test(form.category?.value || "");

    if (!videoFileName || !audioFileName) {
      showState(status, "Please upload required video and audio files.", "error");
      return;
    }

    if (!form.agreement?.checked) {
      showState(status, "Please accept the agreement to continue.", "error");
      return;
    }

    if (isGroup && !String(form.teamName?.value || "").trim()) {
      showState(status, "Team name is required for group categories.", "error");
      return;
    }

    try {
      button.disabled = true;
      showState(status, "Submitting registration...", "info");
      await submitRegistration({
        name: form.fullName.value.trim(),
        age: Number(form.age.value) || null,
        contact: form.phone.value.trim(),
        email: form.email.value.trim(),
        city: form.city.value.trim(),
        category: form.category.value,
        teamName: form.teamName?.value?.trim() || "",
        memberCount: form.memberCount?.value?.trim() || "",
        danceStyle: form.danceStyle.value,
        experienceLevel: form.experienceLevel.value,
        videoFileName,
        audioFileName
      });
      form.reset();
      showState(status, "Registration submitted successfully.", "success");
    } catch (error) {
      showState(status, "Registration could not be completed. Please try again.", "error");
    } finally {
      button.disabled = false;
    }
  });
}

function mountSponsorEnquiryForm() {
  const form = document.getElementById("sponsor-form");
  if (!form || form.dataset.liveFirebase !== "true") return;

  const status = document.getElementById("sponsor-form-status");
  const submit = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) {
      showState(status, "Please complete all required fields before submitting.", "error");
      return;
    }

    try {
      if (submit) submit.disabled = true;
      showState(status, "Submitting enquiry...", "info");
      await submitSponsorEnquiry({
        name: form.name.value.trim(),
        company: form.company.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email.value.trim(),
        interest: form.interest.value,
        message: form.message.value.trim()
      });
      form.reset();
      showState(status, "Enquiry submitted successfully.", "success");
    } catch (error) {
      showState(status, "Your sponsor enquiry could not be submitted. Please try again.", "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

function mountContactForm() {
  const form = document.getElementById("contact-form");
  if (!form || form.dataset.liveFirebase !== "true") return;

  const status = document.getElementById("contact-form-status");
  const submit = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) {
      showState(status, "Please complete all required fields before sending your message.", "error");
      return;
    }

    try {
      if (submit) submit.disabled = true;
      showState(status, "Sending message...", "info");
      await submitContactMessage({
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email.value.trim(),
        subject: form.subject.value,
        message: form.message.value.trim()
      });
      form.reset();
      showState(status, "Message sent successfully.", "success");
    } catch (error) {
      showState(status, "Your message could not be sent. Please try again.", "error");
    } finally {
      if (submit) submit.disabled = false;
    }
  });
}

async function initLiveFirebaseSync() {
  try {
    await ensureSettingsDocument();
  } catch (error) {
    console.error("[BOTD] Failed to ensure settings/app document", error);
  }

  const unsubs = [];
  unsubs.push(mountHomeContent());
  unsubs.push(mountAnnouncementFeed());
  unsubs.push(mountSponsors());
  unsubs.push(...mountVotingPage());
  unsubs.push(...mountSeasonContestants());
  mountRegistrationForm();
  mountSponsorEnquiryForm();
  mountContactForm();

  window.addEventListener("beforeunload", () => {
    unsubs.forEach((fn) => typeof fn === "function" && fn());
  });
}

initLiveFirebaseSync();
