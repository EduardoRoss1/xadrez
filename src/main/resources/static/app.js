const API = '';
console.log('[app] app.js loaded');

const persistentStorage = window.localStorage;
const sessionStorage = window.sessionStorage;

const USER_STORAGE_KEY = 'xadrezUser';
const MATCH_STORAGE_KEY = 'xadrezMatchId';
const SIMULATION_STORAGE_KEY = 'xadrezSimulation';
const VIEW_STORAGE_KEY = 'xadrezView';
const SEARCHING_STORAGE_KEY = 'xadrezSearching';
const HIGH_CONTRAST_STORAGE_KEY = 'xadrezHighContrast';

const PROTECTED_VIEWS = ['profile', 'users', 'lobby', 'game'];
const VALID_VIEWS = ['home', 'login', 'register', ...PROTECTED_VIEWS];
const USERS_TAB_USERNAME = 'demo';
const VIEW_NAMES = {
  home: 'Início', login: 'Login', register: 'Cadastro', profile: 'Perfil',
  users: 'Usuários ativos', lobby: 'Jogar', game: 'Partida'
};

function migrateLegacyStorage() {
  const legacyUser = sessionStorage.getItem(USER_STORAGE_KEY);
  if (legacyUser != null && persistentStorage.getItem(USER_STORAGE_KEY) == null) {
    persistentStorage.setItem(USER_STORAGE_KEY, legacyUser);
  }
  sessionStorage.removeItem(USER_STORAGE_KEY);

  [MATCH_STORAGE_KEY, SIMULATION_STORAGE_KEY].forEach(key => {
    const persisted = persistentStorage.getItem(key);
    const sessionValue = sessionStorage.getItem(key);
    if (persisted == null && sessionValue != null) {
      persistentStorage.setItem(key, sessionValue);
    } else if (persisted != null && sessionValue == null) {
      sessionStorage.setItem(key, persisted);
    }
  });
}

function readSessionValue(key) {
  return sessionStorage.getItem(key);
}

function writeSessionValue(key, value) {
  if (value == null) {
    sessionStorage.removeItem(key);
    return;
  }
  sessionStorage.setItem(key, value);
}

function readMatchValue(key) {
  return persistentStorage.getItem(key) ?? sessionStorage.getItem(key);
}

function writeMatchValue(key, value) {
  if (value == null) {
    persistentStorage.removeItem(key);
    sessionStorage.removeItem(key);
    return;
  }
  persistentStorage.setItem(key, value);
  sessionStorage.setItem(key, value);
}

function readStoredUser() {
  try {
    return JSON.parse(persistentStorage.getItem(USER_STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

migrateLegacyStorage();

function applyHighContrast(enabled) {
  document.body.classList.toggle('high-contrast', enabled);
  const btn = document.getElementById('highContrastToggle');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(enabled));
  btn.textContent = enabled ? 'Contraste normal' : 'Alto contraste';
  btn.setAttribute(
    'aria-label',
    enabled ? 'Desativar alto contraste' : 'Ativar alto contraste'
  );
}

function initHighContrastToggle() {
  const saved = persistentStorage.getItem(HIGH_CONTRAST_STORAGE_KEY) === 'true';
  applyHighContrast(saved);

  const btn = document.getElementById('highContrastToggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const enabled = !document.body.classList.contains('high-contrast');
    applyHighContrast(enabled);
    persistentStorage.setItem(HIGH_CONTRAST_STORAGE_KEY, String(enabled));
  });
}

initHighContrastToggle();
window.Narrator?.init();

// Fala um aviso quando a narração por voz está ativa (sem efeito caso contrário).
function narrate(text, options) {
  window.Narrator?.announce(text, options);
}

let currentUser = null;
let currentMatchId = readMatchValue(MATCH_STORAGE_KEY) || null;
let simulationMode = readMatchValue(SIMULATION_STORAGE_KEY) === 'true';
let selectedSource = null;
let possibleTargets = new Set();
let currentTurnColor = null;
let boardPolling = null;
let moveInProgress = false;
let lastOpponentMove = null;
const computerDifficultyNames = { EASY: 'Fácil', MEDIUM: 'Médio', HARD: 'Difícil' };
let matchmakingPolling = null;
let presencePolling = null;
let pieceColorsByPosition = {};
let pieceLettersByPosition = {};
let pendingPromotionResolver = null;
let activeMatch = null;

const views = {
  home: document.getElementById('homeView'),
  login: document.getElementById('loginView'),
  register: document.getElementById('registerView'),
  profile: document.getElementById('profileView'),
  users: document.getElementById('usersView'),
  lobby: document.getElementById('lobbyView'),
  game: document.getElementById('gameView'),
};

const whiteSprites = {
  K: '/sprites/w-king.png',
  Q: '/sprites/w-queen.png',
  R: '/sprites/w-rook.png',
  B: '/sprites/w-bishop.png',
  N: '/sprites/w-knight.png',
  P: '/sprites/w-pawn.png'
};

const blackSprites = {
  K: '/sprites/b-king.png',
  Q: '/sprites/b-queen.png',
  R: '/sprites/b-rook.png',
  B: '/sprites/b-bishop.png',
  N: '/sprites/b-knight.png',
  P: '/sprites/b-pawn.png'
};

function normalizeAlertMessage(message) {
  if (!message) return 'Ocorreu um erro inesperado.';

  const raw = String(message).trim();
  const lowered = raw.toLowerCase();

  const exactTranslations = {
    'invalid move.': 'Movimento inválido.',
    'invalid move': 'Movimento inválido.',
    'match not found.': 'Partida não encontrada.',
    'match not found': 'Partida não encontrada.',
    'user not found.': 'Usuário não encontrado.',
    'user not found': 'Usuário não encontrado.',
    'match not found.': 'Partida não encontrada.',
    'match not found': 'Partida não encontrada.',
    'resource not found.': 'Recurso não encontrado na API. Reinicie o servidor se acabou de atualizar o projeto.',
    'resource not found': 'Recurso não encontrado na API. Reinicie o servidor se acabou de atualizar o projeto.',
    'forbidden.': 'Ação não permitida.',
    'forbidden': 'Ação não permitida.',
    'unauthorized.': 'Não autorizado.',
    'unauthorized': 'Não autorizado.',
    'bad request.': 'Requisição inválida.',
    'bad request': 'Requisição inválida.',
    'internal server error.': 'Erro interno no servidor.',
    'internal server error': 'Erro interno no servidor.',
    'already in checkmate.': 'A partida já está em xeque-mate.',
    'already in checkmate': 'A partida já está em xeque-mate.',
    'checkmate.': 'Xeque-mate.',
    'checkmate': 'Xeque-mate.',
    'check.': 'Xeque.',
    'check': 'Xeque.',
    'source position is empty.': 'A casa de origem está vazia.',
    'source position is empty': 'A casa de origem está vazia.',
    'there is no possible moves for this piece.': 'Não há movimentos possíveis para esta peça.',
    'there is no possible moves for this piece': 'Não há movimentos possíveis para esta peça.',
    'you can not put yourself in check.': 'Você não pode se colocar em xeque.',
    'you can not put yourself in check': 'Você não pode se colocar em xeque.',
    'promotion piece type is required.': 'Escolha a peça para a promoção.',
    'promotion piece type is required': 'Escolha a peça para a promoção.',
    'not your turn.': 'Aguarde seu turno.',
    'not your turn': 'Aguarde seu turno.',
    'you are not part of this match.': 'Você não participa desta partida.',
    'you are not part of this match': 'Você não participa desta partida.',
    "it's not possible to promote to this type of piece": 'Peça de promoção inválida.',
    'invalid username or password.': 'Usuário ou senha inválidos.',
    'invalid username or password': 'Usuário ou senha inválidos.',
    'username already exists.': 'Nome de usuário já existe.',
    'username already exists': 'Nome de usuário já existe.',
    'username must have at least 3 characters.': 'O nome de usuário deve ter pelo menos 3 caracteres.',
    'username must have at least 3 characters': 'O nome de usuário deve ter pelo menos 3 caracteres.',
    'password must have at least 3 characters.': 'A senha deve ter pelo menos 3 caracteres.',
    'password must have at least 3 characters': 'A senha deve ter pelo menos 3 caracteres.',
    'match already finished': 'Esta partida já foi finalizada.',
    'match already finished.': 'Esta partida já foi finalizada.',
    'finished match state is unavailable': 'Estado da partida finalizada indisponível.',
    'finished match state is unavailable.': 'Estado da partida finalizada indisponível.',
    'cannot delete admin account.': 'Não é possível excluir a conta de administrador.',
    'cannot delete admin account': 'Não é possível excluir a conta de administrador.',
    'cannot delete user while match history still exists.': 'Não foi possível excluir o usuário por causa do histórico de partidas.',
    'cannot delete user while match history still exists': 'Não foi possível excluir o usuário por causa do histórico de partidas.',
    'cannot rename admin account': 'Não é possível renomear a conta de administrador.',
    'a player cannot play against themselves': 'Escolha dois jogadores diferentes.',
    'username must have at most 64 characters': 'O nome de usuário deve ter no máximo 64 caracteres.',
    'password must have at most 128 characters': 'A senha deve ter no máximo 128 caracteres.',
    'invalid or missing request body': 'Requisição inválida.',
    'cannot surrender simulation match': 'Não é possível desistir de uma partida de simulação.'
  };

  // Mensagens exatas do motor de xadrez (ChessMatch), que antes apareciam em inglês.
  const engineTranslations = {
    'there is no piece on source position': 'Não há peça na casa de origem.',
    'there is no possible move for this piece': 'Não há movimentos possíveis para esta peça.',
    'the chosen piece can\'t move into this position': 'A peça escolhida não pode ir para essa casa.',
    'you can\'t put yourself in check': 'Esse lance deixaria seu rei em xeque.',
    'you must make a move that removes the check': 'Seu rei está em xeque. Faça um lance que o proteja.',
    'cannot castle through check': 'Não é possível fazer o roque passando por uma casa atacada.',
    'promotion piece type is required: q, r, b or n': 'Escolha a peça para a promoção.',
  };
  if (engineTranslations[lowered]) return engineTranslations[lowered];
  if (lowered.startsWith('this is not a white piece')) return 'Essa peça não é sua: é a vez das brancas.';
  if (lowered.startsWith('this is not a black piece')) return 'Essa peça não é sua: é a vez das pretas.';
  if (lowered.startsWith('there is already a')) return 'Já existe uma peça sua nessa casa.';
  if (lowered.startsWith('invalid chess position')) return 'Casa inválida no tabuleiro.';

  if (exactTranslations[lowered]) {
    return exactTranslations[lowered];
  }

  if (lowered.includes('invalid') && lowered.includes('move')) return 'Movimento inválido.';
  if (lowered.includes('not found')) return 'Registro não encontrado.';
  if (lowered.includes('unauthorized')) return 'Não autorizado.';
  if (lowered.includes('forbidden')) return 'Ação não permitida.';
  if (lowered.includes('already') && lowered.includes('exists')) return 'Registro já existe.';
  if (lowered.includes('required')) return 'Preencha os dados obrigatórios.';
  if (lowered.includes('password') && lowered.includes('at least 3')) return 'A senha deve ter pelo menos 3 caracteres.';
  if (lowered.includes('username') && lowered.includes('at least 3')) return 'O nome de usuário deve ter pelo menos 3 caracteres.';
  if (lowered.includes('username') && lowered.includes('invalid')) return 'Usuário ou senha inválidos.';
  if (lowered.includes('username') && lowered.includes('already exists')) return 'Nome de usuário já existe.';

  return raw;
}

let alertTimer = null;

function showAlert(message) {
  const alert = document.getElementById('alert');
  alert.textContent = normalizeAlertMessage(message);
  alert.classList.remove('hidden');
  narrate(alert.textContent);
  // Reinicia o tempo: sem isso, o timer de um alerta anterior esconde o novo antes da hora.
  clearTimeout(alertTimer);
  alertTimer = setTimeout(() => alert.classList.add('hidden'), 4500);
}

// Escapa texto vindo do servidor (ex.: nomes de usuário) antes de usar em innerHTML.
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(API + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
  } catch (error) {
    throw new Error('Não foi possível conectar ao servidor. Verifique se a aplicação está em execução.');
  }

  if (response.status === 204) {
    return null;
  }

  const contentType = response.headers.get('content-type') || '';
  let data = null;
  if (contentType.includes('application/json')) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    if (data && typeof data === 'object' && !data.error && !data.message) {
      const fieldError = Object.values(data).find(value => typeof value === 'string');
      if (fieldError) {
        throw new Error(fieldError);
      }
    }

    const message = data?.error || data?.message || 'Erro ao comunicar com a API.';
    throw new Error(message);
  }

  return data;
}

