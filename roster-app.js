import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  collection,
  deleteDoc,
  doc,
  getFirestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyA-U1iMe59o2i9ZQe5Z_eMFX-9WIFYS4mc",
  authDomain: "bcc-men-league.firebaseapp.com",
  projectId: "bcc-men-league",
  storageBucket: "bcc-men-league.firebasestorage.app",
  messagingSenderId: "1037647483069",
  appId: "1:1037647483069:web:f82d7da424b6611b7067d4",
};

const APPROVED_ADMIN_EMAILS = new Set([
  "demandgendave@gmail.com",
  "ronan@flycurrent.ai",
]);
const DEFAULT_NEW_GAME_TIME = "12:00";
const ADMIN_VIEW_IDS = new Set(["pairings-admin", "player-admin", "schedule-admin", "news-admin"]);
const PAIRING_KEYS = ["pair1", "pair2", "pair3", "pair4"];
const SKILL_LEVEL_OPTIONS = [
  { value: "low-intermediate", label: "Low Intermediate" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];
const SKILL_LEVEL_LABELS = new Map(SKILL_LEVEL_OPTIONS.map((option) => [option.value, option.label]));

const VIEW_META = {
  news: {
    label: "News",
    eyebrow: "Team Updates",
    title: "News",
    copy: "Catch the latest team updates, announcements, photos, and links from Hawk'n'Roll.",
  },
  members: {
    label: "The Team",
    eyebrow: "Current roster",
    title: "The Team",
    copy: "Meet the Hawk'n'Roll players who make up the team this season.",
  },
  schedule: {
    label: "Schedule",
    eyebrow: "Blackhawk Country Club",
    title: "Team Schedule",
    copy:
      "See every matchup on the calendar, monitor live availability, and keep the roster aligned for each date.",
  },
  availability: {
    label: "Availability",
    eyebrow: "Player response",
    title: "Availability Board",
    copy:
      "Choose your name once and update your response for each matchup without leaving the schedule flow.",
  },
  roster: {
    label: "Game Rosters",
    eyebrow: "Team view",
    title: "Game Rosters",
    copy: "See the saved pairings for each matchup and compare the DUPR weight of every team.",
  },
  team: {
    label: "Team Standing",
    eyebrow: "Results",
    title: "Team Standing",
    copy:
      "Final matchup scores roll up into win-loss tracking against each opponent as results are entered.",
  },
  "pairings-admin": {
    label: "Roster Mgmt",
    eyebrow: "Operations",
    title: "Roster Mgmt",
    copy:
      "Step 1: Pick the eight players for the scheduled day. Step 2: Go to Pairings and assign teams for the 8 players.",
  },
  "player-admin": {
    label: "Player Mgmt",
    eyebrow: "Operations",
    title: "Player Mgmt",
    copy: "Add players, update names, and manage who is active on the team.",
  },
  "schedule-admin": {
    label: "Schedule + Scores",
    eyebrow: "Operations",
    title: "Schedule + Scores",
    copy: "Create matchups, update details, and enter final scores.",
  },
  "news-admin": {
    label: "Newsroom",
    eyebrow: "Operations",
    title: "Newsroom",
    copy: "Publish team updates with text, one image, and an optional link.",
  },
};

const PT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "America/Los_Angeles",
});

const PT_SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/Los_Angeles",
});

const PT_TIME_LABEL_FORMATTER = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Los_Angeles",
});

const PACIFIC_TZ = "America/Los_Angeles";
const NEWS_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  month: "numeric",
  day: "numeric",
  year: "2-digit",
  hour: "numeric",
  minute: "2-digit",
  timeZone: PACIFIC_TZ,
});

const PACIFIC_CLOCK_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: PACIFIC_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const googleProvider = new GoogleAuthProvider();

googleProvider.setCustomParameters({ prompt: "select_account" });

const navToggle = document.getElementById("nav-toggle");
const navOverlay = document.getElementById("nav-overlay");
const sideNav = document.getElementById("side-nav");
const navButtons = Array.from(document.querySelectorAll("[data-view-target]"));
const adminNavSectionTitle = document.getElementById("nav-admin-section-title");
const pairingsAdminNav = document.getElementById("nav-pairings-admin");
const playerAdminNav = document.getElementById("nav-player-admin");
const scheduleAdminNav = document.getElementById("nav-schedule-admin");
const newsAdminNav = document.getElementById("nav-news-admin");
const viewSections = Array.from(document.querySelectorAll(".view-section"));
const topbarLabel = document.getElementById("topbar-label");
const heroShell = document.getElementById("hero-shell");
const heroStats = document.getElementById("hero-stats");
const matchesStatCard = document.getElementById("matches-stat-card");
const rosterStatCard = document.getElementById("roster-stat-card");

const newsFeed = document.getElementById("news-feed");
const membersGrid = document.getElementById("members-grid");
const scheduleGrid = document.getElementById("schedule-grid");
const playerSelect = document.getElementById("player-select");
const selectedPlayerName = document.getElementById("selected-player-name");
const statusBanner = document.getElementById("status-banner");
const availabilitySelectorRow = document.getElementById("availability-selector-row");
const availabilityHelper = document.getElementById("availability-helper");
const availabilityTabButtons = Array.from(document.querySelectorAll("[data-availability-tab]"));
const gamesGrid = document.getElementById("games-grid");
const gamesPager = document.getElementById("games-pager");
const gamesPrev = document.getElementById("games-prev");
const gamesNext = document.getElementById("games-next");
const gamesPagerLabel = document.getElementById("games-pager-label");
const rosterGrid = document.getElementById("roster-grid");
const rosterPager = document.getElementById("roster-pager");
const rosterPrev = document.getElementById("roster-prev");
const rosterNext = document.getElementById("roster-next");
const rosterPagerLabel = document.getElementById("roster-pager-label");
const rosterViewEyebrow = document.getElementById("roster-view-eyebrow");
const rosterViewCopy = document.getElementById("roster-view-copy");
const pairingsGrid = document.getElementById("pairings-grid");
const adminRosterTabButtons = Array.from(document.querySelectorAll("[data-admin-roster-tab]"));
const rosterAdminGrid = document.getElementById("roster-admin-grid");
const pairingsAdminGrid = document.getElementById("pairings-admin-grid");
const pairingsAdminPager = document.getElementById("pairings-admin-pager");
const pairingsAdminPrev = document.getElementById("pairings-admin-prev");
const pairingsAdminNext = document.getElementById("pairings-admin-next");
const pairingsAdminPagerLabel = document.getElementById("pairings-admin-pager-label");
const teamStandingGrid = document.getElementById("team-standing-grid");
const teamStandingNote = document.getElementById("team-standing-note");
const gamesCount = document.getElementById("games-count");
const playersCount = document.getElementById("players-count");

const adminStatus = document.getElementById("admin-status");
const adminGrid = document.getElementById("admin-grid");
const adminGamesPager = document.getElementById("admin-games-pager");
const adminGamesPrev = document.getElementById("admin-games-prev");
const adminGamesNext = document.getElementById("admin-games-next");
const adminGamesPagerLabel = document.getElementById("admin-games-pager-label");
const newsAdminGrid = document.getElementById("news-admin-grid");
const playersAdminGrid = document.getElementById("players-admin-grid");
const playersAdminPager = document.getElementById("players-admin-pager");
const playersAdminPrev = document.getElementById("players-admin-prev");
const playersAdminNext = document.getElementById("players-admin-next");
const playersAdminPagerLabel = document.getElementById("players-admin-pager-label");
const adminUserEmail = document.getElementById("admin-user-email");
const adminHelperText = document.getElementById("admin-helper-text");
const adminSignIn = document.getElementById("admin-sign-in");
const adminSignOut = document.getElementById("admin-sign-out");

const scheduleCardTemplate = document.getElementById("schedule-card-template");
const availabilityCardTemplate = document.getElementById("availability-card-template");
const rosterCardTemplate = document.getElementById("roster-card-template");
const adminCardTemplate = document.getElementById("admin-card-template");
const playerAdminTemplate = document.getElementById("player-admin-template");
const playerTemplate = document.getElementById("player-row-template");

let activeView = "news";
let navOpen = false;
let selectedPlayerId = "";
let availabilityTab = "per-game";
let players = [];
let games = [];
let newsPosts = [];
let newsLoaded = false;
let newsLoadError = "";
let savingState = false;
let gameBoardIndex = 0;
let lastGamesSignature = "";
let rosterBoardIndex = 0;
let lastRosterSignature = "";
let pairingsAdminIndex = 0;
let lastPairingsAdminSignature = "";
let gameAdminIndex = 0;
let lastGamesAdminSignature = "";
let playerAdminIndex = 0;
let lastPlayersSignature = "";
let adminUser = null;
let isApprovedAdmin = false;
let adminRosterTab = "roster";
let selectedPairingPlayerId = "";
let lastAuthFlowEvent = "No Firebase auth event yet";
let lastAuthStateEvent = "Firebase auth state has not reported yet";

function normalizeEmail(email) {
  return (email ?? "").trim().toLowerCase();
}

function userIsApprovedAdmin(user) {
  return APPROVED_ADMIN_EMAILS.has(normalizeEmail(user?.email));
}

