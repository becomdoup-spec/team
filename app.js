const STORAGE_KEY = "league-manager-state-v2";
const ADMIN_CODE = "1805";

const ROLE_META = {
  batsman: { label: "Batsman", priority: 1 },
  batting_allrounder: { label: "Batting Allrounder", priority: 2 },
  bowling_allrounder: { label: "Bowling Allrounder", priority: 3 },
  bowler: { label: "Bowler", priority: 4 }
};

const ROLE_ORDER = ["batsman", "batting_allrounder", "bowling_allrounder", "bowler"];

const dom = {
  registerForm: document.querySelector("#registerForm"),
  scheduleForm: document.querySelector("#scheduleForm"),
  lockBtn: document.querySelector("#lockBtn"),
  appMessage: document.querySelector("#appMessage"),
  heroMetrics: document.querySelector("#heroMetrics"),
  hypeText: document.querySelector("#hypeText"),
  fillProgress: document.querySelector("#fillProgress"),
  recentPlayers: document.querySelector("#recentPlayers"),
  teamAList: document.querySelector("#teamAList"),
  teamBList: document.querySelector("#teamBList"),
  jokerSlot: document.querySelector("#jokerSlot"),
  scheduleMeta: document.querySelector("#scheduleMeta"),
  scheduleList: document.querySelector("#scheduleList"),
  playerName: document.querySelector("#playerName"),
  playerContact: document.querySelector("#playerContact"),
  playerRole: document.querySelector("#playerRole"),
  oversInput: document.querySelector("#oversInput"),
  durationInput: document.querySelector("#durationInput"),
  roleModal: document.querySelector("#roleModal"),
  roleModalClose: document.querySelector("#roleModalClose"),
  roleModalPlayer: document.querySelector("#roleModalPlayer"),
  modalRoleForm: document.querySelector("#modalRoleForm"),
  modalContact: document.querySelector("#modalContact"),
  modalRole: document.querySelector("#modalRole"),
  adminToggleBtn: document.querySelector("#adminToggleBtn"),
  adminPanel: document.querySelector("#adminPanel"),
  adminCodeForm: document.querySelector("#adminCodeForm"),
  adminCodeInput: document.querySelector("#adminCodeInput"),
  adminActions: document.querySelector("#adminActions"),
  adminDeletePlayer: document.querySelector("#adminDeletePlayer"),
  adminDeleteBtn: document.querySelector("#adminDeleteBtn"),
  adminSwapA: document.querySelector("#adminSwapA"),
  adminSwapB: document.querySelector("#adminSwapB"),
  adminSwapBtn: document.querySelector("#adminSwapBtn"),
  adminMixupBtn: document.querySelector("#adminMixupBtn")
};

function createInitialState() {
  return {
    players: [],
    teamsLocked: false,
    teamsLockedAt: null,
    leagueStateId: null,
    teams: {
      teamA: [],
      teamB: [],
      joker: null,
      seed: null,
      generatedAt: null
    },
    schedule: {
      mode: "overs",
      overs: 10,
      duration: 60,
      bestOf: 3,
      generatedAt: null,
      matches: []
    }
  };
}

let state = createInitialState();
let supabaseClient = null;
let supabaseReady = false;
let adminUnlocked = false;
let activeRolePlayerId = null;
let syncChain = Promise.resolve();

void boot();

async function boot() {
  initializeValidationUX();
  bindEvents();
  await initializeSupabase();
  state = await loadInitialState();

  if (state.players.length > 1 && !state.teams.teamA.length && !state.teams.teamB.length) {
    state.teams = generateTeams(state.players);
  }

  hydrateScheduleInputs();
  render();
  setMessage(supabaseReady ? "Supabase connected. Ready to register players." : "Running in local mode. Ready to register players.", "success");
}

