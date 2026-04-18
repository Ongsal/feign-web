// ==========================================================
// FEIGN v2.0 - 풀버전
// 직업 15개 + 호스트 커스텀 설정 + 마을 뷰 + 애니메이션
// ==========================================================

import { useState, useEffect, useRef, useMemo } from 'react';
import { ref, set, get, onValue, remove, push, update } from 'firebase/database';
import { db } from './firebase';

// ==========================================================
// 역할 정의
// ==========================================================

// 직업 정의 — 겸용은 _civ / _imp로 분리
const ROLES = {
  // 시민 전용
  doctor: {
    name: '의사', emoji: '💉', faction: 'innocent', night: true,
    actionLabel: '치료', cooldown: 'lastNight',
    desc: '밤에 한 명을 치료. 공격받으면 살려요. (자기 ❌, 어제 대상 ❌)',
  },
  mad: {
    name: '정신병자', emoji: '🤪', faction: 'innocent', night: true,
    desc: '자신을 시민 능력직으로 착각. 능력은 모두 가짜 결과.',
  },
  // 겸용 - 시민 버전
  police_civ: {
    name: '경찰', emoji: '👮', faction: 'innocent', night: true, baseKind: 'police',
    actionLabel: '감금', cooldown: 'lastNight',
    desc: '밤에 한 명을 감금. 능력 사용 차단. (자기 ❌, 어제 대상 ❌)',
  },
  investigator_civ: {
    name: '조사관', emoji: '🔍', faction: 'innocent', night: true, baseKind: 'investigator',
    actionLabel: '조사', cooldown: 'permanent',
    desc: '밤에 한 명 조사. 시민/악역 2가지 중 하나가 진짜. (이미 조사한 사람 ❌)',
  },
  lookout_civ: {
    name: '관찰자', emoji: '👁️', faction: 'innocent', night: true, baseKind: 'lookout',
    actionLabel: '관찰', cooldown: 'lastNight',
    desc: '한 집의 방문자 수 확인. (자기 ❌, 어제 대상 ❌)',
  },
  trapper_civ: {
    name: '트래퍼', emoji: '🪤', faction: 'innocent', night: true, baseKind: 'trapper',
    actionLabel: '덫 설치', cooldown: 'lastNight',
    desc: '집에 덫 설치. 방문자 능력 무효. 하루 뒤 소멸.',
  },
  snitch_civ: {
    name: '밀고자', emoji: '📢', faction: 'innocent', night: true, baseKind: 'snitch',
    actionLabel: '밀고', usesMax: 1,
    desc: '공개 밀고. 본인만 타겟 직업 확인. (1게임 1회)',
  },
  provoker_civ: {
    name: '선동가', emoji: '📣', faction: 'innocent', night: true, baseKind: 'provoker',
    actionLabel: '선동', usesMax: 2,
    desc: '타겟 다음 투표 +2표. (1게임 2회)',
  },
  tracker_civ: {
    name: '추적자', emoji: '👣', faction: 'innocent', night: true, baseKind: 'tracker',
    actionLabel: '추적', cooldown: 'lastNight',
    desc: '발자국으로 타겟의 이동 추적.',
  },
  // 겸용 - 임포스터 버전
  police_imp: {
    name: '경찰', emoji: '👮', faction: 'imposter', night: true, baseKind: 'police',
    actionLabel: '감금', cooldown: 'lastNight', isKiller: true,
    desc: '밤마다 살해 OR 감금 중 택 1.',
  },
  investigator_imp: {
    name: '조사관', emoji: '🔍', faction: 'imposter', night: true, baseKind: 'investigator',
    actionLabel: '조사', cooldown: 'permanent', isKiller: true,
    desc: '밤마다 살해 OR 조사 중 택 1.',
  },
  lookout_imp: {
    name: '관찰자', emoji: '👁️', faction: 'imposter', night: true, baseKind: 'lookout',
    actionLabel: '관찰', cooldown: 'lastNight', isKiller: true,
    desc: '밤마다 살해 OR 관찰 중 택 1.',
  },
  trapper_imp: {
    name: '트래퍼', emoji: '🪤', faction: 'imposter', night: true, baseKind: 'trapper',
    actionLabel: '덫 설치', cooldown: 'lastNight', isKiller: true,
    desc: '밤마다 살해 OR 덫 설치 중 택 1.',
  },
  snitch_imp: {
    name: '밀고자', emoji: '📢', faction: 'imposter', night: true, baseKind: 'snitch',
    actionLabel: '밀고', usesMax: 1, isKiller: true,
    desc: '밤마다 살해 OR 밀고 (1회). 소진 후 살해만.',
  },
  provoker_imp: {
    name: '선동가', emoji: '📣', faction: 'imposter', night: true, baseKind: 'provoker',
    actionLabel: '선동', usesMax: 2, isKiller: true,
    desc: '밤마다 살해 OR 선동 (2회). 소진 후 살해만.',
  },
  tracker_imp: {
    name: '추적자', emoji: '👣', faction: 'imposter', night: true, baseKind: 'tracker',
    actionLabel: '추적', cooldown: 'lastNight', isKiller: true,
    desc: '밤마다 살해 OR 추적 중 택 1.',
  },
  // 임포스터 전용
  cleaner: {
    name: '청소부', emoji: '🧹', faction: 'imposter', night: true, isKiller: true,
    actionLabel: '청소', cooldown: 'lastNight',
    desc: '밤마다 살해 OR 청소. 청소된 대상이 사망하면 직업 은폐.',
  },
  painter: {
    name: '페인터', emoji: '🎨', faction: 'imposter', night: true, isKiller: true,
    actionLabel: '페인트', cooldown: 'lastNight',
    desc: '밤마다 살해 OR 페인트. 페인트된 대상이 사망하면 임포스터 직업으로 위장.',
  },
  // 중립
  serialKiller: {
    name: '연쇄살인마', emoji: '🗡️', faction: 'neutral', night: true,
    actionLabel: '살해', winCondition: 'solo',
    desc: '밤에 살해 (최고 우선순위). 혼자 살아남으면 승리.',
  },
  magician: {
    name: '마법사', emoji: '🔮', faction: 'neutral', night: true,
    actionLabel: '주문', winCondition: 'solo',
    desc: '타겟 직업을 맞히면 즉사. 틀리면 자살.',
  },
  bomber: {
    name: '폭탄마', emoji: '💣', faction: 'neutral', night: true,
    winCondition: 'solo',
    desc: '밤마다 설치 OR 폭파 택 1. 혼자 살아남으면 승리.',
  },
  thief: {
    name: '도둑', emoji: '🥷', faction: 'neutral', night: true, isKiller: true,
    actionLabel: '절도',
    desc: '살해 + 직업 훔침. 훔친 진영으로 변신.',
  },
  survivor: {
    name: '생존자', emoji: '🛡️', faction: 'neutral', night: true,
    actionLabel: '방패', usesMax: 3, winCondition: 'survive',
    desc: '방패 3회. 끝까지 살아남으면 승리팀과 함께 승리.',
  },
};

// 호스트가 선택 가능한 직업 키 (정렬된 순서)
const SELECTABLE_ROLES = [
  // 시민
  'doctor', 'mad',
  // 겸용 - 시민 버전
  'police_civ', 'investigator_civ', 'lookout_civ', 'trapper_civ',
  'snitch_civ', 'provoker_civ', 'tracker_civ',
  // 겸용 - 임포스터 버전
  'police_imp', 'investigator_imp', 'lookout_imp', 'trapper_imp',
  'snitch_imp', 'provoker_imp', 'tracker_imp',
  // 임포스터 전용
  'cleaner', 'painter',
  // 중립
  'serialKiller', 'magician', 'bomber', 'thief', 'survivor',
];

// 정신병자가 받을 수 있는 가짜 직업 (모든 시민 능력직)
const MAD_FAKE_ROLES = [
  'doctor', 'police_civ', 'investigator_civ', 'lookout_civ',
  'trapper_civ', 'snitch_civ', 'provoker_civ', 'tracker_civ',
];

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
  [PHASES.ROLE_REVEAL]: 12_000,
  [PHASES.NIGHT]: 30_000,
  [PHASES.NIGHT_RESULT]: 10_000,
  [PHASES.DAY]: 90_000,
  [PHASES.VOTING]: 30_000,
  [PHASES.VOTE_RESULT]: 10_000,
};

// 캐릭터 색상
const PLAYER_COLORS_HEX = [
  '#ef4444', '#3b82f6', '#22c55e', '#eab308',
  '#a855f7', '#ec4899', '#f97316', '#06b6d4',
  '#84cc16', '#14b8a6', '#8b5cf6', '#f59e0b',
];
const PLAYER_COLORS_BG = [
  'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500',
  'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-cyan-500',
  'bg-lime-500', 'bg-teal-500', 'bg-violet-500', 'bg-amber-500',
];

const MIN_PLAYERS = 4;
const MAX_PLAYERS = 12;

// ==========================================================
// 유틸리티
// ==========================================================

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
function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// 착각한 역할(=실제로 쓸 역할)을 반환
function getEffectiveRole(player) {
  if (player.role === 'mad' && player.fakeRole) return player.fakeRole;
  return player.role;
}

// UI에 보여줄 역할 이름 (정신병자는 가짜 역할 이름)
function getDisplayRoleKey(player) {
  if (player.role === 'mad' && player.fakeRole) return player.fakeRole;
  return player.role;
}

