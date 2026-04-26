import {
  collectionGroup,
  deleteField,
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, isFirebaseConfigured, storage } from './firebase';

const INDEPENDENT_CLUB = {
  id: 'independent',
  name: 'Independent Teams',
  slug: 'independent',
};

const RESERVED_CLUBS = [INDEPENDENT_CLUB];

const SUPER_ADMIN_EMAILS = ['demandgendave@gmail.com'];

export const PLAYER_SKILL_LEVELS = [
  'Beginner',
  'Low Intermediate',
  'Intermediate',
  'Advanced',
  'Professional',
];

export const PLAYER_AVAILABLE_DAYS = [
  { id: 'sun', label: 'Sunday' },
  { id: 'mon', label: 'Monday' },
  { id: 'tue', label: 'Tuesday' },
  { id: 'wed', label: 'Wednesday' },
  { id: 'thu', label: 'Thursday' },
  { id: 'fri', label: 'Friday' },
  { id: 'sat', label: 'Saturday' },
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

function makeTeamId() {
  return `team_${Math.random().toString(36).slice(2, 8)}`;
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

function buildClubLogoPath({ clubSlug, fileName }) {
  const safeBaseName = sanitizeFileBaseName(fileName);
  const extension = getFileExtension(fileName);
  return `clubs/${clubSlug}/branding/${Date.now()}-${safeBaseName}${extension}`;
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

async function uploadClubLogo({ clubSlug, file }) {
  if (!storage) {
    throw new Error('Firebase Storage is not configured yet.');
  }

  const logoPath = buildClubLogoPath({
    clubSlug,
    fileName: file?.name,
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

async function deleteRefsInBatches(refs) {
  const batchSize = 450;

  for (let index = 0; index < refs.length; index += batchSize) {
    const batch = writeBatch(db);
    refs.slice(index, index + batchSize).forEach((docRef) => {
      batch.delete(docRef);
    });
    await batch.commit();
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

  return ensureIndependentClub();
}

async function ensureReservedClub(club) {
  const clubRef = doc(db, 'clubs', club.id);
  const snapshot = await getDoc(clubRef);

  if (!snapshot.exists()) {
    await setDoc(clubRef, {
      createdAt: serverTimestamp(),
      name: club.name,
      slug: club.slug,
      status: 'active',
      updatedAt: serverTimestamp(),
    });
  }

  return club;
}

async function ensureIndependentClub() {
  requireDb();

  return ensureReservedClub(INDEPENDENT_CLUB);
}

export async function listClubs({ includeIndependent = false } = {}) {
  requireDb();

  await Promise.all(RESERVED_CLUBS.map((club) => ensureReservedClub(club)));

  const clubsSnapshot = await getDocs(collection(db, 'clubs'));
  const clubs = clubsSnapshot.docs
    .map((entry) => {
      const data = entry.data();

      return {
        address: data.address ?? '',
        city: data.city ?? '',
        id: entry.id,
        logoPath: data.logoPath ?? '',
        logoUrl: data.logoUrl ?? '',
        name: data.name ?? entry.id,
        numberOfCourts: normalizeNullableNumber(data.numberOfCourts),
        slug: data.slug ?? entry.id,
        state: data.state ?? '',
        status: data.status ?? 'active',
        zip: data.zip ?? '',
      };
    })
    .filter((club) => club.status === 'active')
    .filter((club) => includeIndependent || club.slug !== INDEPENDENT_CLUB.slug);

  clubs.sort((left, right) => left.name.localeCompare(right.name));

  return clubs;
}

export async function createClub({
  address = '',
  city = '',
  clubName,
  logoFile = null,
  numberOfCourts = '',
  state = '',
  user,
  zip = '',
}) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to create a club.');
  }

  const trimmedName = clubName.trim();

  if (!trimmedName) {
    throw new Error('Enter a club name.');
  }

  const clubSlug = slugify(trimmedName);

  if (!clubSlug || clubSlug === INDEPENDENT_CLUB.slug) {
    throw new Error('Enter a valid club name.');
  }

  const platformAdmin = await isPlatformAdmin(user.uid, user.email);

  if (!platformAdmin) {
    throw new Error('Only app admins can create clubs.');
  }

  const clubRef = doc(db, 'clubs', clubSlug);
  const snapshot = await getDoc(clubRef);

  if (snapshot.exists()) {
    throw new Error('A club with that name already exists.');
  }

  const uploadedLogo = logoFile ? await uploadClubLogo({ clubSlug, file: logoFile }) : null;

  await setDoc(clubRef, {
    address: address.trim(),
    city: city.trim(),
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    logoPath: uploadedLogo?.logoPath ?? '',
    logoUrl: uploadedLogo?.logoUrl ?? '',
    name: trimmedName,
    numberOfCourts: normalizeNullableNumber(numberOfCourts),
    slug: clubSlug,
    state: state.trim(),
    status: 'active',
    updatedAt: serverTimestamp(),
    zip: zip.trim(),
  });

  return { name: trimmedName, slug: clubSlug };
}

export async function renameClub({
  address = '',
  city = '',
  clubName,
  clubSlug,
  logoFile = null,
  numberOfCourts = '',
  state = '',
  user,
  zip = '',
}) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to rename a club.');
  }

  if (!clubSlug || clubSlug === INDEPENDENT_CLUB.slug) {
    throw new Error('That club cannot be renamed here.');
  }

  const trimmedName = clubName.trim();

  if (!trimmedName) {
    throw new Error('Enter a club name.');
  }

  const platformAdmin = await isPlatformAdmin(user.uid, user.email);

  if (!platformAdmin) {
    throw new Error('Only app admins can rename clubs.');
  }

  const clubRef = doc(db, 'clubs', clubSlug);
  const currentClubSnapshot = await getDoc(clubRef);
  const currentClub = currentClubSnapshot.data() ?? {};
  const uploadedLogo = logoFile ? await uploadClubLogo({ clubSlug, file: logoFile }) : null;

  await updateDoc(clubRef, {
    address: address.trim(),
    city: city.trim(),
    logoPath: uploadedLogo?.logoPath ?? currentClub.logoPath ?? '',
    logoUrl: uploadedLogo?.logoUrl ?? currentClub.logoUrl ?? '',
    name: trimmedName,
    numberOfCourts: normalizeNullableNumber(numberOfCourts),
    state: state.trim(),
    updatedAt: serverTimestamp(),
    zip: zip.trim(),
  });

  if (uploadedLogo?.logoPath && currentClub.logoPath && currentClub.logoPath !== uploadedLogo.logoPath) {
    await deleteStoragePath(currentClub.logoPath);
  }
}

export async function deleteClub({ clubSlug, user }) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to delete a club.');
  }

  if (!clubSlug || clubSlug === INDEPENDENT_CLUB.slug) {
    throw new Error('The independent team area cannot be deleted.');
  }

  const platformAdmin = await isPlatformAdmin(user.uid, user.email);

  if (!platformAdmin) {
    throw new Error('Only app admins can delete clubs.');
  }

  const teamsSnapshot = await getDocs(collection(db, 'clubs', clubSlug, 'teams'));

  if (!teamsSnapshot.empty) {
    throw new Error('Move or remove this club’s teams before deleting the club.');
  }

  await deleteDoc(doc(db, 'clubs', clubSlug));
}

export async function deleteTeamAsAdmin({ clubSlug, teamSlug, user }) {
  requireDb();

  if (!(await isPlatformAdmin(user?.uid, user?.email))) {
    throw new Error('Only the app admin can delete teams.');
  }

  if (!clubSlug || !teamSlug) {
    throw new Error('Choose a team to delete.');
  }

  const teamRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug);
  const teamSnapshot = await getDoc(teamRef);

  if (!teamSnapshot.exists()) {
    throw new Error('That team could not be found.');
  }

  const teamData = teamSnapshot.data();
  const [membersSnapshot, playersSnapshot, playerLinksSnapshot, gamesSnapshot, newsSnapshot, clubs] = await Promise.all([
    getDocs(collection(teamRef, 'members')),
    getDocs(collection(teamRef, 'players')),
    getDocs(collection(teamRef, 'playerLinks')),
    getDocs(collection(teamRef, 'games')),
    getDocs(collection(teamRef, 'newsPosts')),
    listClubs({ includeIndependent: true }),
  ]);
  const [affiliationRequestGroups, challengeGroups] = await Promise.all([
    Promise.all(clubs.map((club) => getDocs(collection(db, 'clubs', club.slug, 'affiliationRequests')).catch(() => null))),
    Promise.all(clubs.map((club) => getDocs(collection(db, 'clubs', club.slug, 'challenges')).catch(() => null))),
  ]);
  const userMembershipRefs = membersSnapshot.docs
    .map((memberDoc) => memberDoc.data().uid || memberDoc.id)
    .filter(Boolean)
    .map((uid) => doc(db, 'users', uid, 'memberships', `${clubSlug}_${teamSlug}`));
  const affiliationRequestRefs = affiliationRequestGroups
    .flatMap((snapshot) => snapshot?.docs ?? [])
    .filter((requestDoc) => {
      const request = requestDoc.data();
      return request.teamClubSlug === clubSlug && request.teamSlug === teamSlug;
    })
    .map((requestDoc) => requestDoc.ref);
  const challengeRefs = challengeGroups
    .flatMap((snapshot) => snapshot?.docs ?? [])
    .filter((challengeDoc) => {
      const challenge = challengeDoc.data();
      return (
        (challenge.createdByTeamClubSlug === clubSlug && challenge.createdByTeamSlug === teamSlug) ||
        (challenge.targetTeamClubSlug === clubSlug && challenge.targetTeamSlug === teamSlug) ||
        (challenge.acceptedByTeamClubSlug === clubSlug && challenge.acceptedByTeamSlug === teamSlug)
      );
    })
    .map((challengeDoc) => challengeDoc.ref);
  const storagePaths = [
    teamData.logoPath,
    ...newsSnapshot.docs.map((newsDoc) => newsDoc.data().imagePath),
  ].filter(Boolean);

  await deleteRefsInBatches([
    ...affiliationRequestRefs,
    ...challengeRefs,
    ...userMembershipRefs,
    ...newsSnapshot.docs.map((entry) => entry.ref),
    ...gamesSnapshot.docs.map((entry) => entry.ref),
    ...playerLinksSnapshot.docs.map((entry) => entry.ref),
    ...playersSnapshot.docs.map((entry) => entry.ref),
    ...membersSnapshot.docs.map((entry) => entry.ref),
    teamRef,
  ]);

  await Promise.all(storagePaths.map((storagePath) => deleteStoragePath(storagePath)));
}

