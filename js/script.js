const THEME_KEY = "botd-theme";
const LOGO_PATH = "assets/images/Final_BOTD_Logo.png";

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

let scrollTicking = false;
let loadingScreen = null;
let modalRoot = null;
let modalTitle = null;
let modalText = null;
let modalPrimary = null;
let modalSecondary = null;
let modalClose = null;
let activeModalResolver = null;

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

  if (!button.dataset.defaultLabel && label) {
    button.dataset.defaultLabel = label.textContent.trim();
  }

  button.classList.toggle("is-loading", isLoading);
  button.disabled = isLoading;

  if (label) {
    label.textContent = isLoading ? loadingText : button.dataset.defaultLabel || label.textContent;
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

function setupRegistrationForm() {
  if (!registrationForm) {
    return;
  }

  const categorySelect = registrationForm.querySelector("#category-select");
  const groupFields = registrationForm.querySelector("#group-fields");
  const teamNameInput = registrationForm.querySelector('input[name="teamName"]');
  const memberCountInput = registrationForm.querySelector('input[name="memberCount"]');
  const videoInput = registrationForm.querySelector("#video-file");
  const audioInput = registrationForm.querySelector("#audio-file");
  const videoName = registrationForm.querySelector("#video-file-name");
  const audioName = registrationForm.querySelector("#audio-file-name");
  const payButton = registrationForm.querySelector("#pay-submit");
  const statusMessage = registrationForm.querySelector("#form-status");
  const successMessage = registrationForm.querySelector("#success-message");
  const agreement = registrationForm.querySelector("#agreement");
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
    const hasFile = Boolean(input.files?.[0]);
    label.textContent = hasFile ? input.files[0].name : "No file selected";
    wrapper?.classList.toggle("is-success", hasFile);
    wrapper?.classList.toggle("is-error", !hasFile);
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
    return registrationForm.checkValidity()
      && Boolean(videoInput?.files?.length)
      && Boolean(audioInput?.files?.length)
      && Boolean(agreement?.checked);
  }

  function syncSubmitState() {
    if (payButton && !payButton.classList.contains("is-loading")) {
      payButton.disabled = !isFormReady();
    }
  }

  function collectFormData() {
    return {
      fullName: registrationForm.fullName.value.trim(),
      age: registrationForm.age.value.trim(),
      phone: registrationForm.phone.value.trim(),
      email: registrationForm.email.value.trim(),
      city: registrationForm.city.value.trim(),
      category: registrationForm.category.value,
      teamName: registrationForm.teamName.value.trim(),
      memberCount: registrationForm.memberCount.value.trim(),
      danceStyle: registrationForm.danceStyle.value,
      experienceLevel: registrationForm.experienceLevel.value,
      videoFileName: videoInput?.files?.[0]?.name || "",
      audioFileName: audioInput?.files?.[0]?.name || "",
      agreementAccepted: Boolean(agreement?.checked),
      entryFee: 99,
      submittedAt: new Date().toISOString(),
    };
  }

  function finalizeSubmission(paymentReference) {
    const payload = {
      ...collectFormData(),
      paymentReference,
    };

    const existing = JSON.parse(localStorage.getItem("botd-registrations") || "[]");
    existing.push(payload);
    localStorage.setItem("botd-registrations", JSON.stringify(existing));
    console.log("BOTD Registration Submission", payload);

    successMessage?.classList.remove("is-hidden");
    setStatus("Payment successful. Your registration has been saved locally.", "is-success");
    registrationForm.reset();
    syncGroupFields();
    updateUploadState(videoInput, videoName);
    updateUploadState(audioInput, audioName);
    registrationForm.querySelectorAll(".field").forEach((field) => field.classList.remove("is-filled", "is-success", "is-error"));
    syncSubmitState();

    showPopup({
      title: "Registration Confirmed",
      text: "Thank you for registering. Your audition entry has been recorded successfully.",
      primaryText: "Continue",
    });
  }

  function startPayment() {
    registrationForm.querySelectorAll(".field").forEach((field) => markFieldValidity(field, true));

    if (!registrationForm.reportValidity()) {
      setStatus("Please complete all required fields before continuing.", "is-error");
      syncSubmitState();
      return;
    }

    if (!videoInput?.files?.length || !audioInput?.files?.length || !agreement?.checked) {
      setStatus("Please upload the required files and accept the agreement to continue.", "is-error");
      updateUploadState(videoInput, videoName);
      updateUploadState(audioInput, audioName);
      syncSubmitState();
      return;
    }

    successMessage?.classList.add("is-hidden");
    setStatus("Preparing your payment...", "");
    setButtonLoading(payButton, true, "Processing");

    const paymentOptions = {
      key: razorpayKey,
      amount: 9900,
      currency: "INR",
      name: "Battle Of The Dance",
      description: "First Audition Round Registration",
      handler(response) {
        finalizeSubmission(response.razorpay_payment_id || "demo-success");
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
  payButton?.addEventListener("click", startPayment);

  syncGroupFields();
  updateUploadState(videoInput, videoName);
  updateUploadState(audioInput, audioName);
  syncSubmitState();
}

function setupVotingPage() {
  const votingShell = document.querySelector("[data-voting]");

  if (!votingShell) {
    return;
  }

  const tabButtons = votingShell.querySelectorAll(".vote-tab-button");
  const tabPanels = votingShell.querySelectorAll(".vote-tab-panel");
  const contestantCards = votingShell.querySelectorAll(".vote-card-item");
  const selectedLabel = document.getElementById("selected-contestant-label");
  const mobileInput = document.getElementById("vote-mobile");
  const sendOtpButton = document.getElementById("send-otp");
  const otpSection = document.getElementById("otp-section");
  const otpInput = document.getElementById("otp-input");
  const verifyVoteButton = document.getElementById("verify-vote");
  const voteStatus = document.getElementById("vote-status");

  let selectedContestant = "";
  let generatedOtp = "";

  function setVoteStatus(message, tone) {
    if (!voteStatus) {
      return;
    }

    voteStatus.textContent = message;
    voteStatus.classList.remove("is-error", "is-success");

    if (tone) {
      voteStatus.classList.add(tone);
    }
  }

  function syncVoteState() {
    const isMobileValid = Boolean(mobileInput?.value.trim().match(/^\d{10}$/));

    if (sendOtpButton && !sendOtpButton.classList.contains("is-loading")) {
      sendOtpButton.disabled = !(selectedContestant && isMobileValid);
    }

    if (verifyVoteButton && !verifyVoteButton.classList.contains("is-loading")) {
      verifyVoteButton.disabled = !(selectedContestant && isMobileValid && otpInput?.value.trim().length === 4);
    }
  }

  function resetVotingFlow() {
    selectedContestant = "";
    generatedOtp = "";
    contestantCards.forEach((card) => card.classList.remove("is-selected"));

    if (selectedLabel) {
      selectedLabel.textContent = "Voting for: None selected";
    }

    if (mobileInput) {
      mobileInput.value = "";
      mobileInput.closest(".field")?.classList.remove("is-filled", "is-success", "is-error");
    }

    if (otpInput) {
      otpInput.value = "";
      otpInput.closest(".field")?.classList.remove("is-filled", "is-success", "is-error");
    }

    otpSection?.classList.add("is-hidden");
    setVoteStatus("", "");
    syncVoteState();
  }

  tabButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetId = button.dataset.voteTarget;

      tabButtons.forEach((item) => {
        const isActive = item === button;
        item.classList.toggle("is-active", isActive);
        item.setAttribute("aria-selected", String(isActive));
      });

      tabPanels.forEach((panel) => {
        panel.classList.toggle("is-active", panel.id === targetId);
      });

      resetVotingFlow();
    });
  });

  contestantCards.forEach((card) => {
    card.addEventListener("click", () => {
      const parentPanel = card.closest(".vote-tab-panel");

      if (!parentPanel?.classList.contains("is-active")) {
        return;
      }

      contestantCards.forEach((item) => item.classList.remove("is-selected"));
      card.classList.add("is-selected");
      selectedContestant = card.dataset.contestant || "";

      if (selectedLabel) {
        selectedLabel.textContent = `Voting for: ${selectedContestant}`;
      }

      generatedOtp = "";
      otpSection?.classList.add("is-hidden");
      if (otpInput) {
        otpInput.value = "";
        otpInput.closest(".field")?.classList.remove("is-filled", "is-success", "is-error");
      }
      setVoteStatus("", "");
      syncVoteState();
    });
  });

  sendOtpButton?.addEventListener("click", () => {
    const mobileNumber = mobileInput?.value.trim() || "";
    const existingVotes = JSON.parse(localStorage.getItem("botd-votes") || "[]");

    if (existingVotes.some((vote) => vote.mobileNumber === mobileNumber)) {
      setVoteStatus("This mobile number has already been used to vote.", "is-error");
      return;
    }

    setButtonLoading(sendOtpButton, true, "Sending");
    generatedOtp = String(Math.floor(1000 + Math.random() * 9000));

    window.setTimeout(async () => {
      otpSection?.classList.remove("is-hidden");
      setVoteStatus("OTP sent for demo verification.", "is-success");
      setButtonLoading(sendOtpButton, false, "Send OTP");
      syncVoteState();

      await showPopup({
        title: "Demo OTP",
        text: `Your OTP is: ${generatedOtp}`,
        primaryText: "Continue",
      });
    }, 420);
  });

  otpInput?.addEventListener("input", syncVoteState);
  mobileInput?.addEventListener("input", syncVoteState);

  verifyVoteButton?.addEventListener("click", () => {
    const mobileNumber = mobileInput?.value.trim() || "";
    const enteredOtp = otpInput?.value.trim() || "";
    const existingVotes = JSON.parse(localStorage.getItem("botd-votes") || "[]");

    if (existingVotes.some((vote) => vote.mobileNumber === mobileNumber)) {
      setVoteStatus("This mobile number has already been used to vote.", "is-error");
      return;
    }

    if (enteredOtp !== generatedOtp) {
      setVoteStatus("Incorrect OTP. Please try again.", "is-error");
      return;
    }

    setButtonLoading(verifyVoteButton, true, "Submitting");

    window.setTimeout(async () => {
      const payload = {
        contestant: selectedContestant,
        mobileNumber,
        timestamp: new Date().toISOString(),
      };

      // For production, backend + real OTP verification are required.
      // Live vote counts are intentionally not shown to avoid manipulation.
      existingVotes.push(payload);
      localStorage.setItem("botd-votes", JSON.stringify(existingVotes));
      console.log("BOTD vote stored", payload);

      setVoteStatus("Vote submitted successfully.", "is-success");
      setButtonLoading(verifyVoteButton, false, "Verify & Submit Vote");

      await showPopup({
        title: "Vote Submitted",
        text: `Thank you for voting ${selectedContestant}. Stay tuned for results.`,
        primaryText: "Done",
      });

      resetVotingFlow();
    }, 700);
  });

  syncVoteState();
}