// 타겟 차단 ID 집합 반환
function getBlockedTargetIds(mePlayer) {
  const blocked = new Set();
  if (!mePlayer) return blocked;
  const effKey = getEffectiveRole(mePlayer);
  const def = ROLES[effKey];
  if (!def) return blocked;
  if (def.cooldown === 'lastNight' && mePlayer.lastNightTarget) {
    blocked.add(mePlayer.lastNightTarget);
  }
  if (def.cooldown === 'permanent') {
    for (const id of mePlayer.investigatedIds || []) blocked.add(id);
  }
  return blocked;
}

// ==========================================================
// Firebase
// ==========================================================

const stateRef = (code) => ref(db, `rooms/${code}/state`);
const actionsRef = (code) => ref(db, `rooms/${code}/actions`);
const actionRef = (code, pid) => ref(db, `rooms/${code}/actions/${pid}`);
const chatRef = (code) => ref(db, `rooms/${code}/chat`);

async function fbGet(r) {
  const snap = await get(r);
  return snap.val();
}

// ==========================================================
// 게임 로직
// ==========================================================

function assignRoles(players, roleConfig) {
  // roleConfig: { doctor: 2, mad: 1, police_civ: 1, ... }
  const pool = [];
  for (const [roleKey, count] of Object.entries(roleConfig)) {
    for (let i = 0; i < count; i++) pool.push(roleKey);
  }
  const shuffled = shuffle(pool);
  return players.map((p, i) => {
    const role = shuffled[i];
    let fakeRole = null;
    if (role === 'mad') fakeRole = randomChoice(MAD_FAKE_ROLES);
    const def = ROLES[role];
    return {
      ...p,
      role,
      fakeRole,
      alive: true,
      lastNightTarget: null,
      investigatedIds: [],
      usesLeft: def?.usesMax != null ? def.usesMax : null,
      // Mad는 착각한 역할의 usesMax 사용
      madUsesLeft: role === 'mad' && ROLES[fakeRole]?.usesMax != null ? ROLES[fakeRole].usesMax : null,
      hasCleanMark: false,
      hasPaintMark: false,
      paintDisguiseRole: null,
      stolenRole: false,
    };
  });
}

// 임포스터 팀 멤버 여부
function isImposterRole(roleKey) {
  return ROLES[roleKey]?.faction === 'imposter';
}
function isNeutralKillerRole(roleKey) {
  return ['serialKiller', 'magician', 'bomber'].includes(roleKey);
}

// 승리 판정
function checkWinner(players) {
  const alive = players.filter((p) => p.alive);
  if (alive.length === 0) return 'draw';

  const aliveImp = alive.filter((p) => isImposterRole(p.role));
  const aliveNeutralKillers = alive.filter((p) => isNeutralKillerRole(p.role));
  const aliveThief = alive.filter((p) => p.role === 'thief');
  const aliveInnocent = alive.filter((p) => ROLES[p.role]?.faction === 'innocent');
  const aliveSurvivor = alive.filter((p) => p.role === 'survivor');

  // 솔로 중립 킬러 혼자 살아남음
  if (alive.length === 1) {
    const last = alive[0];
    if (last.role === 'serialKiller') return 'serialKiller';
    if (last.role === 'magician') return 'magician';
    if (last.role === 'bomber') return 'bomber';
    if (last.role === 'survivor') return 'survivor';
    if (isImposterRole(last.role)) return 'imposter';
    if (ROLES[last.role]?.faction === 'innocent') return 'innocent';
    return 'draw';
  }

  // 시민팀 승리: 악역 0명
  if (aliveImp.length === 0 && aliveNeutralKillers.length === 0 && aliveThief.length === 0) {
    return 'innocent';
  }

  // 임포스터 승리: 임포스터 수 >= 시민 수 + 중립킬러 없음
  if (aliveImp.length > 0 && aliveImp.length >= aliveInnocent.length + aliveSurvivor.length
      && aliveNeutralKillers.length === 0) {
    return 'imposter';
  }

  return null;
}

