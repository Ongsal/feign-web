import { useState, useEffect, useRef } from 'react';
import {
  ref,
  set,
  get,
  onValue,
  remove,
  push,
  update,
} from 'firebase/database';
import { db } from './firebase';

// ============================================
// 상수
// ============================================

const ROLES = {
  villager: {
    name: '시민',
    faction: 'innocent',
    desc: '특별한 능력은 없어요. 토론과 투표로 나쁜 사람을 찾아내세요.',
    emoji: '👤',
    night: false,
  },
  doctor: {
    name: '의사',
    faction: 'innocent',
    desc: '밤에 한 명을 치료해요. 그날 공격받으면 살려줍니다.',
    emoji: '💉',
    night: true,
    actionLabel: '치료할 대상',
    canTargetSelf: true,
  },
  police: {
    name: '경찰',
    faction: 'innocent',
    desc: '밤에 한 명을 가둡니다. 그 사람은 능력을 쓸 수 없어요.',
    emoji: '👮',
    night: true,
    actionLabel: '가둘 대상',
  },
  investigator: {
    name: '조사관',
    faction: 'innocent',
    desc: '밤에 한 명의 직업을 알아냅니다.',
    emoji: '🔍',
    night: true,
    actionLabel: '조사할 대상',
  },
  mad: {
    name: '정신병자',
    faction: 'innocent',
    desc: '자신을 다른 시민 직업으로 착각해요. 능력은 효과 없음!',
    emoji: '🤪',
    night: true,
  },
  imposter: {
    name: '임포스터',
    faction: 'imposter',
    desc: '밤에 한 명을 살해하세요. 정체를 들키지 마세요.',
    emoji: '🔪',
    night: true,
    actionLabel: '살해할 대상',
  },
  serialKiller: {
    name: '연쇄살인마',
    faction: 'neutral',
    desc: '혼자서 모두 죽이고 단독 승리합니다.',
    emoji: '🗡️',
    night: true,
    actionLabel: '살해할 대상',
  },
};

const ROLE_DISTRIBUTIONS = {
  4: ['doctor', 'police', 'villager', 'imposter'],
  5: ['doctor', 'police', 'investigator', 'villager', 'imposter'],
  6: ['doctor', 'police', 'investigator', 'mad', 'villager', 'imposter'],
  7: ['doctor', 'police', 'investigator', 'mad', 'villager', 'imposter', 'serialKiller'],
  8: ['doctor', 'police', 'investigator', 'mad', 'villager', 'villager', 'imposter', 'serialKiller'],
};

const PHASES = {
  LOBBY: 'lobby',
  ROLE_REVEAL: 'role_reveal',
  NIGHT: 'night',
  NIGHT_RESULT: 'night_result',
  DAY: 'day',
  VOTING: 'voting',
  VOTE_RESULT: 'vote_result',
  ENDED: 'ended',
};

const PHASE_DURATIONS = {
  [PHASES.ROLE_REVEAL]: 10_000,
  [PHASES.NIGHT]: 25_000,
  [PHASES.NIGHT_RESULT]: 8_000,
  [PHASES.DAY]: 75_000,
  [PHASES.VOTING]: 30_000,
  [PHASES.VOTE_RESULT]: 8_000,
};

const PLAYER_COLORS = [
  'bg-red-500',
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-orange-500',
  'bg-cyan-500',
];

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 8;