function bindEvents() {
  dom.registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormValidation(dom.registerForm);

    if (state.teamsLocked) {
      setMessage("Teams are locked. Registrations are closed.", "error");
      return;
    }

    const name = dom.playerName.value.trim();
    const contact = normalizeContact(dom.playerContact.value);
    const role = dom.playerRole.value;

    if (name.length < 2) {
      markFieldError(dom.playerName, "Enter at least 2 characters.");
      setMessage("Please fix the highlighted field.", "error");
      return;
    }

    if (!contact || contact.length < 10) {
      markFieldError(dom.playerContact, "Enter at least 10 digits.");
      setMessage("Please fix the highlighted field.", "error");
      return;
    }

    if (!ROLE_META[role]) {
      markFieldError(dom.playerRole, "Select a valid role.");
      setMessage("Please fix the highlighted field.", "error");
      return;
    }

    if (state.players.some((player) => player.contact === contact)) {
      markFieldError(dom.playerContact, "This contact is already registered.");
      setMessage("Please fix the highlighted field.", "error");
      return;
    }

    if (state.players.length >= 17) {
      setMessage("Maximum reached: 8 players per team plus one joker.", "error");
      return;
    }

    const now = new Date().toISOString();
    const player = {
      id: createId(),
      name,
      contact,
      role,
      createdAt: now,
      updatedAt: now
    };

    state.players.push(player);
    if (state.players.length > 1) {
      state.teams = generateTeams(state.players);
    }

    persistState();
    render();
    dom.registerForm.reset();
    setMessage(`${name} added to the draft pool.`, "success");
  });

  dom.teamAList.addEventListener("click", handlePlayerTileClick);
  dom.teamBList.addEventListener("click", handlePlayerTileClick);
  dom.jokerSlot.addEventListener("click", handlePlayerTileClick);

  dom.roleModalClose.addEventListener("click", closeRoleModal);
  dom.roleModal.addEventListener("click", (event) => {
    if (event.target === dom.roleModal) {
      closeRoleModal();
    }
  });

  dom.modalRoleForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormValidation(dom.modalRoleForm);

    if (!activeRolePlayerId) {
      closeRoleModal();
      return;
    }

    if (state.teamsLocked) {
      setMessage("Teams are locked, so role changes are disabled.", "error");
      return;
    }

    const player = state.players.find((entry) => entry.id === activeRolePlayerId);
    if (!player) {
      closeRoleModal();
      return;
    }

    const contact = normalizeContact(dom.modalContact.value);
    const role = dom.modalRole.value;

    if (!contact || contact.length < 10) {
      markFieldError(dom.modalContact, "Enter registered contact number.");
      setMessage("Please fix the highlighted field.", "error");
      return;
    }

    if (contact !== player.contact) {
      markFieldError(dom.modalContact, "Contact does not match this player.");
      setMessage("Please fix the highlighted field.", "error");
      return;
    }

    if (!ROLE_META[role]) {
      markFieldError(dom.modalRole, "Choose the new role.");
      setMessage("Please fix the highlighted field.", "error");
      return;
    }

    player.role = role;
    player.updatedAt = new Date().toISOString();

    if (state.players.length > 1) {
      state.teams = generateTeams(state.players);
    }

    persistState();
    render();
    closeRoleModal();
    setMessage(`Role updated for ${player.name}.`, "success");
  });

  dom.lockBtn.addEventListener("click", () => {
    if (state.players.length < 2) {
      setMessage("Add at least 2 players before locking teams.", "error");
      return;
    }

    if (state.teamsLocked) {
      setMessage("Teams are already locked.", "success");
      return;
    }

    state.teams = generateTeams(state.players);
    state.teamsLocked = true;
    state.teamsLockedAt = new Date().toISOString();

    persistState();
    render();
    setMessage("Teams finalized and locked.", "success");
  });

  dom.scheduleForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormValidation(dom.scheduleForm);

    const selectedMode = new FormData(dom.scheduleForm).get("scheduleMode");
    const overs = Number(dom.oversInput.value);
    const duration = Number(dom.durationInput.value);

    if (selectedMode === "overs" && (Number.isNaN(overs) || overs < 2 || overs > 30)) {
      markFieldError(dom.oversInput, "Overs must be between 2 and 30.");
      setMessage("Please fix the highlighted field.", "error");
      return;
    }

    if (selectedMode === "duration" && (Number.isNaN(duration) || duration < 20 || duration > 180)) {
      markFieldError(dom.durationInput, "Duration must be between 20 and 180 minutes.");
      setMessage("Please fix the highlighted field.", "error");
      return;
    }

    const matchDuration = selectedMode === "overs" ? estimateDurationFromOvers(overs) : duration;
    const bestOf = suggestBestOfSeries(state.players.length, matchDuration);

    state.schedule = {
      mode: selectedMode,
      overs: selectedMode === "overs" ? overs : null,
      duration: matchDuration,
      bestOf,
      generatedAt: new Date().toISOString(),
      matches: buildSchedule(bestOf, matchDuration)
    };

    persistState();
    renderSchedule();
    setMessage(`Schedule generated: best of ${bestOf}.`, "success");
  });

  dom.scheduleForm.addEventListener("change", () => {
    const selectedMode = new FormData(dom.scheduleForm).get("scheduleMode");
    const byOvers = selectedMode === "overs";
    dom.oversInput.disabled = !byOvers;
    dom.durationInput.disabled = byOvers;
    clearFieldError(byOvers ? dom.durationInput : dom.oversInput);
  });

  dom.adminToggleBtn.addEventListener("click", () => {
    dom.adminPanel.classList.toggle("hidden");
  });

  dom.adminCodeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    clearFormValidation(dom.adminCodeForm);

    if (dom.adminCodeInput.value.trim() !== ADMIN_CODE) {
      markFieldError(dom.adminCodeInput, "Incorrect code.");
      setMessage("Admin code is incorrect.", "error");
      return;
    }

    adminUnlocked = true;
    renderAdminState();
    setMessage("Admin tools unlocked.", "success");
  });

  dom.adminDeleteBtn.addEventListener("click", () => {
    if (!adminUnlocked) {
      setMessage("Unlock admin tools first.", "error");
      return;
    }

    const playerId = dom.adminDeletePlayer.value;
    if (!playerId) {
      setMessage("Select a player to delete.", "error");
      return;
    }

    const target = state.players.find((player) => player.id === playerId);
    state.players = state.players.filter((player) => player.id !== playerId);

    if (state.players.length > 1) {
      state.teams = generateTeams(state.players);
    } else {
      state.teams = createInitialState().teams;
      state.teamsLocked = false;
      state.teamsLockedAt = null;
    }

    persistState();
    render();
    setMessage(target ? `${target.name} deleted by admin.` : "Player deleted by admin.", "success");
  });

  dom.adminSwapBtn.addEventListener("click", () => {
    if (!adminUnlocked) {
      setMessage("Unlock admin tools first.", "error");
      return;
    }

    const playerA = dom.adminSwapA.value;
    const playerB = dom.adminSwapB.value;

    if (!playerA || !playerB || playerA === playerB) {
      setMessage("Select 2 different players to swap.", "error");
      return;
    }

    const swapped = swapPlayersInTeams(playerA, playerB);
    if (!swapped) {
      state.teams = generateTeams(state.players);
    }

    persistState();
    render();
    setMessage("Players swapped by admin.", "success");
  });

  dom.adminMixupBtn.addEventListener("click", () => {
    if (!adminUnlocked) {
      setMessage("Unlock admin tools first.", "error");
      return;
    }

    if (state.players.length < 2) {
      setMessage("Need at least 2 players to generate a mixup.", "error");
      return;
    }

    state.teams = generateTeams(state.players);
    persistState();
    render();
    setMessage("Team mixup complete.", "success");
  });
}