function setUser(user) {
  currentUser = user;

  if (user) {
    persistentStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    startPresencePolling();
  } else {
    persistentStorage.removeItem(USER_STORAGE_KEY);
    stopPresencePolling();
  }

  updateSessionUI();
}

function clearMatchState() {
  lastOpponentMove = null;
  currentMatchId = null;
  simulationMode = false;
  activeMatch = null;
  writeMatchValue(MATCH_STORAGE_KEY, null);
  writeMatchValue(SIMULATION_STORAGE_KEY, null);
}

function getMatchRequestUserId() {
  if (simulationMode) return null;
  return currentUser?.id ?? null;
}

function buildMatchUserQuery() {
  const userId = getMatchRequestUserId();
  return userId ? `?userId=${userId}` : '';
}

function resolvePlayerColor(match) {
  if (!match || !currentUser?.id || simulationMode) return null;

  const userId = Number(currentUser.id);
  if (Number(match.playerWhiteId) === userId) return 'white';
  if (Number(match.playerBlackId) === userId) return 'black';
  return null;
}

function formatPlayerColorMessage(color) {
  if (color === 'white') return 'Você joga com as peças brancas e inicia a partida.';
  if (color === 'black') return 'Você joga com as peças pretas.';
  return '';
}

function updateGamePanel(match = activeMatch, options = {}) {
  const computerInfo = document.getElementById('computerMatchInfo');
  if (computerInfo) {
    computerInfo.classList.toggle('hidden', !match?.computerDifficulty);
    computerInfo.textContent = match?.computerDifficulty
      ? `Máquina · ${computerDifficultyNames[match.computerDifficulty] || match.computerDifficulty}` : '';
  }
  const { announceColor = false } = options;
  const refreshBtn = document.getElementById('refreshBoardBtn');
  const colorRow = document.getElementById('playerColorRow');
  const colorEl = document.getElementById('playerColor');

  if (refreshBtn) {
    refreshBtn.classList.toggle('hidden', !simulationMode);
  }

  if (!colorRow || !colorEl) return;

  if (simulationMode) {
    colorRow.classList.add('hidden');
    return;
  }

  const playerColor = resolvePlayerColor(match);
  if (!playerColor) {
    colorRow.classList.add('hidden');
    colorEl.textContent = '-';
    return;
  }

  colorRow.classList.remove('hidden');
  colorEl.textContent = playerColor === 'white'
    ? 'Brancas (você inicia)'
    : 'Pretas';

  if (announceColor && match?.id) {
    const announcedKey = `xadrezAnnouncedMatch:${match.id}`;
    if (readSessionValue(announcedKey) !== 'true') {
      showAlert(formatPlayerColorMessage(playerColor));
      writeSessionValue(announcedKey, 'true');
    }
  }
}

function clearSessionState() {
  clearMatchState();
  writeSessionValue(VIEW_STORAGE_KEY, null);
  writeSessionValue(SEARCHING_STORAGE_KEY, null);
}

function isUserInMatch(match) {
  if (!currentUser?.id || !match) return false;
  const userId = Number(currentUser.id);
  return Number(match.playerWhiteId) === userId || Number(match.playerBlackId) === userId;
}

async function fetchMatch(matchId) {
  try {
    return await request(`/matches/${matchId}${buildMatchUserQuery()}`);
  } catch (error) {
    console.warn('[match] failed to load match', matchId, error);
    return null;
  }
}

async function ensureMatchAccess() {
  if (!currentMatchId) return false;
  if (simulationMode) return true;
  if (!currentUser?.id) return false;

  try {
    const match = await fetchMatch(currentMatchId);
    if (!match || match.status === 'FINISHED') return false;
    activeMatch = match;
    return isUserInMatch(match);
  } catch (error) {
    console.warn('[match] access denied', currentMatchId, error);
    return false;
  }
}

async function fetchActiveMatchForUser() {
  if (!currentUser?.id) return null;
  return request(`/matches/active?userId=${currentUser.id}`);
}

function persistMatchState(matchId, isSimulation = false) {
  currentMatchId = String(matchId);
  simulationMode = isSimulation;
  writeMatchValue(MATCH_STORAGE_KEY, currentMatchId);
  writeMatchValue(SIMULATION_STORAGE_KEY, String(isSimulation));
}

function setMatchmakingSearching(isSearching) {
  writeSessionValue(SEARCHING_STORAGE_KEY, isSearching ? 'true' : null);
}

function canAccessUsersTab() {
  return currentUser?.username === USERS_TAB_USERNAME;
}