// 밤 행동 해결
function resolveNight(state, actions, dayNumber) {
  const players = state.players.map((p) => ({ ...p }));
  const findById = (id) => players.find((p) => p.id === id);

  const chatMessages = [];

  // --- 1) 경찰 감금 (진짜 경찰만) ---
  const blocked = new Set();
  for (const p of players) {
    if (!p.alive) continue;
    const eff = getEffectiveRole(p);
    if (ROLES[eff]?.baseKind !== 'police') continue;
    if (p.role === 'mad') continue; // 정신병자는 효과 없음
    const a = actions[p.id];
    if (!a?.nightTarget) continue;
    // 임포스터 버전은 ability 선택 시만 발동
    if (p.role === 'police_imp' && a.nightAction !== 'ability') continue;
    blocked.add(a.nightTarget);
  }

  // --- 2) 트래퍼 덫 ---
  const trappedHouses = new Set();
  for (const p of players) {
    if (!p.alive) continue;
    const eff = getEffectiveRole(p);
    if (ROLES[eff]?.baseKind !== 'trapper') continue;
    if (p.role === 'mad') continue;
    const a = actions[p.id];
    if (!a?.nightTarget) continue;
    if (p.role === 'trapper_imp' && a.nightAction !== 'ability') continue;
    if (blocked.has(p.id)) continue;
    trappedHouses.add(a.nightTarget);
  }

  // 덫에 걸린 방문자는 능력 무효
  for (const [visitorId, a] of Object.entries(actions)) {
    if (!a?.nightTarget) continue;
    if (trappedHouses.has(a.nightTarget)) blocked.add(visitorId);
  }

  // --- 3) 생존자 방패 ---
  const shielded = new Set();
  for (const p of players) {
    if (p.role !== 'survivor') continue;
    if (!p.alive || (p.usesLeft ?? 0) <= 0) continue;
    const a = actions[p.id];
    if (a?.nightAction === 'shield') {
      shielded.add(p.id);
      p.usesLeft = (p.usesLeft ?? 3) - 1;
    }
  }

  // --- 4) 마법사 공격 (맞히면 방패 무시) ---
  const magicianKills = new Set();
  const magicianSuicides = [];
  const magicianGuessWrong = [];
  for (const p of players) {
    if (!p.alive || p.role !== 'magician') continue;
    const a = actions[p.id];
    if (!a?.nightTarget || !a?.magicianGuess) continue;
    if (blocked.has(p.id)) continue;
    const target = findById(a.nightTarget);
    if (!target) continue;
    // 맞추기: guess는 baseKind 또는 role key
    const targetBase = ROLES[target.role]?.baseKind || target.role;
    const guessMatch = a.magicianGuess === target.role || a.magicianGuess === targetBase;
    if (guessMatch) {
      magicianKills.add(a.nightTarget);
    } else {
      magicianSuicides.push(p.id);
      magicianGuessWrong.push({ magicianId: p.id });
    }
  }

  // --- 5) 연쇄살인마 공격 ---
  const skKills = new Set();
  for (const p of players) {
    if (!p.alive || p.role !== 'serialKiller') continue;
    const a = actions[p.id];
    if (!a?.nightTarget || blocked.has(p.id)) continue;
    skKills.add(a.nightTarget);
  }

  // --- 6) 임포스터 팀 공격 ---
  const impKills = new Set();
  for (const p of players) {
    if (!p.alive) continue;
    if (!isImposterRole(p.role)) continue;
    const a = actions[p.id];
    if (!a?.nightTarget || blocked.has(p.id)) continue;
    // 기본: isKiller && action이 'kill'이거나, 청소부/페인터/겸용 임포스터인 경우
    if (a.nightAction === 'kill') {
      impKills.add(a.nightTarget);
    }
  }

  // --- 7) 도둑 공격 (+ 직업 훔침) ---
  let thiefAction = null;
  for (const p of players) {
    if (!p.alive || p.role !== 'thief') continue;
    const a = actions[p.id];
    if (!a?.nightTarget || blocked.has(p.id)) continue;
    thiefAction = { thiefId: p.id, targetId: a.nightTarget };
  }

  // --- 8) 폭탄마 설치/폭파 ---
  let bomberDetonate = false;
  let bomberId = null;
  const newBombs = [];
  for (const p of players) {
    if (!p.alive || p.role !== 'bomber') continue;
    bomberId = p.id;
    const a = actions[p.id];
    if (!a) continue;
    if (blocked.has(p.id)) continue;
    if (a.bomberAction === 'plant' && a.nightTarget) newBombs.push(a.nightTarget);
    if (a.bomberAction === 'detonate') bomberDetonate = true;
  }
  const bombsPlanted = state.bombsPlanted || [];
  const bombKills = new Set();
  if (bomberDetonate) {
    for (const id of bombsPlanted) bombKills.add(id);
  }

  // --- 9) 의사 치료 ---
  const healed = new Set();
  for (const p of players) {
    if (!p.alive || p.role !== 'doctor') continue;
    const a = actions[p.id];
    if (!a?.nightTarget || blocked.has(p.id)) continue;
    healed.add(a.nightTarget);
  }

  // --- 10) 최종 사망 판정 ---
  const deaths = [];
  const allKillAttempts = new Set([
    ...magicianKills, ...skKills, ...impKills, ...bombKills,
  ]);
  if (thiefAction) allKillAttempts.add(thiefAction.targetId);

  for (const targetId of allKillAttempts) {
    const target = findById(targetId);
    if (!target || !target.alive) continue;
    // 마법사가 맞혔으면 방패/치료 무시
    if (magicianKills.has(targetId)) {
      target.alive = false;
      deaths.push({ id: target.id, name: target.name, role: target.role, cause: 'magician' });
      continue;
    }
    // 방패
    if (shielded.has(targetId)) continue;
    // 치료
    if (healed.has(targetId)) continue;
    // 사망 확정
    target.alive = false;
    const cause = bombKills.has(targetId) ? 'bomb'
      : (thiefAction && thiefAction.targetId === targetId) ? 'thief'
      : skKills.has(targetId) ? 'sk' : 'imposter';
    deaths.push({ id: target.id, name: target.name, role: target.role, cause });
  }

  // 마법사 자살
  for (const mId of magicianSuicides) {
    const m = findById(mId);
    if (m && m.alive) {
      m.alive = false;
      deaths.push({ id: m.id, name: m.name, role: m.role, cause: 'magicianSuicide' });
    }
  }

  // --- 11) 도둑 변신 ---
  if (thiefAction) {
    const target = findById(thiefAction.targetId);
    const thief = findById(thiefAction.thiefId);
    if (target && thief && thief.alive) {
      // 이미 target.alive=false로 처리됨
      // 도둑은 target.role로 변신
      const stolenRole = target.role;
      thief.role = stolenRole;
      thief.stolenRole = true;
      // 훔친 후 재설정
      thief.investigatedIds = [];
      thief.lastNightTarget = null;
      const stolenDef = ROLES[stolenRole];
      thief.usesLeft = stolenDef?.usesMax ?? null;
      // 임포스터 채팅 알림
      if (ROLES[stolenRole]?.faction === 'imposter') {
        chatMessages.push({
          type: 'imposter',
          text: `[시스템] 도둑 ${thief.name}이(가) 임포스터팀에 합류했습니다.`,
          ts: Date.now(),
        });
      }
    }
  }

  // --- 12) 청소부/페인터 표식 ---
  for (const p of players) {
    if (!p.alive) continue;
    const a = actions[p.id];
    if (!a?.nightTarget || blocked.has(p.id)) continue;
    if (p.role === 'cleaner' && a.nightAction === 'ability') {
      const t = findById(a.nightTarget);
      if (t) t.hasCleanMark = true;
    }
    if (p.role === 'painter' && a.nightAction === 'ability') {
      const t = findById(a.nightTarget);
      if (t) {
        t.hasPaintMark = true;
        // 게임에 활성화된 임포스터 직업 중 랜덤 위장
        const impRolesInGame = [...new Set(state.players.map(x => x.role))].filter(r => isImposterRole(r));
        t.paintDisguiseRole = randomChoice(impRolesInGame) || 'cleaner';
      }
    }
  }

  // --- 13) 폭탄 목록 업데이트 ---
  let newBombsPlanted;
  if (bomberDetonate) {
    newBombsPlanted = []; // 다 터뜨림
    chatMessages.push({
      type: 'system',
      text: '💥 폭탄이 터졌습니다!',
      ts: Date.now(),
    });
  } else {
    newBombsPlanted = [...bombsPlanted, ...newBombs];
  }

  // --- 14) 밀고자 공개 발표 ---
  const snitchAnnouncements = [];
  for (const p of players) {
    if (!p.alive) continue;
    const eff = getEffectiveRole(p);
    if (ROLES[eff]?.baseKind !== 'snitch') continue;
    const a = actions[p.id];
    if (!a?.nightTarget) continue;
    if (p.role === 'snitch_imp' && a.nightAction !== 'ability') continue;
    if (p.role === 'mad') {
      // 정신병자 밀고자도 공개 이벤트는 발생 (본인은 진짜라고 믿으니까)
    } else if (blocked.has(p.id)) continue;
    const target = findById(a.nightTarget);
    if (target) {
      snitchAnnouncements.push({ snitcher: p.name, targetName: target.name });
      chatMessages.push({
        type: 'system',
        text: `📢 ${p.name}이(가) ${target.name}을(를) 밀고했습니다.`,
        ts: Date.now(),
      });
      // 사용 횟수 감소
      if (p.role === 'mad' && p.madUsesLeft != null) p.madUsesLeft--;
      else if (p.usesLeft != null) p.usesLeft--;
    }
  }

  // --- 15) 선동가 투표 부스트 ---
  const voteBoosts = { ...(state.voteBoosts || {}) };
  for (const p of players) {
    if (!p.alive) continue;
    const eff = getEffectiveRole(p);
    if (ROLES[eff]?.baseKind !== 'provoker') continue;
    const a = actions[p.id];
    if (!a?.nightTarget) continue;
    if (p.role === 'provoker_imp' && a.nightAction !== 'ability') continue;
    if (p.role === 'mad') {
      // 정신병자 선동가는 실제 효과 없음. 단 본인 UI에는 성공 표시.
      if (p.madUsesLeft != null) p.madUsesLeft--;
      continue;
    }
    if (blocked.has(p.id)) continue;
    voteBoosts[a.nightTarget] = (voteBoosts[a.nightTarget] || 0) + 2;
    if (p.usesLeft != null) p.usesLeft--;
  }

  // --- 16) 개인 결과 생성 ---
  const privateResults = {};

  // 의사 결과
  for (const p of players) {
    if (p.role !== 'doctor') continue;
    const a = actions[p.id];
    if (!a?.nightTarget) continue;
    if (blocked.has(p.id)) continue;
    const target = findById(a.nightTarget);
    if (!target) continue;
    const attacked = allKillAttempts.has(a.nightTarget) && !magicianKills.has(a.nightTarget);
    privateResults[p.id] = {
      type: 'heal', targetName: target.name, saved: attacked, dayNumber,
    };
    // 타겟에게도 방문 알림
    privateResults[target.id] = {
      type: 'visited_by_doctor', attacked, dayNumber,
    };
  }

  // 경찰 결과 (진짜만)
  for (const p of players) {
    if (p.role !== 'police_civ' && p.role !== 'police_imp') continue;
    const a = actions[p.id];
    if (!a?.nightTarget) continue;
    if (p.role === 'police_imp' && a.nightAction !== 'ability') continue;
    if (blocked.has(p.id)) continue;
    const target = findById(a.nightTarget);
    if (!target) continue;
    // 타겟이 능력 발동 시도했으면 성공
    const targetAction = actions[target.id];
    const targetTriedAbility = !!targetAction?.nightTarget;
    privateResults[p.id] = {
      type: 'block', targetName: target.name, success: targetTriedAbility, dayNumber,
    };
    // 타겟에게도 알림
    privateResults[target.id] = {
      type: 'visited_by_police', dayNumber,
    };
  }

  // 조사관 결과 (진짜만)
  for (const p of players) {
    if (p.role !== 'investigator_civ' && p.role !== 'investigator_imp') continue;
    const a = actions[p.id];
    if (!a?.nightTarget) continue;
    if (p.role === 'investigator_imp' && a.nightAction !== 'ability') continue;
    if (blocked.has(p.id)) continue;
    const target = findById(a.nightTarget);
    if (!target) continue;
    // 결과: 시민 직업 1 + 악역 직업 1
    // target이 시민이면 진짜 시민 + 랜덤 악역
    // target이 악역이면 랜덤 시민 + 진짜 악역
    const civRoles = ['doctor', 'mad', 'police_civ', 'investigator_civ', 'lookout_civ',
      'trapper_civ', 'snitch_civ', 'provoker_civ', 'tracker_civ'];
    const evilRoles = ['cleaner', 'painter', 'police_imp', 'investigator_imp',
      'lookout_imp', 'trapper_imp', 'snitch_imp', 'provoker_imp', 'tracker_imp',
      'serialKiller', 'magician', 'bomber', 'thief'];
    let civRole, evilRole;
    if (ROLES[target.role]?.faction === 'innocent') {
      civRole = target.role;
      evilRole = randomChoice(evilRoles);
    } else {
      civRole = randomChoice(civRoles);
      evilRole = target.role;
    }
    privateResults[p.id] = {
      type: 'investigate', targetName: target.name,
      option1: civRole, option2: evilRole, dayNumber,
    };
    // 영구 블록
    p.investigatedIds = [...(p.investigatedIds || []), target.id];
  }

  // 관찰자 결과
  for (const p of players) {
    if (p.role !== 'lookout_civ' && p.role !== 'lookout_imp') continue;
    const a = actions[p.id];
    if (!a?.nightTarget) continue;
    if (p.role === 'lookout_imp' && a.nightAction !== 'ability') continue;
    if (blocked.has(p.id)) continue;
    // 타겟 집 방문자 수 카운트
    let visitorCount = 0;
    for (const [otherId, otherA] of Object.entries(actions)) {
      if (otherId === p.id) continue;
      if (otherId === a.nightTarget) continue;
      if (otherA?.nightTarget === a.nightTarget) visitorCount++;
    }
    privateResults[p.id] = {
      type: 'lookout', targetName: findById(a.nightTarget)?.name, count: visitorCount, dayNumber,
    };
  }

  // 트래퍼 결과 (덫에 걸린 사람 있는지)
  for (const p of players) {
    if (p.role !== 'trapper_civ' && p.role !== 'trapper_imp') continue;
    const a = actions[p.id];
    if (!a?.nightTarget) continue;
    if (p.role === 'trapper_imp' && a.nightAction !== 'ability') continue;
    if (blocked.has(p.id)) continue;
    const targetHouse = a.nightTarget;
    let trapped = false;
    for (const [otherId, otherA] of Object.entries(actions)) {
      if (otherId === p.id) continue;
      if (otherA?.nightTarget === targetHouse) { trapped = true; break; }
    }
    privateResults[p.id] = {
      type: 'trap', targetName: findById(targetHouse)?.name, caught: trapped, dayNumber,
    };
  }

  // 밀고자 결과 (진짜만)
  for (const p of players) {
    if (p.role !== 'snitch_civ' && p.role !== 'snitch_imp') continue;
    const a = actions[p.id];
    if (!a?.nightTarget) continue;
    if (p.role === 'snitch_imp' && a.nightAction !== 'ability') continue;
    if (blocked.has(p.id)) continue;
    const target = findById(a.nightTarget);
    if (target) {
      privateResults[p.id] = {
        type: 'snitch', targetName: target.name, role: target.role, dayNumber,
      };
    }
  }

  // 추적자 결과
  for (const p of players) {
    if (p.role !== 'tracker_civ' && p.role !== 'tracker_imp') continue;
    const a = actions[p.id];
    if (!a?.nightTarget) continue;
    if (p.role === 'tracker_imp' && a.nightAction !== 'ability') continue;
    if (blocked.has(p.id)) continue;
    // 타겟이 어디 갔는지
    const targetAction = actions[a.nightTarget];
    let goneTo = null;
    if (targetAction?.nightTarget) {
      const dest = findById(targetAction.nightTarget);
      if (dest) goneTo = dest.name;
    }
    privateResults[p.id] = {
      type: 'track', targetName: findById(a.nightTarget)?.name, destName: goneTo, dayNumber,
    };
  }

  // === 정신병자 가짜 결과 ===
  for (const p of players) {
    if (p.role !== 'mad') continue;
    if (!p.alive) continue;
    const a = actions[p.id];
    if (!a?.nightTarget) continue;
    const fakeRole = p.fakeRole;
    const fakeBase = ROLES[fakeRole]?.baseKind || fakeRole;
    const target = findById(a.nightTarget);
    if (!target) continue;

    if (fakeRole === 'doctor') {
      privateResults[p.id] = {
        type: 'heal', targetName: target.name,
        saved: Math.random() < 0.3, dayNumber, isFake: true,
      };
    } else if (fakeBase === 'police') {
      privateResults[p.id] = {
        type: 'block', targetName: target.name,
        success: Math.random() < 0.5, dayNumber, isFake: true,
      };
    } else if (fakeBase === 'investigator') {
      const civRoles = ['doctor', 'police_civ', 'investigator_civ', 'lookout_civ', 'trapper_civ'];
      const evilRoles = ['cleaner', 'painter', 'serialKiller', 'magician', 'bomber'];
      privateResults[p.id] = {
        type: 'investigate', targetName: target.name,
        option1: randomChoice(civRoles), option2: randomChoice(evilRoles),
        dayNumber, isFake: true,
      };
      p.investigatedIds = [...(p.investigatedIds || []), target.id];
    } else if (fakeBase === 'lookout') {
      privateResults[p.id] = {
        type: 'lookout', targetName: target.name,
        count: Math.floor(Math.random() * 4), dayNumber, isFake: true,
      };
    } else if (fakeBase === 'trapper') {
      privateResults[p.id] = {
        type: 'trap', targetName: target.name,
        caught: Math.random() < 0.5, dayNumber, isFake: true,
      };
    } else if (fakeBase === 'snitch') {
      const allRoles = Object.keys(ROLES).filter(r => r !== 'mad');
      privateResults[p.id] = {
        type: 'snitch', targetName: target.name,
        role: randomChoice(allRoles), dayNumber, isFake: true,
      };
      // 정신병자도 공개 밀고 발생
      chatMessages.push({
        type: 'system',
        text: `📢 ${p.name}이(가) ${target.name}을(를) 밀고했습니다.`,
        ts: Date.now(),
      });
      if (p.madUsesLeft != null) p.madUsesLeft--;
    } else if (fakeBase === 'provoker') {
      privateResults[p.id] = {
        type: 'provoke', targetName: target.name, dayNumber, isFake: true,
      };
      if (p.madUsesLeft != null) p.madUsesLeft--;
    } else if (fakeBase === 'tracker') {
      // 랜덤 목적지
      const others = players.filter(pp => pp.id !== p.id && pp.id !== target.id && pp.alive);
      const randDest = others.length > 0 ? randomChoice(others).name : null;
      const didGo = Math.random() < 0.5 && randDest;
      privateResults[p.id] = {
        type: 'track', targetName: target.name,
        destName: didGo ? randDest : null, dayNumber, isFake: true,
      };
    }
  }

  // --- 17) 마법사 자살 공지 ---
  if (magicianSuicides.length > 0) {
    chatMessages.push({
      type: 'system',
      text: '🔮 마법사가 자살했습니다.',
      ts: Date.now(),
    });
  }

  // --- 18) lastNightTarget 업데이트 ---
  for (const p of players) {
    if (!p.alive) continue;
    const a = actions[p.id];
    const eff = getEffectiveRole(p);
    const def = ROLES[eff];
    if (!def) continue;
    if (def.cooldown === 'lastNight') {
      if (a?.nightTarget && !blocked.has(p.id)) {
        p.lastNightTarget = a.nightTarget;
      } else {
        p.lastNightTarget = null; // 안 쓴 걸로
      }
    }
  }

  return { players, deaths, privateResults, chatMessages, voteBoosts, bombsPlanted: newBombsPlanted };
}