function buildFullName(firstName, lastName) {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildPlayerId(firstName, lastName) {
  const base = slugify(buildFullName(firstName, lastName));
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${base || "player"}-${suffix}`;
}

function buildPlayerInitials(player) {
  const initials = `${player.firstName?.[0] ?? ""}${player.lastName?.[0] ?? ""}`.trim();
  if (initials) {
    return initials.toUpperCase();
  }

  return (player.fullName?.slice(0, 2) ?? "TM").toUpperCase();
}

function getPlayerById(playerId) {
  return players.find((player) => player.id === playerId) ?? null;
}

function getPlayerNameById(playerId) {
  return getPlayerById(playerId)?.fullName ?? "Former player";
}

function getActivePlayers() {
  return players.filter((player) => player.active);
}

function getLegacyAttendanceKeys(player) {
  return [player.id, player.fullName, ...(player.legacyNames ?? [])];
}

function getAttendanceStatus(game, player) {
  for (const key of getLegacyAttendanceKeys(player)) {
    const status = game.attendance?.[key];
    if (status) {
      return status;
    }
  }

  return "unknown";
}

function setStatus(message, tone = "") {
  if (!statusBanner) {
    return;
  }

  statusBanner.textContent = message;
  statusBanner.className = "status-banner";
  if (tone === "warning" || tone === "error" || tone === "success") {
    statusBanner.classList.add(`is-${tone}`);
  } else {
    statusBanner.classList.add("is-hidden");
  }
}

function setAdminStatus(message, tone = "") {
  if (!adminStatus) {
    return;
  }

  adminStatus.textContent = message;
  adminStatus.className = "admin-status";
  if (tone === "warning" || tone === "error" || tone === "success") {
    adminStatus.classList.add(`is-${tone}`);
  } else {
    adminStatus.classList.add("is-hidden");
  }
}

function refreshAdminSessionUi() {
  if (adminUserEmail) {
    adminUserEmail.textContent = adminUser?.email ?? "Not signed in";
  }
  if (adminSignIn) {
    adminSignIn.hidden = Boolean(adminUser);
  }
  if (adminSignOut) {
    adminSignOut.hidden = !adminUser;
  }

  if (!adminHelperText) {
    return;
  }

  if (isApprovedAdmin) {
    adminHelperText.textContent = "";
  } else if (adminUser) {
    adminHelperText.textContent = "This account is signed in, but it is not on the approved admin list.";
  } else {
    adminHelperText.textContent =
      "Sign in with an approved admin account to manage players, rosters, scores, and news.";
  }
}

function setNavOpen(nextOpen) {
  navOpen = nextOpen;
  document.body.classList.toggle("nav-open", navOpen);
  if (sideNav) {
    sideNav.classList.toggle("is-open", navOpen);
  }
  if (navOverlay) {
    navOverlay.hidden = !navOpen;
  }
  if (navToggle) {
    navToggle.setAttribute("aria-expanded", String(navOpen));
  }
}

function setActiveView(viewId) {
  if (!VIEW_META[viewId]) {
    return;
  }
  if (ADMIN_VIEW_IDS.has(viewId) && !isApprovedAdmin) {
    return;
  }
  activeView = viewId;
  setNavOpen(false);
  renderApp();
}

function syncAdminNavAccess() {
  const adminViewsVisible = isApprovedAdmin;

  if (adminNavSectionTitle) {
    adminNavSectionTitle.hidden = !adminViewsVisible;
  }

  if (pairingsAdminNav) {
    pairingsAdminNav.hidden = !adminViewsVisible;
  }

  if (playerAdminNav) {
    playerAdminNav.hidden = !adminViewsVisible;
  }

  if (scheduleAdminNav) {
    scheduleAdminNav.hidden = !adminViewsVisible;
  }

  if (newsAdminNav) {
    newsAdminNav.hidden = !adminViewsVisible;
  }

  if (!adminViewsVisible && ADMIN_VIEW_IDS.has(activeView)) {
    activeView = "schedule";
  }
}

function updateViewUi() {
  syncAdminNavAccess();
  const meta = VIEW_META[activeView];
  if (topbarLabel) {
    topbarLabel.textContent = meta.label;
  }

  if (heroStats) {
    const showMatchesStat = activeView === "schedule" || activeView === "schedule-admin";
    const showRosterStat = activeView === "player-admin" || activeView === "members";
    const showStats = showMatchesStat || showRosterStat;

    if (heroShell) {
      heroShell.hidden = !showStats;
    }

    heroStats.hidden = !showStats;

    if (matchesStatCard) {
      matchesStatCard.hidden = !showMatchesStat;
    }

    if (rosterStatCard) {
      rosterStatCard.hidden = !showRosterStat;
    }

    heroStats.classList.toggle("hero__stats--single", showStats && showMatchesStat !== showRosterStat);
  }

  navButtons.forEach((button) => {
    const isActive = button.dataset.viewTarget === activeView;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-current", isActive ? "page" : "false");
  });

  viewSections.forEach((section) => {
    section.hidden = section.id !== `view-${activeView}`;
  });
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter((entry) => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeNullableNumber(value) {
  if (value === "" || value === null || typeof value === "undefined") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSkillLevel(value) {
  const normalized = (value ?? "").trim().toLowerCase();
  return SKILL_LEVEL_LABELS.has(normalized) ? normalized : "";
}

function getSkillLevelLabel(value) {
  return SKILL_LEVEL_LABELS.get(normalizeSkillLevel(value)) ?? "Not set";
}

function formatDupr(value) {
  if (value === null || typeof value === "undefined") {
    return "Not set";
  }

  return value.toFixed(3).replace(/\.?0+$/, "");
}

function formatTeamDupr(value) {
  if (value === null || typeof value === "undefined") {
    return "TBD";
  }

  return value.toFixed(3).replace(/\.?0+$/, "");
}

function createEmptyPairings() {
  return Array.from({ length: 4 }, () => []);
}

function normalizePairings(value) {
  if (Array.isArray(value)) {
    return Array.from({ length: 4 }, (_, index) => normalizeStringArray(value[index]).slice(0, 2));
  }

  if (!value || typeof value !== "object") {
    return createEmptyPairings();
  }

  return PAIRING_KEYS.map((key) => normalizeStringArray(value[key]).slice(0, 2));
}

function sanitizePairings(pairings, rosterPlayerIds) {
  const allowedIds = new Set(normalizeStringArray(rosterPlayerIds));
  const seenIds = new Set();

  return normalizePairings(pairings).map((pair) => {
    const nextPair = [];
    pair.forEach((playerId) => {
      if (!allowedIds.has(playerId) || seenIds.has(playerId) || nextPair.length >= 2) {
        return;
      }

      seenIds.add(playerId);
      nextPair.push(playerId);
    });
    return nextPair;
  });
}

function serializePairingsForFirestore(pairings) {
  return normalizePairings(pairings).reduce((accumulator, pair, index) => {
    accumulator[PAIRING_KEYS[index]] = pair;
    return accumulator;
  }, {});
}

function countPairedPlayers(pairings) {
  return normalizePairings(pairings).reduce((total, pair) => total + pair.length, 0);
}

function movePlayerToPair(pairings, playerId, targetPairIndex) {
  const nextPairings = normalizePairings(pairings).map((pair) =>
    pair.filter((entryPlayerId) => entryPlayerId !== playerId),
  );

  if (typeof targetPairIndex !== "number" || targetPairIndex < 0 || targetPairIndex >= nextPairings.length) {
    return nextPairings;
  }

  if (!nextPairings[targetPairIndex].includes(playerId) && nextPairings[targetPairIndex].length < 2) {
    nextPairings[targetPairIndex].push(playerId);
  }

  return nextPairings;
}

function removePlayerFromPairings(pairings, playerId) {
  return normalizePairings(pairings).map((pair) =>
    pair.filter((entryPlayerId) => entryPlayerId !== playerId),
  );
}

function buildPlayerPersistencePayload(updates) {
  const firstName = updates.firstName.trim();
  const lastName = updates.lastName.trim();
  const fullName = buildFullName(firstName, lastName);
  const duprRaw = String(updates.dupr ?? "").trim();
  const dupr = normalizeNullableNumber(duprRaw);
  const skillLevel = normalizeSkillLevel(updates.skillLevel);

  if (!firstName || !lastName) {
    return { error: "First name and last name are required." };
  }

  if (duprRaw && dupr === null) {
    return { error: "Enter a valid DUPR rating or leave it blank." };
  }

  if (dupr !== null && (dupr < 0 || dupr > 8)) {
    return { error: "DUPR must be between 0 and 8." };
  }

  return {
    firstName,
    lastName,
    fullName,
    dupr,
    skillLevel,
  };
}

function normalizeMatchStatus(value) {
  return value === "completed" ? "completed" : "scheduled";
}

function normalizeUrl(value) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return "";
  }

  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeFirestoreTimestampMs(value) {
  if (!value) {
    return 0;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (value instanceof Date) {
    return value.getTime();
  }

  if (typeof value.toDate === "function") {
    return value.toDate().getTime();
  }

  return 0;
}

function formatNewsTimestamp(timestampMs) {
  if (!timestampMs) {
    return "Just now";
  }

  return NEWS_DATE_FORMATTER.format(new Date(timestampMs)).replace(/\//g, ".");
}

function getNewsPostMeta(post) {
  if (post.updatedAtMs && Math.abs(post.updatedAtMs - post.createdAtMs) > 60_000) {
    return `Updated ${formatNewsTimestamp(post.updatedAtMs)}`;
  }

  return `Posted ${formatNewsTimestamp(post.createdAtMs || post.updatedAtMs)}`;
}

function getNewsPostLinkLabel(linkUrl) {
  if (!linkUrl) {
    return "";
  }

  try {
    const parsed = new URL(linkUrl);
    return parsed.hostname.replace(/^www\./, "");
  } catch {
    return "Open link";
  }
}

function sanitizeDownloadFileName(value) {
  const normalized = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "team-update";
}

function inferImageExtensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-z0-9]{3,4})$/i);
    return match ? `.${match[1].toLowerCase()}` : ".jpg";
  } catch {
    return ".jpg";
  }
}

function createNewsActionIcon(iconName) {
  const svgNs = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNs, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("news-card__icon");

  const path = document.createElementNS(svgNs, "path");
  path.setAttribute("fill", "currentColor");

  if (iconName === "download") {
    path.setAttribute(
      "d",
      "M12 3a1 1 0 0 1 1 1v8.59l2.3-2.29a1 1 0 1 1 1.4 1.41l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 0 1 1.4-1.41L11 12.59V4a1 1 0 0 1 1-1Zm-7 14a1 1 0 0 1 1 1v1h12v-1a1 1 0 1 1 2 0v2a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1Z",
    );
  } else {
    path.setAttribute(
      "d",
      "M10.59 13.41a1 1 0 0 1 0-1.41l3.3-3.3a3 3 0 1 1 4.24 4.24l-2.12 2.12a3 3 0 0 1-4.25 0 1 1 0 0 1 1.42-1.41 1 1 0 0 0 1.41 0l2.13-2.12a1 1 0 1 0-1.42-1.42L12 13.41a1 1 0 0 1-1.41 0Zm2.82-2.82a1 1 0 0 1 0 1.41l-3.3 3.3a3 3 0 1 1-4.24-4.24l2.12-2.12a3 3 0 0 1 4.25 0 1 1 0 1 1-1.42 1.41 1 1 0 0 0-1.41 0l-2.13 2.12a1 1 0 1 0 1.42 1.42l3.3-3.3a1 1 0 0 1 1.41 0Z",
    );
  }

  svg.append(path);
  return svg;
}

async function downloadNewsImage(post) {
  if (!post.imageUrl) {
    return;
  }

  try {
    const response = await fetch(post.imageUrl);
    if (!response.ok) {
      throw new Error(`Image download failed with ${response.status}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = `${sanitizeDownloadFileName(post.title)}${inferImageExtensionFromUrl(post.imageUrl)}`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (error) {
    console.error(error);
    window.open(post.imageUrl, "_blank", "noopener,noreferrer");
  }
}

function deriveMatchResult(matchStatus, teamScore, opponentScore) {
  if (matchStatus !== "completed") {
    return "pending";
  }
  if (teamScore === null || opponentScore === null) {
    return "pending";
  }
  if (teamScore > opponentScore) {
    return "win";
  }
  if (teamScore < opponentScore) {
    return "loss";
  }
  return "tie";
}

function hasFinalScore(game) {
  return game.teamScore !== null && game.opponentScore !== null;
}

function createDefaultAttendance(playerList = getActivePlayers()) {
  return playerList.reduce((accumulator, player) => {
    accumulator[player.id] = "unknown";
    return accumulator;
  }, {});
}

function normalizeTimeHHMM(value) {
  if (!value || typeof value !== "string") {
    return "10:00";
  }

  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return "10:00";
  }

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return "10:00";
  }

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function readPacificClock(utcMs) {
  const parts = PACIFIC_CLOCK_FORMATTER.formatToParts(new Date(utcMs));
  const pick = (type) => Number(parts.find((part) => part.type === type)?.value ?? NaN);

  return {
    y: pick("year"),
    mo: pick("month"),
    d: pick("day"),
    h: pick("hour"),
    m: pick("minute"),
  };
}

function pacificDateKeyFromUtcMs(utcMs) {
  const z = readPacificClock(utcMs);
  if (Number.isNaN(z.y) || Number.isNaN(z.mo) || Number.isNaN(z.d)) {
    return "";
  }

  return `${String(z.y).padStart(4, "0")}-${String(z.mo).padStart(2, "0")}-${String(z.d).padStart(2, "0")}`;
}

function pacificDateKeyFromIso(isoDateStr) {
  const ms = Date.parse(isoDateStr);
  if (Number.isNaN(ms)) {
    return "";
  }
  return pacificDateKeyFromUtcMs(ms);
}

function pacificWallTimeToUtcMs(dateValue, timeHHMM) {
  const [y, mo, d] = dateValue.split("-").map(Number);
  const [h, mi] = timeHHMM.split(":").map(Number);
  const dayStart = Date.UTC(y, mo - 1, d, 0, 0, 0);

  for (let ms = dayStart - 12 * 3600 * 1000; ms < dayStart + 36 * 3600 * 1000; ms += 60 * 1000) {
    const z = readPacificClock(ms);
    if (z.y === y && z.mo === mo && z.d === d && z.h === h && z.m === mi) {
      return ms;
    }
  }

  return dayStart;
}

function pacificTimeInputValueFromIso(isoDateStr) {
  const ms = Date.parse(isoDateStr);
  if (Number.isNaN(ms)) {
    return "10:00";
  }

  const z = readPacificClock(ms);
  if (Number.isNaN(z.h) || Number.isNaN(z.m)) {
    return "10:00";
  }

  return `${String(z.h).padStart(2, "0")}:${String(z.m).padStart(2, "0")}`;
}

function buildScheduleFields(dateValue, timeHHMM = "10:00") {
  const time = normalizeTimeHHMM(timeHHMM);
  const utcMs = pacificWallTimeToUtcMs(dateValue, time);
  const instant = new Date(utcMs);

  return {
    isoDate: instant.toISOString(),
    dateLabel: PT_DATE_FORMATTER.format(instant),
    timeLabel: `${PT_TIME_LABEL_FORMATTER.format(instant)} PT`,
  };
}

function buildBlankGameDraft() {
  return {
    isoDate: "",
    dateLabel: "Date TBD",
    timeLabel: "Time TBD",
    dateTbd: true,
    location: "Blackhawk Country Club",
    opponent: "New matchup",
    matchStatus: "scheduled",
    teamScore: null,
    opponentScore: null,
  };
}

function createGameId(dateValue, opponent, location) {
  const safeDateValue = (dateValue || "tbd").trim() || "tbd";
  const slugSource = `${opponent}-${location}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${safeDateValue}-${slugSource || "game"}-${suffix}`;
}