function resolveInitialView() {
  if (currentMatchId) {
    if (simulationMode || (activeMatch && isUserInMatch(activeMatch))) {
      return 'game';
    }
    clearMatchState();
  }

  const savedView = readSessionValue(VIEW_STORAGE_KEY);
  if (!savedView || !VALID_VIEWS.includes(savedView)) {
    return currentUser ? 'lobby' : 'home';
  }

  if (PROTECTED_VIEWS.includes(savedView) && !currentUser) {
    return 'home';
  }

  if (savedView === 'users' && !canAccessUsersTab()) {
    return currentUser ? 'lobby' : 'home';
  }

  if (savedView === 'game' && !currentMatchId) {
    return currentUser ? 'lobby' : 'home';
  }

  return savedView;
}

async function restoreActiveMatch() {
  if (!currentUser && !simulationMode) {
    clearMatchState();
    return;
  }

  if (currentMatchId) {
    const storedMatch = await fetchMatch(currentMatchId);
    if (storedMatch?.status === 'IN_PROGRESS' && (simulationMode || isUserInMatch(storedMatch))) {
      persistMatchState(storedMatch.id, simulationMode);
      activeMatch = storedMatch;
      return;
    }
    clearMatchState();
  }

  if (!currentUser) {
    return;
  }

  const serverActiveMatch = await fetchActiveMatchForUser();
  if (serverActiveMatch?.status === 'IN_PROGRESS' && isUserInMatch(serverActiveMatch)) {
    persistMatchState(serverActiveMatch.id, false);
    activeMatch = serverActiveMatch;
  }
}

async function resumeMatchmaking() {
  if (!currentUser || currentMatchId) return;

  const statusEl = document.getElementById('matchmakingStatus');
  const wasSearching = readSessionValue(SEARCHING_STORAGE_KEY) === 'true';
  // /matches/find coloca o usuário na fila. Sem uma busca em andamento, chamá-lo aqui
  // deixaria o usuário na fila sem consultar, e outro jogador seria pareado com ele.
  if (!wasSearching) return;

  try {
    const result = await request(`/matches/find?userId=${currentUser.id}`, {
      method: 'POST'
    });

    if (result?.status === 'MATCH_FOUND' && result.matchId) {
      setMatchmakingSearching(false);
      if (statusEl) statusEl.textContent = `Partida encontrada: #${result.matchId}`;
      const match = await fetchMatch(result.matchId);
      if (match && isUserInMatch(match)) {
        persistMatchState(match.id, false);
        activeMatch = match;
      }
      return;
    }

    if (result?.status === 'WAITING') {
      if (statusEl) statusEl.textContent = 'Procurando adversário. Aguarde...';
      startMatchmakingPolling();
    }
  } catch (error) {
    console.warn('[matchmaking] failed to resume search', error);
  }
}

async function restoreStoredUser() {
  const storedUser = readStoredUser();
  if (!storedUser?.id) {
    setUser(null);
    return;
  }

  try {
    const user = await request(`/users/${storedUser.id}`);
    setUser(user);
  } catch (error) {
    console.warn('[auth] stored session invalid, clearing user', error);
    setUser(null);
  }
}

async function bootstrapApp() {
  await restoreStoredUser();
  await restoreActiveMatch();
  await resumeMatchmaking();
  updateSessionUI();

  const initialView = resolveInitialView();
  document.body.classList.remove('booting');
  await showView(initialView);
}

async function markCurrentUserActive() {
  if (!currentUser?.id) return;

  try {
    await request(`/auth/presence?userId=${currentUser.id}`, {
      method: 'POST'
    });
  } catch (error) {
    console.warn('[presence] failed to update active user', error);
  }
}

function stopPresencePolling() {
  if (presencePolling) {
    clearInterval(presencePolling);
    presencePolling = null;
  }
}

function startPresencePolling() {
  stopPresencePolling();
  markCurrentUserActive();

  presencePolling = setInterval(() => {
    markCurrentUserActive();
  }, 60000);
}

function updateSessionUI() {
  const isLogged = !!currentUser;

  document.querySelectorAll('.protected').forEach(btn => {
    const isUsersTab = btn.classList.contains('users-admin-only');
    if (isUsersTab) {
      btn.classList.toggle('hidden', !isLogged || !canAccessUsersTab());
      return;
    }
    btn.classList.toggle('hidden', !isLogged);
  });

  document.getElementById('logoutBtn').classList.toggle('hidden', !isLogged);

  document.querySelectorAll('.guest-only').forEach(btn => {
    btn.classList.toggle('hidden', isLogged);
  });

  document.getElementById('sessionText').textContent = isLogged
    ? `Logado como ${currentUser.username} | Elo ${currentUser.elo}`
    : (simulationMode ? 'Modo playground ativo (sem login).' : 'Nenhum usuário logado.');
}

async function showView(name) {
  console.log(`[view] requested: ${name}`, {
    isLogged: !!currentUser,
    simulationMode,
    currentMatchId
  });

  const gameAllowedWithoutLogin = name === 'game' && simulationMode && !!currentMatchId;

  if (name === 'game' && currentMatchId && !gameAllowedWithoutLogin) {
    const allowed = await ensureMatchAccess();
    if (!allowed) {
      showAlert('Você não participa desta partida.');
      clearMatchState();
      return showView(currentUser ? 'lobby' : 'home');
    }
  }

  if (['profile', 'users', 'lobby', 'game'].includes(name) && !currentUser && !gameAllowedWithoutLogin) {
    console.warn(`[view] blocked: ${name} -> redirect login`);
    showAlert('Faça login antes de acessar essa área.');
    name = 'login';
  }

  if (name === 'users' && !canAccessUsersTab()) {
    showAlert('Acesso restrito. Apenas o usuário demo pode ver esta área.');
    name = currentUser ? 'lobby' : 'home';
  }

  const viewChanged = !views[name].classList.contains('active');
  Object.values(views).forEach(view => view.classList.remove('active'));
  views[name].classList.add('active');
  writeSessionValue(VIEW_STORAGE_KEY, name);
  if (viewChanged && name !== 'game') {
    // A tela de partida tem um anúncio próprio, com cor das peças e turno.
    narrate(`Tela: ${VIEW_NAMES[name] || name}.`);
  }
  console.log(`[view] active: ${name}`);

  if (name !== 'game') {
    stopBoardPolling();
  }

  if (name === 'profile') loadProfile();
  if (name === 'users') loadUsers();

  if (name === 'lobby' && currentMatchId) {
    const status = document.getElementById('matchmakingStatus');
    if (status) {
      status.textContent = `Partida #${currentMatchId} em andamento. Use o menu ou recarregue para voltar ao tabuleiro.`;
    }
  }

  if (name === 'game' && currentMatchId) {
    updateGamePanel(activeMatch);
    renderEmptyBoard();
    loadBoard();
    startBoardPolling();
  }
}

function stopBoardPolling() {
  if (boardPolling) {
    clearInterval(boardPolling);
    boardPolling = null;
  }
}

function startBoardPolling() {
  stopBoardPolling();

  let inFlight = false;
  boardPolling = setInterval(async () => {
    // Não dispara uma nova consulta enquanto a anterior não terminou (servidor lento,
    // máquina pensando), evitando respostas fora de ordem sobrescrevendo o tabuleiro.
    if (inFlight || moveInProgress) return;
    if (!views.game.classList.contains('active') || !currentMatchId) return;
    inFlight = true;
    try {
      await loadBoard(false);
    } finally {
      inFlight = false;
    }
  }, 3000);
}

function stopMatchmakingPolling() {
  if (matchmakingPolling) {
    clearInterval(matchmakingPolling);
    matchmakingPolling = null;
  }
  setMatchmakingSearching(false);
}

function startMatchmakingPolling() {
  stopMatchmakingPolling();

  const status = document.getElementById('matchmakingStatus');
  status.textContent = 'Procurando adversário...';
  setMatchmakingSearching(true);

  let inFlight = false;
  const intervalId = setInterval(async () => {
    if (!currentUser) {
      stopMatchmakingPolling();
      return;
    }
    // Evita requisições sobrepostas quando o servidor demora mais que o intervalo.
    if (inFlight) return;
    inFlight = true;

    try {
      const result = await request(`/matches/find?userId=${currentUser.id}`, {
        method: 'POST'
      });

      // A busca pode ter sido cancelada enquanto a requisição estava em andamento.
      if (matchmakingPolling !== intervalId) return;

      if (result?.status === 'MATCH_FOUND' && result.matchId) {
        stopMatchmakingPolling();
        status.textContent = `Partida encontrada: #${result.matchId}`;
        openMatch(result.matchId);
      }
    } catch (error) {
      console.error(error);
    } finally {
      inFlight = false;
    }
  }, 2000);
  matchmakingPolling = intervalId;
}