// ============================================
// 유틸
// ============================================

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function formatTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${s}s`;
}

function getOrCreatePlayerId() {
  let id = sessionStorage.getItem('feign_pid');
  if (!id) {
    id = generateId();
    sessionStorage.setItem('feign_pid', id);
  }
  return id;
}

// ============================================
// Firebase 래퍼
// ============================================

const stateRef = (code) => ref(db, `rooms/${code}/state`);
const actionsRef = (code) => ref(db, `rooms/${code}/actions`);
const actionRef = (code, pid) => ref(db, `rooms/${code}/actions/${pid}`);
const chatRef = (code) => ref(db, `rooms/${code}/chat`);

async function fbGet(r) {
  const snap = await get(r);
  return snap.val();
}

// ============================================
// 게임 로직
// ============================================

function assignRoles(players) {
  const count = players.length;
  const roleList = ROLE_DISTRIBUTIONS[count];
  if (!roleList) return players;
  const shuffled = shuffle(roleList);
  const innoRoles = ['doctor', 'police', 'investigator'];
  return players.map((p, i) => {
    const role = shuffled[i];
    let fakeRole = null;
    if (role === 'mad') {
      fakeRole = innoRoles[Math.floor(Math.random() * innoRoles.length)];
    }
    return { ...p, role, fakeRole, alive: true };
  });
}

function getDisplayRole(player) {
  if (player.role === 'mad' && player.fakeRole) return player.fakeRole;
  return player.role;
}

function resolveNight(state, actions) {
  const players = state.players.map((p) => ({ ...p }));
  const findById = (id) => players.find((p) => p.id === id);
  const alive = () => players.filter((p) => p.alive);

  const targets = {};
  for (const p of alive()) {
    const a = actions[p.id];
    if (a?.nightTarget) targets[p.id] = a.nightTarget;
  }

  const blockedActors = new Set();
  for (const p of alive()) {
    if (p.role === 'police' && targets[p.id]) blockedActors.add(targets[p.id]);
  }

  const killAttempts = new Set();
  for (const p of alive()) {
    if (
      (p.role === 'imposter' || p.role === 'serialKiller') &&
      targets[p.id] &&
      !blockedActors.has(p.id)
    ) {
      killAttempts.add(targets[p.id]);
    }
  }

  const heals = new Set();
  for (const p of alive()) {
    if (p.role === 'doctor' && targets[p.id] && !blockedActors.has(p.id)) {
      heals.add(targets[p.id]);
    }
  }

  const deaths = [];
  for (const targetId of killAttempts) {
    if (!heals.has(targetId)) {
      const t = findById(targetId);
      if (t && t.alive) {
        t.alive = false;
        deaths.push({ id: t.id, name: t.name, role: t.role });
      }
    }
  }

  const privateResults = {};
  for (const p of alive()) {
    if (p.role === 'investigator' && targets[p.id] && !blockedActors.has(p.id)) {
      const t = findById(targets[p.id]);
      if (t) privateResults[p.id] = { type: 'investigate', targetName: t.name, role: t.role };
    }
    if (p.role === 'police' && targets[p.id]) {
      const t = findById(targets[p.id]);
      if (t) privateResults[p.id] = { type: 'block', targetName: t.name };
    }
    if (p.role === 'doctor' && targets[p.id] && !blockedActors.has(p.id)) {
      const t = findById(targets[p.id]);
      if (t) {
        privateResults[p.id] = {
          type: 'heal',
          targetName: t.name,
          healed: killAttempts.has(t.id),
        };
      }
    }
  }

  return { players, deaths, privateResults };
}

function resolveVoting(state, actions) {
  const players = state.players.map((p) => ({ ...p }));
  const tally = {};
  let totalVotes = 0;
  for (const p of players) {
    if (!p.alive) continue;
    const a = actions[p.id];
    if (a?.vote && a.vote !== 'skip') {
      tally[a.vote] = (tally[a.vote] || 0) + 1;
      totalVotes++;
    }
  }
  let maxVotes = 0;
  let topPlayer = null;
  let tied = false;
  for (const [pid, count] of Object.entries(tally)) {
    if (count > maxVotes) {
      maxVotes = count;
      topPlayer = pid;
      tied = false;
    } else if (count === maxVotes) {
      tied = true;
    }
  }
  let eliminated = null;
  if (topPlayer && !tied && maxVotes > 0) {
    const p = players.find((x) => x.id === topPlayer);
    if (p) {
      p.alive = false;
      eliminated = { id: p.id, name: p.name, role: p.role };
    }
  }
  return { players, eliminated, tally, tied: tied && maxVotes > 0, noVote: totalVotes === 0 };
}

function checkWinner(players) {
  const alive = players.filter((p) => p.alive);
  if (alive.length === 0) return 'draw';
  const imposters = alive.filter((p) => ROLES[p.role].faction === 'imposter');
  const sks = alive.filter((p) => p.role === 'serialKiller');
  const innos = alive.filter((p) => ROLES[p.role].faction === 'innocent');
  if (sks.length === 1 && alive.length === 1) return 'serialKiller';
  if (imposters.length === 0 && sks.length === 0) return 'innocent';
  if (sks.length === 0 && imposters.length >= innos.length && imposters.length > 0) return 'imposter';
  return null;
}

// advancePhase: 새로운 state와 시스템 메시지 목록을 반환
function advancePhase(state, actions) {
  const currentPhase = state.phase;
  let next = { ...state };
  const messages = [];
  const nowTs = Date.now();

  if (currentPhase === PHASES.ROLE_REVEAL) {
    next.phase = PHASES.NIGHT;
    next.dayNumber = 1;
    next.phaseEndTime = nowTs + PHASE_DURATIONS[PHASES.NIGHT];
    messages.push({ type: 'system', text: '🌙 밤이 찾아왔어요. 각자 행동을 선택하세요.', ts: nowTs });
    return { next, messages };
  }

  if (currentPhase === PHASES.NIGHT) {
    const result = resolveNight(state, actions);
    next.players = result.players;
    next.privateReveal = { ...(state.privateReveal || {}) };
    for (const [pid, info] of Object.entries(result.privateResults)) {
      next.privateReveal[pid] = { ...info, dayNumber: state.dayNumber };
    }
    next.phase = PHASES.NIGHT_RESULT;
    next.phaseEndTime = nowTs + PHASE_DURATIONS[PHASES.NIGHT_RESULT];
    const winner = checkWinner(next.players);
    if (winner) {
      next.phase = PHASES.ENDED;
      next.winner = winner;
      next.phaseEndTime = 0;
    }
    const deathMsg =
      result.deaths.length === 0
        ? '🌅 아침이 밝았어요. 다행히 아무도 죽지 않았습니다.'
        : `🌅 아침이 밝았어요. ${result.deaths.map((d) => d.name).join(', ')}님이 사망했습니다.`;
    messages.push({ type: 'system', text: deathMsg, ts: nowTs });
    return { next, messages };
  }

  if (currentPhase === PHASES.NIGHT_RESULT) {
    next.phase = PHASES.DAY;
    next.phaseEndTime = nowTs + PHASE_DURATIONS[PHASES.DAY];
    messages.push({ type: 'system', text: '💬 토론 시간입니다. 누가 수상한지 이야기하세요.', ts: nowTs });
    return { next, messages };
  }

  if (currentPhase === PHASES.DAY) {
    next.phase = PHASES.VOTING;
    next.phaseEndTime = nowTs + PHASE_DURATIONS[PHASES.VOTING];
    messages.push({ type: 'system', text: '🗳️ 투표 시간! 추방할 사람을 고르세요.', ts: nowTs });
    return { next, messages };
  }

  if (currentPhase === PHASES.VOTING) {
    const result = resolveVoting(state, actions);
    next.players = result.players;
    next.phase = PHASES.VOTE_RESULT;
    next.phaseEndTime = nowTs + PHASE_DURATIONS[PHASES.VOTE_RESULT];
    let msg;
    if (result.eliminated) {
      msg = `⚖️ ${result.eliminated.name}님이 추방됐어요. 직업은 [${ROLES[result.eliminated.role].name}]였습니다.`;
    } else if (result.tied) {
      msg = '⚖️ 투표가 동점이라 아무도 추방되지 않았어요.';
    } else {
      msg = '⚖️ 아무도 투표하지 않아 조용히 넘어갔어요.';
    }
    messages.push({ type: 'system', text: msg, ts: nowTs });
    const winner = checkWinner(next.players);
    if (winner) {
      next.phase = PHASES.ENDED;
      next.winner = winner;
      next.phaseEndTime = 0;
    }
    return { next, messages };
  }

  if (currentPhase === PHASES.VOTE_RESULT) {
    next.phase = PHASES.NIGHT;
    next.dayNumber = state.dayNumber + 1;
    next.phaseEndTime = nowTs + PHASE_DURATIONS[PHASES.NIGHT];
    messages.push({ type: 'system', text: `🌙 ${next.dayNumber}번째 밤이 시작됐어요.`, ts: nowTs });
    return { next, messages };
  }

  return { next: state, messages: [] };
}

// ============================================
// 메인 컴포넌트
// ============================================

export default function App() {
  const [screen, setScreen] = useState('menu');
  const [playerId] = useState(() => getOrCreatePlayerId());
  const [playerName, setPlayerName] = useState(() => sessionStorage.getItem('feign_name') || '');
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [gameState, setGameState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [privateLog, setPrivateLog] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const processedDayRef = useRef(-1);
  const advanceInFlightRef = useRef(false);

  const isHost = gameState?.hostId === playerId;
  const mePlayer = gameState?.players?.find((p) => p.id === playerId);

  // 로컬 시계
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  // 이름 세션 저장
  useEffect(() => {
    if (playerName) sessionStorage.setItem('feign_name', playerName);
  }, [playerName]);

  // 방 상태 실시간 구독
  useEffect(() => {
    if (!roomCode) return;
    const unsub = onValue(stateRef(roomCode), (snap) => {
      const val = snap.val();
      if (val) setGameState(val);
    });
    return () => unsub();
  }, [roomCode]);

  // 채팅 실시간 구독
  useEffect(() => {
    if (!roomCode) return;
    const unsub = onValue(chatRef(roomCode), (snap) => {
      const val = snap.val();
      if (!val) {
        setChatMessages([]);
        return;
      }
      const arr = Object.entries(val).map(([key, m]) => ({ ...m, id: key }));
      arr.sort((a, b) => (a.ts || 0) - (b.ts || 0));
      setChatMessages(arr);
    });
    return () => unsub();
  }, [roomCode]);

  // 개인 조사 결과 기록 (state.privateReveal 변화 감지)
  useEffect(() => {
    if (!gameState?.privateReveal) return;
    const reveal = gameState.privateReveal[playerId];
    if (reveal && reveal.dayNumber !== processedDayRef.current) {
      processedDayRef.current = reveal.dayNumber;
      setPrivateLog((log) => [...log, reveal]);
    }
  }, [gameState?.privateReveal, playerId]);

  // 호스트: 페이즈 전환 타이머
  useEffect(() => {
    if (!isHost || !gameState) return;
    if (!gameState.phaseEndTime) return;
    if (gameState.phase === PHASES.ENDED || gameState.phase === PHASES.LOBBY) return;

    const targetTime = gameState.phaseEndTime;
    const delay = Math.max(0, targetTime - Date.now()) + 300; // 클라이언트 시계 차이 버퍼

    const timer = setTimeout(async () => {
      if (advanceInFlightRef.current) return;
      advanceInFlightRef.current = true;
      try {
        const fresh = await fbGet(stateRef(roomCode));
        if (!fresh || fresh.phaseEndTime !== targetTime) return; // 이미 다른 곳에서 진행됨
        const actions = (await fbGet(actionsRef(roomCode))) || {};
        const { next, messages } = advancePhase(fresh, actions);
        await set(stateRef(roomCode), next);
        if (next.phase !== fresh.phase) {
          await remove(actionsRef(roomCode));
        }
        for (const msg of messages) {
          await push(chatRef(roomCode), msg);
        }
      } catch (e) {
        console.error('advance phase error', e);
      } finally {
        advanceInFlightRef.current = false;
      }
    }, delay);

    return () => clearTimeout(timer);
  }, [isHost, gameState?.phase, gameState?.phaseEndTime, roomCode]);

  // ========== 핸들러 ==========

  const handleCreateRoom = async () => {
    const name = playerName.trim();
    if (!name) return setError('이름을 입력해주세요');
    setError('');
    setLoading(true);
    try {
      const code = generateRoomCode();
      const initial = {
        code,
        hostId: playerId,
        phase: PHASES.LOBBY,
        phaseEndTime: 0,
        dayNumber: 0,
        players: [
          {
            id: playerId,
            name: name.slice(0, 12),
            colorIdx: 0,
            role: null,
            fakeRole: null,
            alive: true,
          },
        ],
        privateReveal: {},
        winner: null,
      };
      await set(stateRef(code), initial);
      await push(chatRef(code), {
        type: 'system',
        text: `${name}님이 방을 만들었습니다. 코드: ${code}`,
        ts: Date.now(),
      });
      setRoomCode(code);
      setScreen('lobby');
    } catch (e) {
      setError('방 생성 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRoom = async () => {
    const name = playerName.trim();
    if (!name) return setError('이름을 입력해주세요');
    const code = inputCode.trim().toUpperCase();
    if (code.length !== 4) return setError('4자리 방 코드를 입력해주세요');
    setError('');
    setLoading(true);
    try {
      const state = await fbGet(stateRef(code));
      if (!state) {
        setError('방을 찾을 수 없어요.');
        return;
      }
      if (state.phase !== PHASES.LOBBY) {
        setError('이미 게임이 시작됐어요.');
        return;
      }
      const players = state.players || [];
      if (players.length >= MAX_PLAYERS) {
        setError('정원 초과예요.');
        return;
      }
      if (players.some((p) => p.name === name)) {
        setError('이미 사용 중인 이름이에요.');
        return;
      }
      if (players.some((p) => p.id === playerId)) {
        // 이미 들어가 있음 (새로고침 케이스)
        setRoomCode(code);
        setScreen('lobby');
        return;
      }
      const nextPlayers = [
        ...players,
        {
          id: playerId,
          name: name.slice(0, 12),
          colorIdx: players.length % PLAYER_COLORS.length,
          role: null,
          fakeRole: null,
          alive: true,
        },
      ];
      await update(stateRef(code), { players: nextPlayers });
      await push(chatRef(code), {
        type: 'system',
        text: `${name}님이 입장했습니다.`,
        ts: Date.now(),
      });
      setRoomCode(code);
      setScreen('lobby');
    } catch (e) {
      setError('입장 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStartGame = async () => {
    if (!gameState) return;
    if (gameState.players.length < MIN_PLAYERS) {
      setError(`최소 ${MIN_PLAYERS}명이 필요해요.`);
      return;
    }
    const withRoles = assignRoles(gameState.players);
    const next = {
      ...gameState,
      players: withRoles,
      phase: PHASES.ROLE_REVEAL,
      phaseEndTime: Date.now() + PHASE_DURATIONS[PHASES.ROLE_REVEAL],
      dayNumber: 0,
      privateReveal: {},
      winner: null,
    };
    await set(stateRef(gameState.code), next);
    await push(chatRef(gameState.code), {
      type: 'system',
      text: '게임이 시작됐어요! 자신의 직업을 확인하세요.',
      ts: Date.now(),
    });
    setScreen('game');
  };

  // LOBBY 벗어나면 자동 game으로
  useEffect(() => {
    if (gameState && gameState.phase !== PHASES.LOBBY && screen === 'lobby') {
      setScreen('game');
    }
  }, [gameState?.phase, screen]);

  const sendChat = async (text) => {
    if (!text.trim() || !gameState || !mePlayer) return;
    const trimmed = text.trim().slice(0, 200);
    const isDead = !mePlayer.alive;
    const isImposterChat =
      gameState.phase === PHASES.NIGHT &&
      ROLES[mePlayer.role]?.faction === 'imposter' &&
      mePlayer.alive;
    const type = isDead ? 'dead' : isImposterChat ? 'imposter' : 'normal';
    await push(chatRef(gameState.code), {
      playerId,
      name: mePlayer.name,
      colorIdx: mePlayer.colorIdx ?? 0,
      text: trimmed,
      ts: Date.now(),
      type,
    });
  };

  const submitTarget = async (targetId) => {
    if (!gameState) return;
    await update(actionRef(gameState.code, playerId), { nightTarget: targetId });
  };

  const submitVote = async (targetId) => {
    if (!gameState) return;
    await update(actionRef(gameState.code, playerId), { vote: targetId });
  };

  const leaveRoom = () => {
    setRoomCode('');
    setGameState(null);
    setChatMessages([]);
    setPrivateLog([]);
    setScreen('menu');
    processedDayRef.current = -1;
  };

  const resetToLobby = async () => {
    if (!gameState || !isHost) return;
    const next = {
      ...gameState,
      phase: PHASES.LOBBY,
      phaseEndTime: 0,
      dayNumber: 0,
      players: gameState.players.map((p) => ({
        ...p,
        role: null,
        fakeRole: null,
        alive: true,
      })),
      privateReveal: {},
      winner: null,
    };
    await set(stateRef(gameState.code), next);
    await remove(actionsRef(gameState.code));
    await push(chatRef(gameState.code), {
      type: 'system',
      text: '대기실로 돌아왔어요. 호스트가 다시 시작할 수 있습니다.',
      ts: Date.now(),
    });
    processedDayRef.current = -1;
    setPrivateLog([]);
  };

  // ========== 렌더 ==========

  if (screen === 'menu') {
    return (
      <MenuScreen
        playerName={playerName}
        setPlayerName={setPlayerName}
        inputCode={inputCode}
        setInputCode={setInputCode}
        onCreate={handleCreateRoom}
        onJoin={handleJoinRoom}
        error={error}
        loading={loading}
      />
    );
  }

  if (!gameState) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
        <div className="text-lg">연결 중...</div>
      </div>
    );
  }

  if (screen === 'lobby' || gameState.phase === PHASES.LOBBY) {
    return (
      <LobbyScreen
        state={gameState}
        playerId={playerId}
        isHost={isHost}
        onStart={handleStartGame}
        onLeave={leaveRoom}
        error={error}
      />
    );
  }

  return (
    <GameScreen
      state={gameState}
      now={now}
      playerId={playerId}
      isHost={isHost}
      mePlayer={mePlayer}
      chatMessages={chatMessages}
      privateLog={privateLog}
      onChat={sendChat}
      onTarget={submitTarget}
      onVote={submitVote}
      onLeave={leaveRoom}
      onResetToLobby={resetToLobby}
    />
  );
}

// ============================================
// 메뉴 화면
// ============================================

function MenuScreen({ playerName, setPlayerName, inputCode, setInputCode, onCreate, onJoin, error, loading }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800/80 backdrop-blur rounded-2xl p-8 shadow-2xl border border-slate-700">
        <h1 className="text-4xl font-bold text-center mb-2">FEIGN</h1>
        <p className="text-center text-slate-400 mb-8 text-sm">마피아류 추리 게임 · 친구들과 함께</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">내 이름</label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              maxLength={12}
              className="w-full px-4 py-3 bg-slate-900 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 text-white"
              placeholder="12자 이내"
            />
          </div>
          <button
            onClick={onCreate}
            disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg font-semibold transition"
          >
            🏠 새 방 만들기
          </button>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500">또는</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">방 코드</label>
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              maxLength={4}
              className="w-full px-4 py-3 bg-slate-900 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 text-white uppercase tracking-widest text-center text-xl font-mono"
              placeholder="ABCD"
            />
          </div>
          <button
            onClick={onJoin}
            disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg font-semibold transition"
          >
            🚪 방 입장하기
          </button>
          {error && <div className="text-red-400 text-sm text-center">{error}</div>}
        </div>
        <div className="mt-8 text-xs text-slate-500 text-center">
          <p>4~8명 플레이 · URL 공유하면 같이 놀 수 있어요</p>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 대기실
// ============================================

function LobbyScreen({ state, playerId, isHost, onStart, onLeave, error }) {
  const players = state.players || [];
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-900 text-white p-4">
      <div className="max-w-3xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <button onClick={onLeave} className="text-sm text-slate-400 hover:text-white">
            ← 나가기
          </button>
          <h1 className="text-xl font-bold">대기실</h1>
          <div className="w-16" />
        </div>
        <div className="bg-slate-800/80 rounded-2xl p-6 mb-6 border border-slate-700 text-center">
          <p className="text-slate-400 text-sm mb-1">방 코드</p>
          <p className="text-5xl font-mono font-bold tracking-widest text-indigo-300">{state.code}</p>
          <p className="text-xs text-slate-500 mt-2">친구에게 이 코드를 공유하세요</p>
        </div>
        <div className="bg-slate-800/80 rounded-2xl p-6 mb-6 border border-slate-700">
          <h2 className="font-semibold mb-4">
            참가자 ({players.length}/{MAX_PLAYERS})
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {players.map((p) => (
              <div
                key={p.id}
                className={`flex items-center gap-2 p-3 rounded-lg border ${
                  p.id === state.hostId ? 'border-yellow-500 bg-yellow-500/10' : 'border-slate-700 bg-slate-900/50'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-full ${PLAYER_COLORS[p.colorIdx] || 'bg-slate-500'} flex items-center justify-center font-bold text-sm`}
                >
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {p.name}
                    {p.id === playerId && <span className="text-xs text-slate-400"> (나)</span>}
                  </div>
                  {p.id === state.hostId && <div className="text-xs text-yellow-400">👑 호스트</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-slate-800/80 rounded-2xl p-6 border border-slate-700">
          {isHost ? (
            <>
              <p className="text-sm text-slate-400 mb-4 text-center">
                {players.length < MIN_PLAYERS
                  ? `최소 ${MIN_PLAYERS}명이 필요해요 (현재 ${players.length}명)`
                  : `준비 완료! ${players.length}명으로 시작할 수 있어요.`}
              </p>
              <button
                onClick={onStart}
                disabled={players.length < MIN_PLAYERS}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold transition"
              >
                🎮 게임 시작
              </button>
              {error && <div className="text-red-400 text-sm text-center mt-3">{error}</div>}
            </>
          ) : (
            <p className="text-center text-slate-400">호스트가 시작하기를 기다리는 중...</p>
          )}
        </div>
        <details className="mt-6 bg-slate-800/50 rounded-xl p-4 border border-slate-700">
          <summary className="cursor-pointer font-medium text-sm">📖 게임 규칙</summary>
          <div className="mt-3 text-sm text-slate-300 space-y-2">
            <p><b>시민팀</b>: 투표로 임포스터 모두 추방하면 승리</p>
            <p><b>임포스터</b>: 시민 수 ≤ 임포스터 수가 되면 승리</p>
            <p><b>연쇄살인마</b> (7인 이상): 혼자 남으면 승리</p>
            <p>밤엔 능력 사용, 낮엔 토론하고 투표로 한 명 추방!</p>
          </div>
        </details>
      </div>
    </div>
  );
}

// ============================================
// 게임 화면
// ============================================

function GameScreen({
  state,
  now,
  playerId,
  isHost,
  mePlayer,
  chatMessages,
  privateLog,
  onChat,
  onTarget,
  onVote,
  onLeave,
  onResetToLobby,
}) {
  const timeLeft = state.phaseEndTime ? Math.max(0, state.phaseEndTime - now) : 0;
  const isDead = mePlayer && !mePlayer.alive;
  const phase = state.phase;

  const displayRoleKey = mePlayer ? getDisplayRole(mePlayer) : null;
  const realRoleKey = mePlayer?.role;
  const displayRole = displayRoleKey ? ROLES[displayRoleKey] : null;
  const realRole = realRoleKey ? ROLES[realRoleKey] : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-white">
      <div className="max-w-6xl mx-auto p-3 sm:p-4">
        <div className="flex items-center justify-between mb-4 bg-slate-800/80 rounded-xl px-4 py-3 border border-slate-700">
          <button onClick={onLeave} className="text-sm text-slate-400 hover:text-white">나가기</button>
          <div className="text-center">
            <div className="text-xs text-slate-400">
              {phase === PHASES.ROLE_REVEAL && '직업 확인'}
              {phase === PHASES.NIGHT && `🌙 ${state.dayNumber}일차 밤`}
              {phase === PHASES.NIGHT_RESULT && '🌅 밤의 결과'}
              {phase === PHASES.DAY && `💬 ${state.dayNumber}일차 토론`}
              {phase === PHASES.VOTING && '🗳️ 투표 중'}
              {phase === PHASES.VOTE_RESULT && '⚖️ 투표 결과'}
              {phase === PHASES.ENDED && '게임 종료'}
            </div>
            {phase !== PHASES.ENDED && (
              <div className="text-xl font-bold font-mono tabular-nums">{formatTime(timeLeft)}</div>
            )}
          </div>
          <div className="text-xs text-slate-400 font-mono">{state.code}</div>
        </div>

        {phase === PHASES.ENDED && (
          <EndScreen state={state} mePlayer={mePlayer} isHost={isHost} onResetToLobby={onResetToLobby} />
        )}

        {phase !== PHASES.ENDED && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              {displayRole && (
                <div
                  className={`rounded-xl p-4 border-2 ${
                    isDead
                      ? 'bg-slate-800/50 border-slate-700 opacity-60'
                      : realRole.faction === 'innocent'
                      ? 'bg-blue-950/40 border-blue-700'
                      : realRole.faction === 'imposter'
                      ? 'bg-red-950/40 border-red-700'
                      : 'bg-purple-950/40 border-purple-700'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-5xl">{displayRole.emoji}</div>
                    <div className="flex-1">
                      <div className="text-xs text-slate-400">내 직업</div>
                      <div className="text-2xl font-bold">{displayRole.name}</div>
                      <div className="text-sm text-slate-300 mt-1">{displayRole.desc}</div>
                      {isDead && (
                        <div className="text-sm text-red-400 mt-2">☠️ 당신은 사망했습니다 (관전 모드)</div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <PlayerGrid
                state={state}
                playerId={playerId}
                mePlayer={mePlayer}
                phase={phase}
                onTarget={onTarget}
                onVote={onVote}
              />

              {privateLog.length > 0 && (
                <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700">
                  <h3 className="font-semibold mb-2 text-sm">🔎 내 개인 기록</h3>
                  <div className="space-y-1 text-sm text-slate-300 max-h-40 overflow-y-auto">
                    {privateLog.map((r, i) => (
                      <div key={i} className="border-l-2 border-indigo-500 pl-2">
                        <span className="text-slate-500">[{r.dayNumber}일차]</span>{' '}
                        {r.type === 'investigate' && (
                          <>
                            <b>{r.targetName}</b>의 직업은{' '}
                            <b className="text-indigo-300">{ROLES[r.role]?.name}</b>입니다.
                          </>
                        )}
                        {r.type === 'heal' && (
                          <>
                            <b>{r.targetName}</b>을(를) 치료했어요.{' '}
                            {r.healed ? '🩹 살려냈습니다!' : '공격받지 않았어요.'}
                          </>
                        )}
                        {r.type === 'block' && (
                          <>
                            <b>{r.targetName}</b>을(를) 가뒀어요.
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="lg:col-span-1">
              <ChatBox
                state={state}
                mePlayer={mePlayer}
                phase={phase}
                chatMessages={chatMessages}
                onChat={onChat}
                isDead={isDead}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// 플레이어 그리드
// ============================================

function PlayerGrid({ state, playerId, mePlayer, phase, onTarget, onVote }) {
  const [selectedTarget, setSelectedTarget] = useState(null);
  const [selectedVote, setSelectedVote] = useState(null);

  useEffect(() => {
    setSelectedTarget(null);
    setSelectedVote(null);
  }, [phase]);

  const canTarget = phase === PHASES.NIGHT && mePlayer?.alive;
  const canVote = phase === PHASES.VOTING && mePlayer?.alive;

  const myRoleKey = mePlayer ? getDisplayRole(mePlayer) : null;
  const myRole = myRoleKey ? ROLES[myRoleKey] : null;
  const canUseNightAction = myRole?.night && myRole?.actionLabel;
  const canTargetSelf = myRole?.canTargetSelf;

  const handleTargetClick = (targetId) => {
    if (!canTarget || !canUseNightAction) return;
    setSelectedTarget(targetId);
    onTarget(targetId);
  };
  const handleVoteClick = (targetId) => {
    if (!canVote) return;
    setSelectedVote(targetId);
    onVote(targetId);
  };

  return (
    <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-semibold text-sm">플레이어</h3>
        {canTarget && canUseNightAction && (
          <span className="text-xs text-indigo-400">
            {myRole.actionLabel} 선택 {selectedTarget ? '✓' : ''}
          </span>
        )}
        {canVote && (
          <span className="text-xs text-yellow-400">
            추방할 사람 선택 {selectedVote ? '✓' : ''}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {state.players.map((p) => {
          const isMe = p.id === playerId;
          const isSelectableTarget =
            canTarget && canUseNightAction && p.alive && (canTargetSelf || !isMe);
          const isSelectableVote = canVote && p.alive && !isMe;
          const isSelected =
            (canTarget && selectedTarget === p.id) || (canVote && selectedVote === p.id);
          const isClickable = isSelectableTarget || isSelectableVote;
          return (
            <button
              key={p.id}
              onClick={() => {
                if (canTarget) handleTargetClick(p.id);
                else if (canVote) handleVoteClick(p.id);
              }}
              disabled={!isClickable}
              className={`flex items-center gap-2 p-2 rounded-lg border-2 transition text-left ${
                !p.alive
                  ? 'bg-slate-900/50 border-slate-800 opacity-40'
                  : isSelected
                  ? 'bg-indigo-600/30 border-indigo-400'
                  : isClickable
                  ? 'bg-slate-900/70 border-slate-700 hover:border-indigo-500 cursor-pointer'
                  : 'bg-slate-900/70 border-slate-700'
              }`}
            >
              <div
                className={`w-10 h-10 rounded-full ${PLAYER_COLORS[p.colorIdx] || 'bg-slate-500'} flex items-center justify-center font-bold flex-shrink-0 ${
                  !p.alive ? 'grayscale' : ''
                }`}
              >
                {p.alive ? p.name.charAt(0) : '☠'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate text-sm">
                  {p.name}
                  {isMe && <span className="text-xs text-slate-400"> (나)</span>}
                </div>
                {!p.alive && (
                  <div className="text-xs text-red-400 truncate">💀 {ROLES[p.role]?.name}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
      {canTarget && canUseNightAction && (
        <p className="text-xs text-slate-500 mt-3">💡 시간 내에 다시 선택하면 변경 가능.</p>
      )}
      {canTarget && !canUseNightAction && (
        <p className="text-xs text-slate-500 mt-3">💡 당신은 밤 행동이 없어요. 아침까지 기다리세요.</p>
      )}
    </div>
  );
}

// ============================================
// 채팅 박스
// ============================================

function ChatBox({ state, mePlayer, phase, chatMessages, onChat, isDead }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages.length]);

  const myRoleKey = mePlayer?.role;
  const myRole = ROLES[myRoleKey];
  const imposterNight =
    phase === PHASES.NIGHT && myRole?.faction === 'imposter' && mePlayer?.alive;

  const visibleChat = chatMessages.filter((m) => {
    if (m.type === 'system') return true;
    if (m.type === 'dead') return isDead;
    if (m.type === 'imposter') return mePlayer && ROLES[mePlayer.role]?.faction === 'imposter';
    if (phase === PHASES.NIGHT && !isDead) return false;
    return true;
  });

  const canChat =
    phase !== PHASES.ROLE_REVEAL && phase !== PHASES.NIGHT_RESULT && phase !== PHASES.VOTE_RESULT;
  const nightChatOnlyImposter = phase === PHASES.NIGHT && !isDead && !imposterNight;

  const send = () => {
    if (!input.trim() || !canChat || nightChatOnlyImposter) return;
    onChat(input);
    setInput('');
  };

  let placeholder = '메시지 입력...';
  if (isDead) placeholder = '사망자끼리 대화';
  else if (nightChatOnlyImposter) placeholder = '밤에는 조용히... (임포스터/사망자만 채팅)';
  else if (imposterNight) placeholder = '임포스터 채팅 (시민은 못 봄)';

  return (
    <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700 flex flex-col h-[60vh] lg:h-[75vh]">
      <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
        💬 채팅
        {imposterNight && <span className="text-xs text-red-400">(임포스터 전용)</span>}
        {isDead && <span className="text-xs text-slate-500">(사망자)</span>}
      </h3>
      <div className="flex-1 overflow-y-auto space-y-1 text-sm pr-1">
        {visibleChat.map((m) => (
          <div
            key={m.id}
            className={`${
              m.type === 'system'
                ? 'text-slate-400 italic text-xs py-1'
                : m.type === 'imposter'
                ? 'text-red-300'
                : m.type === 'dead'
                ? 'text-slate-500 italic'
                : 'text-slate-200'
            }`}
          >
            {m.type === 'system' ? (
              <span>• {m.text}</span>
            ) : (
              <>
                <span className="font-semibold">{m.name}:</span> {m.text}
              </>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 mt-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={!canChat || nightChatOnlyImposter}
          placeholder={placeholder}
          maxLength={200}
          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
        />
        <button
          onClick={send}
          disabled={!canChat || nightChatOnlyImposter || !input.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-sm font-medium"
        >
          전송
        </button>
      </div>
    </div>
  );
}

// ============================================
// 종료 화면
// ============================================

function EndScreen({ state, mePlayer, isHost, onResetToLobby }) {
  const winner = state.winner;
  const myFaction = mePlayer?.role ? ROLES[mePlayer.role].faction : null;
  const myRoleKey = mePlayer?.role;
  const won =
    (winner === 'innocent' && myFaction === 'innocent') ||
    (winner === 'imposter' && myFaction === 'imposter') ||
    (winner === 'serialKiller' && myRoleKey === 'serialKiller');

  const winnerText =
    {
      innocent: '🎉 시민팀 승리!',
      imposter: '🔪 임포스터 승리!',
      serialKiller: '🗡️ 연쇄살인마 단독 승리!',
      draw: '🤝 무승부',
    }[winner] || '게임 종료';

  return (
    <div className="bg-slate-800/80 rounded-2xl p-6 border border-slate-700">
      <h2 className="text-3xl font-bold text-center mb-2">{winnerText}</h2>
      <p className={`text-center text-lg mb-6 ${won ? 'text-green-400' : 'text-slate-400'}`}>
        {won ? '✨ 당신은 승리했어요!' : '😢 다음 기회에...'}
      </p>
      <div className="bg-slate-900/60 rounded-xl p-4 mb-4">
        <h3 className="font-semibold mb-3 text-sm">최종 직업 공개</h3>
        <div className="space-y-2">
          {state.players.map((p) => (
            <div key={p.id} className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-full ${PLAYER_COLORS[p.colorIdx] || 'bg-slate-500'} flex items-center justify-center font-bold text-sm ${
                  !p.alive ? 'grayscale opacity-60' : ''
                }`}
              >
                {p.name.charAt(0)}
              </div>
              <div className="flex-1">
                <span className="font-medium">{p.name}</span>
                {!p.alive && <span className="text-xs text-red-400 ml-2">☠️ 사망</span>}
              </div>
              <div className="text-sm font-semibold">
                {ROLES[p.role]?.emoji} {ROLES[p.role]?.name}
                {p.role === 'mad' && p.fakeRole && (
                  <span className="text-xs text-slate-500 ml-1">
                    (착각: {ROLES[p.fakeRole]?.name})
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      {isHost && (
        <button
          onClick={onResetToLobby}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold transition"
        >
          🔁 대기실로 돌아가기 (새 판 시작)
        </button>
      )}
      {!isHost && (
        <p className="text-center text-sm text-slate-400">호스트가 다시 시작하면 자동으로 들어가요.</p>
      )}
    </div>
  );
}