function handlePlayerTileClick(event) {
  const tile = event.target.closest("[data-player-id]");
  if (!tile) {
    return;
  }

  openRoleModal(tile.dataset.playerId);
}

function openRoleModal(playerId) {
  const player = state.players.find((entry) => entry.id === playerId);
  if (!player) {
    return;
  }

  activeRolePlayerId = playerId;
  dom.roleModalPlayer.textContent = `${player.name} (${ROLE_META[player.role]?.label || player.role})`;
  dom.modalContact.value = "";
  dom.modalRole.value = player.role;
  clearFormValidation(dom.modalRoleForm);
  dom.roleModal.classList.remove("hidden");
}

function closeRoleModal() {
  activeRolePlayerId = null;
  dom.roleModal.classList.add("hidden");
}

function swapPlayersInTeams(playerAId, playerBId) {
  const slotA = locatePlayerSlot(playerAId);
  const slotB = locatePlayerSlot(playerBId);

  if (!slotA || !slotB) {
    return false;
  }

  const playerA = getSlotPlayer(slotA);
  const playerB = getSlotPlayer(slotB);

  setSlotPlayer(slotA, playerB);
  setSlotPlayer(slotB, playerA);

  return true;
}

function locatePlayerSlot(playerId) {
  const indexA = state.teams.teamA.findIndex((player) => player.id === playerId);
  if (indexA !== -1) {
    return { bucket: "teamA", index: indexA };
  }

  const indexB = state.teams.teamB.findIndex((player) => player.id === playerId);
  if (indexB !== -1) {
    return { bucket: "teamB", index: indexB };
  }

  if (state.teams.joker && state.teams.joker.id === playerId) {
    return { bucket: "joker", index: 0 };
  }

  return null;
}