function fileFromCol(col) {
  return String.fromCharCode(97 + col);
}

function squareName(row, col) {
  return `${fileFromCol(col)}${8 - row}`;
}

function getPieceLetter(value) {
  if (!value) return '';

  const text = String(value).toUpperCase();

  if (text.includes('KING') || text.includes('REI')) return 'K';
  if (text.includes('QUEEN') || text.includes('RAINHA')) return 'Q';
  if (text.includes('ROOK') || text.includes('TORRE')) return 'R';
  if (text.includes('BISHOP') || text.includes('BISPO')) return 'B';
  if (text.includes('KNIGHT') || text.includes('CAVALO')) return 'N';
  if (text.includes('PAWN') || text.includes('PEAO') || text.includes('PEÃO')) return 'P';

  return text.charAt(0);
}

function getInitialPieceColor(row) {
  if (row <= 1) return 'black';
  if (row >= 6) return 'white';
  return null;
}

function getPieceColorFromValue(value) {
  if (!value) return null;

  const text = String(value).trim();
  if (!text) return null;

  if (text === text.toLowerCase()) return 'black';
  if (text === text.toUpperCase()) return 'white';
  return null;
}

function getPieceColor(value, row, position) {
  if (!value) return null;

  const valueColor = getPieceColorFromValue(value);
  if (valueColor) {
    pieceColorsByPosition[position] = valueColor;
    return valueColor;
  }

  if (pieceColorsByPosition[position]) {
    return pieceColorsByPosition[position];
  }

  const initialColor = getInitialPieceColor(row);

  if (initialColor) {
    pieceColorsByPosition[position] = initialColor;
    return initialColor;
  }

  return null;
}

function getPieceClass(value, row, position) {
  const color = getPieceColor(value, row, position);

  return color === 'black'
    ? 'black-piece'
    : 'white-piece';
}

function getPieceSpriteSrc(value, row, position) {
  if (!value) return '';

  const piece = getPieceLetter(value);
  const color = getPieceColor(value, row, position);

  return color === 'black'
    ? (blackSprites[piece] || '')
    : (whiteSprites[piece] || '');
}

function normalizeTurnColor(currentPlayer) {
  const text = String(currentPlayer || '').trim().toLowerCase();
  if (!text) return null;
  if (text.includes('white') || text.includes('branca') || text.includes('branco')) return 'white';
  if (text.includes('black') || text.includes('preta') || text.includes('preto')) return 'black';
  return null;
}

function oppositeColor(color) {
  if (color === 'white') return 'black';
  if (color === 'black') return 'white';
  return null;
}

function formatWinnerText(color) {
  if (color === 'white') return 'Brancas vencem!';
  if (color === 'black') return 'Pretas vencem!';
  return 'Partida encerrada.';
}

function formatDrawText(drawReason) {
  if (drawReason === 'STALEMATE') return 'Empate por afogamento.';
  if (drawReason === 'INSUFFICIENT_MATERIAL') return 'Empate por material insuficiente.';
  return 'Partida empatada.';
}

function updateCheckmateOverlay(isCheckmate, currentPlayerText, customMessage) {
  const overlay = document.getElementById('checkmateOverlay');
  const winnerTextEl = document.getElementById('checkmateWinnerText');
  if (!overlay || !winnerTextEl) return;

  if (!isCheckmate) {
    overlay.classList.add('hidden');
    clearTimeout(overlayNarrationTimer);
    lastOverlayNarration = '';
    return;
  }

  const losingColor = normalizeTurnColor(currentPlayerText);
  const winnerColor = oppositeColor(losingColor);
  winnerTextEl.textContent = customMessage || formatWinnerText(winnerColor);
  overlay.classList.remove('hidden');

  // O texto final pode ser trocado logo em seguida (ex.: "Você venceu a máquina!"),
  // então espera um instante e fala só a versão definitiva, uma única vez.
  clearTimeout(overlayNarrationTimer);
  overlayNarrationTimer = setTimeout(() => {
    const text = winnerTextEl.textContent;
    if (overlay.classList.contains('hidden') || text === lastOverlayNarration) return;
    lastOverlayNarration = text;
    narrate(`Fim de jogo. ${text}`);
  }, 500);
}

let overlayNarrationTimer = null;
let lastOverlayNarration = '';

function clearPossibleTargets() {
  possibleTargets = new Set();
}

function createEmptyBoardState() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function renderEmptyBoard() {
  lastOpponentMove = null;
  setTextContentIfExists('lastOpponentMove', 'Aguardando a primeira jogada.');
  renderCapturedPieces({});
  renderBoard(createEmptyBoardState());
}

function renderCapturedPieces(board) {
  for (const [id, countId, pieces] of [
    ['capturedByWhite', 'capturedWhiteCount', board.capturedByWhite || []],
    ['capturedByBlack', 'capturedBlackCount', board.capturedByBlack || []]
  ]) {
    const target = document.getElementById(id);
    if (!target) continue;
    setTextContentIfExists(countId, `(${pieces.length})`);
    const signature = JSON.stringify(pieces);
    if (target.dataset.captures === signature) continue;
    target.dataset.captures = signature;
    target.replaceChildren();
    if (!pieces.length) {
      target.textContent = 'Nenhuma peça capturada.';
      continue;
    }
    for (const { symbol, count } of ChessDisplay.groupCaptures(pieces)) {
      const color = getPieceColorFromValue(symbol);
      const letter = getPieceLetter(symbol);
      const chip = document.createElement('span');
      chip.className = `captured-piece ${color}-piece`;
      chip.setAttribute('role', 'img');
      const label = `${ChessDisplay.pieceName(letter)}, peça ${color === 'black' ? 'preta' : 'branca'}, ${count} capturada${count > 1 ? 's' : ''}`;
      chip.setAttribute('aria-label', label);
      chip.title = label;
      const img = document.createElement('img');
      img.src = (color === 'black' ? blackSprites : whiteSprites)[letter];
      img.alt = '';
      img.setAttribute('aria-hidden', 'true');
      chip.appendChild(img);
      if (count > 1) {
        const amount = document.createElement('span');
        amount.textContent = `×${count}`;
        amount.setAttribute('aria-hidden', 'true');
        chip.appendChild(amount);
      }
      target.appendChild(chip);
    }
  }
}

function isPromotionMove(source, target) {
  const movingPiece = pieceLettersByPosition[source];
  const movingColor = pieceColorsByPosition[source] || currentTurnColor;

  if (movingPiece !== 'P' || !movingColor || !target) {
    return false;
  }

  const targetRank = Number(target.slice(1));
  if (Number.isNaN(targetRank)) {
    return false;
  }

  return (movingColor === 'white' && targetRank === 8)
    || (movingColor === 'black' && targetRank === 1);
}

function updatePromotionButtons(pieceColor) {
  const colorSprites = pieceColor === 'black' ? blackSprites : whiteSprites;
  const options = ['Q', 'R', 'B', 'N'];

  options.forEach(option => {
    const button = document.querySelector(`[data-promotion-piece="${option}"]`);
    if (!button) return;

    const sprite = colorSprites[option];
    if (sprite) {
      button.innerHTML = `<img src="${sprite}" alt="${option}" class="piece-image" />`;
    } else {
      button.textContent = option;
    }
  });
}

function requestPromotionChoice(pieceColor) {
  const modal = document.getElementById('promotionModal');
  if (!modal) return Promise.resolve(null);

  updatePromotionButtons(pieceColor || currentTurnColor || 'white');
  modal.classList.remove('hidden');
  narrate('Promoção do peão. Escolha: rainha, torre, bispo ou cavalo.');
  // Leva o foco do teclado para as opções, para quem não usa o mouse.
  modal.querySelector('[data-promotion-piece]')?.focus();

  return new Promise(resolve => {
    pendingPromotionResolver = resolve;
  });
}

function resolvePromotionChoice(choice) {
  const modal = document.getElementById('promotionModal');
  if (modal) {
    modal.classList.add('hidden');
  }

  if (pendingPromotionResolver) {
    pendingPromotionResolver(choice);
    pendingPromotionResolver = null;
  }
}

async function loadPossibleMoves(source, options = {}) {
  const { showErrors = false } = options;

  if (!currentMatchId || !source) {
    clearPossibleTargets();
    return false;
  }

  try {
    const matchUserId = getMatchRequestUserId();
    const userIdParam = matchUserId != null ? `&userId=${encodeURIComponent(matchUserId)}` : '';
    const data = await request(`/matches/${currentMatchId}/possible-moves?source=${encodeURIComponent(source)}${userIdParam}`);
    possibleTargets = new Set(Array.isArray(data?.targets) ? data.targets : []);
    return true;
  } catch (error) {
    const normalizedMessage = String(error?.message || '').trim().toLowerCase();
    const isTurnValidationError = normalizedMessage === 'not your turn' || normalizedMessage === 'aguarde seu turno.';

    if (!isTurnValidationError) {
      console.error('[moves] failed to load possible moves', error);
    }
    lastPossibleMovesError = normalizeAlertMessage(error?.message);
    if (showErrors) {
      showAlert(error.message || 'Movimento inválido.');
    }
    clearPossibleTargets();
    return false;
  }
}