function setupSimpleForm({
  formId,
  statusId,
  storageKey,
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
      const entries = JSON.parse(localStorage.getItem(storageKey) || "[]");
      entries.push(payload);
      localStorage.setItem(storageKey, JSON.stringify(entries));
      console.log(`${formId} submission`, payload);

      form.reset();
      form.querySelectorAll(".field").forEach((field) => field.classList.remove("is-filled", "is-success", "is-error"));
      setButtonLoading(submitButton, false, loadingText);

      if (status) {
        status.textContent = successMessage;
        status.classList.add("is-success");
      }

      await showPopup({
        title: popupTitle,
        text: popupText,
        primaryText: "Continue",
      });
    }, 520);
  });
}

function setupSponsorForm() {
  setupSimpleForm({
    formId: "sponsor-form",
    statusId: "sponsor-form-status",
    storageKey: "botd-sponsor-enquiries",
    invalidMessage: "Please complete all required fields before submitting.",
    successMessage: "Thank you. Your enquiry has been recorded and the BOTD team can follow up from here.",
    popupTitle: "Enquiry Submitted",
    popupText: "Thank you for your interest in partnering with BOTD. The team can now follow up with you.",
    loadingText: "Submitting",
    payloadBuilder(form) {
      return {
        name: form.name.value.trim(),
        company: form.company.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email.value.trim(),
        interest: form.interest.value,
        message: form.message.value.trim(),
        submittedAt: new Date().toISOString(),
      };
    },
  });
}

function setupContactForm() {
  setupSimpleForm({
    formId: "contact-form",
    statusId: "contact-form-status",
    storageKey: "botd-contact-messages",
    invalidMessage: "Please complete all required fields before sending your message.",
    successMessage: "Thank you! We'll get back to you soon.",
    popupTitle: "Message Sent",
    popupText: "Thank you! We'll get back to you soon.",
    loadingText: "Sending",
    payloadBuilder(form) {
      return {
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
        email: form.email.value.trim(),
        subject: form.subject.value,
        message: form.message.value.trim(),
        submittedAt: new Date().toISOString(),
      };
    },
  });
}

function initSite() {
  createLoadingScreen();
  createPopup();
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
}

initSite();