function createNewsPostId() {
  const dateStamp = new Date().toISOString().slice(0, 10);
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${dateStamp}-news-${suffix}`;
}

function getFileNameParts(fileName) {
  const trimmed = (fileName ?? "").trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return {
      baseName: trimmed || "image",
      extension: "",
    };
  }

  return {
    baseName: trimmed.slice(0, lastDot),
    extension: trimmed.slice(lastDot).toLowerCase().replace(/[^.a-z0-9]/g, ""),
  };
}

function buildNewsImagePath(postId, file) {
  const { baseName, extension } = getFileNameParts(file?.name);
  const safeBaseName = slugify(baseName).slice(0, 32) || "image";
  const safeExtension = extension || ".jpg";
  return `news/${postId}/${Date.now()}-${safeBaseName}${safeExtension}`;
}

function normalizePlayer(docSnapshot) {
  const data = docSnapshot.data();
  const firstName = (data.firstName ?? "").trim();
  const lastName = (data.lastName ?? "").trim();

  return {
    id: docSnapshot.id,
    firstName,
    lastName,
    fullName: data.fullName ?? buildFullName(firstName, lastName),
    active: data.active !== false,
    dupr: normalizeNullableNumber(data.dupr),
    skillLevel: normalizeSkillLevel(data.skillLevel),
    legacyNames: normalizeStringArray(data.legacyNames),
  };
}

function normalizeGame(docSnapshot) {
  const data = docSnapshot.data();
  const rosterPlayerIds = normalizeStringArray(data.rosterPlayerIds);
  const pairings = sanitizePairings(data.pairings, rosterPlayerIds);
  const teamScore = normalizeNullableNumber(data.teamScore);
  const opponentScore = normalizeNullableNumber(data.opponentScore);
  const matchStatus = normalizeMatchStatus(data.matchStatus);
  const dateTbd = data.dateTbd === true || (!data.isoDate && data.dateLabel === "Date TBD");

  return {
    id: docSnapshot.id,
    dateLabel: data.dateLabel ?? (dateTbd ? "Date TBD" : "Game Date"),
    isoDate: data.isoDate ?? "",
    timeLabel: data.timeLabel ?? (dateTbd ? "Time TBD" : "10:00 AM PT"),
    dateTbd,
    location: data.location ?? "Location TBD",
    opponent: data.opponent ?? "Team Session",
    attendance: data.attendance ?? {},
    rosterPlayerIds,
    pairings,
    matchStatus,
    teamScore,
    opponentScore,
    result: data.result ?? deriveMatchResult(matchStatus, teamScore, opponentScore),
  };
}

function normalizeNewsPost(docSnapshot) {
  const data = docSnapshot.data();
  const title = (data.title ?? "").trim();
  const body = (data.body ?? "").trim();
  const linkUrl = normalizeUrl(data.linkUrl);
  const createdAtMs = normalizeFirestoreTimestampMs(data.createdAt);
  const updatedAtMs = normalizeFirestoreTimestampMs(data.updatedAt);

  return {
    id: docSnapshot.id,
    title: title || "Team update",
    body,
    linkUrl: linkUrl || "",
    imageUrl: typeof data.imageUrl === "string" ? data.imageUrl : "",
    imagePath: typeof data.imagePath === "string" ? data.imagePath : "",
    createdAtMs,
    updatedAtMs,
    createdByAdmin: normalizeEmail(data.createdByAdmin),
    updatedByAdmin: normalizeEmail(data.updatedByAdmin),
    sortMs: updatedAtMs || createdAtMs || 0,
  };
}

function buildSummary(game, playerList = getActivePlayers()) {
  const counts = { in: 0, out: 0, unknown: 0 };

  playerList.forEach((player) => {
    const status = getAttendanceStatus(game, player);
    if (status === "in") {
      counts.in += 1;
    } else if (status === "out") {
      counts.out += 1;
    } else {
      counts.unknown += 1;
    }
  });

  return counts;
}

function getRosterPlayerIds(game) {
  return normalizeStringArray(game.rosterPlayerIds);
}

function getPairings(game) {
  return sanitizePairings(game.pairings, getRosterPlayerIds(game));
}

function getRosterPlayers(game) {
  return getRosterPlayerIds(game).map((playerId) => ({
    id: playerId,
    fullName: getPlayerNameById(playerId),
  }));
}

function buildRosterStatusChipMeta(status) {
  if (status === "in") {
    return {
      chipClassName: "roster-chip--status-in",
      chipPrefix: "✓ ",
    };
  }

  if (status === "out") {
    return {
      chipClassName: "roster-chip--status-out",
      chipPrefix: "- ",
    };
  }

  return {
    chipClassName: "roster-chip--status-unknown",
    chipPrefix: "? ",
  };
}

function getNextUpcomingFromSortedList(sortedList) {
  if (!sortedList.length) {
    return null;
  }

  const todayKey = pacificDateKeyFromUtcMs(Date.now());
  for (let i = 0; i < sortedList.length; i += 1) {
    const gameDateKey = pacificDateKeyFromIso(sortedList[i].isoDate);
    if (gameDateKey && gameDateKey >= todayKey) {
      return sortedList[i];
    }
  }

  const firstTbdGame = sortedList.find((game) => game.dateTbd);
  if (firstTbdGame) {
    return firstTbdGame;
  }

  return sortedList[sortedList.length - 1];
}

function findNextUpcomingGameIndex() {
  if (!games.length) {
    return 0;
  }

  const todayKey = pacificDateKeyFromUtcMs(Date.now());
  const index = games.findIndex((game) => {
    const gameDateKey = pacificDateKeyFromIso(game.isoDate);
    return gameDateKey && gameDateKey >= todayKey;
  });

  if (index !== -1) {
    return index;
  }

  const firstTbdIndex = games.findIndex((game) => game.dateTbd);
  return firstTbdIndex === -1 ? games.length - 1 : firstTbdIndex;
}

function syncGameBoardIndex() {
  const signature = games.map((game) => game.id).join("\n");
  if (signature !== lastGamesSignature) {
    lastGamesSignature = signature;
    gameBoardIndex = findNextUpcomingGameIndex();
    return;
  }

  if (!games.length) {
    gameBoardIndex = 0;
    return;
  }

  if (gameBoardIndex < 0 || gameBoardIndex >= games.length) {
    gameBoardIndex = findNextUpcomingGameIndex();
  }
}

function syncRosterBoardIndex() {
  const signature = games.map((game) => game.id).join("\n");
  if (signature !== lastRosterSignature) {
    lastRosterSignature = signature;
    rosterBoardIndex = findNextUpcomingGameIndex();
    return;
  }

  if (!games.length) {
    rosterBoardIndex = 0;
    return;
  }

  if (rosterBoardIndex < 0 || rosterBoardIndex >= games.length) {
    rosterBoardIndex = findNextUpcomingGameIndex();
  }
}

function syncPairingsAdminIndex() {
  const signature = games.map((game) => game.id).join("\n");
  if (signature !== lastPairingsAdminSignature) {
    lastPairingsAdminSignature = signature;
    pairingsAdminIndex = findNextUpcomingGameIndex();
    return;
  }

  if (!games.length) {
    pairingsAdminIndex = 0;
    return;
  }

  if (pairingsAdminIndex < 0 || pairingsAdminIndex >= games.length) {
    pairingsAdminIndex = findNextUpcomingGameIndex();
  }
}

function syncGameAdminIndex() {
  const signature = games.map((game) => game.id).join("\n");
  if (signature !== lastGamesAdminSignature) {
    lastGamesAdminSignature = signature;
    gameAdminIndex = 0;
    return;
  }

  if (!games.length) {
    gameAdminIndex = 0;
    return;
  }

  if (gameAdminIndex < 0 || gameAdminIndex >= games.length) {
    gameAdminIndex = 0;
  }
}

function syncPlayerAdminIndex() {
  const signature = players.map((player) => player.id).join("\n");
  if (signature !== lastPlayersSignature) {
    lastPlayersSignature = signature;
    playerAdminIndex = 0;
    return;
  }

  if (!players.length) {
    playerAdminIndex = 0;
    return;
  }

  if (playerAdminIndex < 0 || playerAdminIndex >= players.length) {
    playerAdminIndex = 0;
  }
}

function getStatusMeta(status) {
  if (status === "in") {
    return { label: "Available", className: "status-badge status-badge--in" };
  }
  if (status === "out") {
    return { label: "Unavailable", className: "status-badge status-badge--out" };
  }
  return { label: "No response", className: "status-badge" };
}

function createRosterGroup(title, players, emptyMessage, options = {}) {
  const group = document.createElement("section");
  group.className = "roster-group";

  const titleNode = document.createElement("h4");
  titleNode.className = "roster-group__title";
  titleNode.textContent = title;
  group.append(titleNode);

  const list = document.createElement("div");
  list.className = "roster-group__list";

  if (players.length) {
    players.forEach((player) => {
      const chip = document.createElement(options.interactive ? "button" : "span");
      chip.className = `roster-chip ${options.chipClassName ?? ""}`.trim();
      if (player.chipClassName) {
        chip.classList.add(player.chipClassName);
      }
      const content = document.createElement("span");
      content.className = "roster-chip__content";

      const label = document.createElement("span");
      label.className = "roster-chip__label";
      label.textContent = `${player.chipPrefix ?? ""}${player.fullName}`;
      content.append(label);

      if (player.metaText) {
        const meta = document.createElement("span");
        meta.className = "roster-chip__meta";
        meta.textContent = player.metaText;
        content.append(meta);
      }

      chip.append(content);
      if (options.interactive) {
        chip.type = "button";
        chip.classList.add("roster-chip--button");
        chip.disabled = Boolean(options.disabled);
        chip.addEventListener("click", () => {
          options.onChipClick?.(player);
        });
      }
      list.append(chip);
    });
  } else {
    const emptyChip = document.createElement("span");
    emptyChip.className = "roster-chip roster-chip--empty";
    emptyChip.textContent = emptyMessage;
    list.append(emptyChip);
  }

  group.append(list);
  return group;
}

function sortPlayersByName(playerList) {
  return [...playerList].sort((left, right) => left.fullName.localeCompare(right.fullName));
}

function buildRosterChipMetaText(player) {
  const duprLabel =
    typeof player.dupr === "number" ? `DUPR ${formatDupr(player.dupr)}` : "DUPR TBD";
  const skillLabel = normalizeSkillLevel(player.skillLevel)
    ? getSkillLevelLabel(player.skillLevel)
    : "Skill TBD";
  return `${duprLabel} • ${skillLabel}`;
}

function getGameBadgeMeta(game) {
  if (game.dateTbd) {
    return { label: "TBD", className: "game-card__badge game-card__badge--muted" };
  }

  const todayKey = pacificDateKeyFromUtcMs(Date.now());
  const gameDateKey = pacificDateKeyFromIso(game.isoDate);

  if (game.matchStatus === "completed") {
    if (game.result === "win") {
      return { label: "Win", className: "game-card__badge game-card__badge--win" };
    }
    if (game.result === "loss") {
      return { label: "Loss", className: "game-card__badge game-card__badge--loss" };
    }
    if (game.result === "tie") {
      return { label: "Tie", className: "game-card__badge game-card__badge--tie" };
    }
    return { label: "Completed", className: "game-card__badge game-card__badge--muted" };
  }

  if (gameDateKey && gameDateKey === todayKey) {
    return { label: "Today", className: "game-card__badge game-card__badge--today" };
  }

  if (gameDateKey && gameDateKey < todayKey) {
    return { label: "Past", className: "game-card__badge game-card__badge--muted" };
  }

  return { label: "Upcoming", className: "game-card__badge" };
}

function compareGamesForDisplay(left, right) {
  if (left.dateTbd !== right.dateTbd) {
    return left.dateTbd ? 1 : -1;
  }

  if (left.dateTbd && right.dateTbd) {
    const opponentCompare = left.opponent.localeCompare(right.opponent);
    if (opponentCompare !== 0) {
      return opponentCompare;
    }
    return left.location.localeCompare(right.location);
  }

  return left.isoDate.localeCompare(right.isoDate);
}

function renderPlayerSelect() {
  const activePlayers = getActivePlayers();
  if (playerSelect) {
    playerSelect.innerHTML = "";
  }

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = activePlayers.length ? "Select your name" : "No active players yet";
  if (playerSelect) {
    playerSelect.append(defaultOption);
  }

  activePlayers.forEach((player) => {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.fullName;
    option.selected = player.id === selectedPlayerId;
    if (playerSelect) {
      playerSelect.append(option);
    }
  });

  if (selectedPlayerId && !getPlayerById(selectedPlayerId)?.active) {
    selectedPlayerId = "";
  }

  const selectedPlayer = getPlayerById(selectedPlayerId);
  if (selectedPlayerName) {
    selectedPlayerName.textContent = selectedPlayer?.fullName ?? "None selected";
  }
  if (playersCount) {
    playersCount.textContent = String(activePlayers.length);
  }
}

function buildScheduleCardElement(game) {
  const fragment = scheduleCardTemplate.content.cloneNode(true);
  const summary = buildSummary(game);
  const rosterPlayerIds = getRosterPlayerIds(game);
  const summaryNode = fragment.querySelector('[data-role="schedule-summary"]');

  fragment.querySelector('[data-role="schedule-date"]').textContent = game.dateLabel;
  fragment.querySelector('[data-role="schedule-title"]').textContent = game.opponent;
  fragment.querySelector('[data-role="schedule-meta"]').textContent = `${game.timeLabel} • ${game.location}`;
  const rosterStat = document.createElement("span");
  rosterStat.textContent = `On Roster: ${rosterPlayerIds.length}`;
  const availableStat = document.createElement("span");
  availableStat.textContent = `Available: ${summary.in}`;
  summaryNode.replaceChildren(rosterStat, availableStat);

  return fragment;
}

function updateAvailabilityTabUi() {
  const showPerGame = availabilityTab === "per-game";

  availabilityTabButtons.forEach((button) => {
    const isActive = button.dataset.availabilityTab === availabilityTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  if (availabilitySelectorRow) {
    availabilitySelectorRow.hidden = !showPerGame;
  }

  if (availabilityHelper) {
    availabilityHelper.textContent = showPerGame
      ? "Select your name to view your availability per game. Mark your status by cycling through each matchup."
      : "Summary is read-only. Scroll sideways on smaller screens to compare who is available for each matchup.";
  }
}

function getAvailabilitySummaryColumnLabel(game) {
  if (game.dateTbd || !game.isoDate) {
    return "TBD";
  }

  return PT_SHORT_DATE_FORMATTER.format(new Date(game.isoDate));
}

function buildAvailabilitySummaryStatusMeta(status) {
  if (status === "in") {
    return {
      label: "In",
      title: "Available",
      className: "availability-summary-table__status availability-summary-table__status--in",
    };
  }
  if (status === "out") {
    return {
      label: "Out",
      title: "Unavailable",
      className: "availability-summary-table__status availability-summary-table__status--out",
    };
  }

  return {
    label: "--",
    title: "No response",
    className: "availability-summary-table__status availability-summary-table__status--unknown",
  };
}

function buildAvailabilitySummaryTable(activePlayers) {
  const wrapper = document.createElement("div");
  wrapper.className = "availability-summary";

  const scroll = document.createElement("div");
  scroll.className = "availability-summary__scroll";

  const table = document.createElement("table");
  table.className = "availability-summary-table";

  const thead = document.createElement("thead");
  const headerRow = document.createElement("tr");
  const playerHeader = document.createElement("th");
  playerHeader.scope = "col";
  playerHeader.textContent = "Player";
  headerRow.append(playerHeader);

  games.forEach((game) => {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = getAvailabilitySummaryColumnLabel(game);
    cell.title = `${game.dateLabel} • ${game.opponent}`;
    headerRow.append(cell);
  });

  thead.append(headerRow);
  table.append(thead);

  const tbody = document.createElement("tbody");
  sortPlayersByName(activePlayers).forEach((player) => {
    const row = document.createElement("tr");
    const playerCell = document.createElement("th");
    playerCell.scope = "row";
    playerCell.textContent = player.fullName;
    row.append(playerCell);

    games.forEach((game) => {
      const status = getAttendanceStatus(game, player);
      const statusMeta = buildAvailabilitySummaryStatusMeta(status);
      const cell = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = statusMeta.className;
      badge.textContent = statusMeta.label;
      badge.title = `${player.fullName}: ${statusMeta.title}`;
      cell.append(badge);
      row.append(cell);
    });

    tbody.append(row);
  });

  const totalsRow = document.createElement("tr");
  totalsRow.className = "availability-summary-table__totals";

  const totalsLabel = document.createElement("th");
  totalsLabel.scope = "row";
  totalsLabel.textContent = "Total Available";
  totalsRow.append(totalsLabel);

  games.forEach((game) => {
    const cell = document.createElement("td");
    cell.textContent = String(buildSummary(game, activePlayers).in);
    totalsRow.append(cell);
  });

  tbody.append(totalsRow);
  table.append(tbody);
  scroll.append(table);
  wrapper.append(scroll);

  return wrapper;
}

function buildAvailabilityCardElement(game, activePlayers) {
  const fragment = availabilityCardTemplate.content.cloneNode(true);
  const badge = getGameBadgeMeta(game);
  const summary = buildSummary(game, activePlayers);
  const badgeNode = fragment.querySelector('[data-role="availability-badge"]');
  const playerListNode = fragment.querySelector('[data-role="player-list"]');
  const availabilityLocked = game.dateTbd === true;

  fragment.querySelector(".game-card__date").textContent = game.dateLabel;
  fragment.querySelector(".game-card__title").textContent = game.opponent;
  fragment.querySelector(".game-card__meta").textContent = `${game.timeLabel} • ${game.location}`;
  badgeNode.textContent = badge.label;
  badgeNode.className = badge.className;
  fragment.querySelector('[data-role="in-count"]').textContent = String(summary.in);
  fragment.querySelector('[data-role="out-count"]').textContent = String(summary.out);
  fragment.querySelector('[data-role="pending-count"]').textContent = String(summary.unknown);

  activePlayers.forEach((player) => {
    const rowFragment = playerTemplate.content.cloneNode(true);
    const row = rowFragment.querySelector(".player-row");
    const nameNode = rowFragment.querySelector(".player-row__name");
    const badgeNodeInner = rowFragment.querySelector(".player-row__badge");
    const actionsNode = rowFragment.querySelector('[data-role="player-actions"]');
    const status = getAttendanceStatus(game, player);
    const statusMeta = getStatusMeta(status);
    const isSelected = selectedPlayerId && selectedPlayerId === player.id;

    nameNode.textContent = player.fullName;
    badgeNodeInner.textContent = statusMeta.label;
    badgeNodeInner.className = statusMeta.className;

    if (isSelected) {
      row.classList.add("player-row--selected");
      badgeNodeInner.classList.add("status-badge--selected");
    }

    actionsNode.querySelectorAll("button").forEach((button) => {
      const buttonStatus = button.dataset.status;
      if (buttonStatus === status) {
        button.classList.add("action-btn--active");
      }
      button.disabled = savingState || availabilityLocked;
      if (availabilityLocked) {
        button.title = "Availability opens once the matchup date and time are set.";
      }
      button.addEventListener("click", async () => {
        if (!selectedPlayerId) {
          setStatus("Select your name first so you can update your availability.", "warning");
          return;
        }
        if (availabilityLocked) {
          setStatus("Availability is locked for this matchup until the date and time are set.", "warning");
          return;
        }
        await updateAttendance(game.id, selectedPlayerId, buttonStatus);
      });
    });

    if (!isSelected) {
      actionsNode.remove();
    }

    playerListNode.append(rowFragment);
  });

  return fragment;
}

function buildRosterCardElement(game) {
  const fragment = rosterCardTemplate.content.cloneNode(true);
  const badge = getGameBadgeMeta(game);
  const activePlayers = getActivePlayers();
  const summary = buildSummary(game, activePlayers);
  const rosterPlayerIds = getRosterPlayerIds(game);
  const toggleListNode = fragment.querySelector('[data-role="roster-toggle-list"]');
  const selectedNode = fragment.querySelector('[data-role="roster-selected"]');
  const helperNode = fragment.querySelector('[data-role="roster-helper"]');

  fragment.querySelector('[data-role="roster-date"]').textContent = game.dateLabel;
  fragment.querySelector('[data-role="roster-title"]').textContent = game.opponent;
  fragment.querySelector('[data-role="roster-meta"]').textContent = `${game.timeLabel} • ${game.location}`;
  fragment.querySelector('[data-role="roster-selected-count"]').textContent = String(rosterPlayerIds.length);
  fragment.querySelector('[data-role="roster-in-count"]').textContent = String(summary.in);
  fragment.querySelector('[data-role="roster-pending-count"]').textContent = String(summary.unknown);

  const badgeNode = fragment.querySelector('[data-role="roster-badge"]');
  badgeNode.textContent = badge.label;
  badgeNode.className = badge.className;

  helperNode.textContent = isApprovedAdmin
    ? "Tap a player to move them between Playing and Not playing this match."
    : "See who is playing in this matchup and who is not playing.";

  const playingPlayers = sortPlayersByName(
    rosterPlayerIds.map((playerId) => {
      const player = getPlayerById(playerId);
      const availabilityStatus = player ? getAttendanceStatus(game, player) : "unknown";
      return {
        id: playerId,
        fullName: player?.fullName ?? "Former player",
        dupr: player?.dupr ?? null,
        skillLevel: player?.skillLevel ?? "",
        metaText: isApprovedAdmin && player ? buildRosterChipMetaText(player) : "",
        availabilityStatus,
        ...buildRosterStatusChipMeta(availabilityStatus),
      };
    }),
  );

  const benchPlayers = sortPlayersByName(
    activePlayers
      .filter((player) => !rosterPlayerIds.includes(player.id))
      .map((player) => {
        const availabilityStatus = getAttendanceStatus(game, player);
        return {
          id: player.id,
          fullName: player.fullName,
          dupr: player.dupr,
          skillLevel: player.skillLevel,
          metaText: isApprovedAdmin ? buildRosterChipMetaText(player) : "",
          availabilityStatus,
          ...buildRosterStatusChipMeta(availabilityStatus),
        };
      }),
  );

  if (!activePlayers.length) {
    const emptyState = document.createElement("div");
    emptyState.className = "games-grid__empty";
    emptyState.textContent = "No active players are available to assign yet.";
    selectedNode.append(emptyState);
    toggleListNode.hidden = true;
    return fragment;
  }

  const playingGroup = createRosterGroup("Playing", playingPlayers, "Roster has not been set yet", {
    interactive: isApprovedAdmin,
    disabled: savingState,
    onChipClick: async (player) => {
      await updateGameRoster(
        game.id,
        rosterPlayerIds.filter((playerId) => playerId !== player.id),
      );
    },
  });

  const notPlayingGroup = createRosterGroup(
    "Not playing this match",
    benchPlayers,
    "Everyone is currently playing",
    {
      interactive: isApprovedAdmin,
      disabled: savingState,
      onChipClick: async (player) => {
        await updateGameRoster(game.id, [...rosterPlayerIds, player.id]);
      },
    },
  );

  selectedNode.append(playingGroup, notPlayingGroup);
  toggleListNode.hidden = true;

  return fragment;
}

function buildPairingPlayerCard(player, options = {}) {
  const card = document.createElement("article");
  card.className = "pairing-player-card";
  if (options.selected) {
    card.classList.add("is-selected");
  }
  if (options.compact) {
    card.classList.add("pairing-player-card--compact");
  }
  if (options.readonly) {
    card.classList.add("pairing-player-card--readonly");
  }

  const header = document.createElement("div");
  header.className = "pairing-player-card__header";

  const identity = document.createElement("div");
  identity.className = "pairing-player-card__identity";

  const avatar = document.createElement("div");
  avatar.className = "pairing-player-card__avatar";
  avatar.textContent = buildPlayerInitials(player);

  const copy = document.createElement("div");
  const name = document.createElement("strong");
  name.className = "pairing-player-card__name";
  name.textContent = player.fullName;
  const locationLabel = document.createElement("span");
  locationLabel.className = "pairing-player-card__location";
  locationLabel.textContent = options.locationLabel ?? "Roster pool";
  copy.append(name, locationLabel);
  identity.append(avatar, copy);
  header.append(identity);

  if (options.onRemove) {
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "action-btn pairing-player-card__remove";
    removeButton.textContent = "Remove";
    removeButton.disabled = Boolean(options.disabled);
    removeButton.addEventListener("click", (event) => {
      event.stopPropagation();
      options.onRemove();
    });
    header.append(removeButton);
  }

  const meta = document.createElement("div");
  meta.className = "pairing-player-card__meta";

  const duprChip = document.createElement("span");
  duprChip.className = "pairing-player-card__meta-chip";
  if (player.dupr === null || typeof player.dupr === "undefined") {
    duprChip.classList.add("pairing-player-card__meta-chip--muted");
    duprChip.textContent = "DUPR TBD";
  } else {
    duprChip.textContent = `DUPR ${formatDupr(player.dupr)}`;
  }
  meta.append(duprChip);

  if (options.showSkill !== false) {
    const skillChip = document.createElement("span");
    skillChip.className = "pairing-player-card__meta-chip";
    if (normalizeSkillLevel(player.skillLevel)) {
      skillChip.textContent = getSkillLevelLabel(player.skillLevel);
    } else {
      skillChip.classList.add("pairing-player-card__meta-chip--muted");
      skillChip.textContent = "Skill TBD";
    }
    meta.append(skillChip);
  }
  card.append(header, meta);

  if (options.onSelect) {
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-pressed", String(Boolean(options.selected)));
    card.addEventListener("click", () => {
      options.onSelect();
    });
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        options.onSelect();
      }
    });
  }

  if (options.draggable) {
    card.draggable = true;
    card.addEventListener("dragstart", (event) => {
      event.dataTransfer?.setData("text/plain", player.id);
      event.dataTransfer.effectAllowed = "move";
      card.classList.add("is-dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
    });
  }

  return card;
}

function buildPairingsCardElement(game, options = {}) {
  const card = document.createElement("article");
  card.className = "game-card pairings-card";

  const badge = getGameBadgeMeta(game);
  const rosterPlayerIds = getRosterPlayerIds(game);
  const rosterPlayers = sortPlayersByName(
    rosterPlayerIds.map((playerId) => {
      const player = getPlayerById(playerId);
      return (
        player ?? {
          id: playerId,
          firstName: "",
          lastName: "",
          fullName: "Former player",
          dupr: null,
          skillLevel: "",
          active: false,
        }
      );
    }),
  );
  const pairings = getPairings(game);
  const interactive = options.interactive === true && isApprovedAdmin;
  const pairedPlayerIds = new Set(pairings.flat());
  const unpairedPlayers = rosterPlayers.filter((player) => !pairedPlayerIds.has(player.id));
  const pairingsUnlocked = interactive && rosterPlayers.length === 8 && !savingState;
  const selectedPairingPlayer = rosterPlayers.find((player) => player.id === selectedPairingPlayerId) ?? null;

  const top = document.createElement("div");
  top.className = "game-card__top";
  const topCopy = document.createElement("div");
  const date = document.createElement("p");
  date.className = "game-card__date";
  date.textContent = game.dateLabel;
  const title = document.createElement("h3");
  title.className = "game-card__title";
  title.textContent = game.opponent;
  const meta = document.createElement("p");
  meta.className = "game-card__meta";
  meta.textContent = `${game.timeLabel} • ${game.location}`;
  topCopy.append(date, title, meta);

  const badgeNode = document.createElement("span");
  badgeNode.textContent = badge.label;
  badgeNode.className = badge.className;
  top.append(topCopy, badgeNode);

  card.append(top);

  if (!rosterPlayers.length) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "No roster has been selected for this matchup yet.";
    card.append(empty);
    return card;
  }

  if (interactive) {
    const helper = document.createElement("p");
    helper.className = "roster-card__helper";
    helper.textContent = pairingsUnlocked
      ? "Drag players into any pair, or tap a player card and then use Add selected player."
      : "Select exactly 8 players in Game Rosters to unlock matchup pairings.";
    card.append(helper);

    const layout = document.createElement("div");
    layout.className = "pairings-layout";

    const poolSection = document.createElement("section");
    poolSection.className = "pairings-section";
    const poolTitle = document.createElement("h4");
    poolTitle.className = "pairings-section__title";
    poolTitle.textContent = "Available to pair";
    poolSection.append(poolTitle);

    if (selectedPairingPlayer) {
      const selectionBanner = document.createElement("div");
      selectionBanner.className = "pairings-card__selection";
      selectionBanner.textContent = `Selected: ${selectedPairingPlayer.fullName}`;
      poolSection.append(selectionBanner);
    }

    const poolGrid = document.createElement("div");
    poolGrid.className = "pairings-pool";
    if (!unpairedPlayers.length) {
      const emptyPool = document.createElement("div");
      emptyPool.className = "pairings-pool__empty";
      emptyPool.textContent = "Everyone is currently assigned to a pair.";
      poolGrid.append(emptyPool);
    } else {
      unpairedPlayers.forEach((player) => {
        poolGrid.append(
          buildPairingPlayerCard(player, {
            selected: selectedPairingPlayerId === player.id,
            draggable: pairingsUnlocked,
            disabled: !pairingsUnlocked,
            onSelect: () => {
              selectedPairingPlayerId = selectedPairingPlayerId === player.id ? "" : player.id;
              renderAdminPairingsView();
            },
          }),
        );
      });
    }
    poolSection.append(poolGrid);

    const pairsGrid = buildPairingsGrid(game, rosterPlayers, pairings, {
      interactive,
      pairingsUnlocked,
      selectedPairingPlayer,
      rerender: renderAdminPairingsView,
    });

    layout.append(poolSection, pairsGrid);
    card.append(layout);
    return card;
  }

  const pairsGrid = buildPairingsGrid(game, rosterPlayers, pairings, {
    interactive: false,
    pairingsUnlocked: false,
    selectedPairingPlayer: null,
    rerender: renderRosterView,
  });
  card.append(pairsGrid);

  return card;
}

function buildPairingsGrid(game, rosterPlayers, pairings, options) {
  const wrapper = options.interactive ? document.createElement("section") : document.createElement("div");
  wrapper.className = options.interactive ? "pairings-section pairings-section--expanded" : "pairings-grid";
  if (options.interactive) {
    const pairsTitle = document.createElement("h4");
    pairsTitle.className = "pairings-section__title";
    pairsTitle.textContent = "Pairs";
    wrapper.append(pairsTitle);
  }

  const pairsGrid = document.createElement("div");
  pairsGrid.className = "pairings-grid";

  pairings.forEach((pair, pairIndex) => {
    const pairBox = document.createElement("section");
    pairBox.className = "pair-box";
    const pairPlayers = pair
      .map((playerId) => rosterPlayers.find((entry) => entry.id === playerId))
      .filter(Boolean);
    const pairHasCompleteDupr =
      pairPlayers.length === 2 && pairPlayers.every((player) => typeof player.dupr === "number");
    const pairTeamDupr = pairHasCompleteDupr
      ? pairPlayers.reduce((total, player) => total + player.dupr, 0)
      : null;

    const pairHeader = document.createElement("div");
    pairHeader.className = "pair-box__header";
    const pairTitleRow = document.createElement("div");
    pairTitleRow.className = "pair-box__title-row";
    const pairTitle = document.createElement("h5");
    pairTitle.className = "pair-box__title";
    pairTitle.textContent = `Pair ${pairIndex + 1}`;
    const pairDupr = document.createElement("span");
    pairDupr.className = "pair-box__team-dupr";
    if (!pairHasCompleteDupr) {
      pairDupr.classList.add("pair-box__team-dupr--muted");
    }
    pairDupr.textContent = `Team DUPR: ${formatTeamDupr(pairTeamDupr)}`;
    pairTitleRow.append(pairTitle, pairDupr);
    const pairStatus = document.createElement("span");
    pairStatus.className = "pair-box__status";
    pairStatus.textContent = `${pair.length}/2`;
    pairHeader.append(pairTitleRow, pairStatus);

    const pairBody = document.createElement("div");
    pairBody.className = "pair-box__body";
    if (options.pairingsUnlocked && pair.length < 2) {
      pairBody.classList.add("pair-box__body--droppable");
    }

    if (options.pairingsUnlocked) {
      pairBody.addEventListener("dragover", (event) => {
        if (pair.length >= 2) {
          return;
        }
        event.preventDefault();
        pairBody.classList.add("is-drag-over");
      });

      pairBody.addEventListener("dragleave", () => {
        pairBody.classList.remove("is-drag-over");
      });

      pairBody.addEventListener("drop", async (event) => {
        event.preventDefault();
        pairBody.classList.remove("is-drag-over");
        const playerId = event.dataTransfer?.getData("text/plain");
        if (!playerId) {
          return;
        }

        const nextPairings = movePlayerToPair(pairings, playerId, pairIndex);
        const targetPair = nextPairings[pairIndex];
        if (!targetPair.includes(playerId) || targetPair.length > 2) {
          return;
        }

        selectedPairingPlayerId = "";
        await updateGamePairings(game.id, nextPairings, getRosterPlayerIds(game));
      });
    }

    if (pair.length) {
      pair.forEach((playerId) => {
        const player = rosterPlayers.find((entry) => entry.id === playerId);
        if (!player) {
          return;
        }

        pairBody.append(
          buildPairingPlayerCard(player, {
            compact: true,
            locationLabel: `In Pair ${pairIndex + 1}`,
            readonly: !options.interactive,
            showSkill: options.interactive,
            selected: options.interactive && selectedPairingPlayerId === player.id,
            draggable: options.pairingsUnlocked,
            disabled: !options.pairingsUnlocked,
            onSelect: options.interactive
              ? () => {
                  selectedPairingPlayerId = selectedPairingPlayerId === player.id ? "" : player.id;
                  options.rerender();
                }
              : undefined,
            onRemove: options.interactive
              ? async () => {
                  selectedPairingPlayerId =
                    selectedPairingPlayerId === player.id ? "" : selectedPairingPlayerId;
                  await updateGamePairings(
                    game.id,
                    removePlayerFromPairings(pairings, player.id),
                    getRosterPlayerIds(game),
                  );
                }
              : undefined,
          }),
        );
      });
    } else {
      const emptySlot = document.createElement("div");
      emptySlot.className = "pair-box__empty";
      emptySlot.textContent = options.interactive
        ? options.pairingsUnlocked
          ? "Drop players here"
          : "Waiting for an 8-player roster"
        : "Pair not set yet.";
      pairBody.append(emptySlot);
    }

    if (options.interactive) {
      const pairActions = document.createElement("div");
      pairActions.className = "pair-box__actions";

      const addSelectedButton = document.createElement("button");
      addSelectedButton.type = "button";
      addSelectedButton.className = "action-btn";
      addSelectedButton.textContent = options.selectedPairingPlayer
        ? "Add selected player"
        : "Select a player";
      const canAddSelectedPlayer =
        Boolean(options.selectedPairingPlayer) &&
        (pair.length < 2 || pair.includes(options.selectedPairingPlayer.id));
      addSelectedButton.disabled = !options.pairingsUnlocked || !canAddSelectedPlayer;
      addSelectedButton.addEventListener("click", async () => {
        if (!options.selectedPairingPlayer) {
          return;
        }
        selectedPairingPlayerId = "";
        await updateGamePairings(
          game.id,
          movePlayerToPair(pairings, options.selectedPairingPlayer.id, pairIndex),
          getRosterPlayerIds(game),
        );
      });

      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "action-btn";
      clearButton.textContent = "Clear pair";
      clearButton.disabled = !options.pairingsUnlocked || !pair.length;
      clearButton.addEventListener("click", async () => {
        const nextPairings = normalizePairings(pairings);
        nextPairings[pairIndex] = [];
        await updateGamePairings(game.id, nextPairings, getRosterPlayerIds(game));
      });

      pairActions.append(addSelectedButton, clearButton);
      pairBox.append(pairHeader, pairBody, pairActions);
    } else {
      pairBox.append(pairHeader, pairBody);
    }
    pairsGrid.append(pairBox);
  });

  if (options.interactive) {
    wrapper.append(pairsGrid);
  } else {
    return pairsGrid;
  }

  return wrapper;
}

function createStandingCard(title, body, meta = "") {
  const card = document.createElement("article");
  card.className = "game-card standing-card";

  const titleNode = document.createElement("h3");
  titleNode.className = "standing-card__title";
  titleNode.textContent = title;

  const bodyNode = document.createElement("p");
  bodyNode.className = "standing-card__body";
  bodyNode.textContent = body;

  card.append(titleNode, bodyNode);

  if (meta) {
    const metaNode = document.createElement("p");
    metaNode.className = "standing-card__meta";
    metaNode.textContent = meta;
    card.append(metaNode);
  }

  return card;
}

function buildTeamStandingRows() {
  const rows = new Map();

  games.forEach((game) => {
    if (game.matchStatus !== "completed" || game.result === "pending") {
      return;
    }

    const key = game.opponent || "Unknown opponent";
    const row = rows.get(key) ?? {
      opponent: key,
      wins: 0,
      losses: 0,
      ties: 0,
      matches: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    };

    row.matches += 1;
    if (game.result === "win") {
      row.wins += 1;
    } else if (game.result === "loss") {
      row.losses += 1;
    } else if (game.result === "tie") {
      row.ties += 1;
    }

    row.pointsFor += game.teamScore ?? 0;
    row.pointsAgainst += game.opponentScore ?? 0;
    rows.set(key, row);
  });

  return Array.from(rows.values()).sort((left, right) => {
    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }
    if (left.losses !== right.losses) {
      return left.losses - right.losses;
    }
    return left.opponent.localeCompare(right.opponent);
  });
}

function renderScheduleView() {
  if (!scheduleGrid) {
    return;
  }

  scheduleGrid.innerHTML = "";

  if (!games.length) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "No matchups are scheduled yet.";
    scheduleGrid.append(empty);
    return;
  }

  games.forEach((game) => {
    scheduleGrid.append(buildScheduleCardElement(game));
  });
}

function buildTeamMemberCard(player) {
  const card = document.createElement("article");
  card.className = "game-card team-member-card";
  const playerGameCounts = games.reduce(
    (counts, game) => {
      if (getAttendanceStatus(game, player) === "in") {
        counts.available += 1;
      }
      if (getRosterPlayerIds(game).includes(player.id)) {
        counts.played += 1;
      }
      return counts;
    },
    { available: 0, played: 0 },
  );

  const top = document.createElement("div");
  top.className = "team-member-card__top";

  const avatar = document.createElement("div");
  avatar.className = "team-member-card__avatar";
  avatar.textContent = buildPlayerInitials(player);

  const badge = document.createElement("span");
  badge.className = `game-card__badge ${player.active ? "" : "game-card__badge--muted"}`.trim();
  badge.textContent = player.active ? "Active" : "Inactive";

  top.append(avatar, badge);

  const name = document.createElement("h3");
  name.className = "team-member-card__name";
  name.textContent = player.fullName || "Team player";

  const meta = document.createElement("p");
  meta.className = "team-member-card__meta";
  const availableStat = document.createElement("span");
  availableStat.textContent = `Available: ${playerGameCounts.available}`;
  const playedStat = document.createElement("span");
  playedStat.textContent = `Games Played: ${playerGameCounts.played}`;
  meta.append(availableStat, playedStat);

  card.append(top, name, meta);
  return card;
}

function buildNewsCard(post) {
  const card = document.createElement("article");
  card.className = "game-card news-card";

  const header = document.createElement("div");
  header.className = "game-card__top";

  const headerContent = document.createElement("div");
  const date = document.createElement("p");
  date.className = "game-card__date";
  date.textContent = getNewsPostMeta(post);

  const title = document.createElement("h3");
  title.className = "game-card__title";
  title.textContent = post.title;

  headerContent.append(date, title);

  const badge = document.createElement("span");
  badge.className = "game-card__badge game-card__badge--muted";
  badge.textContent = post.imageUrl ? "Photo" : "Post";

  header.append(headerContent, badge);
  card.append(header);

  if (post.imageUrl) {
    const image = document.createElement("img");
    image.className = "news-card__image";
    image.src = post.imageUrl;
    image.alt = "News post image";
    card.append(image);
  }

  const body = document.createElement("p");
  body.className = "news-card__body";
  body.textContent = post.body;
  card.append(body);

  if (post.linkUrl) {
    const actions = document.createElement("div");
    actions.className = "news-card__actions";

    const link = document.createElement("a");
    link.className = "news-card__link";
    link.href = post.linkUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    const linkLabel = document.createElement("span");
    linkLabel.textContent = getNewsPostLinkLabel(post.linkUrl);
    link.append(createNewsActionIcon("link"), linkLabel);
    actions.append(link);

    if (post.imageUrl) {
      const downloadButton = document.createElement("button");
      downloadButton.type = "button";
      downloadButton.className = "news-card__link";
      downloadButton.append(createNewsActionIcon("download"));
      const downloadLabel = document.createElement("span");
      downloadLabel.textContent = "Download image";
      downloadButton.append(downloadLabel);
      downloadButton.addEventListener("click", async () => {
        await downloadNewsImage(post);
      });
      actions.append(downloadButton);
    }

    card.append(actions);
  } else if (post.imageUrl) {
    const actions = document.createElement("div");
    actions.className = "news-card__actions";

    const downloadButton = document.createElement("button");
    downloadButton.type = "button";
    downloadButton.className = "news-card__link";
    downloadButton.append(createNewsActionIcon("download"));
    const downloadLabel = document.createElement("span");
    downloadLabel.textContent = "Download image";
    downloadButton.append(downloadLabel);
    downloadButton.addEventListener("click", async () => {
      await downloadNewsImage(post);
    });

    actions.append(downloadButton);
    card.append(actions);
  }

  return card;
}

function buildNewsAdminCard(post, options = {}) {
  const article = document.createElement("article");
  article.className = "admin-card news-editor-card";

  const header = document.createElement("div");
  header.className = "admin-card__header";

  const headerCopy = document.createElement("div");
  const title = document.createElement("h3");
  title.textContent = options.title ?? "Edit post";
  const meta = document.createElement("p");
  meta.className = "admin-card__meta";
  meta.textContent = options.meta ?? getNewsPostMeta(post);
  headerCopy.append(title, meta);

  const badge = document.createElement("span");
  badge.className = "game-card__badge";
  badge.textContent = post.imageUrl ? "Live with photo" : "Live";

  header.append(headerCopy, badge);

  const form = document.createElement("form");
  form.className = "admin-form";

  const titleField = document.createElement("label");
  titleField.className = "field";
  const titleLabel = document.createElement("span");
  titleLabel.className = "field__label";
  titleLabel.textContent = "Post title";
  const titleInput = document.createElement("input");
  titleInput.className = "field__input";
  titleInput.type = "text";
  titleInput.required = true;
  titleInput.value = post.title;
  titleField.append(titleLabel, titleInput);

  const bodyField = document.createElement("label");
  bodyField.className = "field";
  const bodyLabel = document.createElement("span");
  bodyLabel.className = "field__label";
  bodyLabel.textContent = "Post text";
  const bodyInput = document.createElement("textarea");
  bodyInput.className = "field__input field__input--textarea";
  bodyInput.required = true;
  bodyInput.rows = 5;
  bodyInput.value = post.body;
  bodyField.append(bodyLabel, bodyInput);

  const linkField = document.createElement("label");
  linkField.className = "field";
  const linkLabel = document.createElement("span");
  linkLabel.className = "field__label";
  linkLabel.textContent = "Link URL (optional)";
  const linkInput = document.createElement("input");
  linkInput.className = "field__input";
  linkInput.type = "url";
  linkInput.placeholder = "https://";
  linkInput.value = post.linkUrl;
  linkField.append(linkLabel, linkInput);

  const imageField = document.createElement("label");
  imageField.className = "field";
  const imageLabel = document.createElement("span");
  imageLabel.className = "field__label";
  imageLabel.textContent = "Image (optional)";
  const imageInput = document.createElement("input");
  imageInput.className = "field__input";
  imageInput.type = "file";
  imageInput.accept = "image/*";
  imageField.append(imageLabel, imageInput);

  const imagePreview = document.createElement("div");
  imagePreview.className = "news-editor-card__media";
  if (post.imageUrl) {
    const previewImage = document.createElement("img");
    previewImage.className = "news-editor-card__image";
    previewImage.src = post.imageUrl;
    previewImage.alt = "Current news post image";
    imagePreview.append(previewImage);
  } else {
    imagePreview.hidden = true;
  }

  const removeImageRow = document.createElement("label");
  removeImageRow.className = "checkbox-row";
  const removeImageInput = document.createElement("input");
  removeImageInput.type = "checkbox";
  const removeImageText = document.createElement("span");
  removeImageText.textContent = "Remove current image";
  removeImageRow.append(removeImageInput, removeImageText);
  removeImageRow.hidden = !post.imageUrl;

  const actions = document.createElement("div");
  actions.className = "admin-form__actions";

  form.append(titleField, bodyField, linkField, imageField, imagePreview, removeImageRow, actions);
  article.append(header, form);

  return {
    card: article,
    form,
    actions,
    titleInput,
    bodyInput,
    linkInput,
    imageInput,
    imagePreview,
    removeImageInput,
    removeImageRow,
  };
}

function updateGamesPager() {
  if (!gamesPager || !gamesPagerLabel || !gamesPrev || !gamesNext) {
    return;
  }

  const total = games.length;

  if (total <= 1 || !selectedPlayerId) {
    gamesPager.classList.add("is-hidden");
    return;
  }

  gamesPager.classList.remove("is-hidden");
  gamesPagerLabel.textContent = `Matchup ${gameBoardIndex + 1} of ${total}`;
  gamesPrev.disabled = gameBoardIndex <= 0 || savingState;
  gamesNext.disabled = gameBoardIndex >= total - 1 || savingState;
}

function updateRosterPager() {
  if (!rosterPager || !rosterPagerLabel || !rosterPrev || !rosterNext) {
    return;
  }

  const total = games.length;

  if (total <= 1) {
    rosterPager.classList.add("is-hidden");
    return;
  }

  rosterPager.classList.remove("is-hidden");
  rosterPagerLabel.textContent = `Matchup ${rosterBoardIndex + 1} of ${total}`;
  rosterPrev.disabled = rosterBoardIndex <= 0 || savingState;
  rosterNext.disabled = rosterBoardIndex >= total - 1 || savingState;
}

function updatePairingsAdminPager() {
  if (
    !pairingsAdminPager ||
    !pairingsAdminPagerLabel ||
    !pairingsAdminPrev ||
    !pairingsAdminNext
  ) {
    return;
  }

  const total = games.length;

  if (total <= 1 || !isApprovedAdmin) {
    pairingsAdminPager.classList.add("is-hidden");
    return;
  }

  pairingsAdminPager.classList.remove("is-hidden");
  pairingsAdminPagerLabel.textContent = `Matchup ${pairingsAdminIndex + 1} of ${total}`;
  pairingsAdminPrev.disabled = pairingsAdminIndex <= 0 || savingState;
  pairingsAdminNext.disabled = pairingsAdminIndex >= total - 1 || savingState;
}

function renderAvailabilityView() {
  if (!gamesGrid) {
    return;
  }

  updateAvailabilityTabUi();
  syncGameBoardIndex();
  gamesGrid.innerHTML = "";
  const activePlayers = getActivePlayers();

  if (!games.length) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "No matchups are scheduled yet.";
    gamesGrid.append(empty);
    if (gamesPager) {
      gamesPager.classList.add("is-hidden");
    }
    return;
  }

  if (!activePlayers.length) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "No active players are on the roster yet. An admin can add players in Admin.";
    gamesGrid.append(empty);
    if (gamesPager) {
      gamesPager.classList.add("is-hidden");
    }
    return;
  }

  if (availabilityTab === "summary") {
    gamesGrid.append(buildAvailabilitySummaryTable(activePlayers));
    if (gamesPager) {
      gamesPager.classList.add("is-hidden");
    }
    return;
  }

  if (!selectedPlayerId) {
    updateGamesPager();
    return;
  }

  gamesGrid.append(buildAvailabilityCardElement(games[gameBoardIndex], activePlayers));
  updateGamesPager();
}

function renderRosterView() {
  if (!pairingsGrid) {
    return;
  }

  syncRosterBoardIndex();
  pairingsGrid.innerHTML = "";

  if (rosterViewEyebrow && rosterViewCopy) {
    rosterViewEyebrow.textContent = "Team view";
    rosterViewCopy.textContent =
      "See the saved pairings for each matchup and compare the DUPR weight of every team.";
  }

  if (!games.length) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "No matchups are available for roster planning yet.";
    pairingsGrid.append(empty);
    updateRosterPager();
    return;
  }

  const activeGame = games[rosterBoardIndex];
  const activeRosterIds = new Set(getRosterPlayerIds(activeGame));
  if (selectedPairingPlayerId && !activeRosterIds.has(selectedPairingPlayerId)) {
    selectedPairingPlayerId = "";
  }
  pairingsGrid.append(buildPairingsCardElement(activeGame));
  updateRosterPager();
}

function renderAdminPairingsView() {
  if (!pairingsAdminGrid || !rosterAdminGrid) {
    return;
  }

  syncPairingsAdminIndex();
  rosterAdminGrid.innerHTML = "";
  pairingsAdminGrid.innerHTML = "";

  adminRosterTabButtons.forEach((button) => {
    const isActive = button.dataset.adminRosterTab === adminRosterTab;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  rosterAdminGrid.hidden = adminRosterTab !== "roster";
  pairingsAdminGrid.hidden = adminRosterTab !== "pairings";

  if (!isApprovedAdmin) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "Sign in with an approved admin account to manage matchup pairings.";
    if (adminRosterTab === "pairings") {
      pairingsAdminGrid.append(empty);
    } else {
      rosterAdminGrid.append(empty);
    }
    updatePairingsAdminPager();
    return;
  }

  if (!games.length) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "No matchups are available for pairings yet.";
    if (adminRosterTab === "pairings") {
      pairingsAdminGrid.append(empty);
    } else {
      rosterAdminGrid.append(empty);
    }
    updatePairingsAdminPager();
    return;
  }

  const activeGame = games[pairingsAdminIndex];
  const activeRosterIds = new Set(getRosterPlayerIds(activeGame));
  if (selectedPairingPlayerId && !activeRosterIds.has(selectedPairingPlayerId)) {
    selectedPairingPlayerId = "";
  }

  if (adminRosterTab === "pairings") {
    pairingsAdminGrid.append(buildPairingsCardElement(activeGame, { interactive: true }));
  } else {
    rosterAdminGrid.append(buildRosterCardElement(activeGame));
  }
  updatePairingsAdminPager();
}

function renderTeamStandingView() {
  if (!teamStandingGrid || !teamStandingNote) {
    return;
  }

  teamStandingGrid.innerHTML = "";

  const completedGames = games.filter((game) => game.matchStatus === "completed" && game.result !== "pending");
  if (!completedGames.length) {
    teamStandingNote.hidden = false;
    return;
  }

  teamStandingNote.hidden = true;

  const wins = completedGames.filter((game) => game.result === "win").length;
  const losses = completedGames.filter((game) => game.result === "loss").length;
  const ties = completedGames.filter((game) => game.result === "tie").length;
  const winPct = completedGames.length ? ((wins + ties * 0.5) / completedGames.length).toFixed(3) : "0.000";

  teamStandingGrid.append(
    createStandingCard("Overall record", `${wins}-${losses}${ties ? `-${ties}` : ""}`, `${completedGames.length} completed matchups`),
    createStandingCard("Win %", winPct, "Wins plus half ties over completed matchups"),
  );

  buildTeamStandingRows().forEach((row) => {
    teamStandingGrid.append(
      createStandingCard(
        row.opponent,
        `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`,
        `PF ${row.pointsFor} • PA ${row.pointsAgainst}`,
      ),
    );
  });
}

function renderMembersView() {
  if (!membersGrid) {
    return;
  }

  membersGrid.innerHTML = "";

  if (!players.length) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "No players are on the roster yet.";
    membersGrid.append(empty);
    return;
  }

  players.forEach((player) => {
    membersGrid.append(buildTeamMemberCard(player));
  });
}

function renderNewsView() {
  if (!newsFeed) {
    return;
  }

  newsFeed.innerHTML = "";

  if (newsLoadError) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = newsLoadError;
    newsFeed.append(empty);
    return;
  }

  if (!newsLoaded) {
    const loading = document.createElement("div");
    loading.className = "games-grid__empty";
    loading.textContent = "Loading the latest news...";
    newsFeed.append(loading);
    return;
  }

  if (!newsPosts.length) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "No news has been posted yet.";
    newsFeed.append(empty);
    return;
  }

  newsPosts.forEach((post) => {
    newsFeed.append(buildNewsCard(post));
  });
}

function buildAdminGameCard(game, options = {}) {
  const fragment = adminCardTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".admin-card");
  const title = fragment.querySelector('[data-role="admin-title"]');
  const meta = fragment.querySelector('[data-role="admin-meta"]');
  const badge = fragment.querySelector('[data-role="admin-badge"]');
  const form = fragment.querySelector('[data-role="admin-form"]');
  const actions = fragment.querySelector('[data-role="admin-actions"]');
  const dateInput = fragment.querySelector('[data-role="date-input"]');
  const timeInput = fragment.querySelector('[data-role="time-input"]');
  const tbdInput = fragment.querySelector('[data-role="tbd-input"]');
  const locationInput = fragment.querySelector('[data-role="location-input"]');
  const opponentInput = fragment.querySelector('[data-role="opponent-input"]');
  const statusInput = fragment.querySelector('[data-role="status-input"]');
  const teamScoreInput = fragment.querySelector('[data-role="team-score-input"]');
  const opponentScoreInput = fragment.querySelector('[data-role="opponent-score-input"]');

  title.textContent = options.title ?? game.opponent;
  meta.textContent = options.meta ?? `${game.dateLabel} • ${game.location}`;
  if (options.hideBadge) {
    badge.hidden = true;
  } else {
    badge.hidden = false;
    badge.textContent = hasFinalScore(game) ? `Final ${game.teamScore}-${game.opponentScore}` : (game.dateTbd ? "TBD" : game.timeLabel);
  }

  dateInput.value = game.dateTbd ? "" : (game.isoDate ? game.isoDate.slice(0, 10) : "");
  timeInput.value = game.dateTbd ? "" : pacificTimeInputValueFromIso(game.isoDate);
  tbdInput.checked = game.dateTbd === true;
  locationInput.value = game.location;
  opponentInput.value = game.opponent;
  statusInput.value = game.matchStatus ?? "scheduled";
  teamScoreInput.value = game.teamScore ?? "";
  opponentScoreInput.value = game.opponentScore ?? "";

  const syncTbdUi = () => {
    const isTbd = tbdInput.checked;
    dateInput.disabled = isTbd;
    timeInput.disabled = isTbd;

    if (!isTbd && !timeInput.value) {
      timeInput.value = DEFAULT_NEW_GAME_TIME;
    }
  };

  syncTbdUi();
  tbdInput.addEventListener("change", syncTbdUi);

  return {
    card,
    form,
    actions,
    dateInput,
    timeInput,
    tbdInput,
    locationInput,
    opponentInput,
    statusInput,
    teamScoreInput,
    opponentScoreInput,
  };
}

function buildAdminPlayerCard(player, options = {}) {
  const fragment = playerAdminTemplate.content.cloneNode(true);
  const card = fragment.querySelector(".admin-card");
  const title = fragment.querySelector('[data-role="player-title"]');
  const meta = fragment.querySelector('[data-role="player-meta"]');
  const badge = fragment.querySelector('[data-role="player-badge"]');
  const form = fragment.querySelector('[data-role="player-form"]');
  const actions = fragment.querySelector('[data-role="player-actions"]');
  const firstNameInput = fragment.querySelector('[data-role="first-name-input"]');
  const lastNameInput = fragment.querySelector('[data-role="last-name-input"]');
  const duprInput = fragment.querySelector('[data-role="dupr-input"]');
  const skillLevelInput = fragment.querySelector('[data-role="skill-level-input"]');

  title.textContent = options.title ?? player.fullName;
  meta.textContent = options.meta ?? "Update a player's name or remove them from the active list.";
  badge.textContent = player.active ? "Active" : "Inactive";
  firstNameInput.value = player.firstName;
  lastNameInput.value = player.lastName;
  duprInput.value = player.dupr ?? "";
  skillLevelInput.value = normalizeSkillLevel(player.skillLevel);

  return {
    card,
    form,
    actions,
    firstNameInput,
    lastNameInput,
    duprInput,
    skillLevelInput,
  };
}

function updatePlayersAdminPager() {
  if (!playersAdminPager || !playersAdminPagerLabel || !playersAdminPrev || !playersAdminNext) {
    return;
  }

  const total = players.length;

  if (total <= 1 || !isApprovedAdmin) {
    playersAdminPager.classList.add("is-hidden");
    return;
  }

  playersAdminPager.classList.remove("is-hidden");
  playersAdminPagerLabel.textContent = `Player ${playerAdminIndex + 1} of ${total}`;
  playersAdminPrev.disabled = playerAdminIndex <= 0 || savingState;
  playersAdminNext.disabled = playerAdminIndex >= total - 1 || savingState;
}

function buildExistingPlayerAdminCard(player) {
  const adminCard = buildAdminPlayerCard(player);

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "action-btn";
  resetButton.textContent = "Reset";
  resetButton.disabled = savingState;
  resetButton.addEventListener("click", () => {
    adminCard.firstNameInput.value = player.firstName;
    adminCard.lastNameInput.value = player.lastName;
    adminCard.duprInput.value = player.dupr ?? "";
    adminCard.skillLevelInput.value = normalizeSkillLevel(player.skillLevel);
  });

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "action-btn action-btn--active";
  saveButton.textContent = "Save";
  saveButton.disabled = savingState;

  const activeToggleButton = document.createElement("button");
  activeToggleButton.type = "button";
  activeToggleButton.className = player.active ? "action-btn action-btn--danger" : "action-btn";
  activeToggleButton.textContent = player.active ? "Deactivate" : "Reactivate";
  activeToggleButton.disabled = savingState;
  activeToggleButton.addEventListener("click", async () => {
    await setPlayerActiveState(player.id, !player.active, player.fullName);
  });

  adminCard.actions.append(resetButton, saveButton, activeToggleButton);
  adminCard.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updatePlayer(player, {
      firstName: adminCard.firstNameInput.value,
      lastName: adminCard.lastNameInput.value,
      dupr: adminCard.duprInput.value,
      skillLevel: adminCard.skillLevelInput.value,
    });
  });

  return adminCard.card;
}

function renderPlayersAdminControls() {
  if (!playersAdminGrid) {
    return;
  }

  syncPlayerAdminIndex();
  playersAdminGrid.innerHTML = "";

  if (!isApprovedAdmin) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "Sign in with an approved admin account to manage the roster.";
    playersAdminGrid.append(empty);
    updatePlayersAdminPager();
    return;
  }

  const createCard = buildAdminPlayerCard(
    {
      firstName: "",
      lastName: "",
      fullName: "New player",
      active: true,
      dupr: null,
      skillLevel: "",
    },
    {
      title: "Add player",
      meta: "Add a new player to the roster.",
    },
  );

  createCard.card.classList.add("admin-card--create");

  const createButton = document.createElement("button");
  createButton.type = "submit";
  createButton.className = "action-btn action-btn--active";
  createButton.textContent = "Create player";
  createButton.disabled = savingState;

  createCard.actions.append(createButton);
  createCard.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createPlayer({
      firstName: createCard.firstNameInput.value,
      lastName: createCard.lastNameInput.value,
      dupr: createCard.duprInput.value,
      skillLevel: createCard.skillLevelInput.value,
    });
  });

  if (!players.length) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "No players are loaded yet. Use the card above to create the first player.";
    playersAdminGrid.append(empty, createCard.card);
    updatePlayersAdminPager();
    return;
  }

  playersAdminGrid.append(buildExistingPlayerAdminCard(players[playerAdminIndex]), createCard.card);
  updatePlayersAdminPager();
}

function updateGamesAdminPager() {
  if (!adminGamesPager || !adminGamesPagerLabel || !adminGamesPrev || !adminGamesNext) {
    return;
  }

  const total = games.length;

  if (total <= 1 || !isApprovedAdmin) {
    adminGamesPager.classList.add("is-hidden");
    return;
  }

  adminGamesPager.classList.remove("is-hidden");
  adminGamesPagerLabel.textContent = `Matchup ${gameAdminIndex + 1} of ${total}`;
  adminGamesPrev.disabled = gameAdminIndex <= 0 || savingState;
  adminGamesNext.disabled = gameAdminIndex >= total - 1 || savingState;
}

function buildExistingGameAdminCard(game) {
  const adminCard = buildAdminGameCard(game);

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "action-btn";
  resetButton.textContent = "Reset";
  resetButton.disabled = savingState;
  resetButton.addEventListener("click", () => {
    adminCard.dateInput.value = game.dateTbd ? "" : game.isoDate.slice(0, 10);
    adminCard.timeInput.value = game.dateTbd ? "" : pacificTimeInputValueFromIso(game.isoDate);
    adminCard.tbdInput.checked = game.dateTbd === true;
    adminCard.dateInput.disabled = game.dateTbd === true;
    adminCard.timeInput.disabled = game.dateTbd === true;
    adminCard.locationInput.value = game.location;
    adminCard.opponentInput.value = game.opponent;
    adminCard.statusInput.value = game.matchStatus;
    adminCard.teamScoreInput.value = game.teamScore ?? "";
    adminCard.opponentScoreInput.value = game.opponentScore ?? "";
  });

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "action-btn action-btn--active";
  saveButton.textContent = "Save";
  saveButton.disabled = savingState;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "action-btn action-btn--danger";
  deleteButton.textContent = "Delete";
  deleteButton.disabled = savingState;
  deleteButton.addEventListener("click", async () => {
    const confirmed = window.confirm(`Delete "${game.opponent}" on ${game.dateLabel}?`);
    if (!confirmed) {
      return;
    }
    await deleteGame(game.id, game.opponent);
  });

  adminCard.actions.append(resetButton, saveButton, deleteButton);
  adminCard.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateGameDetails(game.id, {
      scheduledDate: adminCard.dateInput.value,
      scheduledTime: adminCard.timeInput.value,
      dateTbd: adminCard.tbdInput.checked,
      location: adminCard.locationInput.value.trim(),
      opponent: adminCard.opponentInput.value.trim(),
      matchStatus: adminCard.statusInput.value,
      teamScore: adminCard.teamScoreInput.value,
      opponentScore: adminCard.opponentScoreInput.value,
    });
  });

  return adminCard.card;
}

function renderGamesAdminControls() {
  if (!adminGrid) {
    return;
  }

  syncGameAdminIndex();
  adminGrid.innerHTML = "";

  if (!isApprovedAdmin) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "Sign in with an approved admin account to manage matchups and scores.";
    adminGrid.append(empty);
    updateGamesAdminPager();
    return;
  }

  const createCard = buildAdminGameCard(buildBlankGameDraft(), {
    title: "Create matchup",
    meta: "Add a new matchup to the live team schedule.",
    hideBadge: true,
  });

  createCard.card.classList.add("admin-card--create");

  const createButton = document.createElement("button");
  createButton.type = "submit";
  createButton.className = "action-btn action-btn--active";
  createButton.textContent = "Create matchup";
  createButton.disabled = savingState;

  createCard.actions.append(createButton);
  createCard.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createGame({
      scheduledDate: createCard.dateInput.value,
      scheduledTime: createCard.timeInput.value,
      dateTbd: createCard.tbdInput.checked,
      location: createCard.locationInput.value.trim(),
      opponent: createCard.opponentInput.value.trim(),
      matchStatus: createCard.statusInput.value,
      teamScore: createCard.teamScoreInput.value,
      opponentScore: createCard.opponentScoreInput.value,
    });
  });

  if (!games.length) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "No matchups are available to edit yet. Use the card above to create the first one.";
    adminGrid.append(empty, createCard.card);
    updateGamesAdminPager();
    return;
  }

  adminGrid.append(buildExistingGameAdminCard(games[gameAdminIndex]), createCard.card);
  updateGamesAdminPager();
}

function buildNewsPersistencePayload(updates) {
  const title = (updates.title ?? "").trim();
  const body = (updates.body ?? "").trim();
  const normalizedLinkUrl = normalizeUrl(updates.linkUrl);
  const imageFile = updates.imageFile ?? null;

  if (!title) {
    return { error: "Post title is required." };
  }

  if (!body) {
    return { error: "Post text is required." };
  }

  if (normalizedLinkUrl === null) {
    return { error: "Enter a valid http or https link." };
  }

  if (imageFile && !String(imageFile.type ?? "").startsWith("image/")) {
    return { error: "Choose an image file to upload." };
  }

  return {
    title,
    body,
    linkUrl: normalizedLinkUrl || "",
    imageFile,
    removeImage: updates.removeImage === true,
  };
}

async function uploadNewsImage(postId, file) {
  const imagePath = buildNewsImagePath(postId, file);
  const imageRef = ref(storage, imagePath);
  await uploadBytes(imageRef, file, {
    contentType: file.type || undefined,
  });
  const imageUrl = await getDownloadURL(imageRef);
  return { imagePath, imageUrl };
}

async function deleteNewsImageByPath(imagePath) {
  if (!imagePath) {
    return;
  }

  try {
    await deleteObject(ref(storage, imagePath));
  } catch (error) {
    if (error?.code !== "storage/object-not-found") {
      throw error;
    }
  }
}

function buildBlankNewsDraft() {
  return {
    id: "",
    title: "",
    body: "",
    linkUrl: "",
    imageUrl: "",
    imagePath: "",
    createdAtMs: 0,
    updatedAtMs: 0,
  };
}

function buildExistingNewsAdminCard(post) {
  const adminCard = buildNewsAdminCard(post);

  const resetButton = document.createElement("button");
  resetButton.type = "button";
  resetButton.className = "action-btn";
  resetButton.textContent = "Reset";
  resetButton.disabled = savingState;
  resetButton.addEventListener("click", () => {
    adminCard.titleInput.value = post.title;
    adminCard.bodyInput.value = post.body;
    adminCard.linkInput.value = post.linkUrl;
    adminCard.imageInput.value = "";
    adminCard.removeImageInput.checked = false;
  });

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "action-btn action-btn--active";
  saveButton.textContent = "Save";
  saveButton.disabled = savingState;

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "action-btn action-btn--danger";
  deleteButton.textContent = "Delete";
  deleteButton.disabled = savingState;
  deleteButton.addEventListener("click", async () => {
    const confirmed = window.confirm("Delete this news post?");
    if (!confirmed) {
      return;
    }

    await deleteNewsPost(post);
  });

  adminCard.actions.append(resetButton, saveButton, deleteButton);
  adminCard.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateNewsPost(post, {
      title: adminCard.titleInput.value,
      body: adminCard.bodyInput.value,
      linkUrl: adminCard.linkInput.value,
      imageFile: adminCard.imageInput.files?.[0] ?? null,
      removeImage: adminCard.removeImageInput.checked,
    });
  });

  return adminCard.card;
}

function renderNewsAdminControls() {
  if (!newsAdminGrid) {
    return;
  }

  newsAdminGrid.innerHTML = "";

  if (newsLoadError) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = newsLoadError;
    newsAdminGrid.append(empty);
    return;
  }

  if (!isApprovedAdmin) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "Sign in with an approved admin account to publish team news.";
    newsAdminGrid.append(empty);
    return;
  }

  const createCard = buildNewsAdminCard(buildBlankNewsDraft(), {
    title: "Create post",
    meta: "Publish a new update to the public News feed.",
  });
  createCard.card.classList.add("admin-card--create");

  const createButton = document.createElement("button");
  createButton.type = "submit";
  createButton.className = "action-btn action-btn--active";
  createButton.textContent = "Publish post";
  createButton.disabled = savingState;

  createCard.actions.append(createButton);
  createCard.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createNewsPost({
      title: createCard.titleInput.value,
      body: createCard.bodyInput.value,
      linkUrl: createCard.linkInput.value,
      imageFile: createCard.imageInput.files?.[0] ?? null,
    });
  });

  newsAdminGrid.append(createCard.card);

  if (!newsLoaded) {
    const loading = document.createElement("div");
    loading.className = "games-grid__empty";
    loading.textContent = "Loading existing news posts...";
    newsAdminGrid.append(loading);
    return;
  }

  if (!newsPosts.length) {
    const empty = document.createElement("div");
    empty.className = "games-grid__empty";
    empty.textContent = "No news posts are live yet. Use the card above to publish the first one.";
    newsAdminGrid.append(empty);
    return;
  }

  newsPosts.forEach((post) => {
    newsAdminGrid.append(buildExistingNewsAdminCard(post));
  });
}

function buildGamePersistencePayload(updates) {
  const scheduledDate = updates.scheduledDate;
  const scheduledTime = updates.scheduledTime;
  const dateTbd = updates.dateTbd === true;
  const location = updates.location.trim();
  const opponent = updates.opponent.trim();

  if ((!dateTbd && (!scheduledDate || !scheduledTime)) || !location || !opponent) {
    return { error: "Location and match label are required, and dated matchups need a date and time." };
  }

  const teamScore = normalizeNullableNumber(updates.teamScore);
  const opponentScore = normalizeNullableNumber(updates.opponentScore);
  const scorePairIsIncomplete = (teamScore === null) !== (opponentScore === null);

  if (scorePairIsIncomplete) {
    return { error: "Enter both final scores or leave both score fields empty." };
  }

  const requestedStatus = normalizeMatchStatus(updates.matchStatus);
  if (dateTbd && requestedStatus === "completed") {
    return { error: "Set the real date and time before marking a matchup completed." };
  }
  if (requestedStatus === "completed" && (teamScore === null || opponentScore === null)) {
    return { error: "Completed matchups need both final scores." };
  }

  const matchStatus =
    requestedStatus === "completed" || (teamScore !== null && opponentScore !== null) ? "completed" : "scheduled";

  return {
    scheduledDate,
    scheduledTime,
    dateTbd,
    location,
    opponent,
    matchStatus,
    teamScore,
    opponentScore,
    result: deriveMatchResult(matchStatus, teamScore, opponentScore),
  };
}

async function beginAdminSignIn() {
  try {
    lastAuthFlowEvent = "Trying popup sign-in flow";
    refreshAdminSessionUi();
    setAdminStatus("Opening Google sign-in...", "warning");
    const result = await signInWithPopup(auth, googleProvider);
    lastAuthFlowEvent = `Popup sign-in completed for ${result.user.email ?? "unknown email"}`;
    refreshAdminSessionUi();
  } catch (error) {
    console.error(error);

    const fallbackCodes = new Set([
      "auth/popup-blocked",
      "auth/popup-closed-by-user",
      "auth/cancelled-popup-request",
      "auth/operation-not-supported-in-this-environment",
    ]);

    if (fallbackCodes.has(error.code)) {
      try {
        lastAuthFlowEvent = `Popup failed with ${error.code}; falling back to redirect`;
        refreshAdminSessionUi();
        setAdminStatus("Sign-in popup was blocked. Trying redirect sign-in...", "warning");
        await signInWithRedirect(auth, googleProvider);
        return;
      } catch (redirectError) {
        console.error(redirectError);
        lastAuthFlowEvent = `Redirect fallback failed with ${redirectError.code ?? "unknown error"}`;
        refreshAdminSessionUi();
        setAdminStatus("Sign-in could not start. Check the Firebase sign-in setup.", "error");
        return;
      }
    }

    lastAuthFlowEvent = `Popup sign-in failed with ${error.code ?? "unknown error"}`;
    refreshAdminSessionUi();
    setAdminStatus("Sign-in could not start. Check the Firebase sign-in setup.", "error");
  }
}

async function createNewsPost(updates) {
  if (!isApprovedAdmin) {
    setAdminStatus("Sign in first to publish news.", "error");
    return;
  }

  const normalized = buildNewsPersistencePayload(updates);
  if (normalized.error) {
    setAdminStatus(normalized.error, "error");
    return;
  }

  const postId = createNewsPostId();
  let uploadedImage = null;

  savingState = true;
  setAdminStatus("Publishing news post...", "warning");
  renderApp();

  try {
    if (normalized.imageFile) {
      uploadedImage = await uploadNewsImage(postId, normalized.imageFile);
    }

    await setDoc(doc(db, "newsPosts", postId), {
      title: normalized.title,
      body: normalized.body,
      linkUrl: normalized.linkUrl,
      imageUrl: uploadedImage?.imageUrl ?? "",
      imagePath: uploadedImage?.imagePath ?? "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByAdmin: normalizeEmail(adminUser?.email),
      updatedByAdmin: normalizeEmail(adminUser?.email),
    });
    setAdminStatus("", "");
  } catch (error) {
    console.error(error);

    if (uploadedImage?.imagePath) {
      try {
        await deleteNewsImageByPath(uploadedImage.imagePath);
      } catch (cleanupError) {
        console.error(cleanupError);
      }
    }

    setAdminStatus("Could not publish that news post right now.", "error");
  } finally {
    savingState = false;
    renderApp();
  }
}

async function updateNewsPost(post, updates) {
  if (!isApprovedAdmin) {
    setAdminStatus("Sign in first to edit news.", "error");
    return;
  }

  const normalized = buildNewsPersistencePayload(updates);
  if (normalized.error) {
    setAdminStatus(normalized.error, "error");
    return;
  }

  let uploadedImage = null;
  const shouldRemoveExistingImage = normalized.removeImage || Boolean(normalized.imageFile);

  savingState = true;
  setAdminStatus("Saving news post...", "warning");
  renderApp();

  try {
    if (normalized.imageFile) {
      uploadedImage = await uploadNewsImage(post.id, normalized.imageFile);
    }

    await updateDoc(doc(db, "newsPosts", post.id), {
      title: normalized.title,
      body: normalized.body,
      linkUrl: normalized.linkUrl,
      imageUrl: uploadedImage?.imageUrl ?? (shouldRemoveExistingImage ? "" : post.imageUrl),
      imagePath: uploadedImage?.imagePath ?? (shouldRemoveExistingImage ? "" : post.imagePath),
      updatedAt: serverTimestamp(),
      updatedByAdmin: normalizeEmail(adminUser?.email),
    });

    if (shouldRemoveExistingImage && post.imagePath) {
      await deleteNewsImageByPath(post.imagePath);
    }

    setAdminStatus("", "");
  } catch (error) {
    console.error(error);

    if (uploadedImage?.imagePath) {
      try {
        await deleteNewsImageByPath(uploadedImage.imagePath);
      } catch (cleanupError) {
        console.error(cleanupError);
      }
    }

    setAdminStatus("Could not save that news post right now.", "error");
  } finally {
    savingState = false;
    renderApp();
  }
}

async function deleteNewsPost(post) {
  if (!isApprovedAdmin) {
    setAdminStatus("Sign in first to delete news.", "error");
    return;
  }

  savingState = true;
  setAdminStatus("Deleting news post...", "warning");
  renderApp();

  try {
    await deleteDoc(doc(db, "newsPosts", post.id));

    if (post.imagePath) {
      await deleteNewsImageByPath(post.imagePath);
    }

    setAdminStatus("", "");
  } catch (error) {
    console.error(error);
    setAdminStatus("Could not delete that news post right now.", "error");
  } finally {
    savingState = false;
    renderApp();
  }
}

async function updateAttendance(gameId, playerId, status) {
  if (!playerId) {
    return;
  }

  const game = games.find((item) => item.id === gameId);
  if (game?.dateTbd) {
    setStatus("Availability is locked for this matchup until the date and time are set.", "warning");
    return;
  }

  savingState = true;
  renderApp();

  try {
    await updateDoc(doc(db, "games", gameId), {
      [`attendance.${playerId}`]: status,
      updatedAt: serverTimestamp(),
    });
    setStatus("", "");
  } catch (error) {
    console.error(error);
    setStatus(
      "Could not save availability to Firebase. Check Firestore rules and that the site is served over HTTP/HTTPS.",
      "error",
    );
  } finally {
    savingState = false;
    renderApp();
  }
}

async function updateGameRoster(gameId, rosterPlayerIds) {
  if (!isApprovedAdmin) {
    setAdminStatus("Sign in first to update matchup rosters.", "error");
    return;
  }

  const normalizedRosterPlayerIds = normalizeStringArray(rosterPlayerIds);
  const game = games.find((item) => item.id === gameId);

  savingState = true;
  renderApp();

  try {
    await updateDoc(doc(db, "games", gameId), {
      rosterPlayerIds: normalizedRosterPlayerIds,
      pairings: serializePairingsForFirestore(
        sanitizePairings(game?.pairings, normalizedRosterPlayerIds),
      ),
      updatedAt: serverTimestamp(),
      updatedByAdmin: normalizeEmail(adminUser?.email),
    });
    setAdminStatus("", "");
  } catch (error) {
    console.error(error);
    setAdminStatus("Could not save that roster selection right now.", "error");
  } finally {
    savingState = false;
    renderApp();
  }
}

async function updateGamePairings(gameId, pairings, rosterPlayerIds = null) {
  if (!isApprovedAdmin) {
    setAdminStatus("Sign in first to update matchup pairings.", "error");
    return;
  }

  const game = games.find((item) => item.id === gameId);
  const nextRosterPlayerIds = rosterPlayerIds ?? getRosterPlayerIds(game ?? {});

  savingState = true;
  renderApp();

  try {
    await updateDoc(doc(db, "games", gameId), {
      pairings: serializePairingsForFirestore(
        sanitizePairings(pairings, nextRosterPlayerIds),
      ),
      updatedAt: serverTimestamp(),
      updatedByAdmin: normalizeEmail(adminUser?.email),
    });
    setAdminStatus("", "");
  } catch (error) {
    console.error(error);
    setAdminStatus("Could not save those pairings right now.", "error");
  } finally {
    savingState = false;
    renderApp();
  }
}

async function updateGameDetails(gameId, updates) {
  if (!isApprovedAdmin) {
    setAdminStatus("Sign in first to update the schedule.", "error");
    return;
  }

  const normalized = buildGamePersistencePayload(updates);
  if (normalized.error) {
    setAdminStatus(normalized.error, "error");
    return;
  }

  savingState = true;
  setAdminStatus("Saving matchup details...", "warning");
  renderApp();

  try {
    await updateDoc(doc(db, "games", gameId), {
      ...(normalized.dateTbd
        ? {
            isoDate: "",
            dateLabel: "Date TBD",
            timeLabel: "Time TBD",
            dateTbd: true,
          }
        : {
            ...buildScheduleFields(normalized.scheduledDate, normalized.scheduledTime),
            dateTbd: false,
          }),
      location: normalized.location,
      opponent: normalized.opponent,
      matchStatus: normalized.matchStatus,
      teamScore: normalized.teamScore,
      opponentScore: normalized.opponentScore,
      result: normalized.result,
      completedAt: normalized.matchStatus === "completed" ? serverTimestamp() : null,
      completedByAdmin:
        normalized.matchStatus === "completed" ? normalizeEmail(adminUser?.email) : null,
      updatedAt: serverTimestamp(),
      updatedByAdmin: normalizeEmail(adminUser?.email),
    });
    setAdminStatus("", "");
  } catch (error) {
    console.error(error);
    setAdminStatus("Could not save those changes right now.", "error");
  } finally {
    savingState = false;
    renderApp();
  }
}

async function createGame(updates) {
  if (!isApprovedAdmin) {
    setAdminStatus("Sign in first to add a matchup.", "error");
    return;
  }

  const normalized = buildGamePersistencePayload(updates);
  if (normalized.error) {
    setAdminStatus(normalized.error, "error");
    return;
  }

  savingState = true;
  setAdminStatus("Creating matchup...", "warning");
  renderApp();

  const gameId = createGameId(normalized.scheduledDate, normalized.opponent, normalized.location);

  try {
    await setDoc(doc(db, "games", gameId), {
      id: gameId,
      ...(normalized.dateTbd
        ? {
            isoDate: "",
            dateLabel: "Date TBD",
            timeLabel: "Time TBD",
            dateTbd: true,
          }
        : {
            ...buildScheduleFields(normalized.scheduledDate, normalized.scheduledTime),
            dateTbd: false,
          }),
      location: normalized.location,
      opponent: normalized.opponent,
      attendance: createDefaultAttendance(),
      rosterPlayerIds: [],
      pairings: serializePairingsForFirestore(createEmptyPairings()),
      matchStatus: normalized.matchStatus,
      teamScore: normalized.teamScore,
      opponentScore: normalized.opponentScore,
      result: normalized.result,
      completedAt: normalized.matchStatus === "completed" ? serverTimestamp() : null,
      completedByAdmin:
        normalized.matchStatus === "completed" ? normalizeEmail(adminUser?.email) : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdByAdmin: normalizeEmail(adminUser?.email),
      updatedByAdmin: normalizeEmail(adminUser?.email),
    });
    setAdminStatus("New matchup created.", "success");
  } catch (error) {
    console.error(error);
    setAdminStatus("Could not create that matchup right now.", "error");
  } finally {
    savingState = false;
    renderApp();
  }
}

async function deleteGame(gameId, gameName) {
  if (!isApprovedAdmin) {
    setAdminStatus("Sign in first to delete a matchup.", "error");
    return;
  }

  savingState = true;
  setAdminStatus(`Deleting ${gameName}...`, "warning");
  renderApp();

  try {
    await deleteDoc(doc(db, "games", gameId));
    setAdminStatus("Matchup deleted.", "success");
  } catch (error) {
    console.error(error);
    setAdminStatus("Could not delete that matchup right now.", "error");
  } finally {
    savingState = false;
    renderApp();
  }
}

async function createPlayer(updates) {
  if (!isApprovedAdmin) {
    setAdminStatus("Sign in first to add a player.", "error");
    return;
  }

  const normalized = buildPlayerPersistencePayload(updates);
  if (normalized.error) {
    setAdminStatus(
      normalized.error === "First name and last name are required."
        ? "First name and last name are required to create a player."
        : normalized.error,
      "error",
    );
    return;
  }

  savingState = true;
  setAdminStatus("Creating player...", "warning");
  renderApp();

  try {
    const playerId = buildPlayerId(normalized.firstName, normalized.lastName);
    await setDoc(doc(db, "players", playerId), {
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      fullName: normalized.fullName,
      legacyNames: [normalized.fullName],
      active: true,
      dupr: normalized.dupr,
      skillLevel: normalized.skillLevel,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      updatedByAdmin: normalizeEmail(adminUser?.email),
    });
    setAdminStatus(`${normalized.fullName} was added to the roster.`, "success");
  } catch (error) {
    console.error(error);
    setAdminStatus("Could not add that player right now.", "error");
  } finally {
    savingState = false;
    renderApp();
  }
}

async function updatePlayer(player, updates) {
  if (!isApprovedAdmin) {
    setAdminStatus("Sign in first to edit a player.", "error");
    return;
  }

  const normalized = buildPlayerPersistencePayload(updates);
  if (normalized.error) {
    setAdminStatus(normalized.error, "error");
    return;
  }

  savingState = true;
  setAdminStatus("Saving player details...", "warning");
  renderApp();

  try {
    const legacyNames = Array.from(
      new Set([...(player.legacyNames ?? []), player.fullName, normalized.fullName]),
    );

    await updateDoc(doc(db, "players", player.id), {
      firstName: normalized.firstName,
      lastName: normalized.lastName,
      fullName: normalized.fullName,
      legacyNames,
      dupr: normalized.dupr,
      skillLevel: normalized.skillLevel,
      updatedAt: serverTimestamp(),
      updatedByAdmin: normalizeEmail(adminUser?.email),
    });
    setAdminStatus("", "");
  } catch (error) {
    console.error(error);
    setAdminStatus("Could not update that player right now.", "error");
  } finally {
    savingState = false;
    renderApp();
  }
}

async function setPlayerActiveState(playerId, active, fullName) {
  if (!isApprovedAdmin) {
    setAdminStatus("Sign in first to update the roster.", "error");
    return;
  }

  savingState = true;
  setAdminStatus(`${active ? "Reactivating" : "Deactivating"} ${fullName}...`, "warning");
  renderApp();

  try {
    await updateDoc(doc(db, "players", playerId), {
      active,
      updatedAt: serverTimestamp(),
      updatedByAdmin: normalizeEmail(adminUser?.email),
    });

    if (!active && selectedPlayerId === playerId) {
      selectedPlayerId = "";
    }

    setAdminStatus("", "");
  } catch (error) {
    console.error(error);
    setAdminStatus("Could not update that player right now.", "error");
  } finally {
    savingState = false;
    renderApp();
  }
}

async function initializeAdminAuth() {
  try {
    await setPersistence(auth, browserLocalPersistence);
    const redirectResult = await getRedirectResult(auth);
    if (redirectResult?.user) {
      lastAuthFlowEvent = `Redirect sign-in completed for ${redirectResult.user.email ?? "unknown email"}`;
    } else {
      lastAuthFlowEvent = "No redirect result was returned";
    }
  } catch (error) {
    console.error(error);
    lastAuthFlowEvent = `Redirect sign-in failed with ${error.code ?? "unknown error"}`;
    refreshAdminSessionUi();
    setAdminStatus("Google sign-in is not ready yet. Check the Firebase sign-in setup.", "error");
  }

  onAuthStateChanged(auth, async (user) => {
    adminUser = user;
    isApprovedAdmin = userIsApprovedAdmin(user);
    lastAuthStateEvent = user
      ? `Firebase auth state is signed in as ${user.email ?? "unknown email"}`
      : "Firebase auth state is signed out";
    refreshAdminSessionUi();

    if (isApprovedAdmin) {
      setAdminStatus("", "");
    } else if (user) {
      setAdminStatus(`${user.email} is signed in, but it is not an approved admin account.`, "error");
    } else {
      setAdminStatus("Sign in to make changes.", "");
    }

    renderApp();
  });
}

function bootstrapPlayersListener() {
  onSnapshot(
    collection(db, "players"),
    (snapshot) => {
      players = snapshot.docs
        .map(normalizePlayer)
        .sort((left, right) => {
          const lastNameCompare = left.lastName.localeCompare(right.lastName);
          if (lastNameCompare !== 0) {
            return lastNameCompare;
          }
          return left.firstName.localeCompare(right.firstName);
        });

      renderApp();
    },
    (error) => {
      console.error(error);
      setStatus("Could not load the player roster from Firebase.", "error");
    },
  );
}

function bootstrapGamesListener() {
  gamesCount.textContent = "0";
  setStatus("Connecting to Firebase and loading schedule...", "warning");

  onSnapshot(
    collection(db, "games"),
    (snapshot) => {
      games = snapshot.docs
        .map(normalizeGame)
        .sort(compareGamesForDisplay);

      gamesCount.textContent = String(games.length);
      setStatus("", "");
      renderApp();
    },
    (error) => {
      console.error(error);
      setStatus(
        "Firebase load failed. Make sure Firestore is enabled and your rules allow reads.",
        "error",
      );
    },
  );
}

function bootstrapNewsListener() {
  newsLoaded = false;
  newsLoadError = "";

  onSnapshot(
    collection(db, "newsPosts"),
    (snapshot) => {
      newsLoaded = true;
      newsLoadError = "";
      newsPosts = snapshot.docs.map(normalizeNewsPost).sort((left, right) => right.sortMs - left.sortMs);
      renderApp();
    },
    (error) => {
      console.error(error);
      newsLoaded = true;
      newsLoadError = "Could not load news from Firebase.";
      renderApp();
    },
  );
}

function renderApp() {
  updateViewUi();
  refreshAdminSessionUi();
  renderNewsView();
  renderPlayerSelect();
  renderMembersView();
  renderScheduleView();
  renderAvailabilityView();
  renderRosterView();
  renderTeamStandingView();
  renderAdminPairingsView();
  renderPlayersAdminControls();
  renderGamesAdminControls();
  renderNewsAdminControls();
}

if (navToggle) {
  navToggle.addEventListener("click", () => {
    setNavOpen(!navOpen);
  });
}

if (navOverlay) {
  navOverlay.addEventListener("click", () => {
    setNavOpen(false);
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && navOpen) {
    setNavOpen(false);
  }
});

navButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveView(button.dataset.viewTarget);
  });
});

if (adminSignIn) {
  adminSignIn.addEventListener("click", async () => {
    await beginAdminSignIn();
  });
}

if (adminSignOut) {
  adminSignOut.addEventListener("click", async () => {
    try {
      await signOut(auth);
      setAdminStatus("Signed out of admin access.", "");
    } catch (error) {
      console.error(error);
      setAdminStatus("Could not sign out right now.", "error");
    }
  });
}

if (playerSelect) {
  playerSelect.addEventListener("change", (event) => {
    selectedPlayerId = event.target.value;
    renderApp();
  });
}

availabilityTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    availabilityTab = button.dataset.availabilityTab === "summary" ? "summary" : "per-game";
    renderAvailabilityView();
  });
});

adminRosterTabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    adminRosterTab = button.dataset.adminRosterTab === "pairings" ? "pairings" : "roster";
    renderAdminPairingsView();
  });
});

if (gamesPrev) {
  gamesPrev.addEventListener("click", () => {
    if (gameBoardIndex > 0) {
      gameBoardIndex -= 1;
      renderAvailabilityView();
    }
  });
}

if (gamesNext) {
  gamesNext.addEventListener("click", () => {
    if (gameBoardIndex < games.length - 1) {
      gameBoardIndex += 1;
      renderAvailabilityView();
    }
  });
}

if (rosterPrev) {
  rosterPrev.addEventListener("click", () => {
    if (rosterBoardIndex > 0) {
      rosterBoardIndex -= 1;
      renderRosterView();
    }
  });
}

if (rosterNext) {
  rosterNext.addEventListener("click", () => {
    if (rosterBoardIndex < games.length - 1) {
      rosterBoardIndex += 1;
      renderRosterView();
    }
  });
}

if (pairingsAdminPrev) {
  pairingsAdminPrev.addEventListener("click", () => {
    if (pairingsAdminIndex > 0) {
      pairingsAdminIndex -= 1;
      renderAdminPairingsView();
    }
  });
}

if (pairingsAdminNext) {
  pairingsAdminNext.addEventListener("click", () => {
    if (pairingsAdminIndex < games.length - 1) {
      pairingsAdminIndex += 1;
      renderAdminPairingsView();
    }
  });
}

if (adminGamesPrev) {
  adminGamesPrev.addEventListener("click", () => {
    if (gameAdminIndex > 0) {
      gameAdminIndex -= 1;
      renderGamesAdminControls();
    }
  });
}

if (adminGamesNext) {
  adminGamesNext.addEventListener("click", () => {
    if (gameAdminIndex < games.length - 1) {
      gameAdminIndex += 1;
      renderGamesAdminControls();
    }
  });
}

if (playersAdminPrev) {
  playersAdminPrev.addEventListener("click", () => {
    if (playerAdminIndex > 0) {
      playerAdminIndex -= 1;
      renderPlayersAdminControls();
    }
  });
}

if (playersAdminNext) {
  playersAdminNext.addEventListener("click", () => {
    if (playerAdminIndex < players.length - 1) {
      playerAdminIndex += 1;
      renderPlayersAdminControls();
    }
  });
}

renderApp();
setAdminStatus("Sign in to make changes.", "");
bootstrapPlayersListener();
bootstrapGamesListener();
bootstrapNewsListener();
initializeAdminAuth();