function getSlotPlayer(slot) {
  if (slot.bucket === "joker") {
    return state.teams.joker;
  }
  return state.teams[slot.bucket][slot.index];
}

function setSlotPlayer(slot, player) {
  if (slot.bucket === "joker") {
    state.teams.joker = player;
    return;
  }

  state.teams[slot.bucket][slot.index] = player;
}

function generateTeams(players) {
  if (players.length < 2) {
    return createInitialState().teams;
  }

  if (players.length > 17) {
    throw new Error("Team capacity exceeded. Maximum allowed is 17 players including joker.");
  }

  const seed = Date.now() + Math.floor(Math.random() * 1000);
  const rng = mulberry32(seed);
  const orderedPool = buildRoleOrderedPool(players, rng);

  let joker = null;
  if (orderedPool.length % 2 === 1) {
    const jokerIndex = Math.floor(rng() * orderedPool.length);
    joker = orderedPool.splice(jokerIndex, 1)[0];
  }

  const splitSize = orderedPool.length / 2;
  if (splitSize > 8) {
    throw new Error("Each team can have a maximum of 8 players.");
  }

  const teamA = [];
  const teamB = [];
  orderedPool.forEach((player, index) => {
    if (teamA.length >= splitSize) {
      teamB.push(player);
      return;
    }
    if (teamB.length >= splitSize) {
      teamA.push(player);
      return;
    }

    if (index % 2 === 0) {
      teamA.push(player);
    } else {
      teamB.push(player);
    }
  });

  return {
    teamA: sortLineup(teamA),
    teamB: sortLineup(teamB),
    joker,
    seed,
    generatedAt: new Date().toISOString()
  };
}

function buildRoleOrderedPool(players, rng) {
  const grouped = ROLE_ORDER.reduce((accumulator, role) => {
    accumulator[role] = [];
    return accumulator;
  }, {});

  players.forEach((player) => {
    grouped[player.role].push(player);
  });

  const ordered = [];
  ROLE_ORDER.forEach((role) => {
    const shuffled = shuffle([...grouped[role]], rng);
    ordered.push(...shuffled);
  });

  return ordered;
}

function sortLineup(players) {
  return [...players].sort((playerA, playerB) => {
    const diff = ROLE_META[playerA.role].priority - ROLE_META[playerB.role].priority;
    if (diff !== 0) {
      return diff;
    }
    return playerA.name.localeCompare(playerB.name);
  });
}

function estimateDurationFromOvers(overs) {
  return Math.round(overs * 4 + 18);
}

function suggestBestOfSeries(playerCount, matchDuration) {
  let preferred = 3;

  if (playerCount >= 10 && playerCount < 15) {
    preferred = 5;
  }
  if (playerCount >= 15) {
    preferred = 7;
  }

  if (matchDuration > 110) {
    preferred = Math.min(preferred, 3);
  }

  if (matchDuration > 150) {
    preferred = 1;
  }

  return preferred;
}

function buildSchedule(bestOf, durationMinutes) {
  const breakMinutes = 12;
  const matches = [];

  let cursor = getNextStartWindow();
  for (let index = 1; index <= bestOf; index += 1) {
    cursor = fitWithinWindow(cursor, durationMinutes);

    const start = new Date(cursor);
    const end = new Date(start.getTime() + durationMinutes * 60 * 1000);

    matches.push({
      matchNo: index,
      startISO: start.toISOString(),
      endISO: end.toISOString()
    });

    cursor = new Date(end.getTime() + breakMinutes * 60 * 1000);
  }

  return matches;
}

function getNextStartWindow() {
  const now = new Date();
  const start = new Date(now);

  if (now.getHours() >= 17) {
    start.setDate(start.getDate() + 1);
  }

  start.setHours(17, 0, 0, 0);
  return start;
}