// 투표 해결
function resolveVoting(state, actions) {
  const players = state.players.map((p) => ({ ...p }));
  const voteBoosts = state.voteBoosts || {};
  const tally = {};
  for (const targetId of Object.keys(voteBoosts)) {
    tally[targetId] = voteBoosts[targetId];
  }
  for (const p of players) {
    if (!p.alive) continue;
    const a = actions[p.id];
    if (a?.vote && a.vote !== 'skip') {
      tally[a.vote] = (tally[a.vote] || 0) + 1;
    }
  }

  let maxVotes = 0, topId = null, tied = false;
  for (const [pid, count] of Object.entries(tally)) {
    if (count > maxVotes) { maxVotes = count; topId = pid; tied = false; }
    else if (count === maxVotes) { tied = true; }
  }

  let eliminated = null;
  if (topId && !tied && maxVotes > 0) {
    const t = players.find((x) => x.id === topId);
    if (t && t.alive) {
      t.alive = false;
      eliminated = { id: t.id, name: t.name, role: t.role };
    }
  }

  return { players, eliminated, tally, tied: tied && maxVotes > 0 };
}

// 사망 시 공개되는 직업 이름 (청소/페인트 적용)
function getRevealedRole(player) {
  if (player.hasCleanMark) return null; // "알 수 없음"
  if (player.hasPaintMark) return player.paintDisguiseRole;
  return player.role;
}

// 페이즈 전환
function advancePhase(state, actions) {
  const currentPhase = state.phase;
  let next = { ...state };
  const messages = [];
  const nowTs = Date.now();

  if (currentPhase === PHASES.ROLE_REVEAL) {
    next.phase = PHASES.NIGHT;
    next.dayNumber = 1;
    next.phaseEndTime = nowTs + PHASE_DURATIONS[PHASES.NIGHT];
    messages.push({ type: 'system', text: '🌙 밤이 찾아왔어요.', ts: nowTs });
    return { next, messages };
  }

  if (currentPhase === PHASES.NIGHT) {
    const result = resolveNight(state, actions, state.dayNumber);
    next.players = result.players;
    next.voteBoosts = result.voteBoosts;
    next.bombsPlanted = result.bombsPlanted;

    // privateReveal 누적
    next.privateReveal = { ...(state.privateReveal || {}) };
    for (const [pid, info] of Object.entries(result.privateResults)) {
      const existing = next.privateReveal[pid] || [];
      next.privateReveal[pid] = [...existing, info];
    }

    messages.push(...result.chatMessages);

    // 사망 메시지
    const deathNames = result.deaths.map(d => d.name);
    if (deathNames.length === 0) {
      messages.push({ type: 'system', text: '🌅 아침이 밝았어요. 아무도 죽지 않았습니다.', ts: nowTs });
    } else {
      messages.push({ type: 'system', text: `🌅 아침이 밝았어요. 사망자: ${deathNames.join(', ')}`, ts: nowTs });
    }

    next.phase = PHASES.NIGHT_RESULT;
    next.phaseEndTime = nowTs + PHASE_DURATIONS[PHASES.NIGHT_RESULT];

    const winner = checkWinner(next.players);
    if (winner) {
      next.phase = PHASES.ENDED;
      next.winner = winner;
      next.phaseEndTime = 0;
    }
    return { next, messages };
  }

  if (currentPhase === PHASES.NIGHT_RESULT) {
    next.phase = PHASES.DAY;
    next.phaseEndTime = nowTs + PHASE_DURATIONS[PHASES.DAY];
    messages.push({ type: 'system', text: '💬 토론 시간입니다.', ts: nowTs });
    return { next, messages };
  }

  if (currentPhase === PHASES.DAY) {
    next.phase = PHASES.VOTING;
    next.phaseEndTime = nowTs + PHASE_DURATIONS[PHASES.VOTING];
    messages.push({ type: 'system', text: '🗳️ 투표 시간!', ts: nowTs });
    return { next, messages };
  }

  if (currentPhase === PHASES.VOTING) {
    const result = resolveVoting(state, actions);
    next.players = result.players;
    next.phase = PHASES.VOTE_RESULT;
    next.phaseEndTime = nowTs + PHASE_DURATIONS[PHASES.VOTE_RESULT];
    if (result.eliminated) {
      const revealed = getRevealedRole(next.players.find(p => p.id === result.eliminated.id));
      const revealedName = revealed ? ROLES[revealed]?.name : '알 수 없음';
      messages.push({
        type: 'system',
        text: `⚖️ ${result.eliminated.name}이(가) 추방되었습니다. [${revealedName}]`,
        ts: nowTs,
      });
    } else if (result.tied) {
      messages.push({ type: 'system', text: '⚖️ 동점으로 추방 없음.', ts: nowTs });
    } else {
      messages.push({ type: 'system', text: '⚖️ 아무도 투표하지 않았습니다.', ts: nowTs });
    }
    const winner = checkWinner(next.players);
    if (winner) {
      next.phase = PHASES.ENDED;
      next.winner = winner;
      next.phaseEndTime = 0;
    }
    // 투표 부스트 초기화
    next.voteBoosts = {};
    return { next, messages };
  }

  if (currentPhase === PHASES.VOTE_RESULT) {
    next.phase = PHASES.NIGHT;
    next.dayNumber = state.dayNumber + 1;
    next.phaseEndTime = nowTs + PHASE_DURATIONS[PHASES.NIGHT];
    messages.push({ type: 'system', text: `🌙 ${next.dayNumber}번째 밤.`, ts: nowTs });
    return { next, messages };
  }

  return { next: state, messages: [] };
}