// Motivo da última falha ao selecionar uma peça, falado pela narração (ex.: "Aguarde seu turno.").
let lastPossibleMovesError = null;

function renderBoard(board) {
  const boardEl = document.getElementById('chessBoard');
  if (!boardEl) {
    console.error('[board] #chessBoard element not found');
    showAlert('Falha ao renderizar o tabuleiro. Recarregue a página.');
    return;
  }

  boardEl.innerHTML = '';
  pieceLettersByPosition = {};

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const square = document.createElement('button');
      const pos = squareName(row, col);
      const value = board?.[row]?.[col];
      const hasPiece = !!value;

      const spriteSrc = getPieceSpriteSrc(value, row, pos);
      const pieceClass = getPieceClass(value, row, pos);
      const pieceLetter = getPieceLetter(value);
      pieceLettersByPosition[pos] = hasPiece ? pieceLetter : null;

      square.className = `square ${(row + col) % 2 === 0 ? 'light' : 'dark'}`;
      square.dataset.position = pos;

      square.innerHTML = value
        ? `<span class="piece ${pieceClass}">${spriteSrc ? `<img src="${spriteSrc}" alt="" class="piece-image" />` : getPieceLetter(value)}</span>`
        : '';

      if (selectedSource === pos) {
        square.classList.add('selected');
      }

      if (possibleTargets?.has(pos)) {
        square.classList.add('possible-move');
        if (hasPiece) square.classList.add('possible-capture');
      }

      const moveRole = lastOpponentMove?.source === pos ? 'source'
        : lastOpponentMove?.target === pos ? 'target' : null;
      if (moveRole) {
        square.classList.add('last-opponent-move', `last-move-${moveRole}`);
        const badge = document.createElement('span');
        badge.className = 'last-move-marker';
        badge.textContent = moveRole === 'source' ? 'O' : 'D';
        badge.setAttribute('aria-hidden', 'true');
        square.appendChild(badge);
      }
      const moveHint = moveRole ? `, ${moveRole === 'source' ? 'origem' : 'destino'} da última jogada` : '';
      const pieceColorName = String(value) === String(value).toLowerCase() ? 'preta' : 'branca';
      const pieceHint = hasPiece ? `, ${ChessDisplay.pieceName(pieceLetter)}, peça ${pieceColorName}` : ', vazia';
      const targetHint = possibleTargets?.has(pos) ? ', movimento possível' : '';
      square.setAttribute('aria-label', `${pos}${pieceHint}${moveHint}${targetHint}`);
      square.setAttribute('aria-pressed', String(selectedSource === pos));
      square.title = square.getAttribute('aria-label');

      square.addEventListener('click', () => handleSquareClick(pos, hasPiece));
      boardEl.appendChild(square);
    }
  }
}

function setTextContentIfExists(id, value) {
  const element = document.getElementById(id);
  if (element) {
    element.textContent = value;
  }
}

function normalizeBoardPayload(payload) {
  if (payload && Array.isArray(payload.board)) {
    return payload;
  }

  if (payload?.game && Array.isArray(payload.game.board)) {
    return payload.game;
  }

  if (payload?.data && Array.isArray(payload.data.board)) {
    return payload.data;
  }

  return {
    board: createEmptyBoardState(),
    currentPlayer: null,
    check: false,
    checkmate: false
  };
}

async function handleSquareClick(position, hasPiece) {
  if (moveInProgress) {
    narrate('Aguarde, o lance anterior ainda está sendo processado.');
    return;
  }
  const gameOver = activeMatch?.status === 'FINISHED'
    || document.getElementById('checkmateOverlay')?.classList.contains('hidden') === false;
  if (gameOver) {
    narrate('A partida terminou.');
    return;
  }
  if (pendingPromotionResolver) return;

  const trySelectSource = async (sourcePosition) => {
    // Lido antes de recarregar o tabuleiro, que recria esses mapas.
    const letter = pieceLettersByPosition[sourcePosition];
    const symbol = pieceColorsByPosition[sourcePosition] === 'black' ? letter?.toLowerCase() : letter;

    const loadedMoves = await loadPossibleMoves(sourcePosition);
    if (!loadedMoves) {
      narrate(lastPossibleMovesError || 'Não é possível selecionar esta peça.');
      return false;
    }

    if (simulationMode && currentTurnColor && possibleTargets.size === 0) {
      narrate('Não há movimentos possíveis para esta peça.');
      return false;
    }

    selectedSource = sourcePosition;
    setTextContentIfExists('selectedSource', sourcePosition);
    if (symbol) {
      narrate(ChessDisplay.spokenSelection(symbol, sourcePosition, [...possibleTargets].sort()));
    }
    await loadBoard(false);
    return true;
  };

  if (!selectedSource) {
    if (!hasPiece) return;
    await trySelectSource(position);
    return;
  }

  if (selectedSource === position) {
    selectedSource = null;
    clearPossibleTargets();
    setTextContentIfExists('selectedSource', '-');
    narrate('Seleção cancelada.');
    await loadBoard(false);
    return;
  }

  if (hasPiece && !possibleTargets?.has(position)) {
    await trySelectSource(position);
    return;
  }

  try {
    const movingColor = pieceColorsByPosition[selectedSource];
    const promotionType = isPromotionMove(selectedSource, position)
      ? await requestPromotionChoice(movingColor)
      : null;

    if (isPromotionMove(selectedSource, position) && !promotionType) {
      return;
    }

    moveInProgress = true;
    if (activeMatch?.computerDifficulty) {
      stopBoardPolling();
      document.getElementById('computerThinking')?.classList.remove('hidden');
    }
    await request(`/matches/${currentMatchId}/moves`, {
      method: 'POST',
      body: JSON.stringify({
        userId: getMatchRequestUserId(),
        source: selectedSource,
        target: position,
        promotionType
      })
    });

    if (movingColor) {
      pieceColorsByPosition[position] = movingColor;
      delete pieceColorsByPosition[selectedSource];
    }
    pieceLettersByPosition[position] = promotionType || pieceLettersByPosition[selectedSource];
    delete pieceLettersByPosition[selectedSource];

    selectedSource = null;
    clearPossibleTargets();
    setTextContentIfExists('selectedSource', '-');
    await loadBoard();

  } catch (error) {
    if (hasPiece) {
      await trySelectSource(position);
      return;
    }

    showAlert(error.message || 'Movimento inválido.');
  } finally {
    moveInProgress = false;
    document.getElementById('computerThinking')?.classList.add('hidden');
  }
}

async function resetBoard() {
  if (!currentMatchId) {
    showAlert('Nenhuma partida aberta.');
    return;
  }

  try {
    await request(`/matches/${currentMatchId}/reset`, { method: 'POST' });

    selectedSource = null;
    clearPossibleTargets();
    pieceColorsByPosition = {};
    pieceLettersByPosition = {};
    resolvePromotionChoice(null);
    updateCheckmateOverlay(false, null);
    setTextContentIfExists('selectedSource', '-');

    narrate('Tabuleiro reiniciado. Vez das brancas.');
    await loadBoard(false);
    // O polling para quando a partida termina; reiniciar o tabuleiro precisa retomá-lo.
    startBoardPolling();
  } catch (error) {
    console.error('[board] failed to reset board', error);
    const msg = (error.message || '').toLowerCase();

    if (msg.includes('resource not found')) {
      showAlert('Reinicie o servidor Spring Boot para carregar o endpoint de reset.');
      return;
    }

    if (msg.includes('match not found')) {
      clearMatchState();
      showAlert('Partida não encontrada. Crie ou abra uma nova partida.');
      showView('lobby');
      return;
    }

    showAlert(error.message || 'Não foi possível reiniciar o tabuleiro.');
  }
}