function fitWithinWindow(candidateStart, durationMinutes) {
  const start = new Date(candidateStart);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const windowClose = new Date(start);
  windowClose.setHours(20, 0, 0, 0);

  if (end > windowClose) {
    start.setDate(start.getDate() + 1);
    start.setHours(17, 0, 0, 0);
  }

  return start;
}

function render() {
  renderMetrics();
  renderHypePanel();
  renderTeams();
  renderSchedule();
  renderLockedState();
  renderAdminOptions();
  renderAdminState();
}

function renderMetrics() {
  const total = state.players.length;

  dom.heroMetrics.innerHTML = [
    metricChip(`Total Players: ${total}`),
    metricChip(`Team A: ${state.teams.teamA.length}`),
    metricChip(`Team B: ${state.teams.teamB.length}`),
    metricChip(`Joker: ${state.teams.joker ? "Yes" : "No"}`)
  ].join("");
}

function renderHypePanel() {
  const total = state.players.length;
  const progressMax = 16;
  const progress = Math.min(100, Math.round((total / progressMax) * 100));
  dom.fillProgress.style.width = `${progress}%`;

  if (total === 0) {
    dom.hypeText.textContent = "Start adding players and build the matchup.";
  } else if (total % 2 === 0) {
    dom.hypeText.textContent = `Great rhythm. ${total} players means a perfect equal split.`;
  } else {
    dom.hypeText.textContent = `${total} players added. Next one balances teams, current extra becomes Joker.`;
  }

  const recent = [...state.players]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  dom.recentPlayers.innerHTML = recent.length
    ? recent
        .map((player) => `<li>${escapeHtml(player.name)} - ${ROLE_META[player.role].label}</li>`)
        .join("")
    : "<li>No players yet.</li>";
}

function metricChip(text) {
  return `<span class="metric-chip">${text}</span>`;
}

function renderTeams() {
  dom.teamAList.innerHTML = renderLineup(state.teams.teamA);
  dom.teamBList.innerHTML = renderLineup(state.teams.teamB);

  if (!state.teams.joker) {
    dom.jokerSlot.innerHTML = '<div class="joker-slot-empty">No joker assigned</div>';
  } else {
    dom.jokerSlot.innerHTML = renderPlayerTile(state.teams.joker, 1, true);
  }
}

function renderLineup(players) {
  if (!players.length) {
    return '<li class="lineup-item"><div class="player-tile">No players allocated yet.</div></li>';
  }

  return players
    .map((player, index) => `<li class="lineup-item">${renderPlayerTile(player, index + 1, false)}</li>`)
    .join("");
}

function renderPlayerTile(player, index, isJoker) {
  const roleLabel = ROLE_META[player.role]?.label || player.role;
  const badgeClass = `role-${player.role}`;
  return `
    <button class="player-tile" type="button" data-player-id="${player.id}">
      <span class="player-left">
        <span class="player-index">${isJoker ? "J" : index}</span>
        <span class="player-name">${escapeHtml(player.name)}</span>
      </span>
      <span class="role-badge ${badgeClass}">${escapeHtml(roleLabel)}</span>
    </button>
  `;
}

function renderSchedule() {
  const schedule = state.schedule;
  if (!schedule || !schedule.matches.length) {
    dom.scheduleMeta.textContent = "No schedule generated yet.";
    dom.scheduleList.innerHTML = "";
    return;
  }

  const modeText = schedule.mode === "overs" ? `${schedule.overs} overs` : `${schedule.duration} min`;
  dom.scheduleMeta.textContent = `Best of ${schedule.bestOf} | Mode: ${modeText} | Match duration: ${schedule.duration} min`;

  dom.scheduleList.innerHTML = schedule.matches
    .map((match) => {
      const start = new Date(match.startISO);
      const end = new Date(match.endISO);
      return `<li>Match ${match.matchNo}: ${start.toLocaleString([], {
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit"
      })} - ${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</li>`;
    })
    .join("");
}

function renderLockedState() {
  const disabled = state.teamsLocked;
  const registerFields = [dom.playerName, dom.playerContact, dom.playerRole, dom.registerForm.querySelector("button")];

  registerFields.forEach((field) => {
    field.disabled = disabled;
  });

  dom.lockBtn.textContent = disabled ? "Teams Locked" : "Finalize & Lock Teams";
  dom.lockBtn.disabled = disabled;
}

