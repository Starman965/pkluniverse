import {
  collection,
  collectionGroup,
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

  await setDoc(
    playerRef,
    {
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      displayName: user.displayName ?? user.email ?? 'New player',
      email: user.email ?? '',
      isActive: true,
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

  const memberships = [];
  const membershipQuery = query(collectionGroup(db, 'members'), where('uid', '==', uid));
  const membershipSnapshot = await getDocs(membershipQuery);

  membershipSnapshot.forEach((snapshot) => {
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

  return snapshot.data();
}