async function handleFinishedMatchFromServer(showMessage = true) {
  if (!currentMatchId) return false;

  try {
    const match = await fetchMatch(currentMatchId);
    if (match?.status !== 'FINISHED') return false;

    activeMatch = match;
    stopBoardPolling();

    // Sem vencedor (encerrada pelo admin, empate ou vitória da máquina) não há cor vencedora;
    // antes caía no ramo "pretas" e anunciava um vencedor errado.
    if (match.winnerId == null) {
      const message = match.computerDifficulty ? 'Partida contra a máquina encerrada.' : 'Partida encerrada sem vencedor.';
      updateCheckmateOverlay(true, null, message);
    } else {
      const winnerColor = Number(match.winnerId) === Number(match.playerWhiteId) ? 'white' : 'black';
      updateCheckmateOverlay(true, oppositeColor(winnerColor), formatWinnerText(winnerColor));
    }

    if (currentUser?.id) {
      try {
        const refreshed = await request(`/users/${currentUser.id}`);
        setUser(refreshed);
      } catch (error) {
        console.warn('[board] failed to refresh user rating', error);
      }
    }

    return true;
  } catch (error) {
    console.warn('[board] failed to load finished match', error);
    return false;
  }
}

// --- Narração dos acontecimentos da partida ---------------------------------------------
// Compara cada tabuleiro recebido com o anterior e fala o que mudou: lances de cada lado,
// xeque e a vez do jogador. Ao abrir uma partida, fala um resumo em vez dos lances antigos.
const boardNarration = { matchId: null, white: null, black: null, check: false, turn: null };

function moveKey(move) {
  return move ? `${move.source}-${move.target}-${move.piece}-${move.promotion || ''}` : null;
}

function colorNamePlural(color) {
  return color === 'white' ? 'brancas' : 'pretas';
}

function moveActor(color, playerColor) {
  if (simulationMode || !playerColor) return color === 'white' ? 'Brancas' : 'Pretas';
  if (color === playerColor) return 'Você';
  return activeMatch?.computerDifficulty ? 'Máquina' : 'Oponente';
}

function narrateBoardUpdate(board) {
  if (!window.Narrator?.isEnabled()) {
    // Mantém o estado atualizado para não falar lances antigos ao ativar a narração depois.
    boardNarration.matchId = null;
    return;
  }

  const playerColor = resolvePlayerColor(activeMatch);
  const turn = normalizeTurnColor(board.currentPlayer);
  const whiteKey = moveKey(board.lastWhiteMove);
  const blackKey = moveKey(board.lastBlackMove);
  const gameOver = !!board.checkmate || !!board.drawReason;

  if (boardNarration.matchId !== currentMatchId) {
    Object.assign(boardNarration, { matchId: currentMatchId, white: whiteKey, black: blackKey, check: !!board.check, turn });
    const parts = [`Partida ${currentMatchId}.`];
    if (activeMatch?.computerDifficulty) {
      parts.push(`Contra a máquina, nível ${computerDifficultyNames[activeMatch.computerDifficulty] || activeMatch.computerDifficulty}.`);
    }
    if (simulationMode) parts.push('Playground: você move as peças dos dois lados.');
    else if (playerColor) parts.push(`Você joga com as ${colorNamePlural(playerColor)}.`);
    const lastMove = turn === 'white' ? board.lastBlackMove : board.lastWhiteMove;
    if (lastMove) parts.push(`Último lance: ${ChessDisplay.spokenMove(lastMove, moveActor(oppositeColor(turn), playerColor))}`);
    if (!gameOver && turn) {
      parts.push(playerColor && turn === playerColor ? 'É a sua vez.' : `Vez das ${colorNamePlural(turn)}.`);
    }
    if (board.check && !gameOver) parts.push('Xeque!');
    narrate(parts.join(' '));
    return;
  }

  // Quem jogou por último é a cor oposta à da vez; se as duas cores jogaram desde a última
  // consulta (ex.: resposta da máquina), a cor da vez jogou primeiro.
  const changed = [];
  if (whiteKey && whiteKey !== boardNarration.white) changed.push(['white', board.lastWhiteMove]);
  if (blackKey && blackKey !== boardNarration.black) changed.push(['black', board.lastBlackMove]);
  if (changed.length === 2 && changed[0][0] !== turn) changed.reverse();
  changed.forEach(([color, move]) => narrate(ChessDisplay.spokenMove(move, moveActor(color, playerColor))));

  if (board.checkmate) {
    if (changed.length) narrate('Xeque-mate!');
  } else if (board.check && (!boardNarration.check || changed.length)) {
    if (simulationMode || !playerColor) narrate(`Xeque nas ${colorNamePlural(turn)}!`);
    else narrate(turn === playerColor ? 'Xeque! Seu rei está sendo atacado.' : 'Xeque no rei adversário!');
  }

  const opponentJustMoved = changed.some(([color]) => color !== playerColor);
  if (!gameOver && !simulationMode && playerColor && turn === playerColor
    && (boardNarration.turn !== turn || opponentJustMoved)) {
    narrate('Sua vez.');
  }

  Object.assign(boardNarration, { white: whiteKey, black: blackKey, check: !!board.check, turn });
}

async function loadBoard(showMessage = true) {
  if (!currentMatchId) return;
  const requestedMatchId = currentMatchId;

  try {
    const response = await request(`/matches/${requestedMatchId}/board${buildMatchUserQuery()}`);
    // O usuário pode ter trocado/saído da partida enquanto a resposta chegava.
    if (currentMatchId !== requestedMatchId) return;
    const board = normalizeBoardPayload(response);
    narrateBoardUpdate(board);

    setTextContentIfExists('gameMatchId', String(currentMatchId));
    setTextContentIfExists('currentPlayer', board.currentPlayer || '-');
    setTextContentIfExists('checkStatus', board.check ? 'Sim' : 'Não');
    setTextContentIfExists('checkmateStatus', board.checkmate ? 'Sim' : 'Não');
    currentTurnColor = normalizeTurnColor(board.currentPlayer);
    lastOpponentMove = ChessDisplay.opponentMove(board, resolvePlayerColor(activeMatch));
    const moveLabel = simulationMode ? 'Última jogada:' : 'Última jogada do oponente:';
    const description = ChessDisplay.describeMove(lastOpponentMove);
    if (document.getElementById('lastMoveLabel')?.textContent !== moveLabel) {
      setTextContentIfExists('lastMoveLabel', moveLabel);
    }
    // Não reanuncia a mesma mensagem a cada atualização automática do tabuleiro.
    if (document.getElementById('lastOpponentMove')?.textContent !== description) {
      setTextContentIfExists('lastOpponentMove', description);
    }
    const isDraw = !board.checkmate && !!board.drawReason;
    if (isDraw) {
      updateCheckmateOverlay(true, null, formatDrawText(board.drawReason));
    } else {
      updateCheckmateOverlay(!!board.checkmate, board.currentPlayer);
    }

    renderBoard(board.board);
    renderCapturedPieces(board);

    if (activeMatch?.computerDifficulty) {
      const match = await fetchMatch(requestedMatchId);
      if (currentMatchId !== requestedMatchId) return;
      if (match) activeMatch = match;
      if (match?.status === 'FINISHED') {
        stopBoardPolling();
        const message = board.checkmate
          ? (match.winnerId ? 'Você venceu a máquina!' : 'A máquina venceu. Tente novamente!')
          : (isDraw ? formatDrawText(board.drawReason) : 'Partida encerrada.');
        updateCheckmateOverlay(true, board.currentPlayer, message);
      }
    }

    if (board.checkmate || isDraw) {
      // Fim de jogo: para o polling (o tabuleiro não muda mais) e atualiza o Elo uma única vez,
      // em vez de repetir essas requisições a cada 3 segundos indefinidamente.
      stopBoardPolling();

      const match = await fetchMatch(requestedMatchId);
      if (match?.status === 'FINISHED' && currentMatchId === requestedMatchId) {
        activeMatch = match;
      }

      if (currentUser?.id) {
        try {
          const refreshed = await request(`/users/${currentUser.id}`);
          setUser(refreshed);
        } catch (error) {
          console.warn('[board] failed to refresh user rating', error);
        }
      }
    }
  } catch (error) {
    if (currentMatchId !== requestedMatchId) return;
    console.error('[board] failed to load board', error);
    renderEmptyBoard();

    const msg = (error.message || '').toLowerCase();
    if (msg.includes('match not found') || msg.includes('partida não encontrada')) {
      clearMatchState();
      if (showMessage) showAlert('Partida não encontrada.');
      showView(currentUser ? 'lobby' : 'home');
      return;
    }

    if (msg.includes('finished match state is unavailable')
      || msg.includes('finalizada indisponível')) {
      if (await handleFinishedMatchFromServer(showMessage)) {
        return;
      }
    }

    if (msg.includes('already finished') || msg.includes('já finalizada')) {
      if (await handleFinishedMatchFromServer(showMessage)) {
        return;
      }
      clearMatchState();
      if (showMessage) showAlert('Esta partida já foi finalizada.');
      showView(currentUser ? 'lobby' : 'home');
      return;
    }

    if (msg.includes('not part') || msg.includes('não participa')) {
      clearMatchState();
      if (showMessage) showAlert('Você não participa desta partida.');
      showView(currentUser ? 'lobby' : 'home');
      return;
    }

    if (showMessage) showAlert(error.message);
  }
}