function renderAdminOptions() {
  const options = ["<option value=''>Select</option>"];
  state.players.forEach((player) => {
    options.push(`<option value="${player.id}">${escapeHtml(player.name)} (${ROLE_META[player.role].label})</option>`);
  });

  const html = options.join("");
  dom.adminDeletePlayer.innerHTML = html;
  dom.adminSwapA.innerHTML = html;
  dom.adminSwapB.innerHTML = html;
}

function renderAdminState() {
  dom.adminActions.classList.toggle("hidden", !adminUnlocked);
  dom.adminCodeInput.disabled = adminUnlocked;
  dom.adminCodeForm.querySelector("button").disabled = adminUnlocked;
}

function hydrateScheduleInputs() {
  const mode = state.schedule.mode === "duration" ? "duration" : "overs";
  const selectedModeInput = dom.scheduleForm.querySelector(`input[name="scheduleMode"][value="${mode}"]`);
  if (selectedModeInput) {
    selectedModeInput.checked = true;
  }

  dom.oversInput.value = Number.isFinite(state.schedule.overs) ? state.schedule.overs : 10;
  dom.durationInput.value = Number.isFinite(state.schedule.duration) ? state.schedule.duration : 60;
  dom.oversInput.disabled = mode !== "overs";
  dom.durationInput.disabled = mode === "overs";
}

function setMessage(text, type = "") {
  dom.appMessage.textContent = text;
  dom.appMessage.classList.remove("success", "error");
  if (type) {
    dom.appMessage.classList.add(type);
  }
}

function initializeValidationUX() {
  const fields = document.querySelectorAll("input, select");
  fields.forEach((field) => {
    field.addEventListener("input", () => clearFieldError(field));
    field.addEventListener("change", () => clearFieldError(field));
  });
}

function clearFormValidation(form) {
  const fields = form.querySelectorAll("input, select");
  fields.forEach((field) => clearFieldError(field));
}

function markFieldError(field, message) {
  if (!field) {
    return;
  }

  field.classList.add("is-invalid");
  field.setAttribute("aria-invalid", "true");

  const label = field.closest("label");
  if (label) {
    let errorNode = label.querySelector(".validation-error");
    if (!errorNode) {
      errorNode = document.createElement("small");
      errorNode.className = "validation-error";
      label.appendChild(errorNode);
    }
    errorNode.textContent = message;
  }

  field.focus();
}

function clearFieldError(field) {
  if (!field) {
    return;
  }

  field.classList.remove("is-invalid");
  field.removeAttribute("aria-invalid");

  const label = field.closest("label");
  const errorNode = label?.querySelector(".validation-error");
  if (errorNode) {
    errorNode.remove();
  }
}

function persistState() {
  persistLocalState(state);
  queueSupabaseSync();
}

function persistLocalState(inputState) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(inputState));
}

function loadLocalState() {
  const fallback = createInitialState();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return fallback;
    }

    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      ...parsed,
      players: Array.isArray(parsed.players) ? parsed.players : [],
      teams: sanitizeTeams(parsed.teams),
      schedule: sanitizeSchedule(parsed.schedule)
    };
  } catch (error) {
    console.error("Unable to read saved state", error);
    return fallback;
  }
}

function sanitizeTeams(rawTeams) {
  const fallback = createInitialState().teams;
  if (!rawTeams || typeof rawTeams !== "object") {
    return fallback;
  }

  return {
    teamA: Array.isArray(rawTeams.teamA) ? rawTeams.teamA : [],
    teamB: Array.isArray(rawTeams.teamB) ? rawTeams.teamB : [],
    joker: rawTeams.joker && typeof rawTeams.joker === "object" ? rawTeams.joker : null,
    seed: rawTeams.seed || null,
    generatedAt: rawTeams.generatedAt || null
  };
}

function sanitizeSchedule(rawSchedule) {
  const fallback = createInitialState().schedule;
  if (!rawSchedule || typeof rawSchedule !== "object") {
    return fallback;
  }

  return {
    ...fallback,
    ...rawSchedule,
    matches: Array.isArray(rawSchedule.matches) ? rawSchedule.matches : []
  };
}