export async function listAdminTeamPlayers({ clubSlug, teamSlug, user }) {
  requireDb();

  if (!(await isPlatformAdmin(user?.uid, user?.email))) {
    throw new Error('Only the app admin can load team players.');
  }

  if (!clubSlug || !teamSlug) {
    return [];
  }

  const [players, members] = await Promise.all([
    listPlayers(clubSlug, teamSlug),
    listTeamMembers(clubSlug, teamSlug),
  ]);
  const memberByPlayerId = new Map(
    members
      .filter((member) => member.playerId)
      .map((member) => [member.playerId, member]),
  );
  const memberByUid = new Map(members.map((member) => [member.uid, member]));

  return players.map((player) => {
    const linkedMember = memberByPlayerId.get(player.id) ?? (player.uid ? memberByUid.get(player.uid) : null);

    return {
      ...player,
      memberRole: linkedMember?.role ?? '',
      memberUid: linkedMember?.uid ?? player.uid ?? '',
    };
  });
}

export async function copyPlayersToTeamAsAdmin({
  sourceClubSlug,
  sourceTeamSlug,
  targetClubSlug,
  targetTeamSlug,
  playerIds = [],
  user,
}) {
  requireDb();

  if (!(await isPlatformAdmin(user?.uid, user?.email))) {
    throw new Error('Only the app admin can copy players between teams.');
  }

  if (!sourceClubSlug || !sourceTeamSlug || !targetClubSlug || !targetTeamSlug) {
    throw new Error('Choose a source team and a target team.');
  }

  if (sourceClubSlug === targetClubSlug && sourceTeamSlug === targetTeamSlug) {
    throw new Error('Choose a different target team.');
  }

  const selectedPlayerIds = normalizePlayerIdList(playerIds);

  if (!selectedPlayerIds.length) {
    throw new Error('Choose at least one player to copy.');
  }

  const targetTeamRef = doc(db, 'clubs', targetClubSlug, 'teams', targetTeamSlug);
  const targetTeamSnapshot = await getDoc(targetTeamRef);

  if (!targetTeamSnapshot.exists()) {
    throw new Error('The target team could not be found.');
  }

  const targetTeam = targetTeamSnapshot.data();
  const targetTeamName = targetTeam.name ?? targetTeamSlug;
  const [sourcePlayersSnapshot, sourceMembersSnapshot, targetMembersSnapshot] = await Promise.all([
    getDocs(collection(db, 'clubs', sourceClubSlug, 'teams', sourceTeamSlug, 'players')),
    getDocs(collection(db, 'clubs', sourceClubSlug, 'teams', sourceTeamSlug, 'members')),
    getDocs(collection(targetTeamRef, 'members')),
  ]);
  const sourcePlayerDocs = new Map(sourcePlayersSnapshot.docs.map((entry) => [entry.id, entry]));
  const sourceMembers = sourceMembersSnapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }));
  const sourceMemberByPlayerId = new Map(
    sourceMembers
      .filter((member) => member.playerId)
      .map((member) => [member.playerId, member]),
  );
  const targetMemberByUid = new Map(targetMembersSnapshot.docs.map((entry) => [entry.id, entry.data()]));
  const batch = writeBatch(db);
  let copiedCount = 0;
  let unlinkedCount = 0;

  selectedPlayerIds.forEach((playerId) => {
    const sourcePlayerDoc = sourcePlayerDocs.get(playerId);

    if (!sourcePlayerDoc) {
      return;
    }

    const player = sourcePlayerDoc.data();
    const playerUid = player.uid || sourceMemberByPlayerId.get(playerId)?.uid || '';

    batch.set(
      doc(targetTeamRef, 'players', playerId),
      {
        ...player,
        teamId: targetTeamSlug,
        teamName: targetTeamName,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    if (playerUid) {
      const existingTargetMember = targetMemberByUid.get(playerUid);
      const targetRole = existingTargetMember?.role ?? 'member';

      batch.set(
        doc(targetTeamRef, 'members', playerUid),
        {
          clubId: targetClubSlug,
          clubSlug: targetClubSlug,
          joinedAt: existingTargetMember?.joinedAt ?? serverTimestamp(),
          playerId,
          role: targetRole,
          status: existingTargetMember?.status ?? 'active',
          teamId: targetTeamSlug,
          teamName: targetTeamName,
          teamSlug: targetTeamSlug,
          uid: playerUid,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      batch.set(
        doc(targetTeamRef, 'playerLinks', playerUid),
        {
          playerId,
          teamId: targetTeamSlug,
          uid: playerUid,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      batch.set(
        doc(db, 'users', playerUid, 'memberships', `${targetClubSlug}_${targetTeamSlug}`),
        {
          clubSlug: targetClubSlug,
          role: targetRole,
          teamName: targetTeamName,
          teamSlug: targetTeamSlug,
          uid: playerUid,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    } else {
      unlinkedCount += 1;
    }

    copiedCount += 1;
  });

  if (!copiedCount) {
    throw new Error('None of the selected players could be found on the source team.');
  }

  await batch.commit();

  return { copiedCount, unlinkedCount };
}

export async function listAdminPlayers(user) {
  requireDb();

  if (!(await isPlatformAdmin(user?.uid, user?.email))) {
    throw new Error('Only the app admin can load all players.');
  }

  const clubs = await listClubs({ includeIndependent: true });
  const clubPlayers = await Promise.all(
    clubs.map(async (club) => {
      const teamsSnapshot = await getDocs(collection(db, 'clubs', club.slug, 'teams'));

      return Promise.all(
        teamsSnapshot.docs.map(async (teamEntry) => {
          const team = teamEntry.data();
          const teamSlug = teamEntry.id;
          const [players, members] = await Promise.all([
            listPlayers(club.slug, teamSlug),
            listTeamMembers(club.slug, teamSlug),
          ]);
          const memberByPlayerId = new Map(
            members
              .filter((member) => member.playerId)
              .map((member) => [member.playerId, member]),
          );
          const memberByUid = new Map(members.map((member) => [member.uid, member]));

          return players.map((player) => {
            const linkedMember = memberByPlayerId.get(player.id) ?? (player.uid ? memberByUid.get(player.uid) : null);

            return {
              ...player,
              assignmentKey: `${club.slug}::${teamSlug}::${player.id}`,
              memberRole: linkedMember?.role ?? '',
              memberUid: linkedMember?.uid ?? player.uid ?? '',
              sourceClubName: club.name,
              sourceClubSlug: club.slug,
              sourceTeamName: team.name ?? teamSlug,
              sourceTeamSlug: teamSlug,
            };
          });
        }),
      );
    }),
  );
  const players = clubPlayers.flat(2);

  players.sort((left, right) => {
    const nameCompare = (left.fullName || '').localeCompare(right.fullName || '');

    if (nameCompare !== 0) {
      return nameCompare;
    }

    return left.sourceTeamName.localeCompare(right.sourceTeamName);
  });

  return players;
}

export async function assignPlayersToTeamAsAdmin({ playerRefs = [], targetClubSlug, targetTeamSlug, user }) {
  requireDb();

  if (!(await isPlatformAdmin(user?.uid, user?.email))) {
    throw new Error('Only the app admin can assign players to teams.');
  }

  if (!targetClubSlug || !targetTeamSlug) {
    throw new Error('Choose a target team.');
  }

  const normalizedPlayerRefs = playerRefs
    .map((playerRef) => ({
      playerId: playerRef.playerId ?? '',
      sourceClubSlug: playerRef.sourceClubSlug ?? '',
      sourceTeamSlug: playerRef.sourceTeamSlug ?? '',
    }))
    .filter((playerRef) => playerRef.playerId && playerRef.sourceClubSlug && playerRef.sourceTeamSlug);
  const uniquePlayerRefs = Array.from(
    new Map(
      normalizedPlayerRefs.map((playerRef) => [
        `${playerRef.sourceClubSlug}::${playerRef.sourceTeamSlug}::${playerRef.playerId}`,
        playerRef,
      ]),
    ).values(),
  );

  if (!uniquePlayerRefs.length) {
    throw new Error('Choose at least one player to assign.');
  }

  const targetTeamRef = doc(db, 'clubs', targetClubSlug, 'teams', targetTeamSlug);
  const targetTeamSnapshot = await getDoc(targetTeamRef);

  if (!targetTeamSnapshot.exists()) {
    throw new Error('The target team could not be found.');
  }

  const targetTeam = targetTeamSnapshot.data();
  const targetTeamName = targetTeam.name ?? targetTeamSlug;
  const targetMembersSnapshot = await getDocs(collection(targetTeamRef, 'members'));
  const targetMemberByUid = new Map(targetMembersSnapshot.docs.map((entry) => [entry.id, entry.data()]));
  const sourceGroups = new Map();

  uniquePlayerRefs.forEach((playerRef) => {
    const sourceKey = `${playerRef.sourceClubSlug}::${playerRef.sourceTeamSlug}`;
    const group = sourceGroups.get(sourceKey) ?? {
      playerIds: [],
      sourceClubSlug: playerRef.sourceClubSlug,
      sourceTeamSlug: playerRef.sourceTeamSlug,
    };

    group.playerIds.push(playerRef.playerId);
    sourceGroups.set(sourceKey, group);
  });

  const batch = writeBatch(db);
  let assignedCount = 0;
  let alreadyOnTargetCount = 0;
  let unlinkedCount = 0;

  for (const sourceGroup of sourceGroups.values()) {
    const [sourcePlayersSnapshot, sourceMembersSnapshot] = await Promise.all([
      getDocs(collection(db, 'clubs', sourceGroup.sourceClubSlug, 'teams', sourceGroup.sourceTeamSlug, 'players')),
      getDocs(collection(db, 'clubs', sourceGroup.sourceClubSlug, 'teams', sourceGroup.sourceTeamSlug, 'members')),
    ]);
    const sourcePlayerDocs = new Map(sourcePlayersSnapshot.docs.map((entry) => [entry.id, entry]));
    const sourceMembers = sourceMembersSnapshot.docs.map((entry) => ({ ...entry.data(), id: entry.id }));
    const sourceMemberByPlayerId = new Map(
      sourceMembers
        .filter((member) => member.playerId)
        .map((member) => [member.playerId, member]),
    );

    sourceGroup.playerIds.forEach((playerId) => {
      if (sourceGroup.sourceClubSlug === targetClubSlug && sourceGroup.sourceTeamSlug === targetTeamSlug) {
        alreadyOnTargetCount += 1;
        return;
      }

      const sourcePlayerDoc = sourcePlayerDocs.get(playerId);

      if (!sourcePlayerDoc) {
        return;
      }

      const player = sourcePlayerDoc.data();
      const playerUid = player.uid || sourceMemberByPlayerId.get(playerId)?.uid || '';

      batch.set(
        doc(targetTeamRef, 'players', playerId),
        {
          ...player,
          teamId: targetTeamSlug,
          teamName: targetTeamName,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      if (playerUid) {
        const existingTargetMember = targetMemberByUid.get(playerUid);
        const targetRole = existingTargetMember?.role ?? 'member';

        batch.set(
          doc(targetTeamRef, 'members', playerUid),
          {
            clubId: targetClubSlug,
            clubSlug: targetClubSlug,
            joinedAt: existingTargetMember?.joinedAt ?? serverTimestamp(),
            playerId,
            role: targetRole,
            status: existingTargetMember?.status ?? 'active',
            teamId: targetTeamSlug,
            teamName: targetTeamName,
            teamSlug: targetTeamSlug,
            uid: playerUid,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        batch.set(
          doc(targetTeamRef, 'playerLinks', playerUid),
          {
            playerId,
            teamId: targetTeamSlug,
            uid: playerUid,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );

        batch.set(
          doc(db, 'users', playerUid, 'memberships', `${targetClubSlug}_${targetTeamSlug}`),
          {
            clubSlug: targetClubSlug,
            role: targetRole,
            teamName: targetTeamName,
            teamSlug: targetTeamSlug,
            uid: playerUid,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } else {
        unlinkedCount += 1;
      }

      assignedCount += 1;
    });
  }

  if (!assignedCount && alreadyOnTargetCount) {
    throw new Error('The selected players are already on the target team.');
  }

  if (!assignedCount) {
    throw new Error('None of the selected players could be assigned.');
  }

  await batch.commit();

  return { assignedCount, alreadyOnTargetCount, unlinkedCount };
}

function isBootstrapPlatformAdmin(email) {
  return SUPER_ADMIN_EMAILS.includes((email ?? '').trim().toLowerCase());
}

export async function isPlatformAdmin(uid, email = '') {
  requireDb();

  if (!uid) {
    return false;
  }

  return isBootstrapPlatformAdmin(email);
}

export async function listManagedClubs(uid, email = '') {
  requireDb();

  if (!uid) {
    return [];
  }

  const [clubs, platformAdmin] = await Promise.all([
    listClubs(),
    isPlatformAdmin(uid, email),
  ]);

  if (platformAdmin) {
    return clubs;
  }

  const adminChecks = await Promise.all(
    clubs.map(async (club) => {
      const adminSnapshot = await getDoc(doc(db, 'clubs', club.slug, 'admins', uid));
      return adminSnapshot.exists() ? club : null;
    }),
  );

  return adminChecks.filter(Boolean);
}

export async function listAdminTeamSummaries(user) {
  requireDb();

  if (!user?.uid) {
    return [];
  }

  const platformAdmin = await isPlatformAdmin(user.uid, user.email);
  const clubs = platformAdmin
    ? await listClubs({ includeIndependent: true })
    : await listManagedClubs(user.uid, user.email);

  const clubTeams = await Promise.all(
    clubs.map(async (club) => {
      const teamsSnapshot = await getDocs(collection(db, 'clubs', club.slug, 'teams'));

      return Promise.all(
        teamsSnapshot.docs.map(async (teamEntry) => {
          const team = teamEntry.data();
          const sourceTeamSlug = teamEntry.id;
          const teamSlug = team.slug ?? sourceTeamSlug;
          const [members, players] = await Promise.all([
            listTeamMembers(club.slug, sourceTeamSlug),
            listPlayers(club.slug, sourceTeamSlug),
          ]);
          const playerMap = new Map(players.map((player) => [player.id, player]));
          const captains = members
            .filter((member) => member.role === 'captain' || member.role === 'coCaptain')
            .map((member) => playerMap.get(member.playerId)?.fullName || member.uid)
            .filter(Boolean);

          return {
            affiliationStatus: team.affiliationStatus ?? 'independent',
            approvedClubSlug: team.approvedClubSlug ?? '',
            captainNames: captains,
            clubName: club.name,
            clubSlug: club.slug,
            logoUrl: team.logoUrl ?? '',
            memberCount: members.length,
            name: team.name ?? teamSlug,
            primaryLocation: team.primaryLocation ?? '',
            requestedClubSlug: team.requestedClubSlug ?? '',
            teamSlug: sourceTeamSlug,
          };
        }),
      );
    }),
  );

  const teams = clubTeams.flat();

  teams.sort((left, right) => {
    const clubCompare = left.clubName.localeCompare(right.clubName);

    if (clubCompare !== 0) {
      return clubCompare;
    }

    return left.name.localeCompare(right.name);
  });

  return teams;
}

export async function listTeamDirectory() {
  requireDb();

  const clubs = await listClubs({ includeIndependent: true });
  const clubNameBySlug = new Map(
    clubs.map((club) => [club.slug, club.slug === INDEPENDENT_CLUB.slug ? 'Independent' : club.name]),
  );
  const directoryGroups = new Map();

  clubs.forEach((club) => {
    const displayName = club.slug === INDEPENDENT_CLUB.slug ? 'Independent' : club.name;
    directoryGroups.set(club.slug, {
      clubName: displayName,
      clubSlug: club.slug,
      teams: [],
    });
  });

  const teamsBySourceClub = await Promise.all(
    clubs.map(async (club) => {
      const teamsSnapshot = await getDocs(collection(db, 'clubs', club.slug, 'teams'));

      return Promise.all(teamsSnapshot.docs.map(async (teamEntry) => {
        const team = teamEntry.data();
        const sourceTeamSlug = teamEntry.id;
        const teamSlug = team.slug ?? sourceTeamSlug;
        let members = [];
        let players = [];

        try {
          [members, players] = await Promise.all([
            listTeamMembers(club.slug, sourceTeamSlug),
            listPlayers(club.slug, sourceTeamSlug),
          ]);
        } catch {
          // Directory cards should still render if private roster details are not readable.
        }

        const playerMap = new Map(players.map((player) => [player.id, player]));
        const captainNames = members
          .filter((member) => member.role === 'captain')
          .map((member) => playerMap.get(member.playerId)?.fullName || member.displayName || member.email || member.uid)
          .filter(Boolean);
        const directoryClubSlug =
          team.affiliationStatus === 'approved' && team.approvedClubSlug
            ? team.approvedClubSlug
            : INDEPENDENT_CLUB.slug;
        const directoryClubName = clubNameBySlug.get(directoryClubSlug) ?? directoryClubSlug;

        return {
          clubName: directoryClubName,
          clubSlug: directoryClubSlug,
          captainNames,
          logoUrl: team.logoUrl ?? '',
          memberCount: members.length,
          name: team.name ?? teamSlug,
          primaryLocation: team.primaryLocation ?? '',
          sourceClubSlug: club.slug,
          teamSlug: sourceTeamSlug,
        };
      }));
    }),
  );

  teamsBySourceClub.flat().forEach((team) => {
    if (!directoryGroups.has(team.clubSlug)) {
      directoryGroups.set(team.clubSlug, {
        clubName: team.clubName,
        clubSlug: team.clubSlug,
        teams: [],
      });
    }

    directoryGroups.get(team.clubSlug).teams.push(team);
  });

  return [...directoryGroups.values()]
    .map((group) => ({
      ...group,
      teams: group.teams.sort((left, right) => left.name.localeCompare(right.name)),
    }))
    .filter((group) => group.teams.length > 0)
    .sort((left, right) => left.clubName.localeCompare(right.clubName));
}

export async function listClubDirectory() {
  requireDb();

  const [clubs, teamGroups] = await Promise.all([
    listClubs(),
    listTeamDirectory(),
  ]);
  const teamsByClubSlug = new Map(teamGroups.map((group) => [group.clubSlug, group.teams]));

  return clubs.map((club) => {
    const teams = teamsByClubSlug.get(club.slug) ?? [];
    const memberCount = teams.reduce((total, team) => total + (team.memberCount ?? 0), 0);

    return {
      ...club,
      memberCount,
      teamCount: teams.length,
    };
  });
}

async function findTeamByJoinCode(normalizedCode) {
  const clubs = await listClubs({ includeIndependent: true });

  for (const club of clubs) {
    const teamsSnapshot = await getDocs(collection(db, 'clubs', club.slug, 'teams'));
    const matchingTeamDoc = teamsSnapshot.docs.find((teamEntry) => {
      const joinCode = (teamEntry.data().joinCode ?? '').trim().toUpperCase();
      return joinCode === normalizedCode;
    });

    if (matchingTeamDoc) {
      return {
        clubSlug: club.slug,
        team: matchingTeamDoc.data(),
        teamDoc: matchingTeamDoc,
      };
    }
  }

  return null;
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
    payload.availableDays = normalizeAvailableDays(existingPlayer?.availableDays);
    payload.notes = existingPlayer?.notes ?? '';
    payload.phone = existingPlayer?.phone ?? '';
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

  const club = await ensureIndependentClub();
  const publicSlug = slugify(trimmedName);

  if (!publicSlug) {
    throw new Error('That team name cannot be converted into a valid URL slug.');
  }

  let teamSlug = makeTeamId();
  let teamRef = doc(db, 'clubs', club.id, 'teams', teamSlug);
  let existingTeam = await getDoc(teamRef);

  while (existingTeam.exists()) {
    teamSlug = makeTeamId();
    teamRef = doc(db, 'clubs', club.id, 'teams', teamSlug);
    existingTeam = await getDoc(teamRef);
  }

  const joinCode = makeJoinCode(publicSlug);

  await setDoc(teamRef, {
    affiliationStatus: 'independent',
    approvedClubSlug: '',
    clubId: club.id,
    clubName: club.name,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    createdByEmail: user.email ?? '',
    joinCode,
    logoPath: '',
    logoUrl: '',
    name: trimmedName,
    primaryLocation: '',
    publicSlug,
    requestedClubSlug: '',
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

  const match = await findTeamByJoinCode(normalizedCode);

  if (!match) {
    throw new Error('No team matched that join code.');
  }

  const { team, teamDoc } = match;
  const teamClubSlug = team.clubId ?? match.clubSlug ?? teamDoc.ref.parent.parent?.id ?? INDEPENDENT_CLUB.id;
  const teamSlug = teamDoc.id;
  const membershipRef = doc(db, 'clubs', teamClubSlug, 'teams', teamSlug, 'members', user.uid);
  const existingMemberships = await listMemberships(user.uid).catch(() => []);
  const existingMembership =
    existingMemberships.find(
      (membership) => membership.clubSlug === teamClubSlug && membership.teamSlug === teamSlug,
    ) ?? null;
  const nextRole = existingMembership?.role ?? 'member';

  if (existingMembership) {
    await updateDoc(membershipRef, {
      playerId: user.uid,
      updatedAt: serverTimestamp(),
    });
  } else {
    await setDoc(membershipRef, {
      clubId: teamClubSlug,
      clubSlug: teamClubSlug,
      joinedAt: serverTimestamp(),
      playerId: user.uid,
      role: nextRole,
      status: 'active',
      teamId: teamSlug,
      teamName: team.name,
      teamSlug,
      uid: user.uid,
      updatedAt: serverTimestamp(),
    });
  }

  const playerId = await ensurePlayerProfile({
    clubId: teamClubSlug,
    teamId: teamSlug,
    teamName: team.name,
    user,
  });

  if (playerId !== user.uid) {
    await updateDoc(membershipRef, {
      playerId,
      updatedAt: serverTimestamp(),
    });
  }

  await syncMembershipSummary({
    clubSlug: teamClubSlug,
    role: nextRole,
    teamName: team.name,
    teamSlug,
    uid: user.uid,
  });

  await setLastActiveTeam({
    clubSlug: teamClubSlug,
    teamSlug,
    uid: user.uid,
  });

  return { clubSlug: teamClubSlug, teamSlug };
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

async function syncTeamNameReferences({ clubSlug, teamName, teamSlug, user }) {
  const membersRef = collection(db, 'clubs', clubSlug, 'teams', teamSlug, 'members');
  const membersSnapshot = await getDocs(membersRef);

  if (membersSnapshot.empty) {
    return;
  }

  const batch = writeBatch(db);

  membersSnapshot.docs.forEach((entry) => {
    batch.update(entry.ref, {
      teamName,
      updatedAt: serverTimestamp(),
    });
  });

  const currentMember = membersSnapshot.docs.find((entry) => (entry.data().uid ?? entry.id) === user?.uid);

  if (currentMember) {
    const data = currentMember.data();

    batch.set(
      doc(db, 'users', user.uid, 'memberships', `${clubSlug}_${teamSlug}`),
      {
        clubSlug,
        role: data.role ?? 'member',
        teamName,
        teamSlug,
        uid: user.uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();
}

export async function updateTeamSettings({
  clubSlug,
  logoFile,
  primaryLocation = '',
  status = 'active',
  teamName,
  teamSlug,
  user,
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
  const normalizedPrimaryLocation = primaryLocation.trim();
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
    primaryLocation: normalizedPrimaryLocation,
    publicSlug: slugify(normalizedName),
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
      user,
    });
  }
}

export async function requestClubAffiliation({
  clubSlug,
  requestedClubSlug,
  teamSlug,
  user,
}) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to request club affiliation.');
  }

  if (!requestedClubSlug || requestedClubSlug === INDEPENDENT_CLUB.slug) {
    throw new Error('Choose a club to request affiliation.');
  }

  const [teamSnapshot, requestedClubSnapshot, membershipSnapshot] = await Promise.all([
    getDoc(doc(db, 'clubs', clubSlug, 'teams', teamSlug)),
    getDoc(doc(db, 'clubs', requestedClubSlug)),
    getDoc(doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'members', user.uid)),
  ]);

  if (!teamSnapshot.exists()) {
    throw new Error('That team could not be found.');
  }

  if (!requestedClubSnapshot.exists()) {
    throw new Error('That club could not be found.');
  }

  const membership = membershipSnapshot.exists() ? membershipSnapshot.data() : null;

  if (!['captain', 'coCaptain'].includes(membership?.role)) {
    throw new Error('Only captains and co-captains can request club affiliation.');
  }

  const team = teamSnapshot.data();
  const requestedClub = requestedClubSnapshot.data();
  const requestId = `${clubSlug}_${teamSlug}`;
  const requestRef = doc(db, 'clubs', requestedClubSlug, 'affiliationRequests', requestId);
  const batch = writeBatch(db);

  batch.set(requestRef, {
    clubSlug: requestedClubSlug,
    createdAt: serverTimestamp(),
    captainUid: user.uid,
    requestedClubName: requestedClub.name ?? requestedClubSlug,
    requestedClubSlug,
    reviewedAt: null,
    reviewedBy: '',
    status: 'pending',
    teamClubSlug: clubSlug,
    teamName: team.name ?? teamSlug,
    teamSlug,
    updatedAt: serverTimestamp(),
  });

  batch.update(teamSnapshot.ref, {
    affiliationStatus: 'pending',
    requestedClubSlug,
    requestedClubName: requestedClub.name ?? requestedClubSlug,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

function mapAffiliationRequest(snapshot) {
  const data = snapshot.data();

  return {
    id: snapshot.id,
    captainUid: data.captainUid ?? '',
    clubSlug: data.clubSlug ?? data.requestedClubSlug ?? '',
    createdAtMs: normalizeTimestampMs(data.createdAt),
    requestedClubName: data.requestedClubName ?? data.requestedClubSlug ?? '',
    requestedClubSlug: data.requestedClubSlug ?? data.clubSlug ?? '',
    reviewedAtMs: normalizeTimestampMs(data.reviewedAt),
    reviewedBy: data.reviewedBy ?? '',
    status: data.status ?? 'pending',
    teamClubSlug: data.teamClubSlug ?? '',
    teamName: data.teamName ?? '',
    teamSlug: data.teamSlug ?? '',
  };
}

export async function listClubAffiliationRequests(userOrUid) {
  requireDb();

  const uid = typeof userOrUid === 'string' ? userOrUid : userOrUid?.uid;
  const email = typeof userOrUid === 'string' ? '' : userOrUid?.email;

  if (!uid) {
    return [];
  }

  const platformAdmin = await isPlatformAdmin(uid, email);
  let snapshots = [];
  const managedClubs = await listManagedClubs(uid, email);

  if (platformAdmin) {
    const requestSnapshots = await Promise.all(
      managedClubs.map((club) => getDocs(collection(db, 'clubs', club.slug, 'affiliationRequests'))),
    );
    snapshots = requestSnapshots.flatMap((snapshot) => snapshot.docs);
  } else {
    const requestSnapshots = await Promise.all(
      managedClubs.map((club) => getDocs(collection(db, 'clubs', club.slug, 'affiliationRequests'))),
    );
    snapshots = requestSnapshots.flatMap((snapshot) => snapshot.docs);
  }

  const requests = snapshots.map(mapAffiliationRequest);
  const reviewerUids = Array.from(
    new Set(requests.map((request) => request.reviewedBy).filter(Boolean)),
  );
  const reviewerProfiles = await Promise.all(
    reviewerUids.map(async (reviewerUid) => {
      const profile = await getUserProfileData(reviewerUid).catch(() => null);

      return [reviewerUid, profile];
    }),
  );
  const reviewerMap = new Map(reviewerProfiles);

  requests.forEach((request) => {
    const reviewer = reviewerMap.get(request.reviewedBy);
    request.reviewedByLabel =
      reviewer?.displayName || reviewer?.email || (request.reviewedBy ? 'an admin' : '');
  });

  requests.sort((left, right) => {
    if (left.status !== right.status) {
      return left.status === 'pending' ? -1 : 1;
    }

    return right.createdAtMs - left.createdAtMs;
  });

  return requests;
}

export async function reviewClubAffiliationRequest({
  request,
  status,
  user,
}) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to review affiliation requests.');
  }

  if (!['approved', 'rejected'].includes(status)) {
    throw new Error('Choose whether to approve or reject the request.');
  }

  const requestedClubSlug = request.requestedClubSlug || request.clubSlug;
  const requestRef = doc(db, 'clubs', requestedClubSlug, 'affiliationRequests', request.id);
  const teamRef = doc(db, 'clubs', request.teamClubSlug, 'teams', request.teamSlug);
  const batch = writeBatch(db);
  const approved = status === 'approved';

  batch.update(requestRef, {
    reviewedAt: serverTimestamp(),
    reviewedBy: user.uid,
    status,
    updatedAt: serverTimestamp(),
  });

  batch.update(teamRef, {
    affiliationStatus: status,
    approvedAt: approved ? serverTimestamp() : deleteField(),
    approvedBy: approved ? user.uid : deleteField(),
    approvedClubSlug: approved ? requestedClubSlug : deleteField(),
    requestedClubSlug: approved ? deleteField() : requestedClubSlug,
    updatedAt: serverTimestamp(),
  });

  await batch.commit();
}

export async function listApprovedClubTeams(clubSlug) {
  requireDb();

  if (!clubSlug || clubSlug === INDEPENDENT_CLUB.slug) {
    return [];
  }

  async function readApprovedTeamsFromSnapshot(snapshot, sourceClubSlug = '') {
    return snapshot.docs
      .map((entry) => {
        const data = entry.data();
          const teamSlug = entry.id;

        return {
          affiliationStatus: data.affiliationStatus ?? 'independent',
          approvedClubSlug: data.approvedClubSlug ?? '',
          clubSlug: data.clubId ?? sourceClubSlug ?? entry.ref.parent.parent?.id ?? '',
          id: entry.id,
          logoUrl: data.logoUrl ?? '',
          name: data.name ?? entry.id,
          primaryLocation: data.primaryLocation ?? '',
            teamSlug,
        };
      })
      .filter((team) => team.affiliationStatus === 'approved' && team.approvedClubSlug === clubSlug)
      .map(({ affiliationStatus, approvedClubSlug, ...team }) => team);
  }

  let teams = [];

  try {
    const teamsQuery = query(
      collectionGroup(db, 'teams'),
      where('affiliationStatus', '==', 'approved'),
      where('approvedClubSlug', '==', clubSlug),
    );
    const snapshot = await getDocs(teamsQuery);
    teams = await readApprovedTeamsFromSnapshot(snapshot);
  } catch {
    const clubs = await listClubs({ includeIndependent: true });
    const nestedTeamGroups = await Promise.all(
      clubs.map(async (club) => {
        const snapshot = await getDocs(collection(db, 'clubs', club.slug, 'teams'));
        return readApprovedTeamsFromSnapshot(snapshot, club.slug);
      }),
    );

    teams = nestedTeamGroups.flat();
  }

  teams.sort((left, right) => left.name.localeCompare(right.name));

  return teams;
}

function normalizeChallenge(entry, challengeClubSlug) {
  const data = entry.data();

  return {
    acceptedAtMs: normalizeTimestampMs(data.acceptedAt),
    acceptedByTeamClubSlug: data.acceptedByTeamClubSlug ?? '',
    acceptedByTeamName: data.acceptedByTeamName ?? '',
    acceptedByTeamSlug: data.acceptedByTeamSlug ?? '',
    cancelledAtMs: normalizeTimestampMs(data.cancelledAt),
    challengeClubSlug,
    createdAtMs: normalizeTimestampMs(data.createdAt),
    createdByTeamClubSlug: data.createdByTeamClubSlug ?? '',
    createdByTeamName: data.createdByTeamName ?? '',
    createdByTeamSlug: data.createdByTeamSlug ?? '',
    dateTbd: data.dateTbd === true,
    declinedAtMs: normalizeTimestampMs(data.declinedAt),
    homeGameId: data.homeGameId ?? '',
    id: entry.id,
    isoDate: data.isoDate ?? '',
    location: data.location ?? '',
    notes: data.notes ?? '',
    status: data.status ?? 'open',
    targetTeamClubSlug: data.targetTeamClubSlug ?? '',
    targetTeamName: data.targetTeamName ?? '',
    targetTeamSlug: data.targetTeamSlug ?? '',
    timeLabel: normalizeTimeLabel(data.timeLabel),
    updatedAtMs: normalizeTimestampMs(data.updatedAt),
    visibility: data.visibility ?? 'open',
    awayGameId: data.awayGameId ?? '',
  };
}

async function getApprovedChallengeTeam({ challengeClubSlug, teamClubSlug, teamSlug }) {
  const teamRef = doc(db, 'clubs', teamClubSlug, 'teams', teamSlug);
  const teamSnapshot = await getDoc(teamRef);

  if (!teamSnapshot.exists()) {
    throw new Error('That team could not be found.');
  }

  const team = teamSnapshot.data();

  if (team.affiliationStatus !== 'approved' || team.approvedClubSlug !== challengeClubSlug) {
    throw new Error('Challenges are only available for approved teams in the same club.');
  }

  return {
    clubSlug: teamClubSlug,
    logoUrl: team.logoUrl ?? '',
    name: team.name ?? teamSlug,
    primaryLocation: team.primaryLocation ?? '',
    teamSlug,
  };
}

async function requireTeamManager({ clubSlug, teamSlug, user }) {
  if (!user?.uid) {
    throw new Error('You must be signed in to manage challenges.');
  }

  const membershipSnapshot = await getDoc(doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'members', user.uid));
  const membership = membershipSnapshot.exists() ? membershipSnapshot.data() : null;

  if (!['captain', 'coCaptain'].includes(membership?.role)) {
    throw new Error('Only captains and co-captains can manage challenges.');
  }

  return membership;
}

function buildChallengeGamePayload({
  challenge,
  challengeClubSlug,
  createdBy,
  linkedGameId,
  linkedTeam,
  user,
}) {
  const normalizedDateTbd = challenge.dateTbd === true;
  const isoDate = normalizedDateTbd ? '' : challenge.isoDate || '';
  const location = challenge.location || 'Location TBD';
  const timeLabel = normalizedDateTbd ? 'Time TBD' : normalizeTimeLabel(challenge.timeLabel) || 'Time TBD';

  return {
    attendance: {},
    challengeClubSlug,
    challengeId: challenge.id,
    createdAt: serverTimestamp(),
    createdBy: user?.uid ?? '',
    dateLabel: normalizedDateTbd ? 'Date TBD' : isoDate,
    dateTbd: normalizedDateTbd,
    isoDate,
    linkedGameId,
    linkedTeamClubSlug: linkedTeam.clubSlug,
    linkedTeamName: linkedTeam.name,
    linkedTeamSlug: linkedTeam.teamSlug,
    location,
    matchStatus: 'scheduled',
    opponent: linkedTeam.name,
    opponentScore: null,
    pairings: createEmptyPairings(),
    result: 'pending',
    rosterPlayerIds: [],
    teamScore: null,
    timeLabel,
    updatedAt: serverTimestamp(),
    source: 'challenge',
    sourceTeamClubSlug: createdBy.clubSlug,
    sourceTeamSlug: createdBy.teamSlug,
  };
}

export async function createChallenge({
  clubSlug,
  dateTbd = false,
  isoDate = '',
  location = '',
  notes = '',
  targetTeam = null,
  teamSlug,
  timeLabel = '',
  user,
  visibility = 'open',
}) {
  requireDb();

  await requireTeamManager({ clubSlug, teamSlug, user });

  const sourceTeamSnapshot = await getDoc(doc(db, 'clubs', clubSlug, 'teams', teamSlug));

  if (!sourceTeamSnapshot.exists()) {
    throw new Error('That team could not be found.');
  }

  const sourceTeam = sourceTeamSnapshot.data();
  const challengeClubSlug = sourceTeam.approvedClubSlug ?? '';

  if (sourceTeam.affiliationStatus !== 'approved' || !challengeClubSlug || challengeClubSlug === INDEPENDENT_CLUB.slug) {
    throw new Error('Approve this team for a club before posting challenges.');
  }

  const normalizedVisibility = visibility === 'targeted' ? 'targeted' : 'open';
  const trimmedIsoDate = isoDate.trim();
  const trimmedLocation = location.trim();
  const trimmedNotes = notes.trim();
  const trimmedTimeLabel = timeLabel.trim();
  const normalizedDateTbd = dateTbd === true;

  if (!normalizedDateTbd && !trimmedIsoDate) {
    throw new Error('Choose a date or mark the challenge date as TBD.');
  }

  let target = null;

  if (normalizedVisibility === 'targeted') {
    if (!targetTeam?.teamSlug || !targetTeam?.clubSlug) {
      throw new Error('Choose a team to challenge.');
    }

    if (targetTeam.teamSlug === teamSlug && targetTeam.clubSlug === clubSlug) {
      throw new Error('A team cannot challenge itself.');
    }

    target = await getApprovedChallengeTeam({
      challengeClubSlug,
      teamClubSlug: targetTeam.clubSlug,
      teamSlug: targetTeam.teamSlug,
    });
  }

  const challengeId = slugify(`${teamSlug}-${normalizedDateTbd ? 'date-tbd' : trimmedIsoDate}-${Date.now()}`);
  const challengeRef = doc(db, 'clubs', challengeClubSlug, 'challenges', challengeId);

  await setDoc(challengeRef, {
    acceptedAt: null,
    acceptedByTeamClubSlug: '',
    acceptedByTeamName: '',
    acceptedByTeamSlug: '',
    acceptedByUid: '',
    awayGameId: '',
    cancelledAt: null,
    clubSlug: challengeClubSlug,
    createdAt: serverTimestamp(),
    createdByTeamClubSlug: clubSlug,
    createdByTeamName: sourceTeam.name ?? teamSlug,
    createdByTeamSlug: teamSlug,
    createdByUid: user.uid,
    dateTbd: normalizedDateTbd,
    declinedAt: null,
    homeGameId: '',
    isoDate: normalizedDateTbd ? '' : trimmedIsoDate,
    location: trimmedLocation || sourceTeam.primaryLocation || 'Location TBD',
    notes: trimmedNotes,
    status: 'open',
    targetTeamClubSlug: target?.clubSlug ?? '',
    targetTeamName: target?.name ?? '',
    targetTeamSlug: target?.teamSlug ?? '',
    timeLabel: normalizedDateTbd ? '' : trimmedTimeLabel,
    updatedAt: serverTimestamp(),
    visibility: normalizedVisibility,
  });

  return challengeId;
}

export async function listClubChallenges(challengeClubSlug) {
  requireDb();

  if (!challengeClubSlug || challengeClubSlug === INDEPENDENT_CLUB.slug) {
    return [];
  }

  const snapshot = await getDocs(collection(db, 'clubs', challengeClubSlug, 'challenges'));
  const challenges = snapshot.docs
    .map((entry) => normalizeChallenge(entry, challengeClubSlug))
    .filter((challenge) => challenge.status === 'open' && challenge.visibility === 'open');

  challenges.sort((left, right) => (right.createdAtMs || 0) - (left.createdAtMs || 0));

  return challenges;
}

export async function listTeamChallenges({ challengeClubSlug, clubSlug, teamSlug }) {
  requireDb();

  if (!challengeClubSlug || challengeClubSlug === INDEPENDENT_CLUB.slug || !clubSlug || !teamSlug) {
    return [];
  }

  const snapshot = await getDocs(collection(db, 'clubs', challengeClubSlug, 'challenges'));
  const challenges = snapshot.docs
    .map((entry) => normalizeChallenge(entry, challengeClubSlug))
    .filter(
      (challenge) =>
        (challenge.createdByTeamClubSlug === clubSlug && challenge.createdByTeamSlug === teamSlug) ||
        (challenge.targetTeamClubSlug === clubSlug && challenge.targetTeamSlug === teamSlug) ||
        (challenge.acceptedByTeamClubSlug === clubSlug && challenge.acceptedByTeamSlug === teamSlug),
    );

  challenges.sort((left, right) => (right.createdAtMs || 0) - (left.createdAtMs || 0));

  return challenges;
}

export async function listAdminChallenges(user) {
  requireDb();

  if (!(await isPlatformAdmin(user?.uid, user?.email))) {
    throw new Error('Only the app admin can view all challenges.');
  }

  const clubs = await listClubs();
  const challengeGroups = await Promise.all(
    clubs.map(async (club) => {
      const snapshot = await getDocs(collection(db, 'clubs', club.slug, 'challenges'));

      return snapshot.docs.map((entry) => ({
        ...normalizeChallenge(entry, club.slug),
        challengeClubName: club.name,
      }));
    }),
  );
  const challenges = challengeGroups.flat();

  challenges.sort((left, right) => (right.createdAtMs || 0) - (left.createdAtMs || 0));

  return challenges;
}

export async function deleteChallengeAsAdmin({ challengeClubSlug, challengeId, user }) {
  requireDb();

  if (!(await isPlatformAdmin(user?.uid, user?.email))) {
    throw new Error('Only the app admin can delete challenges.');
  }

  const challengeRef = doc(db, 'clubs', challengeClubSlug, 'challenges', challengeId);
  const challengeSnapshot = await getDoc(challengeRef);

  if (!challengeSnapshot.exists()) {
    throw new Error('That challenge could not be found.');
  }

  const challenge = normalizeChallenge(challengeSnapshot, challengeClubSlug);
  const batch = writeBatch(db);

  batch.delete(challengeRef);

  if (challenge.homeGameId && challenge.createdByTeamClubSlug && challenge.createdByTeamSlug) {
    batch.delete(
      doc(
        db,
        'clubs',
        challenge.createdByTeamClubSlug,
        'teams',
        challenge.createdByTeamSlug,
        'games',
        challenge.homeGameId,
      ),
    );
  }

  if (challenge.awayGameId && challenge.acceptedByTeamClubSlug && challenge.acceptedByTeamSlug) {
    batch.delete(
      doc(
        db,
        'clubs',
        challenge.acceptedByTeamClubSlug,
        'teams',
        challenge.acceptedByTeamSlug,
        'games',
        challenge.awayGameId,
      ),
    );
  }

  await batch.commit();
}

export async function acceptChallenge({ challengeId, challengeClubSlug, clubSlug, teamSlug, user }) {
  requireDb();

  await requireTeamManager({ clubSlug, teamSlug, user });

  const challengeRef = doc(db, 'clubs', challengeClubSlug, 'challenges', challengeId);
  const challengeSnapshot = await getDoc(challengeRef);

  if (!challengeSnapshot.exists()) {
    throw new Error('That challenge could not be found.');
  }

  const challenge = normalizeChallenge(challengeSnapshot, challengeClubSlug);

  if (challenge.status !== 'open') {
    throw new Error('This challenge is no longer open.');
  }

  if (challenge.createdByTeamClubSlug === clubSlug && challenge.createdByTeamSlug === teamSlug) {
    throw new Error('A team cannot accept its own challenge.');
  }

  if (
    challenge.visibility === 'targeted' &&
    (challenge.targetTeamClubSlug !== clubSlug || challenge.targetTeamSlug !== teamSlug)
  ) {
    throw new Error('Only the challenged team can accept this challenge.');
  }

  const [createdByTeam, acceptedByTeam] = await Promise.all([
    getApprovedChallengeTeam({
      challengeClubSlug,
      teamClubSlug: challenge.createdByTeamClubSlug,
      teamSlug: challenge.createdByTeamSlug,
    }),
    getApprovedChallengeTeam({
      challengeClubSlug,
      teamClubSlug: clubSlug,
      teamSlug,
    }),
  ]);
  const homeGameId = `challenge-${challengeId}-${createdByTeam.teamSlug}`;
  const awayGameId = `challenge-${challengeId}-${acceptedByTeam.teamSlug}`;
  const batch = writeBatch(db);

  batch.update(challengeRef, {
    acceptedAt: serverTimestamp(),
    acceptedByTeamClubSlug: acceptedByTeam.clubSlug,
    acceptedByTeamName: acceptedByTeam.name,
    acceptedByTeamSlug: acceptedByTeam.teamSlug,
    acceptedByUid: user.uid,
    awayGameId,
    homeGameId,
    status: 'accepted',
    updatedAt: serverTimestamp(),
  });
  batch.set(
    doc(db, 'clubs', createdByTeam.clubSlug, 'teams', createdByTeam.teamSlug, 'games', homeGameId),
    buildChallengeGamePayload({
      challenge,
      challengeClubSlug,
      createdBy: createdByTeam,
      linkedGameId: awayGameId,
      linkedTeam: acceptedByTeam,
      user,
    }),
  );
  batch.set(
    doc(db, 'clubs', acceptedByTeam.clubSlug, 'teams', acceptedByTeam.teamSlug, 'games', awayGameId),
    buildChallengeGamePayload({
      challenge,
      challengeClubSlug,
      createdBy: acceptedByTeam,
      linkedGameId: homeGameId,
      linkedTeam: createdByTeam,
      user,
    }),
  );

  await batch.commit();
}

export async function declineChallenge({ challengeId, challengeClubSlug, clubSlug, teamSlug, user }) {
  requireDb();

  await requireTeamManager({ clubSlug, teamSlug, user });

  const challengeRef = doc(db, 'clubs', challengeClubSlug, 'challenges', challengeId);
  const challengeSnapshot = await getDoc(challengeRef);

  if (!challengeSnapshot.exists()) {
    throw new Error('That challenge could not be found.');
  }

  const challenge = normalizeChallenge(challengeSnapshot, challengeClubSlug);

  if (
    challenge.status !== 'open' ||
    challenge.visibility !== 'targeted' ||
    challenge.targetTeamClubSlug !== clubSlug ||
    challenge.targetTeamSlug !== teamSlug
  ) {
    throw new Error('Only the challenged team can decline an open targeted challenge.');
  }

  await updateDoc(challengeRef, {
    declinedAt: serverTimestamp(),
    status: 'declined',
    updatedAt: serverTimestamp(),
  });
}

export async function cancelChallenge({ challengeId, challengeClubSlug, clubSlug, teamSlug, user }) {
  requireDb();

  await requireTeamManager({ clubSlug, teamSlug, user });

  const challengeRef = doc(db, 'clubs', challengeClubSlug, 'challenges', challengeId);
  const challengeSnapshot = await getDoc(challengeRef);

  if (!challengeSnapshot.exists()) {
    throw new Error('That challenge could not be found.');
  }

  const challenge = normalizeChallenge(challengeSnapshot, challengeClubSlug);

  if (
    challenge.status !== 'open' ||
    challenge.createdByTeamClubSlug !== clubSlug ||
    challenge.createdByTeamSlug !== teamSlug
  ) {
    throw new Error('Only the posting team can cancel an open challenge.');
  }

  await updateDoc(challengeRef, {
    cancelledAt: serverTimestamp(),
    status: 'cancelled',
    updatedAt: serverTimestamp(),
  });
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

  await updateDoc(membershipRef, {
    role,
    updatedAt: serverTimestamp(),
  });
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

function normalizeAvailableDays(days = []) {
  const allowedDays = new Set(PLAYER_AVAILABLE_DAYS.map((day) => day.id));

  return Array.from(
    new Set(
      (Array.isArray(days) ? days : [])
        .map((day) => (typeof day === 'string' ? day.trim().toLowerCase() : ''))
        .filter((day) => allowedDays.has(day)),
    ),
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
      availableDays: normalizeAvailableDays(data.availableDays),
      dupr: normalizeNullableNumber(data.dupr),
      email: data.email ?? '',
      firstName,
      fullName: data.fullName ?? buildFullName(firstName, lastName),
      id: entry.id,
      lastName,
      notes: data.notes ?? '',
      phone: data.phone ?? '',
      skillLevel: data.skillLevel ?? '',
      uid: data.uid ?? '',
    };
  });

  players.sort((left, right) => left.fullName.localeCompare(right.fullName));

  return players;
}

export async function savePlayer({
  active = true,
  availableDays = [],
  clubSlug,
  dupr,
  firstName,
  lastName,
  notes = '',
  playerId,
  phone = '',
  skillLevel,
  teamSlug,
}) {
  requireDb();

  if (!playerId) {
    throw new Error('Players must join the team before their profile can be edited.');
  }

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

  const playerRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'players', playerId);
  const playerSnapshot = await getDoc(playerRef);

  if (!playerSnapshot.exists()) {
    throw new Error('That player could not be found.');
  }

  const payload = {
    active,
    availableDays: normalizeAvailableDays(availableDays),
    dupr: normalizeNullableNumber(dupr),
    firstName: trimmedFirstName,
    fullName,
    lastName: trimmedLastName,
    notes: notes.trim(),
    phone: phone.trim(),
    skillLevel: normalizedSkillLevel,
    updatedAt: serverTimestamp(),
  };

  await updateDoc(playerRef, payload);

  return playerId;
}

export async function dropTeamMember({ clubSlug, playerId, teamSlug, uid = '', user = null }) {
  requireDb();

  if (!playerId && !uid) {
    throw new Error('Choose a player to drop.');
  }

  const membersRef = collection(db, 'clubs', clubSlug, 'teams', teamSlug, 'members');
  const membersSnapshot = await getDocs(membersRef);
  const members = membersSnapshot.docs.map((entry) => ({
    ...entry.data(),
    id: entry.id,
    ref: entry.ref,
  }));
  const targetMember =
    members.find((member) => member.id === uid || member.uid === uid) ??
    members.find((member) => playerId && member.playerId === playerId) ??
    null;
  const targetUid = uid || targetMember?.uid || '';
  const targetPlayerId = playerId || targetMember?.playerId || '';

  if (!targetPlayerId) {
    throw new Error('That player could not be found.');
  }

  const playerRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'players', targetPlayerId);
  const playerSnapshot = await getDoc(playerRef);

  if (!playerSnapshot.exists()) {
    throw new Error('That player could not be found.');
  }

  const isSelfDrop = Boolean(user?.uid && targetUid && user.uid === targetUid);

  if (targetMember?.role === 'captain') {
    const otherCaptain = members.some(
      (member) => member.role === 'captain' && member.uid !== targetUid && member.id !== targetUid,
    );

    if (!otherCaptain) {
      throw new Error(
        isSelfDrop
          ? 'Assign another captain before dropping yourself from this team.'
          : 'Assign another captain before dropping this captain from the team.',
      );
    }
  }

  const gamesRef = collection(db, 'clubs', clubSlug, 'teams', teamSlug, 'games');
  const gamesSnapshot = await getDocs(gamesRef);
  const batch = writeBatch(db);

  gamesSnapshot.docs.forEach((entry) => {
    const game = entry.data();
    const rosterPlayerIds = normalizePlayerIdList(
      (game.rosterPlayerIds ?? []).filter((entryPlayerId) => entryPlayerId !== targetPlayerId),
    );
    const pairings = normalizePairings(game.pairings, rosterPlayerIds);
    const attendance = { ...(game.attendance ?? {}) };

    delete attendance[targetPlayerId];

    batch.update(entry.ref, {
      attendance,
      pairings,
      rosterPlayerIds,
      updatedAt: serverTimestamp(),
    });
  });

  if (targetUid) {
    batch.delete(doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'members', targetUid));
    batch.delete(doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'playerLinks', targetUid));
    batch.delete(doc(db, 'users', targetUid, 'memberships', `${clubSlug}_${teamSlug}`));
  }

  batch.delete(playerRef);
  await batch.commit();
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

function normalizeTimeLabel(value) {
  return (value ?? '').replace(':undefined', ':00');
}

function getPairingCountForRoster(rosterPlayerIds = []) {
  const selectedCount = normalizePlayerIdList(rosterPlayerIds).length;
  return Math.min(4, Math.max(1, Math.ceil(selectedCount / 2)));
}

function createEmptyPairings(pairingCount = 1) {
  return Array.from({ length: pairingCount }, (_, index) => ({
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

  return createEmptyPairings(getPairingCountForRoster(rosterPlayerIds)).map((defaultPairing, index) => {
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
      timeLabel: normalizeTimeLabel(data.timeLabel),
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

function createNewsPostId(title = 'post') {
  const slug = slugify(title).slice(0, 24) || 'post';
  return `${Date.now()}-${slug}`;
}

function buildAuthorFromUser(user, fallbackRole = '') {
  const displayName = user?.displayName || user?.email || 'Teammate';

  return {
    authorName: displayName,
    authorPhotoUrl: user?.photoURL ?? '',
    authorRole: fallbackRole,
    authorUid: user?.uid ?? '',
  };
}

export async function listNewsPosts(clubSlug, teamSlug) {
  requireDb();

  const newsRef = collection(db, 'clubs', clubSlug, 'teams', teamSlug, 'newsPosts');
  const snapshot = await getDocs(newsRef);
  const posts = await Promise.all(snapshot.docs.map(async (entry) => {
    const data = entry.data();
    const [commentsSnapshot, reactionsSnapshot] = await Promise.all([
      getDocs(collection(entry.ref, 'comments')).catch(() => null),
      getDocs(collection(entry.ref, 'reactions')).catch(() => null),
    ]);
    const comments = (commentsSnapshot?.docs ?? [])
      .map((commentEntry) => {
        const comment = commentEntry.data();

        return {
          authorName: comment.authorName ?? 'Teammate',
          authorPhotoUrl: comment.authorPhotoUrl ?? '',
          authorRole: comment.authorRole ?? '',
          authorUid: comment.authorUid ?? comment.createdBy ?? '',
          body: (comment.body ?? '').trim(),
          createdAtMs: normalizeTimestampMs(comment.createdAt),
          id: commentEntry.id,
        };
      })
      .sort((left, right) => (left.createdAtMs || 0) - (right.createdAtMs || 0));
    const reactions = (reactionsSnapshot?.docs ?? []).map((reactionEntry) => {
      const reaction = reactionEntry.data();

      return {
        createdAtMs: normalizeTimestampMs(reaction.createdAt),
        id: reactionEntry.id,
        type: reaction.type ?? 'like',
        uid: reaction.uid ?? reactionEntry.id,
      };
    });

    return {
      authorName: data.authorName ?? data.createdByName ?? data.createdBy ?? 'Teammate',
      authorPhotoUrl: data.authorPhotoUrl ?? '',
      authorRole: data.authorRole ?? '',
      authorUid: data.authorUid ?? data.createdByUid ?? data.createdBy ?? '',
      body: (data.body ?? '').trim(),
      comments,
      commentCount: comments.length,
      createdAtMs: normalizeTimestampMs(data.createdAt),
      createdBy: data.createdBy ?? '',
      id: entry.id,
      imagePath: typeof data.imagePath === 'string' ? data.imagePath : '',
      imageUrl: typeof data.imageUrl === 'string' ? data.imageUrl : '',
      linkUrl: typeof data.linkUrl === 'string' ? data.linkUrl : '',
      reactions,
      reactionCount: reactions.length,
      title: (data.title ?? '').trim() || 'Team update',
      updatedAtMs: normalizeTimestampMs(data.updatedAt),
      updatedBy: data.updatedBy ?? '',
    };
  }));

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

  if (!user?.uid) {
    throw new Error('You must be signed in to post.');
  }

  const membership = await getMembership(clubSlug, teamSlug, user.uid, user);

  if (!membership) {
    throw new Error('You must be a team member to post in this feed.');
  }

  const normalizedTitle = (title || 'Team post').trim();
  const normalizedBody = body.trim();

  if (!normalizedBody && !imageFile && !post?.imageUrl) {
    throw new Error('Write a post or add a photo before sharing.');
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
    ...(post
      ? {
          authorName: post.authorName ?? user.displayName ?? user.email ?? 'Teammate',
          authorPhotoUrl: post.authorPhotoUrl ?? user.photoURL ?? '',
          authorRole: post.authorRole ?? membership?.role ?? '',
          authorUid: post.authorUid ?? user.uid,
        }
      : buildAuthorFromUser(user, membership?.role ?? '')),
    body: normalizedBody,
    createdBy: post?.createdBy ?? user.uid,
    imagePath: uploadedImage?.imagePath ?? post?.imagePath ?? '',
    imageUrl: uploadedImage?.imageUrl ?? post?.imageUrl ?? '',
    linkUrl: normalizeUrl(linkUrl ?? ''),
    title: normalizedTitle,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  };

  if (!post) {
    payload.createdAt = serverTimestamp();
    payload.createdByUid = user.uid;
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
  const [commentsSnapshot, reactionsSnapshot] = await Promise.all([
    getDocs(collection(postRef, 'comments')),
    getDocs(collection(postRef, 'reactions')),
  ]);

  await deleteRefsInBatches([
    ...commentsSnapshot.docs.map((entry) => entry.ref),
    ...reactionsSnapshot.docs.map((entry) => entry.ref),
  ]);
  await deleteDoc(postRef);
  await deleteStoragePath(post.imagePath);
}

export async function addNewsComment({ body, clubSlug, postId, teamSlug, user }) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to comment.');
  }

  const normalizedBody = body.trim();

  if (!normalizedBody) {
    throw new Error('Write a comment before posting.');
  }

  const membership = await getMembership(clubSlug, teamSlug, user.uid, user);

  if (!membership) {
    throw new Error('You must be a team member to comment in this feed.');
  }

  const commentRef = doc(collection(db, 'clubs', clubSlug, 'teams', teamSlug, 'newsPosts', postId, 'comments'));

  await setDoc(commentRef, {
    ...buildAuthorFromUser(user, membership?.role ?? ''),
    body: normalizedBody,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
  });

  return commentRef.id;
}

export async function deleteNewsComment({ clubSlug, commentId, postId, teamSlug }) {
  requireDb();

  await deleteDoc(doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'newsPosts', postId, 'comments', commentId));
}

export async function toggleNewsReaction({ clubSlug, post, teamSlug, type = 'like', user }) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to react.');
  }

  const reactionRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'newsPosts', post.id, 'reactions', user.uid);
  const existingReaction = post.reactions?.find((reaction) => reaction.uid === user.uid);

  if (existingReaction?.type === type) {
    await deleteDoc(reactionRef);
    return false;
  }

  await setDoc(reactionRef, {
    createdAt: serverTimestamp(),
    type,
    uid: user.uid,
  });

  return true;
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