function historyPosition() {
  const track = document.getElementById('matchHistory');
  const cards = track ? Array.from(track.querySelectorAll('.match-card')) : [];
  if (!cards.length) return { track, cards, index: 0, overflow: false };
  const overflow = track.scrollHeight > track.clientHeight + 2;
  const max = track.scrollHeight - track.clientHeight;
  const step = cards.length > 1 ? cards[1].offsetTop - cards[0].offsetTop : 1;
  const index = overflow && track.scrollTop >= max - 2 ? cards.length - 1
    : Math.max(0, Math.min(cards.length - 1, Math.round(track.scrollTop / Math.max(1, step))));
  return { track, cards, index, overflow };
}

function updateHistoryNavigation() {
  const { cards, index, overflow } = historyPosition();
  document.getElementById('historyControls')?.classList.toggle('hidden', !cards.length);
  document.getElementById('historyHelp')?.classList.toggle('hidden', !overflow);
  const position = document.getElementById('historyPosition');
  const text = cards.length ? `${index + 1} de ${cards.length} partidas` : '';
  if (position && position.textContent !== text) position.textContent = text;
  const previous = document.getElementById('historyPrevious');
  const next = document.getElementById('historyNext');
  if (previous) previous.disabled = !overflow || index === 0;
  if (next) next.disabled = !overflow || index === cards.length - 1;
}

function scrollHistory(direction) {
  const { track, cards, index } = historyPosition();
  if (!track || !cards.length) return;
  const target = Math.max(0, Math.min(cards.length - 1, index + direction));
  track.scrollTo({ top: cards[target].offsetTop - cards[0].offsetTop,
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}

function sizeHistoryCards() {
  const { track, cards, index } = historyPosition();
  if (!track || !cards.length || !track.clientWidth) return;
  // Usa a maior altura necessária para manter cada cartão inteiro, mesmo no celular
  // ou com texto ampliado. A faixa mostra um cartão por vez, sem cortar os demais.
  track.style.removeProperty('--history-card-height');
  const height = Math.ceil(Math.max(260, ...cards.map(card => card.getBoundingClientRect().height)));
  track.style.setProperty('--history-card-height', `${height}px`);
  track.scrollTop = cards[index].offsetTop - cards[0].offsetTop;
  updateHistoryNavigation();
}

document.getElementById('historyPrevious')?.addEventListener('click', () => scrollHistory(-1));
document.getElementById('historyNext')?.addEventListener('click', () => scrollHistory(1));
const historyTrack = document.getElementById('matchHistory');
historyTrack?.addEventListener('scroll', updateHistoryNavigation, { passive: true });
historyTrack?.addEventListener('keydown', event => {
  if (event.target !== historyTrack || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  scrollHistory(event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : event.key === 'Home' ? -Infinity : Infinity);
});
if (historyTrack && typeof ResizeObserver !== 'undefined') new ResizeObserver(updateHistoryNavigation).observe(historyTrack);
window.addEventListener('resize', () => requestAnimationFrame(sizeHistoryCards));

async function loadProfile() {
  if (!currentUser) return;

  try {
    const user = await request(`/users/${currentUser.id}`);
    setUser(user);

    document.getElementById('profileName').textContent = user.username;
    document.getElementById('profileElo').textContent = user.elo;
    document.getElementById('profileAvatar').textContent =
      user.username?.charAt(0)?.toUpperCase() || '♟';

    document.getElementById('updateUsername').value = user.username;
    document.getElementById('updatePassword').value = '';

    const matches = await request(`/users/${user.id}/matches`);
    const history = document.getElementById('matchHistory');

    if (!matches || matches.length === 0) {
      history.className = 'match-history empty';
      history.textContent = 'Nenhuma partida encontrada.';
      updateHistoryNavigation();
      return;
    }

    history.className = 'match-history';
    history.innerHTML = matches.map((match, index) => `
      <article class="match-card" role="group" aria-roledescription="cartão" aria-label="Partida ${match.id}, ${index + 1} de ${matches.length}">
        <div class="match-card-header">
          <h3>Partida #${match.id}</h3>
          <span class="match-status ${match.status === 'IN_PROGRESS' ? 'in-progress' : ''}">${match.status === 'IN_PROGRESS' ? 'Em andamento' : 'Finalizada'}</span>
        </div>
        <dl class="match-facts">
          <div><dt>${match.status === 'IN_PROGRESS' ? 'Tempo decorrido' : 'Duração'}</dt><dd>${ChessDisplay.formatDuration(match.durationSeconds)}</dd></div>
          <div><dt>Vencedor</dt><dd>${match.winnerId ? `Jogador #${match.winnerId}` : (match.status === 'FINISHED' ? 'Partida encerrada' : 'Ainda não definido')}</dd></div>
          <div><dt>Brancas</dt><dd>Jogador #${match.playerWhiteId}</dd></div>
          <div><dt>Pretas</dt><dd>${match.computerDifficulty ? `Máquina · ${computerDifficultyNames[match.computerDifficulty]}` : `Jogador #${match.playerBlackId}`}</dd></div>
        </dl>
        <div class="match-card-footer">
        ${match.status === 'IN_PROGRESS'
          ? `<button class="secondary open-match" data-match="${match.id}">Continuar partida</button>`
          : '<span class="muted">Partida finalizada</span>'}
        </div>
      </article>
    `).join('');
    history.scrollTop = 0;
    requestAnimationFrame(sizeHistoryCards);

    document.querySelectorAll('.open-match').forEach(btn => {
      btn.addEventListener('click', () => openMatch(btn.dataset.match));
    });

  } catch (error) {
    showAlert(error.message);
  }
}

async function loadUsers() {
  if (!canAccessUsersTab()) {
    showAlert('Acesso restrito. Apenas o usuário demo pode ver esta área.');
    showView(currentUser ? 'lobby' : 'home');
    return;
  }

  try {
    await markCurrentUserActive();

    const users = await request(`/users/active?userId=${currentUser.id}`);
    const target = document.getElementById('usersList');
    const visibleUsers = (users || []).filter(
      user => user.username !== USERS_TAB_USERNAME
    );

    if (visibleUsers.length === 0) {
      target.innerHTML = '<p class="muted">Nenhum usuário ativo no momento.</p>';
      return;
    }

    target.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Nome</th>
            <th>Elo</th>
            <th>Status</th>
            <th>Ação</th>
          </tr>
        </thead>
        <tbody>
          ${visibleUsers.map(user => `
            <tr>
              <td>${escapeHtml(user.id)}</td>
              <td>${escapeHtml(user.username)}</td>
              <td>${escapeHtml(user.elo)}</td>
              <td>Ativo</td>
              <td class="table-actions">
                <button type="button" class="secondary view-profile" data-id="${escapeHtml(user.id)}">Ver</button>
                <button type="button" class="danger delete-user" data-id="${escapeHtml(user.id)}" data-username="${escapeHtml(user.username)}">Excluir</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    document.querySelectorAll('.view-profile').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          const user = await request(`/users/${btn.dataset.id}`);
          showAlert(`${user.username} | Elo ${user.elo} | ${user.active ? 'Ativo' : 'Inativo'}`);
        } catch (error) {
          showAlert(error.message);
        }
      });
    });

  } catch (error) {
    showAlert(error.message);
  }
}

async function openMatch(matchId, isSimulation = false) {
  console.log('[match] opening match', { matchId, isSimulation });

  const match = await fetchMatch(matchId);
  if (!match) {
    showAlert('Partida não encontrada.');
    clearMatchState();
    showView(currentUser ? 'lobby' : 'home');
    return;
  }

  if (!isSimulation) {
    if (!currentUser) {
      showAlert('Faça login para entrar na partida.');
      showView('login');
      return;
    }
    if (!isUserInMatch(match)) {
      showAlert('Você não participa desta partida.');
      clearMatchState();
      showView('lobby');
      return;
    }
  }

  if (match.status === 'FINISHED') {
    clearMatchState();
    showAlert('Esta partida já foi finalizada.');
    showView(currentUser ? 'lobby' : 'home');
    return;
  }

  persistMatchState(match.id, isSimulation);
  activeMatch = match;
  setMatchmakingSearching(false);

  selectedSource = null;
  clearPossibleTargets();
  currentTurnColor = null;
  pieceColorsByPosition = {};
  pieceLettersByPosition = {};
  resolvePromotionChoice(null);
  updateCheckmateOverlay(false, null);
  setTextContentIfExists('selectedSource', '-');

  stopMatchmakingPolling();
  updateSessionUI();
  updateGamePanel(match, { announceColor: !isSimulation });
  console.log('[match] navigating to game view');
  showView('game');
}