async function initializeSupabase() {
  try {
    const [{ createClient }, configModule] = await Promise.all([
      import("https://esm.sh/@supabase/supabase-js@2"),
      import("./config.js")
    ]);

    const url = configModule.SUPABASE_URL;
    const key = configModule.SUPABASE_ANON_KEY || configModule.SUPABASE_LEGACY_ANON_KEY;

    if (!url || !key) {
      return;
    }

    supabaseClient = createClient(url, key);
    supabaseReady = true;
  } catch (error) {
    console.warn("Supabase client not initialized. Local mode enabled.", error);
    supabaseReady = false;
  }
}

async function loadInitialState() {
  const localState = loadLocalState();
  if (!supabaseReady) {
    return localState;
  }

  try {
    const [playersResponse, leagueResponse] = await Promise.all([
      supabaseClient.from("players").select("*").order("created_at", { ascending: true }),
      supabaseClient.from("league_state").select("*").order("updated_at", { ascending: false }).limit(1)
    ]);

    if (playersResponse.error) {
      throw playersResponse.error;
    }

    if (leagueResponse.error) {
      throw leagueResponse.error;
    }

    const merged = {
      ...createInitialState(),
      ...localState,
      players: Array.isArray(playersResponse.data) ? playersResponse.data.map(mapPlayerRowToState) : []
    };

    const remoteLeague = Array.isArray(leagueResponse.data) ? leagueResponse.data[0] : null;
    if (remoteLeague) {
      merged.leagueStateId = remoteLeague.id;
      merged.teamsLocked = Boolean(remoteLeague.teams_locked);
      merged.teamsLockedAt = remoteLeague.teams_locked_at || null;
      merged.teams = sanitizeTeams(remoteLeague.teams);
      merged.schedule = sanitizeSchedule(remoteLeague.schedule);
    }

    persistLocalState(merged);
    return merged;
  } catch (error) {
    console.warn("Supabase load failed. Falling back to local state.", error);
    return localState;
  }
}

function queueSupabaseSync() {
  if (!supabaseReady) {
    return;
  }

  const snapshot = deepClone(state);

  syncChain = syncChain
    .then(() => syncSnapshotToSupabase(snapshot))
    .catch((error) => {
      console.error("Supabase sync failed", error);
      setMessage("Saved locally. Supabase sync failed.", "error");
    });
}

async function syncSnapshotToSupabase(snapshot) {
  const { error: wipeError } = await supabaseClient.from("players").delete().not("id", "is", null);
  if (wipeError) {
    throw wipeError;
  }

  const playerRows = snapshot.players.map(mapPlayerStateToRow);
  if (playerRows.length) {
    const { error: insertError } = await supabaseClient.from("players").insert(playerRows);
    if (insertError) {
      throw insertError;
    }
  }

  const payload = {
    teams_locked: snapshot.teamsLocked,
    teams_locked_at: snapshot.teamsLockedAt,
    teams: snapshot.teams,
    schedule: snapshot.schedule
  };

  const effectiveLeagueStateId = snapshot.leagueStateId || state.leagueStateId;
  if (effectiveLeagueStateId) {
    const { error: upsertError } = await supabaseClient
      .from("league_state")
      .upsert({ id: effectiveLeagueStateId, ...payload }, { onConflict: "id" });

    if (upsertError) {
      throw upsertError;
    }

    return;
  }

  const { data, error: insertLeagueError } = await supabaseClient
    .from("league_state")
    .insert(payload)
    .select("id")
    .single();

  if (insertLeagueError) {
    throw insertLeagueError;
  }

  if (data?.id) {
    state.leagueStateId = data.id;
    persistLocalState(state);
  }
}

function mapPlayerStateToRow(player) {
  return {
    id: player.id,
    name: player.name,
    contact: player.contact,
    role: player.role,
    created_at: player.createdAt,
    updated_at: player.updatedAt
  };
}

function mapPlayerRowToState(row) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact,
    role: row.role,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function shuffle(collection, rng) {
  for (let index = collection.length - 1; index > 0; index -= 1) {
    const target = Math.floor(rng() * (index + 1));
    [collection[index], collection[target]] = [collection[target], collection[index]];
  }
  return collection;
}

function mulberry32(seed) {
  let value = seed;
  return function random() {
    value += 0x6d2b79f5;
    let result = Math.imul(value ^ (value >>> 15), value | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function normalizeContact(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function escapeHtml(text) {
  const span = document.createElement("span");
  span.innerText = text;
  return span.innerHTML;
}

function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `player-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
