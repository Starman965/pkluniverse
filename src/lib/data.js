import {
  deleteField,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from './firebase';

const DEFAULT_CLUB = {
  id: 'blackhawk',
  name: 'Blackhawk',
  slug: 'blackhawk',
};

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

function splitDisplayName(displayName, email = '') {
  const trimmedDisplayName = (displayName ?? '').trim();

  if (!trimmedDisplayName) {
    return {
      firstName: '',
      lastName: '',
      fullName: email || 'New player',
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

  await setDoc(
    playerRef,
    {
      active: true,
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      displayName: user.displayName ?? user.email ?? 'New player',
      email: user.email ?? '',
      firstName,
      fullName,
      lastName,
      skillLevel: '',
      teamId,
      teamName,
      uid: user.uid,
      updatedAt: serverTimestamp(),
    },
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

  await setDoc(
    doc(db, 'users', user.uid),
    {
      lastActiveClubId: club.id,
      lastActiveTeamId: teamSlug,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

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
  const membershipSnapshot = await getDoc(membershipRef);
  const playerId = await ensurePlayerProfile({
    clubId: club.id,
    teamId: team.slug,
    teamName: team.name,
    user,
  });

  if (!membershipSnapshot.exists()) {
    await setDoc(membershipRef, {
      clubId: club.id,
      clubSlug: club.slug,
      joinedAt: serverTimestamp(),
      playerId,
      role: 'member',
      status: 'active',
      teamId: team.slug,
      teamName: team.name,
      teamSlug: team.slug,
      uid: user.uid,
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(membershipRef, {
      playerId,
      updatedAt: serverTimestamp(),
    });
  }

  await syncMembershipSummary({
    clubSlug: club.slug,
    role: membershipSnapshot.exists() ? membershipSnapshot.data().role ?? 'member' : 'member',
    teamName: team.name,
    teamSlug: team.slug,
    uid: user.uid,
  });

  await setDoc(
    doc(db, 'users', user.uid),
    {
      lastActiveClubId: club.id,
      lastActiveTeamId: team.slug,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

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

export async function getMembership(clubSlug, teamSlug, uid) {
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

  return data;
}

function normalizeNullableNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildFullName(firstName, lastName) {
  return [firstName, lastName].filter(Boolean).join(' ').trim();
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

  const nextPlayerId = playerId || slugify(fullName) || `player-${Date.now()}`;
  const playerRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'players', nextPlayerId);

  await setDoc(
    playerRef,
    {
      active,
      createdAt: serverTimestamp(),
      createdBy: user?.uid ?? '',
      dupr: normalizeNullableNumber(dupr),
      firstName: trimmedFirstName,
      fullName,
      lastName: trimmedLastName,
      skillLevel: skillLevel.trim(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return nextPlayerId;
}

function gameSortKey(game) {
  return game.isoDate || '9999-12-31';
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
      id: entry.id,
      isoDate: data.isoDate ?? '',
      location: data.location ?? '',
      matchStatus: data.matchStatus ?? 'scheduled',
      opponent: data.opponent ?? '',
      opponentScore: normalizeNullableNumber(data.opponentScore),
      teamScore: normalizeNullableNumber(data.teamScore),
      timeLabel: data.timeLabel ?? '',
    };
  });

  games.sort((left, right) => gameSortKey(left).localeCompare(gameSortKey(right)));

  return games;
}

export async function saveGame({
  clubSlug,
  isoDate,
  location,
  opponent,
  teamSlug,
  timeLabel,
  user,
}) {
  requireDb();

  const trimmedIsoDate = isoDate.trim();
  const trimmedOpponent = opponent.trim();
  const trimmedLocation = location.trim();
  const trimmedTimeLabel = timeLabel.trim();

  if (!trimmedIsoDate) {
    throw new Error('Choose a date for the matchup.');
  }

  if (!trimmedOpponent) {
    throw new Error('Enter an opponent or event name.');
  }

  const baseId = slugify(`${trimmedIsoDate}-${trimmedOpponent}-${trimmedLocation || 'location'}`);
  const gameId = baseId || `game-${Date.now()}`;
  const gameRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'games', gameId);

  await setDoc(
    gameRef,
    {
      attendance: {},
      createdAt: serverTimestamp(),
      createdBy: user?.uid ?? '',
      dateLabel: trimmedIsoDate,
      isoDate: trimmedIsoDate,
      location: trimmedLocation || 'Location TBD',
      matchStatus: 'scheduled',
      opponent: trimmedOpponent,
      opponentScore: null,
      rosterPlayerIds: [],
      teamScore: null,
      timeLabel: trimmedTimeLabel || 'Time TBD',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return gameId;
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