// Cria a partida com a dificuldade escolhida. A decisão das jogadas fica no backend Java.
document.getElementById('playComputerBtn')?.addEventListener('click', async (event) => {
  if (!currentUser?.id) {
    showAlert('Faça login para jogar contra a máquina.');
    showView('login');
    return;
  }
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const difficulty = document.getElementById('computerDifficulty').value;
    // Limpa o modo de simulação para enviar o usuário nas requisições da nova partida.
    clearMatchState();
    const match = await request(`/matches/computer?userId=${currentUser.id}&difficulty=${difficulty}`, { method: 'POST' });
    await openMatch(match.id);
  } catch (error) {
    showAlert(error.message || 'Não foi possível iniciar a partida contra a máquina.');
  } finally {
    button.disabled = false;
  }
});

document.querySelectorAll('[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    console.log('[ui] data-view click', {
      view: btn.dataset.view,
      buttonText: btn.textContent?.trim()
    });
    showView(btn.dataset.view);
  });
});

document.getElementById('logoutBtn').addEventListener('click', () => {
  const userId = currentUser?.id;
  if (userId) {
    request(`/auth/logout?userId=${userId}`, {
      method: 'POST'
    }).catch(error => console.warn('[presence] failed to logout user', error));
    // Tira o usuário da fila de matchmaking; senão ele poderia ser pareado após sair.
    request(`/matches/cancel?userId=${userId}`, {
      method: 'POST'
    }).catch(error => console.warn('[matchmaking] failed to cancel search on logout', error));
  }

  setUser(null);
  clearSessionState();
  selectedSource = null;
  pieceColorsByPosition = {};

  stopBoardPolling();
  stopMatchmakingPolling();

  showView('home');
});

async function startSimulationMatch() {
  console.log('[simulate] button clicked', {
    isLogged: !!currentUser,
    activeView: Object.entries(views).find(([, el]) => el.classList.contains('active'))?.[0] || 'unknown'
  });

  const lobbyStatus = document.getElementById('matchmakingStatus');
  if (lobbyStatus) {
    lobbyStatus.textContent = 'Criando partida de simulação...';
  }

  try {
    console.log('[simulate] requesting POST /matches/simulate');
    const match = await request('/matches/simulate', {
      method: 'POST'
    });
    console.log('[simulate] match created', match);

    showAlert('Playground iniciado. Nenhum usuário foi criado.');
    openMatch(match.id, true);
  } catch (error) {
    console.error('[simulate] failed to create simulation match', error);
    if (lobbyStatus) {
      lobbyStatus.textContent = 'Falha ao criar simulação.';
    }
    showAlert(error.message);
  }
}

const simulateBtnHome = document.getElementById('simulateMatchBtn');
const simulateBtnLobby = document.getElementById('simulateMatchBtnLobby');
if (!simulateBtnHome) {
  console.warn('[simulate] home button not found');
}
if (!simulateBtnLobby) {
  console.warn('[simulate] lobby button not found');
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('#simulateMatchBtn, #simulateMatchBtnLobby');
  if (!button) return;

  event.preventDefault();
  console.log('[simulate] delegated click captured', { id: button.id });
  startSimulationMatch();
});

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const user = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('loginUsername').value.trim(),
        password: document.getElementById('loginPassword').value,
      })
    });

    setUser(user);
    showAlert('Login realizado com sucesso.');
    showView('lobby');
  } catch (error) {
    showAlert(error.message);
  }
});

document.getElementById('registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const user = await request('/users', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('registerUsername').value.trim(),
        password: document.getElementById('registerPassword').value,
      })
    });

    setUser(user);
    showAlert('Cadastro realizado com sucesso.');
    showView('lobby');
  } catch (error) {
    showAlert(error.message);
  }
});

document.getElementById('updateForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    if (!currentUser?.id) return;
    const user = await request(`/users/${currentUser.id}?userId=${currentUser.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        username: document.getElementById('updateUsername').value.trim(),
        password: document.getElementById('updatePassword').value,
      })
    });

    setUser(user);
    showAlert('Perfil atualizado com sucesso.');
    loadProfile();
  } catch (error) {
    showAlert(error.message);
  }
});

document.getElementById('deleteAccountBtn').addEventListener('click', async () => {
  if (!currentUser) return;

  if (!confirm('Tem certeza que deseja excluir seu usuário?')) return;

  try {
    await request(`/users/${currentUser.id}?userId=${currentUser.id}`, {
      method: 'DELETE'
    });

    setUser(null);
    clearSessionState();
    showAlert('Usuário excluído.');
    showView('home');
  } catch (error) {
    showAlert(error.message);
  }
});

document.getElementById('findMatchBtn').addEventListener('click', async () => {
  if (!currentUser) {
    showView('login');
    return;
  }

  const status = document.getElementById('matchmakingStatus');
  status.textContent = 'Procurando adversário...';
  setMatchmakingSearching(true);

  try {
    const result = await request(`/matches/find?userId=${currentUser.id}`, {
      method: 'POST'
    });

    if (result.status === 'MATCH_FOUND' && result.matchId) {
      setMatchmakingSearching(false);
      status.textContent = `Partida encontrada: #${result.matchId}`;
      await openMatch(result.matchId);
    } else {
      status.textContent = 'Procurando adversário. Aguarde...';
      startMatchmakingPolling();
    }
  } catch (error) {
    showAlert(error.message);
  }
});

document.getElementById('cancelSearchBtn').addEventListener('click', async () => {
  if (!currentUser) return;

  try {
    await request(`/matches/cancel?userId=${currentUser.id}`, {
      method: 'POST'
    });

    stopMatchmakingPolling();
    setMatchmakingSearching(false);
    document.getElementById('matchmakingStatus').textContent = 'Busca cancelada.';
  } catch (error) {
    showAlert(error.message);
  }
});

document.getElementById('createManualMatchBtn').addEventListener('click', async () => {
  const white = document.getElementById('whitePlayerId').value;
  const black = document.getElementById('blackPlayerId').value;

  if (!white || !black) {
    showAlert('Informe o ID dos dois jogadores.');
    return;
  }

  try {
    const match = await request(`/matches?playerWhiteId=${white}&playerBlackId=${black}`, {
      method: 'POST'
    });

    openMatch(match.id);
  } catch (error) {
    showAlert(error.message);
  }
});

const refreshBoardBtn = document.getElementById('refreshBoardBtn');
if (refreshBoardBtn) {
  refreshBoardBtn.addEventListener('click', () => {
    if (!simulationMode) return;
    resetBoard();
  });
}

document.querySelectorAll('[data-promotion-piece]').forEach(btn => {
  btn.addEventListener('click', () => {
    resolvePromotionChoice(btn.dataset.promotionPiece || null);
  });
});

const usersListEl = document.getElementById('usersList');
if (usersListEl) {
  usersListEl.addEventListener('click', async (event) => {
    const btn = event.target.closest('.delete-user');
    if (!btn) return;

    if (!canAccessUsersTab() || !currentUser?.id) {
      showAlert('Acesso restrito. Apenas o usuário demo pode usar esta ação.');
      return;
    }

    const username = btn.dataset.username;
    const userId = btn.dataset.id;

    if (!confirm(`Excluir o usuário "${username}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    try {
      await request(`/users/${userId}?userId=${currentUser.id}`, {
        method: 'DELETE'
      });
      showAlert(`Usuário "${username}" excluído.`);
      loadUsers();
    } catch (error) {
      showAlert(error.message);
    }
  });
}

const endAllMatchesBtn = document.getElementById('endAllMatchesBtn');
if (endAllMatchesBtn) {
  endAllMatchesBtn.addEventListener('click', async () => {
    if (!canAccessUsersTab() || !currentUser?.id) {
      showAlert('Acesso restrito. Apenas o usuário demo pode usar esta ação.');
      return;
    }

    if (!confirm('Encerrar todas as partidas em andamento? Os jogadores serão desconectados da partida.')) {
      return;
    }

    try {
      const result = await request(`/matches/admin/end-active?userId=${currentUser.id}`, {
        method: 'POST'
      });

      const count = result?.endedCount ?? 0;
      if (currentMatchId) {
        clearMatchState();
        stopBoardPolling();
      }
      showAlert(count === 1 ? '1 partida encerrada.' : `${count} partidas encerradas.`);
    } catch (error) {
      showAlert(error.message);
    }
  });
}

bootstrapApp().catch(error => {
  console.error('[app] bootstrap failed', error);
  document.body.classList.remove('booting');
  void showView('home');
});