// ==========================================================
// 메인 컴포넌트
// ==========================================================

export default function App() {
  const [screen, setScreen] = useState('menu');
  const [playerId] = useState(() => getOrCreatePlayerId());
  const [playerName, setPlayerName] = useState(() => sessionStorage.getItem('feign_name') || '');
  const [roomCode, setRoomCode] = useState('');
  const [inputCode, setInputCode] = useState('');
  const [gameState, setGameState] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(Date.now());
  const advanceInFlightRef = useRef(false);

  const isHost = gameState?.hostId === playerId;
  const mePlayer = gameState?.players?.find((p) => p.id === playerId);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (playerName) sessionStorage.setItem('feign_name', playerName);
  }, [playerName]);

  // 상태 구독
  useEffect(() => {
    if (!roomCode) return;
    const unsub = onValue(stateRef(roomCode), (snap) => {
      const val = snap.val();
      if (val) setGameState(val);
    });
    return () => unsub();
  }, [roomCode]);

  // 채팅 구독
  useEffect(() => {
    if (!roomCode) return;
    const unsub = onValue(chatRef(roomCode), (snap) => {
      const val = snap.val();
      if (!val) { setChatMessages([]); return; }
      const arr = Object.entries(val).map(([key, m]) => ({ ...m, id: key }));
      arr.sort((a, b) => (a.ts || 0) - (b.ts || 0));
      setChatMessages(arr);
    });
    return () => unsub();
  }, [roomCode]);

  // 호스트 페이즈 전환 타이머
  useEffect(() => {
    if (!isHost || !gameState) return;
    if (!gameState.phaseEndTime) return;
    if (gameState.phase === PHASES.ENDED || gameState.phase === PHASES.LOBBY) return;

    const targetTime = gameState.phaseEndTime;
    const delay = Math.max(0, targetTime - Date.now()) + 300;

    const timer = setTimeout(async () => {
      if (advanceInFlightRef.current) return;
      advanceInFlightRef.current = true;
      try {
        const fresh = await fbGet(stateRef(roomCode));
        if (!fresh || fresh.phaseEndTime !== targetTime) return;
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

  // ================== 핸들러 ==================

  const handleCreateRoom = async () => {
    const name = playerName.trim();
    if (!name) return setError('이름을 입력해주세요');
    setError(''); setLoading(true);
    try {
      const code = generateRoomCode();
      const initial = {
        code, hostId: playerId, phase: PHASES.LOBBY,
        phaseEndTime: 0, dayNumber: 0,
        players: [{
          id: playerId, name: name.slice(0, 12),
          colorIdx: 0, role: null, fakeRole: null, alive: true,
        }],
        roleConfig: {
          doctor: 1, mad: 1, police_civ: 1, investigator_civ: 1,
          cleaner: 1,
        },
        privateReveal: {}, voteBoosts: {}, bombsPlanted: [], winner: null,
      };
      await set(stateRef(code), initial);
      await push(chatRef(code), {
        type: 'system', text: `${name}님이 방을 만들었습니다. 코드: ${code}`, ts: Date.now(),
      });
      setRoomCode(code); setScreen('lobby');
    } catch (e) { setError('방 생성 실패: ' + e.message); }
    finally { setLoading(false); }
  };

  const handleJoinRoom = async () => {
    const name = playerName.trim();
    if (!name) return setError('이름을 입력해주세요');
    const code = inputCode.trim().toUpperCase();
    if (code.length !== 4) return setError('4자리 방 코드를 입력해주세요');
    setError(''); setLoading(true);
    try {
      const state = await fbGet(stateRef(code));
      if (!state) { setError('방을 찾을 수 없어요.'); return; }
      if (state.phase !== PHASES.LOBBY) { setError('이미 시작됐어요.'); return; }
      const players = state.players || [];
      if (players.length >= MAX_PLAYERS) { setError('정원 초과.'); return; }
      if (players.some((p) => p.name === name)) { setError('이름 중복.'); return; }
      if (players.some((p) => p.id === playerId)) {
        setRoomCode(code); setScreen('lobby'); return;
      }
      const nextPlayers = [...players, {
        id: playerId, name: name.slice(0, 12),
        colorIdx: players.length % PLAYER_COLORS_HEX.length,
        role: null, fakeRole: null, alive: true,
      }];
      await update(stateRef(code), { players: nextPlayers });
      await push(chatRef(code), {
        type: 'system', text: `${name}님이 입장했습니다.`, ts: Date.now(),
      });
      setRoomCode(code); setScreen('lobby');
    } catch (e) { setError('입장 실패: ' + e.message); }
    finally { setLoading(false); }
  };

  const handleStartGame = async () => {
    if (!gameState) return;
    const pCount = gameState.players.length;
    if (pCount < MIN_PLAYERS) { setError(`최소 ${MIN_PLAYERS}명 필요`); return; }
    const config = gameState.roleConfig || {};
    const total = Object.values(config).reduce((s, v) => s + (v || 0), 0);
    if (total !== pCount) {
      setError(`직업 총합(${total})이 인원(${pCount})과 달라요.`);
      return;
    }
    const impCount = Object.entries(config).reduce((s, [k, v]) => s + (isImposterRole(k) ? v : 0), 0);
    if (impCount < 1) { setError('임포스터 최소 1명 필요'); return; }

    const withRoles = assignRoles(gameState.players, config);
    const next = {
      ...gameState, players: withRoles,
      phase: PHASES.ROLE_REVEAL,
      phaseEndTime: Date.now() + PHASE_DURATIONS[PHASES.ROLE_REVEAL],
      dayNumber: 0, privateReveal: {}, voteBoosts: {}, bombsPlanted: [], winner: null,
    };
    await set(stateRef(gameState.code), next);
    await push(chatRef(gameState.code), {
      type: 'system', text: '게임이 시작됐어요!', ts: Date.now(),
    });
    setScreen('game');
  };

  useEffect(() => {
    if (gameState && gameState.phase !== PHASES.LOBBY && screen === 'lobby') {
      setScreen('game');
    }
  }, [gameState?.phase, screen]);

  const sendChat = async (text) => {
    if (!text.trim() || !gameState || !mePlayer) return;
    const trimmed = text.trim().slice(0, 200);
    const isDead = !mePlayer.alive;
    const isImposterChat = gameState.phase === PHASES.NIGHT
      && isImposterRole(mePlayer.role) && mePlayer.alive;
    const type = isDead ? 'dead' : isImposterChat ? 'imposter' : 'normal';
    await push(chatRef(gameState.code), {
      playerId, name: mePlayer.name,
      colorIdx: mePlayer.colorIdx ?? 0,
      text: trimmed, ts: Date.now(), type,
    });
  };

  const submitAction = async (actionUpdate) => {
    if (!gameState) return;
    await update(actionRef(gameState.code, playerId), actionUpdate);
  };

  const updateRoleConfig = async (roleKey, newCount) => {
    if (!gameState || !isHost) return;
    const newConfig = { ...(gameState.roleConfig || {}) };
    if (newCount <= 0) delete newConfig[roleKey];
    else newConfig[roleKey] = newCount;
    await update(stateRef(gameState.code), { roleConfig: newConfig });
  };

  const leaveRoom = () => {
    setRoomCode(''); setGameState(null); setChatMessages([]);
    setScreen('menu');
  };

  const resetToLobby = async () => {
    if (!gameState || !isHost) return;
    const next = {
      ...gameState, phase: PHASES.LOBBY,
      phaseEndTime: 0, dayNumber: 0,
      players: gameState.players.map((p) => ({
        id: p.id, name: p.name, colorIdx: p.colorIdx,
        role: null, fakeRole: null, alive: true,
      })),
      privateReveal: {}, voteBoosts: {}, bombsPlanted: [], winner: null,
    };
    await set(stateRef(gameState.code), next);
    await remove(actionsRef(gameState.code));
  };

  // ================== 렌더 ==================

  if (screen === 'menu') {
    return (
      <MenuScreen
        playerName={playerName} setPlayerName={setPlayerName}
        inputCode={inputCode} setInputCode={setInputCode}
        onCreate={handleCreateRoom} onJoin={handleJoinRoom}
        error={error} loading={loading}
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
        state={gameState} playerId={playerId} isHost={isHost}
        onStart={handleStartGame} onLeave={leaveRoom} error={error}
        onUpdateConfig={updateRoleConfig}
      />
    );
  }

  return (
    <GameScreen
      state={gameState} now={now} playerId={playerId} isHost={isHost}
      mePlayer={mePlayer} chatMessages={chatMessages}
      onChat={sendChat} onSubmitAction={submitAction}
      onLeave={leaveRoom} onResetToLobby={resetToLobby}
    />
  );
}

// ==========================================================
// 메뉴
// ==========================================================

function MenuScreen({ playerName, setPlayerName, inputCode, setInputCode, onCreate, onJoin, error, loading }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800/80 backdrop-blur rounded-2xl p-8 shadow-2xl border border-slate-700">
        <h1 className="text-4xl font-bold text-center mb-2">FEIGN</h1>
        <p className="text-center text-slate-400 mb-8 text-sm">v2 · 15개 직업 · 친구들과 함께</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-slate-300 mb-1">내 이름</label>
            <input type="text" value={playerName}
              onChange={(e) => setPlayerName(e.target.value)} maxLength={12}
              className="w-full px-4 py-3 bg-slate-900 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 text-white"
              placeholder="12자 이내" />
          </div>
          <button onClick={onCreate} disabled={loading}
            className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-lg font-semibold">
            🏠 새 방 만들기
          </button>
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-xs text-slate-500">또는</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>
          <div>
            <label className="block text-sm text-slate-300 mb-1">방 코드</label>
            <input type="text" value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())} maxLength={4}
              className="w-full px-4 py-3 bg-slate-900 rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 text-white uppercase tracking-widest text-center text-xl font-mono"
              placeholder="ABCD" />
          </div>
          <button onClick={onJoin} disabled={loading}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg font-semibold">
            🚪 방 입장하기
          </button>
          {error && <div className="text-red-400 text-sm text-center">{error}</div>}
        </div>
        <div className="mt-8 text-xs text-slate-500 text-center">4~12명 · URL 공유</div>
      </div>
    </div>
  );
}

// ==========================================================
// 로비 (직업 커스텀 설정)
// ==========================================================

function LobbyScreen({ state, playerId, isHost, onStart, onLeave, error, onUpdateConfig }) {
  const players = state.players || [];
  const config = state.roleConfig || {};
  const total = Object.values(config).reduce((s, v) => s + (v || 0), 0);
  const diff = total - players.length;
  const impCount = Object.entries(config).reduce((s, [k, v]) => s + (isImposterRole(k) ? v : 0), 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-indigo-900 text-white p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <button onClick={onLeave} className="text-sm text-slate-400 hover:text-white">← 나가기</button>
          <h1 className="text-xl font-bold">대기실</h1>
          <div className="w-16" />
        </div>

        <div className="bg-slate-800/80 rounded-2xl p-6 mb-4 border border-slate-700 text-center">
          <p className="text-slate-400 text-sm mb-1">방 코드</p>
          <p className="text-5xl font-mono font-bold tracking-widest text-indigo-300">{state.code}</p>
        </div>

        <div className="bg-slate-800/80 rounded-2xl p-6 mb-4 border border-slate-700">
          <h2 className="font-semibold mb-4">참가자 ({players.length}/{MAX_PLAYERS})</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {players.map((p) => (
              <div key={p.id}
                className={`flex items-center gap-2 p-3 rounded-lg border ${
                  p.id === state.hostId ? 'border-yellow-500 bg-yellow-500/10' : 'border-slate-700 bg-slate-900/50'}`}>
                <div className={`w-8 h-8 rounded-full ${PLAYER_COLORS_BG[p.colorIdx] || 'bg-slate-500'} flex items-center justify-center font-bold text-sm`}>
                  {p.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">{p.name}{p.id === playerId && <span className="text-xs text-slate-400"> (나)</span>}</div>
                  {p.id === state.hostId && <div className="text-xs text-yellow-400">👑 호스트</div>}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-slate-800/80 rounded-2xl p-6 mb-4 border border-slate-700">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            🎭 직업 설정
            <span className={`text-sm ${diff === 0 ? 'text-green-400' : 'text-yellow-400'}`}>
              ({total}/{players.length})
            </span>
            {impCount < 1 && <span className="text-xs text-red-400">⚠️ 임포스터 최소 1명</span>}
          </h2>
          {!isHost && <p className="text-xs text-slate-400 mb-2">호스트만 설정 가능</p>}

          <RoleConfigSection title="시민 전용" roles={['doctor', 'mad']}
            config={config} isHost={isHost} onUpdate={onUpdateConfig} />
          <RoleConfigSection title="겸용 · 시민 버전"
            roles={['police_civ', 'investigator_civ', 'lookout_civ', 'trapper_civ', 'snitch_civ', 'provoker_civ', 'tracker_civ']}
            config={config} isHost={isHost} onUpdate={onUpdateConfig} />
          <RoleConfigSection title="겸용 · 임포스터 버전"
            roles={['police_imp', 'investigator_imp', 'lookout_imp', 'trapper_imp', 'snitch_imp', 'provoker_imp', 'tracker_imp']}
            config={config} isHost={isHost} onUpdate={onUpdateConfig} />
          <RoleConfigSection title="임포스터 전용" roles={['cleaner', 'painter']}
            config={config} isHost={isHost} onUpdate={onUpdateConfig} />
          <RoleConfigSection title="중립" roles={['serialKiller', 'magician', 'bomber', 'thief', 'survivor']}
            config={config} isHost={isHost} onUpdate={onUpdateConfig} />
        </div>

        <div className="bg-slate-800/80 rounded-2xl p-6 border border-slate-700">
          {isHost ? (
            <>
              <p className="text-sm text-slate-400 mb-4 text-center">
                {players.length < MIN_PLAYERS
                  ? `최소 ${MIN_PLAYERS}명 필요`
                  : diff !== 0
                    ? `직업 합계를 ${players.length}개에 맞춰주세요`
                    : impCount < 1
                      ? `임포스터 최소 1명 필요`
                      : '준비 완료!'}
              </p>
              <button onClick={onStart}
                disabled={players.length < MIN_PLAYERS || diff !== 0 || impCount < 1}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg font-semibold">
                🎮 게임 시작
              </button>
              {error && <div className="text-red-400 text-sm text-center mt-3">{error}</div>}
            </>
          ) : (
            <p className="text-center text-slate-400">호스트 대기 중...</p>
          )}
        </div>
      </div>
    </div>
  );
}

function RoleConfigSection({ title, roles, config, isHost, onUpdate }) {
  return (
    <div className="mb-3">
      <div className="text-xs text-slate-400 mb-1 font-medium">{title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
        {roles.map((r) => {
          const def = ROLES[r];
          if (!def) return null;
          const count = config[r] || 0;
          return (
            <div key={r} className="flex items-center gap-1 bg-slate-900/60 rounded px-2 py-1.5 text-sm">
              <span className="text-base">{def.emoji}</span>
              <span className="flex-1 truncate">{def.name}{r.endsWith('_imp') ? ' (임)' : r.endsWith('_civ') ? '' : ''}</span>
              {isHost ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => onUpdate(r, Math.max(0, count - 1))}
                    className="w-5 h-5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold">-</button>
                  <span className="w-5 text-center text-sm font-mono">{count}</span>
                  <button onClick={() => onUpdate(r, count + 1)}
                    className="w-5 h-5 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold">+</button>
                </div>
              ) : (
                <span className="text-sm font-mono text-slate-400">{count}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ==========================================================
// 게임 화면 (마을 뷰 포함)
// ==========================================================

function GameScreen({ state, now, playerId, isHost, mePlayer, chatMessages, onChat, onSubmitAction, onLeave, onResetToLobby }) {
  const timeLeft = state.phaseEndTime ? Math.max(0, state.phaseEndTime - now) : 0;
  const isDead = mePlayer && !mePlayer.alive;
  const phase = state.phase;
  const isNightPhase = phase === PHASES.NIGHT;

  const displayRoleKey = mePlayer ? getDisplayRoleKey(mePlayer) : null;
  const displayRole = displayRoleKey ? ROLES[displayRoleKey] : null;
  const realRoleKey = mePlayer?.role;
  const realRole = realRoleKey ? ROLES[realRoleKey] : null;

  return (
    <div className={`min-h-screen text-white transition-colors duration-1000 ${
      isNightPhase ? 'bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900'
                   : 'bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900'}`}>
      <style>{`
        @keyframes feign-bob { 0%,100% { transform: translate(-50%, -50%) translateY(0); } 50% { transform: translate(-50%, -50%) translateY(-4px); } }
        @keyframes feign-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }
        @keyframes feign-twinkle { 0%,100% { opacity: 0.3; } 50% { opacity: 1; } }
        .feign-char { transition: left 1.5s ease-in-out, top 1.5s ease-in-out; }
        .feign-char-idle { animation: feign-bob 2s ease-in-out infinite; }
      `}</style>

      <div className="max-w-7xl mx-auto p-3 sm:p-4">
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
              {/* 내 역할 카드 */}
              {displayRole && (
                <div className={`rounded-xl p-4 border-2 ${
                  isDead ? 'bg-slate-800/50 border-slate-700 opacity-60'
                  : realRole?.faction === 'innocent' ? 'bg-blue-950/40 border-blue-700'
                  : realRole?.faction === 'imposter' ? 'bg-red-950/40 border-red-700'
                  : 'bg-purple-950/40 border-purple-700'}`}>
                  <div className="flex items-start gap-4">
                    <div className="text-5xl">{displayRole.emoji}</div>
                    <div className="flex-1">
                      <div className="text-xs text-slate-400">내 직업</div>
                      <div className="text-2xl font-bold">{displayRole.name}</div>
                      <div className="text-sm text-slate-300 mt-1">{displayRole.desc}</div>
                      {mePlayer?.usesLeft != null && (
                        <div className="text-xs text-yellow-400 mt-1">남은 사용: {mePlayer.usesLeft}회</div>
                      )}
                      {mePlayer?.stolenRole && (
                        <div className="text-xs text-green-400 mt-1">🥷 훔친 직업</div>
                      )}
                      {isDead && <div className="text-sm text-red-400 mt-2">☠️ 당신은 사망했습니다</div>}
                    </div>
                  </div>
                </div>
              )}

              {/* 마을 뷰 */}
              <VillageMap state={state} playerId={playerId} mePlayer={mePlayer}
                phase={phase} onSubmitAction={onSubmitAction} />

              {/* 액션 패널 */}
              {phase === PHASES.NIGHT && mePlayer?.alive && (
                <ActionPanel state={state} mePlayer={mePlayer} onSubmitAction={onSubmitAction} />
              )}

              {/* 개인 기록 */}
              <PrivateLog state={state} playerId={playerId} />
            </div>

            <div className="lg:col-span-1">
              <ChatBox state={state} mePlayer={mePlayer} phase={phase}
                chatMessages={chatMessages} onChat={onChat} isDead={isDead} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ==========================================================
// 마을 뷰 (집 원형 배치 + 캐릭터 애니메이션)
// ==========================================================

function VillageMap({ state, playerId, mePlayer, phase, onSubmitAction }) {
  const players = state.players || [];
  const n = players.length;
  const isNight = phase === PHASES.NIGHT || phase === PHASES.ROLE_REVEAL;
  const isVoting = phase === PHASES.VOTING;

  const [hovered, setHovered] = useState(null);

  // 집 위치 (원형)
  const housePositions = useMemo(() => {
    return players.map((_, i) => {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      const r = 38;
      return {
        left: 50 + r * Math.cos(angle),
        top: 50 + r * Math.sin(angle) * 0.85,
      };
    });
  }, [n]);

  // 캐릭터 위치: 낮엔 연못, 밤엔 집, 사망은 집(무덤)
  const getCharPos = (i, p) => {
    if (!p.alive) return housePositions[i];
    if (isNight) return housePositions[i];
    // 연못: 살아있는 사람들만 모임
    const aliveIndices = players.map((pp, idx) => pp.alive ? idx : null).filter(x => x !== null);
    const myIdx = aliveIndices.indexOf(i);
    const r = 11;
    const angle = aliveIndices.length > 0 ? (myIdx / aliveIndices.length) * 2 * Math.PI : 0;
    return {
      left: 50 + r * Math.cos(angle),
      top: 50 + r * Math.sin(angle) * 0.85,
    };
  };

  // 클릭 이벤트: 밤엔 타겟 선택, 투표엔 투표
  const blockedIds = getBlockedTargetIds(mePlayer);
  const canTargetAtNight = phase === PHASES.NIGHT && mePlayer?.alive;
  const canVote = phase === PHASES.VOTING && mePlayer?.alive;

  const handleHouseClick = (targetId) => {
    if (!mePlayer) return;
    if (targetId === playerId) return; // 자기 자신 금지

    if (canTargetAtNight) {
      const eff = getEffectiveRole(mePlayer);
      const def = ROLES[eff];
      if (!def?.night) return;
      if (blockedIds.has(targetId)) return;
      // 임포스터는 서로 타겟 불가
      if (isImposterRole(mePlayer.role)) {
        const targetP = players.find(pp => pp.id === targetId);
        if (targetP && isImposterRole(targetP.role)) return;
      }
      onSubmitAction({ nightTarget: targetId });
    }
    if (canVote) {
      const targetP = players.find(pp => pp.id === targetId);
      if (!targetP?.alive) return;
      onSubmitAction({ vote: targetId });
    }
  };

  // 현재 내 선택 (액션에서 실시간은 구독 안 함, 그냥 서버 반영 후 UI엔 강조 없음 — 간단화)
  const [myCurrentTarget, setMyCurrentTarget] = useState(null);
  const [myCurrentVote, setMyCurrentVote] = useState(null);
  useEffect(() => {
    setMyCurrentTarget(null);
    setMyCurrentVote(null);
  }, [phase]);

  return (
    <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
      <div className="relative w-full" style={{ aspectRatio: '16/10', minHeight: 300 }}>
        {/* 밤 별들 */}
        {isNight && (
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 20 }).map((_, i) => (
              <div key={i} className="absolute rounded-full bg-white" style={{
                width: 2, height: 2,
                left: `${(i * 47) % 100}%`,
                top: `${(i * 23) % 70}%`,
                opacity: 0.6,
                animation: `feign-twinkle ${2 + (i % 3)}s ease-in-out infinite`,
              }} />
            ))}
          </div>
        )}

        {/* 연못 */}
        <div className="absolute rounded-full" style={{
          left: '50%', top: '50%', width: '30%', height: '24%',
          transform: 'translate(-50%, -50%)',
          background: isNight
            ? 'radial-gradient(ellipse, rgba(30,58,138,0.6), rgba(15,23,42,0.8))'
            : 'radial-gradient(ellipse, rgba(56,189,248,0.5), rgba(14,165,233,0.3))',
          border: '2px solid rgba(56,189,248,0.3)',
        }} />

        {/* 집들 */}
        {players.map((p, i) => {
          const pos = housePositions[i];
          const isMe = p.id === playerId;
          const isBlocked = blockedIds.has(p.id);
          const isDead = !p.alive;
          const voteBoostNum = state.voteBoosts?.[p.id] || 0;
          const isTargetable = (canTargetAtNight && !isMe && !isBlocked && p.alive)
                                || (canVote && !isMe && p.alive);
          return (
            <div key={p.id} className="absolute"
              style={{ left: `${pos.left}%`, top: `${pos.top}%`, transform: 'translate(-50%, -50%)' }}>
              <div className="flex flex-col items-center">
                <div className={`text-xs font-medium mb-1 px-1.5 py-0.5 rounded ${
                  isDead ? 'text-slate-500 line-through bg-slate-900/60'
                  : 'text-white bg-slate-900/60'}`}>
                  {p.name}{isMe && ' (나)'}
                </div>
                <button onClick={() => handleHouseClick(p.id)}
                  disabled={!isTargetable}
                  onMouseEnter={() => setHovered(p.id)}
                  onMouseLeave={() => setHovered(null)}
                  className={`relative transition-transform ${
                    isTargetable ? 'cursor-pointer hover:scale-110' : 'cursor-default'}`}>
                  <svg viewBox="0 0 80 70" className={`w-16 sm:w-20 ${isDead ? 'opacity-40 grayscale' : ''} ${
                    isTargetable && hovered === p.id ? 'drop-shadow-[0_0_10px_rgba(99,102,241,0.8)]' : 'drop-shadow-md'}`}>
                    <polygon points="10,35 40,10 70,35" fill={isNight ? '#4a2817' : '#7c3f1d'} />
                    <rect x="15" y="35" width="50" height="30" fill={isNight ? '#8b7355' : '#d4a574'} />
                    <rect x="35" y="48" width="10" height="17" fill="#5c2a0e" rx="1" />
                    {phase === PHASES.VOTING && voteBoostNum > 0 && (
                      <text x="20" y="26" textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold">+{voteBoostNum}</text>
                    )}
                    <rect x="20" y="42" width="10" height="8" fill={isNight ? '#1e293b' : '#7dd3fc'} opacity="0.8" />
                  </svg>
                  {isBlocked && !isMe && canTargetAtNight && (
                    <div className="absolute -top-1 -right-1 text-xs bg-slate-800 rounded px-1 text-yellow-400">✕</div>
                  )}
                </button>
              </div>
            </div>
          );
        })}

        {/* 캐릭터들 (절대 위치, 애니메이션 전환) */}
        {players.map((p, i) => {
          const pos = getCharPos(i, p);
          return (
            <Character key={p.id} player={p} left={pos.left} top={pos.top} />
          );
        })}
      </div>

      {(canTargetAtNight || canVote) && (
        <p className="text-xs text-slate-400 mt-2 text-center">
          {canTargetAtNight && '🌙 밤 행동: 집을 클릭해서 타겟 선택'}
          {canVote && '🗳️ 투표: 집을 클릭해서 추방 대상 선택'}
        </p>
      )}
    </div>
  );
}

function Character({ player, left, top }) {
  const color = PLAYER_COLORS_HEX[player.colorIdx] || '#888';
  if (!player.alive) {
    return (
      <div className="feign-char absolute" style={{
        left: `${left}%`, top: `${top + 8}%`, transform: 'translate(-50%, -50%)', zIndex: 5,
      }}>
        <div className="text-2xl">☠️</div>
      </div>
    );
  }
  return (
    <div className="feign-char absolute" style={{
      left: `${left}%`, top: `${top}%`, transform: 'translate(-50%, -50%)', zIndex: 10,
    }}>
      <div className="feign-char-idle">
        <svg viewBox="0 0 40 50" width="28" height="35">
          <ellipse cx="20" cy="30" rx="14" ry="18" fill={color} stroke="#000" strokeWidth="1.5" />
          <ellipse cx="15" cy="25" rx="3" ry="4" fill="white" />
          <ellipse cx="25" cy="25" rx="3" ry="4" fill="white" />
          <circle cx="15" cy="26" r="1.5" fill="black" />
          <circle cx="25" cy="26" r="1.5" fill="black" />
        </svg>
      </div>
    </div>
  );
}

// ==========================================================
// 액션 패널 (임포스터 kill/ability 선택, 마법사 guess, 폭탄마 plant/detonate, 생존자 방패)
// ==========================================================

function ActionPanel({ state, mePlayer, onSubmitAction }) {
  const [guessRole, setGuessRole] = useState('');
  const role = mePlayer?.role;
  if (!role) return null;
  const def = ROLES[role];
  const isImp = isImposterRole(role);
  const isBomber = role === 'bomber';
  const isMagician = role === 'magician';
  const isSurvivor = role === 'survivor';
  const needsKillOrAbility = isImp && def?.isKiller;

  if (!isImp && !isBomber && !isMagician && !isSurvivor) return null;

  return (
    <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700">
      <h3 className="text-sm font-semibold mb-2">🎯 밤 액션 선택</h3>

      {needsKillOrAbility && (
        <div className="flex gap-2 mb-2">
          <button onClick={() => onSubmitAction({ nightAction: 'kill' })}
            className="flex-1 py-2 bg-red-700 hover:bg-red-600 rounded text-sm font-medium">
            🔪 살해
          </button>
          <button onClick={() => onSubmitAction({ nightAction: 'ability' })}
            className="flex-1 py-2 bg-slate-700 hover:bg-slate-600 rounded text-sm font-medium">
            {def.emoji} {def.actionLabel}
          </button>
        </div>
      )}

      {isBomber && (
        <div className="flex gap-2 mb-2">
          <button onClick={() => onSubmitAction({ bomberAction: 'plant' })}
            className="flex-1 py-2 bg-orange-700 hover:bg-orange-600 rounded text-sm font-medium">
            💣 다이너마이트 설치
          </button>
          <button onClick={() => onSubmitAction({ bomberAction: 'detonate', nightTarget: null })}
            className="flex-1 py-2 bg-red-700 hover:bg-red-600 rounded text-sm font-medium">
            🔥 일괄 폭파
          </button>
        </div>
      )}

      {isMagician && (
        <div className="space-y-2 mb-2">
          <select value={guessRole} onChange={e => {
              setGuessRole(e.target.value);
              onSubmitAction({ magicianGuess: e.target.value });
            }}
            className="w-full bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm">
            <option value="">-- 타겟 직업 추측 --</option>
            {SELECTABLE_ROLES.map(r => (
              <option key={r} value={r}>{ROLES[r].name}{r.endsWith('_imp') ? ' (임)' : r.endsWith('_civ') ? ' (시)' : ''}</option>
            ))}
          </select>
          <p className="text-xs text-slate-400">맞히면 즉사 / 틀리면 자살</p>
        </div>
      )}

      {isSurvivor && (
        <div>
          <button
            onClick={() => onSubmitAction({ nightAction: 'shield' })}
            disabled={(mePlayer.usesLeft ?? 0) <= 0}
            className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 rounded text-sm font-medium">
            🛡️ 방패 발동 ({mePlayer.usesLeft ?? 0}/3)
          </button>
        </div>
      )}

      <p className="text-xs text-slate-500 mt-2">
        {isBomber && '설치 시 아래 집 선택 필수. 폭파는 타겟 없음.'}
        {isMagician && '집 선택 + 직업 추측 둘 다 필요.'}
        {(isImp && !needsKillOrAbility) && '집 선택 필요.'}
      </p>
    </div>
  );
}

// ==========================================================
// 개인 기록
// ==========================================================

function PrivateLog({ state, playerId }) {
  const log = state.privateReveal?.[playerId] || [];
  if (!Array.isArray(log) || log.length === 0) return null;
  return (
    <div className="bg-slate-800/60 rounded-xl p-4 border border-slate-700">
      <h3 className="font-semibold mb-2 text-sm">🔎 내 기록</h3>
      <div className="space-y-1 text-sm text-slate-300 max-h-40 overflow-y-auto">
        {log.map((r, i) => (
          <div key={i} className="border-l-2 border-indigo-500 pl-2">
            <span className="text-slate-500">[{r.dayNumber}일차]</span>{' '}
            {r.type === 'heal' && <>
              <b>{r.targetName}</b>을(를) 치료{r.saved ? ' 🩹 살렸어요!' : '했지만 공격이 없었어요'}
            </>}
            {r.type === 'block' && <>
              <b>{r.targetName}</b>을(를) 감금 {r.success ? '성공' : '(집에 없었음)'}
            </>}
            {r.type === 'investigate' && <>
              <b>{r.targetName}</b>: <b className="text-indigo-300">{ROLES[r.option1]?.name}</b> OR <b className="text-red-300">{ROLES[r.option2]?.name}</b>
            </>}
            {r.type === 'lookout' && <>
              <b>{r.targetName}</b> 집 방문자 <b>{r.count}명</b>
            </>}
            {r.type === 'trap' && <>
              <b>{r.targetName}</b> 덫: {r.caught ? '걸렸어요!' : '안 걸렸어요'}
            </>}
            {r.type === 'snitch' && <>
              <b>{r.targetName}</b> 직업: <b className="text-indigo-300">{ROLES[r.role]?.name}</b>
            </>}
            {r.type === 'provoke' && <>
              <b>{r.targetName}</b> 선동 성공. 내일 투표 +2
            </>}
            {r.type === 'track' && <>
              <b>{r.targetName}</b>: {r.destName ? <>→ <b>{r.destName}</b></> : '집 밖 안 나감'}
            </>}
            {r.type === 'visited_by_doctor' && <>
              🩹 누가 와서 {r.attacked ? '날 살려줬어요!' : '치료했어요'}
            </>}
            {r.type === 'visited_by_police' && <>
              👮 집 밖에 나갔는데 누가 막았어요
            </>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================================
// 채팅
// ==========================================================

function ChatBox({ state, mePlayer, phase, chatMessages, onChat, isDead }) {
  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMessages.length]);

  const imposterNight = phase === PHASES.NIGHT
    && isImposterRole(mePlayer?.role) && mePlayer?.alive;

  const visible = chatMessages.filter((m) => {
    if (m.type === 'system') return true;
    if (m.type === 'dead') return isDead;
    if (m.type === 'imposter') return isImposterRole(mePlayer?.role);
    if (phase === PHASES.NIGHT && !isDead) return false;
    return true;
  });

  const canChat = phase !== PHASES.ROLE_REVEAL && phase !== PHASES.NIGHT_RESULT && phase !== PHASES.VOTE_RESULT;
  const nightChatOnlyImposter = phase === PHASES.NIGHT && !isDead && !imposterNight;

  const send = () => {
    if (!input.trim() || !canChat || nightChatOnlyImposter) return;
    onChat(input);
    setInput('');
  };

  let placeholder = '메시지...';
  if (isDead) placeholder = '사망자 채팅';
  else if (nightChatOnlyImposter) placeholder = '밤엔 조용히';
  else if (imposterNight) placeholder = '임포스터 채팅';

  return (
    <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700 flex flex-col h-[60vh] lg:h-[80vh]">
      <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
        💬 채팅
        {imposterNight && <span className="text-xs text-red-400">(임포스터)</span>}
        {isDead && <span className="text-xs text-slate-500">(사망자)</span>}
      </h3>
      <div className="flex-1 overflow-y-auto space-y-1 text-sm pr-1">
        {visible.map((m) => (
          <div key={m.id} className={
            m.type === 'system' ? 'text-slate-400 italic text-xs py-1'
            : m.type === 'imposter' ? 'text-red-300'
            : m.type === 'dead' ? 'text-slate-500 italic'
            : 'text-slate-200'}>
            {m.type === 'system' ? <span>• {m.text}</span>
            : <><span className="font-semibold">{m.name}:</span> {m.text}</>}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <div className="flex gap-2 mt-2">
        <input type="text" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          disabled={!canChat || nightChatOnlyImposter} placeholder={placeholder} maxLength={200}
          className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50" />
        <button onClick={send}
          disabled={!canChat || nightChatOnlyImposter || !input.trim()}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-sm font-medium">
          전송
        </button>
      </div>
    </div>
  );
}

// ==========================================================
// 종료 화면
// ==========================================================

function EndScreen({ state, mePlayer, isHost, onResetToLobby }) {
  const winner = state.winner;
  const myRoleKey = mePlayer?.role;
  const myFaction = myRoleKey ? ROLES[myRoleKey]?.faction : null;
  const won =
    (winner === 'innocent' && myFaction === 'innocent') ||
    (winner === 'imposter' && myFaction === 'imposter') ||
    (winner === myRoleKey) ||
    (winner === 'survivor' && myRoleKey === 'survivor');

  const winnerText = {
    innocent: '🎉 시민팀 승리!',
    imposter: '🔪 임포스터팀 승리!',
    serialKiller: '🗡️ 연쇄살인마 승리!',
    magician: '🔮 마법사 승리!',
    bomber: '💣 폭탄마 승리!',
    survivor: '🛡️ 생존자 승리!',
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
              <div className={`w-8 h-8 rounded-full ${PLAYER_COLORS_BG[p.colorIdx] || 'bg-slate-500'} flex items-center justify-center font-bold text-sm ${!p.alive ? 'grayscale opacity-60' : ''}`}>
                {p.name.charAt(0)}
              </div>
              <div className="flex-1">
                <span className="font-medium">{p.name}</span>
                {!p.alive && <span className="text-xs text-red-400 ml-2">☠️</span>}
              </div>
              <div className="text-sm font-semibold">
                {ROLES[p.role]?.emoji} {ROLES[p.role]?.name}
                {p.role === 'mad' && p.fakeRole && (
                  <span className="text-xs text-slate-500 ml-1">(착각: {ROLES[p.fakeRole]?.name})</span>
                )}
                {p.stolenRole && <span className="text-xs text-green-400 ml-1">(훔침)</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
      {isHost && (
        <button onClick={onResetToLobby}
          className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold">
          🔁 대기실로 돌아가기
        </button>
      )}
    </div>
  );
}
