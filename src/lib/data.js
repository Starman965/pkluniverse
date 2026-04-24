import {
  deleteField,
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, isFirebaseConfigured, storage } from './firebase';

const DEFAULT_CLUB = {
  id: 'blackhawk',
  name: 'Blackhawk',
  slug: 'blackhawk',
};

export const PLAYER_SKILL_LEVELS = [
  'Beginner',
  'Low Intermediate',
  'Intermediate',
  'Advanced',
  'Professional',
];

function requireDb() {
  if (!isFirebaseConfigured || !db) {
    throw new Error('Firebase is not configured yet.');
  }
}

export function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function makeJoinCode(seed) {
  const normalizedSeed = seed.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 3) || 'PKL';
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${normalizedSeed}${random}`;
}

function sanitizeFileBaseName(fileName) {
  const withoutExtension = (fileName ?? '').replace(/\.[^/.]+$/, '');
  return slugify(withoutExtension).slice(0, 32) || 'image';
}

function getFileExtension(fileName) {
  const match = /(\.[a-z0-9]+)$/i.exec(fileName ?? '');
  return match?.[1]?.toLowerCase() ?? '.jpg';
}

function buildNewsImagePath({ clubSlug, postId, teamSlug, fileName }) {
  const safeBaseName = sanitizeFileBaseName(fileName);
  const extension = getFileExtension(fileName);
  return `clubs/${clubSlug}/teams/${teamSlug}/news/${postId}/${Date.now()}-${safeBaseName}${extension}`;
}

function buildTeamLogoPath({ clubSlug, teamSlug, fileName }) {
  const safeBaseName = sanitizeFileBaseName(fileName);
  const extension = getFileExtension(fileName);
  return `clubs/${clubSlug}/teams/${teamSlug}/branding/${Date.now()}-${safeBaseName}${extension}`;
}

async function uploadNewsImage({ clubSlug, file, postId, teamSlug }) {
  if (!storage) {
    throw new Error('Firebase Storage is not configured yet.');
  }

  const imagePath = buildNewsImagePath({
    clubSlug,
    fileName: file?.name,
    postId,
    teamSlug,
  });
  const imageRef = ref(storage, imagePath);

  await uploadBytes(imageRef, file);

  return {
    imagePath,
    imageUrl: await getDownloadURL(imageRef),
  };
}

async function uploadTeamLogo({ clubSlug, file, teamSlug }) {
  if (!storage) {
    throw new Error('Firebase Storage is not configured yet.');
  }

  const logoPath = buildTeamLogoPath({
    clubSlug,
    fileName: file?.name,
    teamSlug,
  });
  const logoRef = ref(storage, logoPath);

  await uploadBytes(logoRef, file);

  return {
    logoPath,
    logoUrl: await getDownloadURL(logoRef),
  };
}

async function deleteStoragePath(imagePath) {
  if (!storage || !imagePath) {
    return;
  }

  try {
    await deleteObject(ref(storage, imagePath));
  } catch {
    // Ignore missing or already-deleted files during updates.
  }
}

function splitDisplayName(displayName, email = '') {
  const trimmedDisplayName = (displayName ?? '').trim();

  if (!trimmedDisplayName) {
    const emailLocalPart = (email ?? '').split('@')[0] ?? '';
    const emailParts = emailLocalPart
      .split(/[._-]+/)
      .map((part) => part.trim())
      .filter(Boolean);
    const firstName = emailParts[0] ?? '';
    const lastName = emailParts
      .slice(1)
      .join(' ')
      .trim();
    const fullName = buildFullName(firstName, lastName);

    return {
      firstName,
      lastName,
      fullName: fullName || email || 'New player',
    };
  }

  const parts = trimmedDisplayName.split(/\s+/);
  const firstName = parts[0] ?? '';
  const lastName = parts.slice(1).join(' ');

  return {
    firstName,
    fullName: buildFullName(firstName, lastName) || trimmedDisplayName,
    lastName,
  };
}

async function syncMembershipSummary({ clubSlug, role, teamName, teamSlug, uid }) {
  const membershipSummaryRef = doc(db, 'users', uid, 'memberships', `${clubSlug}_${teamSlug}`);

  await setDoc(
    membershipSummaryRef,
    {
      clubSlug,
      role,
      teamName,
      teamSlug,
      uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function syncUserProfile(user) {
  requireDb();

  const userRef = doc(db, 'users', user.uid);

  await setDoc(
    userRef,
    {
      uid: user.uid,
      displayName: user.displayName ?? '',
      email: user.email ?? '',
      photoURL: user.photoURL ?? '',
      lastSeenAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function getUserProfileData(uid) {
  requireDb();

  if (!uid) {
    return null;
  }

  const userRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userRef);

  return snapshot.exists() ? snapshot.data() : null;
}

export async function setLastActiveTeam({ clubSlug, teamSlug, uid }) {
  requireDb();

  if (!uid || !clubSlug || !teamSlug) {
    return;
  }

  await setDoc(
    doc(db, 'users', uid),
    {
      lastActiveClubId: clubSlug,
      lastActiveTeamId: teamSlug,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function ensureClub() {
  requireDb();

  const clubRef = doc(db, 'clubs', DEFAULT_CLUB.id);
  const snapshot = await getDoc(clubRef);

  if (!snapshot.exists()) {
    await setDoc(clubRef, {
      createdAt: serverTimestamp(),
      name: DEFAULT_CLUB.name,
      slug: DEFAULT_CLUB.slug,
      status: 'active',
      updatedAt: serverTimestamp(),
    });
  }

  return DEFAULT_CLUB;
}

async function ensurePlayerProfile({ clubId, teamId, teamName, user }) {
  const playerRef = doc(db, 'clubs', clubId, 'teams', teamId, 'players', user.uid);
  const membershipPlayerRef = doc(db, 'clubs', clubId, 'teams', teamId, 'playerLinks', user.uid);
  const { firstName, fullName, lastName } = splitDisplayName(user.displayName, user.email);
  let playerSnapshot = null;
  let existingPlayer = null;

  try {
    playerSnapshot = await getDoc(playerRef);
    existingPlayer = playerSnapshot.exists() ? playerSnapshot.data() : null;
  } catch (error) {
    // Joining or creating a team can happen before membership exists, and the current
    // rules block reads on player docs until the user is already a team member.
    if (error?.code !== 'permission-denied') {
      throw error;
    }
  }

  const existingFirstName = (existingPlayer?.firstName ?? '').trim();
  const existingLastName = (existingPlayer?.lastName ?? '').trim();
  const existingFullName = (existingPlayer?.fullName ?? '').trim();
  const payload = {
    displayName: user.displayName ?? user.email ?? existingPlayer?.displayName ?? 'New player',
    email: user.email ?? existingPlayer?.email ?? '',
    firstName: existingFirstName || firstName,
    fullName:
      existingFullName ||
      buildFullName(existingFirstName || firstName, existingLastName || lastName) ||
      fullName,
    lastName: existingLastName || lastName,
    teamId,
    teamName,
    uid: user.uid,
    updatedAt: serverTimestamp(),
  };

  if (playerSnapshot) {
    payload.active = existingPlayer?.active !== false;
    payload.skillLevel = normalizeSkillLevel(existingPlayer?.skillLevel ?? '');

    if (!playerSnapshot.exists()) {
      payload.createdAt = serverTimestamp();
      payload.createdBy = user.uid;
    }
  }

  await setDoc(
    playerRef,
    payload,
    { merge: true },
  );

  await setDoc(
    membershipPlayerRef,
    {
      playerId: user.uid,
      teamId,
      uid: user.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return user.uid;
}

export async function createTeam({ teamName, user }) {
  requireDb();

  if (!user) {
    throw new Error('You must be signed in to create a team.');
  }

  const trimmedName = teamName.trim();

  if (!trimmedName) {
    throw new Error('Enter a team name first.');
  }

  const club = await ensureClub();
  const teamSlug = slugify(trimmedName);

  if (!teamSlug) {
    throw new Error('That team name cannot be converted into a valid URL slug.');
  }

  const teamRef = doc(db, 'clubs', club.id, 'teams', teamSlug);
  const existingTeam = await getDoc(teamRef);

  if (existingTeam.exists()) {
    throw new Error('A team with that slug already exists. Try a slightly different name.');
  }

  const joinCode = makeJoinCode(teamSlug);

  await setDoc(teamRef, {
    clubId: club.id,
    clubName: club.name,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    createdByEmail: user.email ?? '',
    joinCode,
    logoPath: '',
    logoUrl: '',
    name: trimmedName,
    slug: teamSlug,
    status: 'active',
    updatedAt: serverTimestamp(),
  });

  const playerId = await ensurePlayerProfile({
    clubId: club.id,
    teamId: teamSlug,
    teamName: trimmedName,
    user,
  });

  await setDoc(doc(db, 'clubs', club.id, 'teams', teamSlug, 'members', user.uid), {
    clubId: club.id,
    clubSlug: club.slug,
    joinedAt: serverTimestamp(),
    playerId,
    role: 'captain',
    status: 'active',
    teamId: teamSlug,
    teamName: trimmedName,
    teamSlug,
    uid: user.uid,
    updatedAt: serverTimestamp(),
  });

  await syncMembershipSummary({
    clubSlug: club.slug,
    role: 'captain',
    teamName: trimmedName,
    teamSlug,
    uid: user.uid,
  });

  await setLastActiveTeam({
    clubSlug: club.slug,
    teamSlug,
    uid: user.uid,
  });

  return { clubSlug: club.slug, joinCode, teamSlug };
}

export async function joinTeamByCode({ code, user }) {
  requireDb();

  if (!user) {
    throw new Error('You must be signed in to join a team.');
  }

  const normalizedCode = code.trim().toUpperCase();

  if (!normalizedCode) {
    throw new Error('Enter a join code first.');
  }

  const club = await ensureClub();
  const teamsRef = collection(db, 'clubs', club.id, 'teams');
  const teamQuery = query(teamsRef, where('joinCode', '==', normalizedCode), limit(1));
  const teamSnapshot = await getDocs(teamQuery);

  if (teamSnapshot.empty) {
    throw new Error('No team matched that join code.');
  }

  const teamDoc = teamSnapshot.docs[0];
  const team = teamDoc.data();
  const membershipRef = doc(db, 'clubs', club.id, 'teams', team.slug, 'members', user.uid);
  const existingMemberships = await listMemberships(user.uid).catch(() => []);
  const existingMembership =
    existingMemberships.find(
      (membership) => membership.clubSlug === club.slug && membership.teamSlug === team.slug,
    ) ?? null;
  const nextRole = existingMembership?.role ?? 'member';
  const playerId = await ensurePlayerProfile({
    clubId: club.id,
    teamId: team.slug,
    teamName: team.name,
    user,
  });

  if (existingMembership) {
    await updateDoc(membershipRef, {
      playerId,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(membershipRef, {
      clubId: club.id,
      clubSlug: club.slug,
      joinedAt: serverTimestamp(),
      playerId,
      role: nextRole,
      status: 'active',
      teamId: team.slug,
      teamName: team.name,
      teamSlug: team.slug,
      uid: user.uid,
      updatedAt: serverTimestamp(),
    });
  }

  await syncMembershipSummary({
    clubSlug: club.slug,
    role: nextRole,
    teamName: team.name,
    teamSlug: team.slug,
    uid: user.uid,
  });

  await setLastActiveTeam({
    clubSlug: club.slug,
    teamSlug: team.slug,
    uid: user.uid,
  });

  return { clubSlug: club.slug, teamSlug: team.slug };
}

export async function listMemberships(uid) {
  requireDb();

  const membershipSummariesRef = collection(db, 'users', uid, 'memberships');
  const membershipSummariesSnapshot = await getDocs(membershipSummariesRef);
  const memberships = [];

  membershipSummariesSnapshot.forEach((snapshot) => {
    const data = snapshot.data();
    memberships.push({
      clubSlug: data.clubSlug,
      role: data.role,
      teamName: data.teamName,
      teamSlug: data.teamSlug,
    });
  });

  memberships.sort((a, b) => a.teamName.localeCompare(b.teamName));

  return memberships;
}

export async function getTeam(clubSlug, teamSlug) {
  requireDb();

  const teamRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug);
  const snapshot = await getDoc(teamRef);

  if (!snapshot.exists()) {
    return null;
  }

  return snapshot.data();
}

export async function getMembership(clubSlug, teamSlug, uid, user = null) {
  requireDb();

  const membershipRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'members', uid);
  const snapshot = await getDoc(membershipRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();

  await syncMembershipSummary({
    clubSlug: data.clubSlug,
    role: data.role,
    teamName: data.teamName,
    teamSlug: data.teamSlug,
    uid,
  });

  if (user?.uid === uid) {
    await ensurePlayerProfile({
      clubId: clubSlug,
      teamId: teamSlug,
      teamName: data.teamName ?? teamSlug,
      user,
    });
  }

  return data;
}

export async function listTeamMembers(clubSlug, teamSlug) {
  requireDb();

  const membersRef = collection(db, 'clubs', clubSlug, 'teams', teamSlug, 'members');
  const snapshot = await getDocs(membersRef);
  const members = snapshot.docs.map((entry) => {
    const data = entry.data();

    return {
      clubSlug: data.clubSlug ?? clubSlug,
      id: entry.id,
      joinedAtMs: normalizeTimestampMs(data.joinedAt),
      playerId: data.playerId ?? '',
      role: data.role ?? 'member',
      status: data.status ?? 'active',
      teamName: data.teamName ?? '',
      teamSlug: data.teamSlug ?? teamSlug,
      uid: data.uid ?? entry.id,
    };
  });

  const roleOrder = {
    captain: 0,
    coCaptain: 1,
    member: 2,
  };

  members.sort((left, right) => {
    const leftOrder = roleOrder[left.role] ?? 99;
    const rightOrder = roleOrder[right.role] ?? 99;

    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }

    return (left.uid ?? '').localeCompare(right.uid ?? '');
  });

  return members;
}

async function syncTeamNameReferences({ clubSlug, teamName, teamSlug }) {
  const membersRef = collection(db, 'clubs', clubSlug, 'teams', teamSlug, 'members');
  const membersSnapshot = await getDocs(membersRef);

  if (membersSnapshot.empty) {
    return;
  }

  const batch = writeBatch(db);

  membersSnapshot.docs.forEach((entry) => {
    const data = entry.data();
    const uid = data.uid ?? entry.id;

    batch.update(entry.ref, {
      teamName,
      updatedAt: serverTimestamp(),
    });

    batch.set(
      doc(db, 'users', uid, 'memberships', `${clubSlug}_${teamSlug}`),
      {
        clubSlug,
        role: data.role ?? 'member',
        teamName,
        teamSlug,
        uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  await batch.commit();
}

export async function updateTeamSettings({
  clubSlug,
  logoFile,
  status = 'active',
  teamName,
  teamSlug,
}) {
  requireDb();

  const normalizedName = teamName.trim();

  if (!normalizedName) {
    throw new Error('Enter a team name.');
  }

  const teamRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug);
  const teamSnapshot = await getDoc(teamRef);

  if (!teamSnapshot.exists()) {
    throw new Error('That team could not be found.');
  }

  const currentTeam = teamSnapshot.data();
  let uploadedLogo = null;

  if (logoFile) {
    uploadedLogo = await uploadTeamLogo({
      clubSlug,
      file: logoFile,
      teamSlug,
    });
  }

  await updateDoc(teamRef, {
    logoPath: uploadedLogo?.logoPath ?? currentTeam.logoPath ?? '',
    logoUrl: uploadedLogo?.logoUrl ?? currentTeam.logoUrl ?? '',
    name: normalizedName,
    status,
    updatedAt: serverTimestamp(),
  });

  if (uploadedLogo?.logoPath && currentTeam.logoPath && currentTeam.logoPath !== uploadedLogo.logoPath) {
    await deleteStoragePath(currentTeam.logoPath);
  }

  if ((currentTeam.name ?? '') !== normalizedName) {
    await syncTeamNameReferences({
      clubSlug,
      teamName: normalizedName,
      teamSlug,
    });
  }
}

export async function rotateTeamJoinCode({ clubSlug, teamSlug }) {
  requireDb();

  const nextJoinCode = makeJoinCode(teamSlug);
  const teamRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug);

  await updateDoc(teamRef, {
    joinCode: nextJoinCode,
    updatedAt: serverTimestamp(),
  });

  return nextJoinCode;
}

export async function updateTeamMemberRole({
  clubSlug,
  role,
  targetUid,
  teamSlug,
}) {
  requireDb();

  if (!['member', 'coCaptain'].includes(role)) {
    throw new Error('That role change is not supported.');
  }

  const membershipRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'members', targetUid);
  const membershipSnapshot = await getDoc(membershipRef);

  if (!membershipSnapshot.exists()) {
    throw new Error('That team member could not be found.');
  }

  const membership = membershipSnapshot.data();

  if ((membership.role ?? '') === 'captain') {
    throw new Error('Captain reassignment is not supported here yet.');
  }

  const batch = writeBatch(db);

  batch.update(membershipRef, {
    role,
    updatedAt: serverTimestamp(),
  });

  batch.set(
    doc(db, 'users', targetUid, 'memberships', `${clubSlug}_${teamSlug}`),
    {
      clubSlug,
      role,
      teamName: membership.teamName ?? '',
      teamSlug,
      uid: targetUid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
}

function normalizeNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSkillLevel(value) {
  const trimmed = (value ?? '').trim();

  if (!trimmed) {
    return '';
  }

  return (
    PLAYER_SKILL_LEVELS.find((option) => option.toLowerCase() === trimmed.toLowerCase()) ?? ''
  );
}

function buildFullName(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(' ').trim();
}

export function deriveMatchResult(matchStatus, teamScore, opponentScore) {
  if (matchStatus !== 'completed') {
    return 'pending';
  }

  if (teamScore === null || opponentScore === null) {
    return 'pending';
  }

  if (teamScore > opponentScore) {
    return 'win';
  }

  if (teamScore < opponentScore) {
    return 'loss';
  }

  return 'tie';
}

function normalizeUrl(value) {
  const trimmed = (value ?? '').trim();

  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function normalizeTimestampMs(value) {
  if (!value) {
    return 0;
  }

  if (typeof value.toMillis === 'function') {
    return value.toMillis();
  }

  if (typeof value.seconds === 'number') {
    return value.seconds * 1000;
  }

  return 0;
}

export async function listPlayers(clubSlug, teamSlug) {
  requireDb();

  const playersRef = collection(db, 'clubs', clubSlug, 'teams', teamSlug, 'players');
  const snapshot = await getDocs(playersRef);
  const players = snapshot.docs.map((entry) => {
    const data = entry.data();
    const firstName = (data.firstName ?? '').trim();
    const lastName = (data.lastName ?? '').trim();

    return {
      active: data.active !== false,
      dupr: normalizeNullableNumber(data.dupr),
      email: data.email ?? '',
      firstName,
      fullName: data.fullName ?? buildFullName(firstName, lastName),
      id: entry.id,
      lastName,
      skillLevel: data.skillLevel ?? '',
      uid: data.uid ?? '',
    };
  });

  players.sort((left, right) => left.fullName.localeCompare(right.fullName));

  return players;
}

export async function savePlayer({
  active = true,
  clubSlug,
  dupr,
  firstName,
  lastName,
  playerId,
  skillLevel,
  teamSlug,
  user,
}) {
  requireDb();

  const trimmedFirstName = firstName.trim();
  const trimmedLastName = lastName.trim();
  const fullName = buildFullName(trimmedFirstName, trimmedLastName);

  if (!fullName) {
    throw new Error('Enter at least a first or last name for the player.');
  }

  const normalizedSkillLevel = normalizeSkillLevel(skillLevel);

  if (skillLevel?.trim() && !normalizedSkillLevel) {
    throw new Error('Choose a valid skill level from the list.');
  }

  const nextPlayerId = playerId || slugify(fullName) || `player-${Date.now()}`;
  const playerRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'players', nextPlayerId);
  const payload = {
    active,
    dupr: normalizeNullableNumber(dupr),
    firstName: trimmedFirstName,
    fullName,
    lastName: trimmedLastName,
    skillLevel: normalizedSkillLevel,
    updatedAt: serverTimestamp(),
  };

  if (!playerId) {
    payload.createdAt = serverTimestamp();
    payload.createdBy = user?.uid ?? '';
  }

  await setDoc(playerRef, payload, { merge: true });

  return nextPlayerId;
}

export async function deletePlayer({ clubSlug, playerId, teamSlug }) {
  requireDb();

  if (!playerId) {
    throw new Error('Choose a player to remove.');
  }

  const playerRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'players', playerId);
  const playerSnapshot = await getDoc(playerRef);

  if (!playerSnapshot.exists()) {
    throw new Error('That player could not be found.');
  }

  const player = playerSnapshot.data();

  if (player.uid) {
    throw new Error('Linked account players cannot be deleted. Deactivate them instead.');
  }

  const gamesRef = collection(db, 'clubs', clubSlug, 'teams', teamSlug, 'games');
  const gamesSnapshot = await getDocs(gamesRef);
  const batch = writeBatch(db);

  gamesSnapshot.docs.forEach((entry) => {
    const game = entry.data();
    const rosterPlayerIds = normalizePlayerIdList(
      (game.rosterPlayerIds ?? []).filter((entryPlayerId) => entryPlayerId !== playerId),
    );
    const pairings = normalizePairings(game.pairings, rosterPlayerIds);
    const attendance = { ...(game.attendance ?? {}) };

    delete attendance[playerId];

    batch.update(entry.ref, {
      attendance,
      pairings,
      rosterPlayerIds,
      updatedAt: serverTimestamp(),
    });
  });

  batch.delete(playerRef);
  await batch.commit();
}

function gameSortKey(game) {
  return game.isoDate || '9999-12-31';
}

function createEmptyPairings() {
  return Array.from({ length: 4 }, (_, index) => ({
    courtLabel: `Court ${index + 1}`,
    playerIds: [],
  }));
}

function normalizePlayerIdList(playerIds) {
  return Array.from(
    new Set(
      (Array.isArray(playerIds) ? playerIds : [])
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter(Boolean),
    ),
  );
}

function normalizePairings(pairings, rosterPlayerIds = []) {
  const allowedPlayerIds = new Set(normalizePlayerIdList(rosterPlayerIds));
  const source = Array.isArray(pairings) ? pairings : [];
  const seen = new Set();

  return createEmptyPairings().map((defaultPairing, index) => {
    const pair = source[index];
    const playerIds = normalizePlayerIdList(pair?.playerIds).filter((playerId) => {
      if (!allowedPlayerIds.has(playerId) || seen.has(playerId)) {
        return false;
      }

      seen.add(playerId);
      return true;
    });

    return {
      courtLabel:
        typeof pair?.courtLabel === 'string' && pair.courtLabel.trim()
          ? pair.courtLabel.trim()
          : defaultPairing.courtLabel,
      playerIds: playerIds.slice(0, 2),
    };
  });
}

export async function listGames(clubSlug, teamSlug) {
  requireDb();

  const gamesRef = collection(db, 'clubs', clubSlug, 'teams', teamSlug, 'games');
  const snapshot = await getDocs(gamesRef);
  const games = snapshot.docs.map((entry) => {
    const data = entry.data();

    return {
      attendance: data.attendance ?? {},
      dateLabel: data.dateLabel ?? '',
      dateTbd: data.dateTbd === true,
      id: entry.id,
      isoDate: data.isoDate ?? '',
      location: data.location ?? '',
      matchStatus: data.matchStatus ?? 'scheduled',
      opponent: data.opponent ?? '',
      opponentScore: normalizeNullableNumber(data.opponentScore),
      pairings: normalizePairings(data.pairings, data.rosterPlayerIds ?? []),
      result:
        data.result ??
        deriveMatchResult(
          data.matchStatus ?? 'scheduled',
          normalizeNullableNumber(data.teamScore),
          normalizeNullableNumber(data.opponentScore),
        ),
      rosterPlayerIds: normalizePlayerIdList(data.rosterPlayerIds),
      teamScore: normalizeNullableNumber(data.teamScore),
      timeLabel: data.timeLabel ?? '',
    };
  });

  games.sort((left, right) => gameSortKey(left).localeCompare(gameSortKey(right)));

  return games;
}

export async function saveGame({
  clubSlug,
  dateTbd = false,
  gameId,
  isoDate,
  location,
  matchStatus = 'scheduled',
  opponent,
  opponentScore,
  teamSlug,
  teamScore,
  timeLabel,
  user,
}) {
  requireDb();

  const trimmedIsoDate = isoDate.trim();
  const trimmedOpponent = opponent.trim();
  const trimmedLocation = location.trim();
  const trimmedTimeLabel = timeLabel.trim();
  const normalizedDateTbd = dateTbd === true;

  if (!normalizedDateTbd && !trimmedIsoDate) {
    throw new Error('Choose a date for the matchup.');
  }

  if (!trimmedOpponent) {
    throw new Error('Enter an opponent or event name.');
  }

  const baseId = slugify(
    `${normalizedDateTbd ? 'date-tbd' : trimmedIsoDate}-${trimmedOpponent}-${trimmedLocation || 'location'}`,
  );
  const nextGameId = gameId || baseId || `game-${Date.now()}`;
  const gameRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'games', nextGameId);
  const normalizedTeamScore = normalizeNullableNumber(teamScore);
  const normalizedOpponentScore = normalizeNullableNumber(opponentScore);
  const finalStatus =
    matchStatus === 'completed' ||
    (normalizedTeamScore !== null && normalizedOpponentScore !== null)
      ? 'completed'
      : 'scheduled';
  const result = deriveMatchResult(finalStatus, normalizedTeamScore, normalizedOpponentScore);
  const payload = {
    dateLabel: normalizedDateTbd ? 'Date TBD' : trimmedIsoDate,
    dateTbd: normalizedDateTbd,
    isoDate: normalizedDateTbd ? '' : trimmedIsoDate,
    location: trimmedLocation || 'Location TBD',
    matchStatus: finalStatus,
    opponent: trimmedOpponent,
    opponentScore: normalizedOpponentScore,
    result,
    teamScore: normalizedTeamScore,
    timeLabel: normalizedDateTbd ? 'Time TBD' : trimmedTimeLabel || 'Time TBD',
    updatedAt: serverTimestamp(),
  };

  if (!gameId) {
    payload.attendance = {};
    payload.createdAt = serverTimestamp();
    payload.createdBy = user?.uid ?? '';
    payload.pairings = createEmptyPairings();
    payload.rosterPlayerIds = [];
  }

  await setDoc(
    gameRef,
    payload,
    { merge: true },
  );

  return nextGameId;
}

export async function deleteGame({ clubSlug, gameId, teamSlug }) {
  requireDb();

  if (!gameId) {
    throw new Error('Choose a matchup to delete.');
  }

  await deleteDoc(doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'games', gameId));
}

export async function saveGamePairings({
  clubSlug,
  gameId,
  pairings,
  rosterPlayerIds,
  teamSlug,
}) {
  requireDb();

  if (!gameId) {
    throw new Error('Choose a matchup before saving pairings.');
  }

  const normalizedRosterPlayerIds = normalizePlayerIdList(rosterPlayerIds);

  if (normalizedRosterPlayerIds.length > 8) {
    throw new Error('Choose up to eight players for matchup pairings.');
  }

  const normalizedPairings = normalizePairings(pairings, normalizedRosterPlayerIds);
  const gameRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'games', gameId);

  await updateDoc(gameRef, {
    pairings: normalizedPairings,
    rosterPlayerIds: normalizedRosterPlayerIds,
    updatedAt: serverTimestamp(),
  });
}

export async function setAvailability({
  clubSlug,
  playerId,
  status,
  teamSlug,
  user,
  gameId,
}) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to update availability.');
  }

  if (!playerId) {
    throw new Error('Your account is not linked to a player profile for this team yet.');
  }

  const gameRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'games', gameId);
  const fieldPath = `attendance.${playerId}`;

  if (status === 'unknown') {
    await updateDoc(gameRef, {
      [fieldPath]: deleteField(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  await updateDoc(gameRef, {
    [fieldPath]: status,
    updatedAt: serverTimestamp(),
  });
}

function createNewsPostId(title) {
  const slug = slugify(title).slice(0, 24) || 'news';
  return `${Date.now()}-${slug}`;
}

export async function listNewsPosts(clubSlug, teamSlug) {
  requireDb();

  const newsRef = collection(db, 'clubs', clubSlug, 'teams', teamSlug, 'newsPosts');
  const snapshot = await getDocs(newsRef);
  const posts = snapshot.docs.map((entry) => {
    const data = entry.data();

    return {
      body: (data.body ?? '').trim(),
      createdAtMs: normalizeTimestampMs(data.createdAt),
      createdBy: data.createdBy ?? '',
      id: entry.id,
      imagePath: typeof data.imagePath === 'string' ? data.imagePath : '',
      imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
      linkUrl: typeof data.linkUrl === 'string' ? data.linkUrl : '',
      title: (data.title ?? '').trim() || 'Team update',
      updatedAtMs: normalizeTimestampMs(data.updatedAt),
      updatedBy: data.updatedBy ?? '',
    };
  });

  posts.sort((left, right) => (right.updatedAtMs || right.createdAtMs) - (left.updatedAtMs || left.createdAtMs));

  return posts;
}

export async function saveNewsPost({
  body,
  clubSlug,
  imageFile,
  linkUrl,
  post,
  teamSlug,
  title,
  user,
}) {
  requireDb();

  const normalizedTitle = title.trim();
  const normalizedBody = body.trim();

  if (!normalizedTitle) {
    throw new Error('Enter a title for the news post.');
  }

  if (!normalizedBody) {
    throw new Error('Enter some body text for the news post.');
  }

  const postId = post?.id ?? createNewsPostId(normalizedTitle);
  const postRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'newsPosts', postId);
  let uploadedImage = null;

  if (imageFile) {
    uploadedImage = await uploadNewsImage({
      clubSlug,
      file: imageFile,
      postId,
      teamSlug,
    });
  }

  const payload = {
    body: normalizedBody,
    createdBy: post?.createdBy ?? user?.email ?? user?.uid ?? '',
    imagePath: uploadedImage?.imagePath ?? post?.imagePath ?? '',
    imageUrl: uploadedImage?.imageUrl ?? post?.imageUrl ?? '',
    linkUrl: normalizeUrl(linkUrl),
    title: normalizedTitle,
    updatedAt: serverTimestamp(),
    updatedBy: user?.email ?? user?.uid ?? '',
  };

  if (!post) {
    payload.createdAt = serverTimestamp();
  }

  await setDoc(postRef, payload, { merge: true });

  if (uploadedImage?.imagePath && post?.imagePath && post.imagePath !== uploadedImage.imagePath) {
    await deleteStoragePath(post.imagePath);
  }

  return postId;
}

export async function deleteNewsPost({ clubSlug, post, teamSlug }) {
  requireDb();

  const postRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'newsPosts', post.id);
  await deleteDoc(postRef);
  await deleteStoragePath(post.imagePath);
}

export function buildStandingsSummary(games) {
  const completedGames = games.filter(
    (game) => game.matchStatus === 'completed' && game.result && game.result !== 'pending',
  );

  const wins = completedGames.filter((game) => game.result === 'win').length;
  const losses = completedGames.filter((game) => game.result === 'loss').length;
  const ties = completedGames.filter((game) => game.result === 'tie').length;
  const winPct = completedGames.length
    ? ((wins + ties * 0.5) / completedGames.length).toFixed(3)
    : '0.000';

  const rows = new Map();

  completedGames.forEach((game) => {
    const key = game.opponent || 'Unknown opponent';
    const row = rows.get(key) ?? {
      losses: 0,
      matches: 0,
      opponent: key,
      pointsAgainst: 0,
      pointsFor: 0,
      ties: 0,
      wins: 0,
    };

    row.matches += 1;

    if (game.result === 'win') {
      row.wins += 1;
    } else if (game.result === 'loss') {
      row.losses += 1;
    } else if (game.result === 'tie') {
      row.ties += 1;
    }

    row.pointsFor += game.teamScore ?? 0;
    row.pointsAgainst += game.opponentScore ?? 0;
    rows.set(key, row);
  });

  const opponents = Array.from(rows.values()).sort((left, right) => {
    if (right.wins !== left.wins) {
      return right.wins - left.wins;
    }

    if (left.losses !== right.losses) {
      return left.losses - right.losses;
    }

    return left.opponent.localeCompare(right.opponent);
  });

  return {
    completedGames,
    losses,
    opponents,
    ties,
    winPct,
    wins,
  };
}

export function buildPairingSummary(game, players) {
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const selectedPlayers = normalizePlayerIdList(game?.rosterPlayerIds).map(
    (playerId) => playerMap.get(playerId) ?? { fullName: 'Unknown player', id: playerId },
  );
  const pairings = normalizePairings(game?.pairings, game?.rosterPlayerIds ?? []);

  return {
    pairings: pairings.map((pairing) => ({
      ...pairing,
      players: pairing.playerIds.map(
        (playerId) => playerMap.get(playerId) ?? { fullName: 'Unknown player', id: playerId },
      ),
    })),
    selectedPlayers,
  };
}
