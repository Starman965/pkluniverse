import {
  collectionGroup,
  deleteField,
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  limit as limitDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, isFirebaseConfigured, storage } from './firebase';
import { normalizeTeamDivision } from './teamDivision';

const INDEPENDENT_CLUB = {
  id: 'independent',
  name: 'Independent Teams',
  slug: 'independent',
};

const BLACKHAWK_CLUB = {
  id: 'blackhawk-country-club',
  name: 'Blackhawk Country Club',
  slug: 'blackhawk-country-club',
};

const DEFAULT_TEAM_CLUB = BLACKHAWK_CLUB;
const RESERVED_CLUBS = [INDEPENDENT_CLUB, BLACKHAWK_CLUB];

const SUPER_ADMIN_EMAILS = ['demandgendave@gmail.com'];

export const TEAM_MEMBER_LIMIT = 2;
export const MATCH_PLAYER_COUNT_OPTIONS = [1, 2];

function normalizeMatchPlayerCount(value) {
  const count = Number(value);
  return MATCH_PLAYER_COUNT_OPTIONS.includes(count) ? count : 2;
}

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

export const ACTIVITY_TYPES = {
  CHALLENGE_ACCEPTED: 'challenge_accepted',
  CHALLENGE_CREATED: 'challenge_created',
  CHALLENGE_DECLINED: 'challenge_declined',
  EVENT_CREATED: 'event_created',
  EVENT_REGISTERED: 'event_registered',
  MATCH_COMPLETED: 'match_completed',
  MATCH_SCHEDULED: 'match_scheduled',
  PLAYER_ADDED: 'player_added',
  PLAYER_JOINED_TEAM: 'player_joined_team',
  SCORE_REPORTED: 'score_reported',
  STANDINGS_UPDATED: 'standings_updated',
  TEAM_CREATED: 'team_created',
};

const ACTIVITY_TYPE_VALUES = Object.values(ACTIVITY_TYPES);

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
  return `clubs/${clubSlug}/news/${teamSlug}/${postId}/${Date.now()}-${safeBaseName}${extension}`;
}

function buildTeamLogoPath({ clubSlug, teamSlug, fileName }) {
  const safeBaseName = sanitizeFileBaseName(fileName);
  const extension = getFileExtension(fileName);
  return `clubs/${clubSlug}/teams/${teamSlug}/branding/${Date.now()}-${safeBaseName}${extension}`;
}

function buildPlayerHeadshotPath({ clubSlug, teamSlug, playerId, fileName }) {
  const safeBaseName = sanitizeFileBaseName(fileName);
  const extension = getFileExtension(fileName);
  return `clubs/${clubSlug}/teams/${teamSlug}/players/${playerId}/headshots/${Date.now()}-${safeBaseName}${extension}`;
}

function buildUserHeadshotPath({ fileName, uid }) {
  const safeBaseName = sanitizeFileBaseName(fileName);
  const extension = getFileExtension(fileName);
  return `users/${uid}/profile/headshots/${Date.now()}-${safeBaseName}${extension}`;
}

function buildClubLogoPath({ clubSlug, fileName }) {
  const safeBaseName = sanitizeFileBaseName(fileName);
  const extension = getFileExtension(fileName);
  return `clubs/${clubSlug}/branding/${Date.now()}-${safeBaseName}${extension}`;
}

function buildClubEventFlyerPath({ clubSlug, eventId, fileName }) {
  const safeBaseName = sanitizeFileBaseName(fileName);
  const extension = getFileExtension(fileName);
  return `clubs/${clubSlug}/events/${eventId}/flyer/${Date.now()}-${safeBaseName}${extension}`;
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

async function uploadPlayerHeadshot({ clubSlug, file, playerId, teamSlug }) {
  if (!storage) {
    throw new Error('Firebase Storage is not configured yet.');
  }

  const headshotPath = buildPlayerHeadshotPath({
    clubSlug,
    fileName: file?.name,
    playerId,
    teamSlug,
  });
  const headshotRef = ref(storage, headshotPath);

  await uploadBytes(headshotRef, file);

  return {
    headshotPath,
    headshotUrl: await getDownloadURL(headshotRef),
  };
}

async function uploadUserHeadshot({ file, uid }) {
  if (!storage) {
    throw new Error('Firebase Storage is not configured yet.');
  }

  const headshotPath = buildUserHeadshotPath({
    fileName: file?.name,
    uid,
  });
  const headshotRef = ref(storage, headshotPath);

  await uploadBytes(headshotRef, file);

  return {
    headshotPath,
    headshotUrl: await getDownloadURL(headshotRef),
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

async function uploadClubEventFlyer({ clubSlug, eventId, file }) {
  if (!storage) {
    throw new Error('Firebase Storage is not configured yet.');
  }

  const flyerImagePath = buildClubEventFlyerPath({
    clubSlug,
    eventId,
    fileName: file?.name,
  });
  const flyerRef = ref(storage, flyerImagePath);

  await uploadBytes(flyerRef, file);

  return {
    flyerImagePath,
    flyerImageUrl: await getDownloadURL(flyerRef),
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

async function collectNewsPostDeleteRefs(postRef) {
  const [commentsSnapshot, reactionsSnapshot] = await Promise.all([
    getDocs(collection(postRef, 'comments')),
    getDocs(collection(postRef, 'reactions')),
  ]);

  return [
    ...commentsSnapshot.docs.map((entry) => entry.ref),
    ...reactionsSnapshot.docs.map((entry) => entry.ref),
    postRef,
  ];
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

function buildGlobalProfileFields({ fallback = {}, user = null, userProfile = {} } = {}) {
  const authNames = splitDisplayName(user?.displayName ?? userProfile.displayName, user?.email ?? userProfile.email);
  const firstName = authNames.firstName || userProfile.firstName || fallback.firstName || '';
  const lastName = authNames.lastName || userProfile.lastName || fallback.lastName || '';
  const fullName =
    authNames.fullName ||
    userProfile.fullName ||
    buildFullName(firstName, lastName) ||
    fallback.fullName ||
    fallback.displayName ||
    'New player';

  return {
    displayName: user?.displayName ?? userProfile.displayName ?? fallback.displayName ?? fullName,
    email: user?.email ?? userProfile.email ?? fallback.email ?? '',
    firstName,
    fullName,
    headshotPath: userProfile.headshotPath ?? fallback.headshotPath ?? '',
    headshotUrl: userProfile.headshotUrl ?? fallback.headshotUrl ?? userProfile.photoURL ?? user?.photoURL ?? '',
    lastName,
    phone: userProfile.phone ?? fallback.phone ?? '',
    photoURL: user?.photoURL ?? userProfile.photoURL ?? '',
    skillLevel: normalizeSkillLevel(userProfile.skillLevel ?? fallback.skillLevel ?? ''),
    uid: user?.uid ?? userProfile.uid ?? fallback.uid ?? '',
  };
}

function buildPlayerSnapshotFromGlobalProfile(profile) {
  return {
    displayName: profile.displayName ?? profile.fullName ?? '',
    email: profile.email ?? '',
    firstName: profile.firstName ?? '',
    fullName: profile.fullName ?? buildFullName(profile.firstName, profile.lastName),
    headshotPath: profile.headshotPath ?? '',
    headshotUrl: profile.headshotUrl || profile.photoURL || '',
    lastName: profile.lastName ?? '',
    phone: profile.phone ?? '',
    skillLevel: normalizeSkillLevel(profile.skillLevel ?? ''),
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

async function createAdminNotification({
  captainEmail = '',
  captainEmails = '',
  captainName = '',
  captainNames = '',
  clubSlug = '',
  message,
  teamName = '',
  teamSlug = '',
  title,
  type,
  user,
  metadata = {},
}) {
  if (!type || !title || !message || !user?.uid) {
    return;
  }

  const notificationRef = doc(collection(db, 'adminNotifications'));

  try {
    await setDoc(notificationRef, {
      captainEmail,
      captainEmails,
      captainName,
      captainNames,
      clubSlug,
      createdAt: serverTimestamp(),
      createdByEmail: user.email ?? '',
      createdByName: user.displayName ?? '',
      createdByUid: user.uid,
      message,
      metadata,
      status: 'new',
      teamName,
      teamSlug,
      title,
      type,
    });
  } catch (error) {
    console.warn('Unable to create admin notification.', error);
  }
}

async function getTeamCaptainNotificationFields(clubSlug, teamSlug) {
  const membersSnapshot = await getDocs(collection(db, 'clubs', clubSlug, 'teams', teamSlug, 'members'));
  const captainMembers = membersSnapshot.docs
    .map((entry) => entry.data())
    .filter((member) => ['captain', 'coCaptain'].includes(member.role ?? ''));

  if (captainMembers.length === 0) {
    return {
      captainEmail: '',
      captainEmails: '',
      captainName: '',
      captainNames: '',
    };
  }

  const playerSnapshots = await Promise.all(
    captainMembers.map((member) => {
      const playerId = member.playerId || member.uid;
      return playerId ? getDoc(doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'players', playerId)) : null;
    }),
  );

  const captains = captainMembers
    .map((member, index) => {
      const player = playerSnapshots[index]?.exists() ? playerSnapshots[index].data() : null;
      const email = (player?.email ?? '').trim();

      if (!email) {
        return null;
      }

      return {
        email,
        name: (player?.fullName || player?.displayName || member.uid || '').trim(),
      };
    })
    .filter(Boolean);

  const uniqueCaptains = Array.from(
    new Map(captains.map((captain) => [captain.email.toLowerCase(), captain])).values(),
  );

  return {
    captainEmail: uniqueCaptains[0]?.email ?? '',
    captainEmails: uniqueCaptains.map((captain) => captain.email).join(', '),
    captainName: uniqueCaptains[0]?.name ?? '',
    captainNames: uniqueCaptains.map((captain) => captain.name).filter(Boolean).join(', '),
  };
}

export async function syncUserProfile(user) {
  requireDb();

  const userRef = doc(db, 'users', user.uid);
  const userSnapshot = await getDoc(userRef);
  const profile = buildGlobalProfileFields({
    user,
    userProfile: userSnapshot.exists() ? userSnapshot.data() : {},
  });

  await setDoc(
    userRef,
    {
      displayName: profile.displayName,
      email: profile.email,
      firstName: profile.firstName,
      fullName: profile.fullName,
      headshotPath: profile.headshotPath,
      headshotUrl: profile.headshotUrl,
      lastName: profile.lastName,
      photoURL: profile.photoURL,
      uid: user.uid,
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

  return snapshot.exists() ? buildGlobalProfileFields({ userProfile: snapshot.data() }) : null;
}

async function syncUserProfileToTeamPlayerSnapshots(uid, profile) {
  const memberships = await listMemberships(uid);
  const snapshot = buildPlayerSnapshotFromGlobalProfile(profile);

  await Promise.all(
    memberships.map(async (membership) => {
      if (!membership.clubSlug || !membership.teamSlug) {
        return;
      }

      const playerRef = doc(db, 'clubs', membership.clubSlug, 'teams', membership.teamSlug, 'players', uid);

      try {
        const playerSnapshot = await getDoc(playerRef);

        if (!playerSnapshot.exists()) {
          return;
        }

        await updateDoc(playerRef, {
          ...snapshot,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        if (error?.code !== 'permission-denied' && error?.code !== 'not-found') {
          throw error;
        }
      }
    }),
  );
}

export async function backfillUserProfileFromPlayer({ player, user }) {
  requireDb();

  if (!user?.uid || !player) {
    return null;
  }

  const userRef = doc(db, 'users', user.uid);
  const userSnapshot = await getDoc(userRef);
  const currentProfile = userSnapshot.exists() ? userSnapshot.data() : {};
  const profile = buildGlobalProfileFields({
    fallback: player,
    user,
    userProfile: currentProfile,
  });

  await setDoc(
    userRef,
    {
      ...buildPlayerSnapshotFromGlobalProfile(profile),
      photoURL: profile.photoURL,
      uid: user.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return profile;
}

export async function saveUserPlayerProfile({ headshotFile = null, phone = '', skillLevel = '', user }) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to update your profile.');
  }

  const normalizedSkillLevel = normalizeSkillLevel(skillLevel);

  if (skillLevel?.trim() && !normalizedSkillLevel) {
    throw new Error('Choose a valid skill level from the list.');
  }

  const userRef = doc(db, 'users', user.uid);
  const userSnapshot = await getDoc(userRef);
  const currentProfile = userSnapshot.exists() ? userSnapshot.data() : {};
  const uploadedHeadshot = headshotFile ? await uploadUserHeadshot({ file: headshotFile, uid: user.uid }) : null;
  const authProfile = buildGlobalProfileFields({ user, userProfile: currentProfile });
  const payload = {
    displayName: authProfile.displayName,
    email: authProfile.email,
    firstName: authProfile.firstName,
    fullName: authProfile.fullName,
    headshotPath: currentProfile.headshotPath ?? '',
    headshotUrl: currentProfile.headshotUrl ?? authProfile.photoURL ?? '',
    lastName: authProfile.lastName,
    phone: phone.trim(),
    photoURL: authProfile.photoURL,
    skillLevel: normalizedSkillLevel,
    uid: user.uid,
    updatedAt: serverTimestamp(),
  };

  if (uploadedHeadshot) {
    payload.headshotPath = uploadedHeadshot.headshotPath;
    payload.headshotUrl = uploadedHeadshot.headshotUrl;
  }

  await setDoc(userRef, payload, { merge: true });

  const nextProfile = buildGlobalProfileFields({
    user,
    userProfile: {
      ...currentProfile,
      ...payload,
    },
  });

  await syncUserProfileToTeamPlayerSnapshots(user.uid, nextProfile);

  if (
    uploadedHeadshot?.headshotPath &&
    currentProfile.headshotPath?.startsWith(`users/${user.uid}/profile/headshots/`) &&
    currentProfile.headshotPath !== uploadedHeadshot.headshotPath
  ) {
    await deleteStoragePath(currentProfile.headshotPath);
  }

  return nextProfile;
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
      uid,
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

async function ensureDefaultTeamClub() {
  requireDb();

  return ensureReservedClub(DEFAULT_TEAM_CLUB);
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
        courtLabels: normalizeCourtLabels(data.courtLabels, data.numberOfCourts),
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
  courtLabels = [],
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
  const normalizedNumberOfCourts = normalizeNullableNumber(numberOfCourts);

  await setDoc(clubRef, {
    address: address.trim(),
    city: city.trim(),
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    logoPath: uploadedLogo?.logoPath ?? '',
    logoUrl: uploadedLogo?.logoUrl ?? '',
    name: trimmedName,
    courtLabels: normalizeCourtLabels(courtLabels, normalizedNumberOfCourts),
    numberOfCourts: normalizedNumberOfCourts,
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
  courtLabels = [],
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
  const normalizedNumberOfCourts = normalizeNullableNumber(numberOfCourts);

  await updateDoc(clubRef, {
    address: address.trim(),
    city: city.trim(),
    logoPath: uploadedLogo?.logoPath ?? currentClub.logoPath ?? '',
    logoUrl: uploadedLogo?.logoUrl ?? currentClub.logoUrl ?? '',
    name: trimmedName,
    courtLabels: normalizeCourtLabels(courtLabels, normalizedNumberOfCourts),
    numberOfCourts: normalizedNumberOfCourts,
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

export async function deleteTeamAsAdmin({
  clubSlug,
  teamSlug,
  user,
  skipChallengeAndRequestScan = false,
} = {}) {
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
  const [membersSnapshot, playersSnapshot, playerLinksSnapshot, gamesSnapshot, newsSnapshot] = await Promise.all([
    getDocs(collection(teamRef, 'members')),
    getDocs(collection(teamRef, 'players')),
    getDocs(collection(teamRef, 'playerLinks')),
    getDocs(collection(teamRef, 'games')),
    getDocs(collection(teamRef, 'newsPosts')),
  ]);
  let affiliationRequestRefs = [];
  let challengeRefs = [];

  if (!skipChallengeAndRequestScan) {
    const clubs = await listClubs({ includeIndependent: true });
    const [affiliationRequestGroups, challengeGroups] = await Promise.all([
      Promise.all(clubs.map((club) => getDocs(collection(db, 'clubs', club.slug, 'affiliationRequests')).catch(() => null))),
      Promise.all(clubs.map((club) => getDocs(collection(db, 'clubs', club.slug, 'challenges')).catch(() => null))),
    ]);

    affiliationRequestRefs = affiliationRequestGroups
      .flatMap((snapshot) => snapshot?.docs ?? [])
      .filter((requestDoc) => {
        const request = requestDoc.data();
        return request.teamClubSlug === clubSlug && request.teamSlug === teamSlug;
      })
      .map((requestDoc) => requestDoc.ref);
    challengeRefs = challengeGroups
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
  }

  const userMembershipRefs = membersSnapshot.docs
    .map((memberDoc) => memberDoc.data().uid || memberDoc.id)
    .filter(Boolean)
    .map((uid) => doc(db, 'users', uid, 'memberships', `${clubSlug}_${teamSlug}`));
  const teamNewsDeleteRefGroups = await Promise.all(
    newsSnapshot.docs.map((entry) => collectNewsPostDeleteRefs(entry.ref)),
  );
  const storagePaths = [
    teamData.logoPath,
    ...newsSnapshot.docs.map((newsDoc) => newsDoc.data().imagePath),
  ].filter(Boolean);

  await deleteRefsInBatches([
    ...affiliationRequestRefs,
    ...challengeRefs,
    ...userMembershipRefs,
    ...teamNewsDeleteRefGroups.flat(),
    ...gamesSnapshot.docs.map((entry) => entry.ref),
    ...playerLinksSnapshot.docs.map((entry) => entry.ref),
    ...playersSnapshot.docs.map((entry) => entry.ref),
    ...membersSnapshot.docs.map((entry) => entry.ref),
    teamRef,
  ]);

  await Promise.all(storagePaths.map((storagePath) => deleteStoragePath(storagePath)));
}

/** Typed in the admin Testing tab before running a full data reset (case-sensitive). */
export const RESET_FIRESTORE_TEST_DATA_PHRASE = 'RESET PKL TEST DATA';

/**
 * Deletes operational data across all clubs for local/staging test resets.
 * Preserves club documents, platform admins, club approvers, and user profiles (and Firestore rules block user doc delete).
 */
export async function resetFirestoreTestData({ user } = {}) {
  requireDb();

  if (!(await isPlatformAdmin(user?.uid, user?.email))) {
    throw new Error('Only the app admin can reset Firestore test data.');
  }

  const clubs = await listClubs({ includeIndependent: true });
  const [activitySnapshot, notificationsSnapshot] = await Promise.all([
    getDocs(collection(db, 'activityLogs')),
    getDocs(collection(db, 'adminNotifications')),
  ]);

  await deleteRefsInBatches([
    ...activitySnapshot.docs.map((entry) => entry.ref),
    ...notificationsSnapshot.docs.map((entry) => entry.ref),
  ]);

  for (const club of clubs) {
    const challengesSnapshot = await getDocs(collection(db, 'clubs', club.slug, 'challenges'));
    await deleteRefsInBatches(challengesSnapshot.docs.map((entry) => entry.ref));
  }

  for (const club of clubs) {
    const requestsSnapshot = await getDocs(collection(db, 'clubs', club.slug, 'affiliationRequests'));
    await deleteRefsInBatches(requestsSnapshot.docs.map((entry) => entry.ref));
  }

  for (const club of clubs) {
    const eventsSnapshot = await getDocs(collection(db, 'clubs', club.slug, 'events'));
    await deleteRefsInBatches(eventsSnapshot.docs.map((entry) => entry.ref));
  }

  for (const club of clubs) {
    const clubNewsSnapshot = await getDocs(collection(db, 'clubs', club.slug, 'newsPosts'));
    const clubNewsNestedGroups = await Promise.all(
      clubNewsSnapshot.docs.map((entry) => collectNewsPostDeleteRefs(entry.ref)),
    );
    const clubNewsImagePaths = clubNewsSnapshot.docs.map((newsDoc) => newsDoc.data().imagePath).filter(Boolean);

    await deleteRefsInBatches(clubNewsNestedGroups.flat());
    await Promise.all(clubNewsImagePaths.map((imagePath) => deleteStoragePath(imagePath)));
  }

  for (const club of clubs) {
    const teamsSnapshot = await getDocs(collection(db, 'clubs', club.slug, 'teams'));
    const teamSlugs = teamsSnapshot.docs.map((entry) => entry.id);

    for (const teamSlug of teamSlugs) {
      await deleteTeamAsAdmin({
        clubSlug: club.slug,
        teamSlug,
        user,
        skipChallengeAndRequestScan: true,
      });
    }
  }
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

export async function canManageClub({ clubSlug, user }) {
  requireDb();

  if (!clubSlug || !user?.uid) {
    return false;
  }

  if (await isPlatformAdmin(user.uid, user.email)) {
    return true;
  }

  const managerSnapshot = await getDoc(doc(db, 'clubs', clubSlug, 'admins', user.uid));
  return managerSnapshot.exists();
}

export async function listClubManagers({ clubSlug, user }) {
  requireDb();

  if (!(await isPlatformAdmin(user?.uid, user?.email))) {
    throw new Error('Only app admins can manage club managers.');
  }

  const snapshot = await getDocs(collection(db, 'clubs', clubSlug, 'admins'));
  const managers = snapshot.docs.map((entry) => {
    const data = entry.data();

    return {
      addedAtMs: normalizeTimestampMs(data.addedAt),
      addedBy: data.addedBy ?? '',
      displayName: data.displayName ?? '',
      email: data.email ?? '',
      id: entry.id,
      role: data.role ?? 'manager',
      uid: data.uid ?? entry.id,
    };
  });

  managers.sort((left, right) =>
    (left.displayName || left.email || left.uid).localeCompare(right.displayName || right.email || right.uid),
  );

  return managers;
}

export async function addClubManager({ clubSlug, email, user }) {
  requireDb();

  if (!(await isPlatformAdmin(user?.uid, user?.email))) {
    throw new Error('Only app admins can add club managers.');
  }

  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail) {
    throw new Error('Enter the club manager email.');
  }

  const usersQuery = query(collection(db, 'users'), where('email', '==', normalizedEmail));
  const usersSnapshot = await getDocs(usersQuery);
  const userDoc = usersSnapshot.docs[0];

  if (!userDoc) {
    throw new Error('That user has not signed in yet. Ask them to log in once, then add them here.');
  }

  const profile = userDoc.data();

  await setDoc(
    doc(db, 'clubs', clubSlug, 'admins', userDoc.id),
    {
      addedAt: serverTimestamp(),
      addedBy: user.uid,
      displayName: profile.displayName ?? profile.fullName ?? '',
      email: profile.email ?? normalizedEmail,
      role: 'manager',
      uid: userDoc.id,
    },
    { merge: true },
  );

  return userDoc.id;
}

export async function removeClubManager({ clubSlug, managerUid, user }) {
  requireDb();

  if (!(await isPlatformAdmin(user?.uid, user?.email))) {
    throw new Error('Only app admins can remove club managers.');
  }

  if (!managerUid) {
    throw new Error('Choose a club manager to remove.');
  }

  await deleteDoc(doc(db, 'clubs', clubSlug, 'admins', managerUid));
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
            requestedClubSlug: team.requestedClubSlug ?? '',
            teamDivision: normalizeTeamDivision(team.teamDivision),
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
        if ((team.status ?? 'active') !== 'active') {
          return null;
        }

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
          sourceClubSlug: club.slug,
          teamDivision: normalizeTeamDivision(team.teamDivision),
          teamSlug: sourceTeamSlug,
        };
      }));
    }),
  );

  teamsBySourceClub.flat().filter(Boolean).forEach((team) => {
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
      if ((teamEntry.data().status ?? 'active') !== 'active') {
        return false;
      }

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
  const userRef = doc(db, 'users', user.uid);
  let playerSnapshot = null;
  let existingPlayer = null;
  let userProfile = null;

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

  try {
    const userSnapshot = await getDoc(userRef);
    userProfile = userSnapshot.exists() ? userSnapshot.data() : null;
  } catch (error) {
    if (error?.code !== 'permission-denied') {
      throw error;
    }
  }

  const globalProfile = buildGlobalProfileFields({
    fallback: existingPlayer ?? {},
    user,
    userProfile: userProfile ?? {},
  });

  await setDoc(
    userRef,
    {
      ...buildPlayerSnapshotFromGlobalProfile(globalProfile),
      photoURL: globalProfile.photoURL,
      uid: user.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const payload = {
    ...buildPlayerSnapshotFromGlobalProfile(globalProfile),
    teamId,
    teamName,
    uid: user.uid,
    updatedAt: serverTimestamp(),
  };

  if (playerSnapshot) {
    payload.active = existingPlayer?.active !== false;
    payload.availableDays = playerSnapshot.exists()
      ? normalizeAvailableDays(existingPlayer?.availableDays)
      : PLAYER_AVAILABLE_DAYS.map((day) => day.id);
    payload.notes = existingPlayer?.notes ?? '';

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

  const club = await ensureDefaultTeamClub();
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
    affiliationStatus: 'approved',
    approvedAt: serverTimestamp(),
    approvedBy: user.uid,
    approvedClubName: club.name,
    approvedClubSlug: club.slug,
    clubId: club.id,
    clubName: club.name,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    createdByEmail: user.email ?? '',
    joinCode,
    logoPath: '',
    logoUrl: '',
    memberCount: 1,
    name: trimmedName,
    publicSlug,
    requestedClubName: '',
    requestedClubSlug: '',
    slug: teamSlug,
    status: 'active',
    teamDivision: '',
    updatedAt: serverTimestamp(),
  });

  await setDoc(doc(db, 'clubs', club.id, 'teams', teamSlug, 'members', user.uid), {
    clubId: club.id,
    clubSlug: club.slug,
    joinedAt: serverTimestamp(),
    playerId: user.uid,
    role: 'captain',
    status: 'active',
    teamId: teamSlug,
    teamName: trimmedName,
    teamSlug,
    uid: user.uid,
    updatedAt: serverTimestamp(),
  });

  const playerId = await ensurePlayerProfile({
    clubId: club.id,
    teamId: teamSlug,
    teamName: trimmedName,
    user,
  });

  if (playerId !== user.uid) {
    await updateDoc(doc(db, 'clubs', club.id, 'teams', teamSlug, 'members', user.uid), {
      playerId,
      updatedAt: serverTimestamp(),
    });
  }

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

  await createAdminNotification({
    captainEmail: user.email ?? '',
    captainEmails: user.email ?? '',
    captainName: user.displayName ?? user.email ?? '',
    captainNames: user.displayName ?? user.email ?? '',
    clubSlug: club.slug,
    message: `${trimmedName} was created by ${user.displayName || user.email || 'a new captain'}.`,
    teamName: trimmedName,
    teamSlug,
    title: 'New team created',
    type: 'team.created',
    user,
    metadata: {
      joinCode,
      publicSlug,
    },
  });

  await logActivityBestEffort({
    actorId: user.uid,
    clubId: club.slug,
    metadata: {
      captainName: user.displayName || user.email || '',
      clubName: club.name,
      joinCode,
      publicSlug,
      teamId: teamSlug,
      teamName: trimmedName,
    },
    targetId: teamSlug,
    teamId: teamSlug,
    type: ACTIVITY_TYPES.TEAM_CREATED,
  });

  await logActivityBestEffort({
    actorId: user.uid,
    clubId: club.slug,
    metadata: {
      clubName: club.name,
      playerId,
      playerName: user.displayName || user.email || 'A player',
      source: 'team_creation',
      teamId: teamSlug,
      teamName: trimmedName,
    },
    targetId: playerId,
    teamId: teamSlug,
    type: ACTIVITY_TYPES.PLAYER_ADDED,
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
  const activityClubSlug =
    team.affiliationStatus === 'approved' && team.approvedClubSlug && team.approvedClubSlug !== 'independent'
      ? team.approvedClubSlug
      : teamClubSlug;
  const activityClubName = team.approvedClubName ?? team.clubName ?? activityClubSlug;
  const teamRef = doc(db, 'clubs', teamClubSlug, 'teams', teamSlug);
  const membershipRef = doc(db, 'clubs', teamClubSlug, 'teams', teamSlug, 'members', user.uid);
  const { existingMembership, nextRole, teamName } = await runTransaction(db, async (transaction) => {
    const [currentTeamSnapshot, membershipSnapshot] = await Promise.all([
      transaction.get(teamRef),
      transaction.get(membershipRef),
    ]);
    const currentTeam = currentTeamSnapshot.exists() ? currentTeamSnapshot.data() : team;
    const storedMemberCount = Number(currentTeam.memberCount);
    const currentMemberCount = Number.isFinite(storedMemberCount) ? storedMemberCount : 1;
    const existingMembershipData = membershipSnapshot.exists() ? membershipSnapshot.data() : null;
    const role = existingMembershipData?.role ?? 'member';

    if (!membershipSnapshot.exists() && currentMemberCount >= TEAM_MEMBER_LIMIT) {
      throw new Error('This team already has two team members, so it is not accepting new joins.');
    }

    if (membershipSnapshot.exists()) {
      transaction.update(membershipRef, {
        playerId: existingMembershipData?.playerId ?? user.uid,
        updatedAt: serverTimestamp(),
      });
    } else {
      transaction.set(membershipRef, {
        clubId: teamClubSlug,
        clubSlug: teamClubSlug,
        joinedAt: serverTimestamp(),
        playerId: user.uid,
        role,
        status: 'active',
        teamId: teamSlug,
        teamName: currentTeam.name ?? team.name,
        teamSlug,
        uid: user.uid,
        updatedAt: serverTimestamp(),
      });
      transaction.update(teamRef, {
        memberCount: currentMemberCount + 1,
        updatedAt: serverTimestamp(),
      });
    }

    return {
      existingMembership: membershipSnapshot.exists(),
      nextRole: role,
      teamName: currentTeam.name ?? team.name,
    };
  });

  const playerId = await ensurePlayerProfile({
    clubId: teamClubSlug,
    teamId: teamSlug,
    teamName,
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
    teamName,
    teamSlug,
    uid: user.uid,
  });

  await setLastActiveTeam({
    clubSlug: teamClubSlug,
    teamSlug,
    uid: user.uid,
  });

  if (!existingMembership) {
    const captainNotificationFields = await getTeamCaptainNotificationFields(teamClubSlug, teamSlug);

    await createAdminNotification({
      ...captainNotificationFields,
      clubSlug: teamClubSlug,
      message: `${user.displayName || user.email || 'A player'} joined ${teamName || teamSlug}.`,
      teamName: teamName ?? teamSlug,
      teamSlug,
      title: 'New team member joined',
      type: 'teamMember.joined',
      user,
      metadata: {
        role: nextRole,
      },
    });

    await logActivityBestEffort({
      actorId: user.uid,
      clubId: activityClubSlug,
      metadata: {
        clubName: activityClubName,
        playerId,
        playerName: user.displayName || user.email || 'A player',
        source: 'join_code',
        teamId: teamSlug,
        teamName: teamName ?? teamSlug,
      },
      targetId: playerId,
      teamId: teamSlug,
      type: ACTIVITY_TYPES.PLAYER_ADDED,
    });

    await logActivityBestEffort({
      actorId: user.uid,
      clubId: activityClubSlug,
      metadata: {
        clubName: activityClubName,
        playerId,
        playerName: user.displayName || user.email || 'A player',
        role: nextRole,
        teamId: teamSlug,
        teamName: teamName ?? teamSlug,
      },
      targetId: playerId,
      teamId: teamSlug,
      type: ACTIVITY_TYPES.PLAYER_JOINED_TEAM,
    });
  }

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
    if (user?.uid === uid) {
      const teamSnapshot = await getDoc(doc(db, 'clubs', clubSlug, 'teams', teamSlug));
      const team = teamSnapshot.exists() ? teamSnapshot.data() : null;

      if (team?.createdBy === uid && (team.status ?? 'active') === 'active') {
        const teamName = team.name ?? teamSlug;
        const repairedMembership = {
          clubId: clubSlug,
          clubSlug,
          joinedAt: serverTimestamp(),
          playerId: uid,
          role: 'captain',
          status: 'active',
          teamId: teamSlug,
          teamName,
          teamSlug,
          uid,
          updatedAt: serverTimestamp(),
        };

        await setDoc(membershipRef, repairedMembership);
        const playerId = await ensurePlayerProfile({
          clubId: clubSlug,
          teamId: teamSlug,
          teamName,
          user,
        });

        if (playerId !== uid) {
          await updateDoc(membershipRef, {
            playerId,
            updatedAt: serverTimestamp(),
          });
        }

        await syncMembershipSummary({
          clubSlug,
          role: 'captain',
          teamName,
          teamSlug,
          uid,
        });

        return {
          ...repairedMembership,
          joinedAt: null,
          playerId,
          updatedAt: null,
        };
      }
    }

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
  status = 'active',
  teamDivision = '',
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
  const normalizedTeamDivision = normalizeTeamDivision(teamDivision);
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
    publicSlug: slugify(normalizedName),
    status,
    teamDivision: normalizedTeamDivision,
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

export async function updateTeamLogoAsAdmin({ clubSlug, logoFile, teamSlug, user }) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to update a team logo.');
  }

  const platformAdmin = await isPlatformAdmin(user.uid, user.email);

  if (!platformAdmin) {
    throw new Error('Only app admins can update team logos here.');
  }

  if (!logoFile) {
    throw new Error('Choose a logo image first.');
  }

  const teamRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug);
  const teamSnapshot = await getDoc(teamRef);

  if (!teamSnapshot.exists()) {
    throw new Error('That team could not be found.');
  }

  const currentTeam = teamSnapshot.data();
  const uploadedLogo = await uploadTeamLogo({
    clubSlug,
    file: logoFile,
    teamSlug,
  });

  await updateDoc(teamRef, {
    logoPath: uploadedLogo.logoPath,
    logoUrl: uploadedLogo.logoUrl,
    updatedAt: serverTimestamp(),
  });

  if (currentTeam.logoPath && currentTeam.logoPath !== uploadedLogo.logoPath) {
    await deleteStoragePath(currentTeam.logoPath);
  }

  return uploadedLogo;
}

export async function archiveTeam({ clubSlug, teamSlug, user }) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to archive this team.');
  }

  const teamRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug);
  const [teamSnapshot, membershipSnapshot] = await Promise.all([
    getDoc(teamRef),
    getDoc(doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'members', user.uid)),
  ]);
  const team = teamSnapshot.exists() ? teamSnapshot.data() : null;
  const membership = membershipSnapshot.exists() ? membershipSnapshot.data() : null;

  if (!team) {
    throw new Error('That team could not be found.');
  }

  if ((team.status ?? 'active') !== 'active') {
    throw new Error('This team is already archived.');
  }

  if (!['captain', 'coCaptain'].includes(membership?.role)) {
    throw new Error('Only captains and co-captains can archive this team.');
  }

  const batch = writeBatch(db);
  batch.update(teamRef, {
    archivedAt: serverTimestamp(),
    archivedBy: user.uid,
    joinCode: '',
    status: 'archived',
    updatedAt: serverTimestamp(),
  });

  if (team.approvedClubSlug && team.approvedClubSlug !== INDEPENDENT_CLUB.slug) {
    const challengesSnapshot = await getDocs(query(
      collection(db, 'clubs', team.approvedClubSlug, 'challenges'),
      where('createdByTeamClubSlug', '==', clubSlug),
      where('createdByTeamSlug', '==', teamSlug),
      where('status', '==', 'open'),
    ));

    challengesSnapshot.forEach((challengeDoc) => {
      batch.update(challengeDoc.ref, {
        cancelledAt: serverTimestamp(),
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });
    });
  }

  await batch.commit();
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

  await createAdminNotification({
    clubSlug,
    message: `${team.name ?? teamSlug} requested affiliation with ${requestedClub.name ?? requestedClubSlug}.`,
    teamName: team.name ?? teamSlug,
    teamSlug,
    title: 'Club affiliation requested',
    type: 'clubAffiliation.requested',
    user,
    metadata: {
      requestId,
      requestedClubName: requestedClub.name ?? requestedClubSlug,
      requestedClubSlug,
    },
  });
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
          status: data.status ?? 'active',
          teamDivision: normalizeTeamDivision(data.teamDivision),
          teamSlug,
        };
      })
      .filter((team) =>
        team.affiliationStatus === 'approved' &&
        team.approvedClubSlug === clubSlug &&
        team.status === 'active'
      )
      .map(({ affiliationStatus, approvedClubSlug, status, ...team }) => team);
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
  const normalizedPlayersNeeded = normalizeMatchPlayerCount(data.playersNeeded);

  return {
    acceptedAtMs: normalizeTimestampMs(data.acceptedAt),
    acceptedByPlayerId: data.acceptedByPlayerId ?? '',
    acceptedByPlayerName: data.acceptedByPlayerName ?? '',
    acceptedByTeamClubSlug: data.acceptedByTeamClubSlug ?? '',
    acceptedByTeamName: data.acceptedByTeamName ?? '',
    acceptedByTeamSlug: data.acceptedByTeamSlug ?? '',
    cancelledAtMs: normalizeTimestampMs(data.cancelledAt),
    challengeClubSlug,
    createdAtMs: normalizeTimestampMs(data.createdAt),
    createdByTeamClubSlug: data.createdByTeamClubSlug ?? '',
    createdByTeamName: data.createdByTeamName ?? '',
    createdByTeamSlug: data.createdByTeamSlug ?? '',
    createdByPlayerId: data.createdByPlayerId ?? '',
    createdByPlayerName: data.createdByPlayerName ?? '',
    dateTbd: data.dateTbd === true,
    declinedAtMs: normalizeTimestampMs(data.declinedAt),
    homeGameId: data.homeGameId ?? '',
    id: entry.id,
    isoDate: data.isoDate ?? '',
    location: data.location ?? '',
    notes: data.notes ?? '',
    playersNeeded: normalizedPlayersNeeded,
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

  if ((team.status ?? 'active') !== 'active') {
    throw new Error('Challenges are only available for active teams.');
  }

  if (team.affiliationStatus !== 'approved' || team.approvedClubSlug !== challengeClubSlug) {
    throw new Error('Challenges are only available for approved teams in the same club.');
  }

  return {
    clubSlug: teamClubSlug,
    logoUrl: team.logoUrl ?? '',
    name: team.name ?? teamSlug,
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

function getPlayerDisplayName(player) {
  return player?.fullName || player?.displayName || player?.email || 'Player';
}

async function listActiveTeamRosterPlayers(clubSlug, teamSlug) {
  const players = await listPlayers(clubSlug, teamSlug);
  return players.filter((player) => player.active !== false).slice(0, TEAM_MEMBER_LIMIT);
}

function requireRosterPlayer(players, playerId, label = 'Choose a player for this singles match.') {
  const player = players.find((entry) => entry.id === playerId);

  if (!player) {
    throw new Error(label);
  }

  return player;
}

function buildRosterPairing(rosterPlayers) {
  return [
    {
      courtLabel: 'Court 1',
      playerIds: rosterPlayers.map((player) => player.id),
    },
  ];
}

function buildChallengeGamePayload({
  challenge,
  challengeClubSlug,
  createdBy,
  linkedGameId,
  linkedTeam,
  rosterPlayers = [],
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
    linkedTeamLogoUrl: linkedTeam.logoUrl ?? '',
    linkedTeamName: linkedTeam.name,
    linkedTeamSlug: linkedTeam.teamSlug,
    location,
    matchStatus: 'scheduled',
    matchScores: [],
    opponent: linkedTeam.name,
    opponentScore: null,
    pairings: buildRosterPairing(rosterPlayers),
    playersNeeded: normalizeMatchPlayerCount(challenge.playersNeeded),
    result: 'pending',
    rosterPlayerIds: rosterPlayers.map((player) => player.id),
    teamScore: null,
    timeLabel,
    updatedAt: serverTimestamp(),
    source: 'challenge',
    sourceTeamClubSlug: createdBy.clubSlug,
    sourceTeamLogoUrl: createdBy.logoUrl ?? '',
    sourceTeamSlug: createdBy.teamSlug,
  };
}

export async function createChallenge({
  clubSlug,
  createdByPlayerId = '',
  dateTbd = false,
  isoDate = '',
  location = '',
  notes = '',
  playersNeeded = 2,
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

  if ((sourceTeam.status ?? 'active') !== 'active') {
    throw new Error('Archived teams cannot send new challenges.');
  }

  if (sourceTeam.affiliationStatus !== 'approved' || !challengeClubSlug || challengeClubSlug === INDEPENDENT_CLUB.slug) {
    throw new Error('Approve this team for a club before posting challenges.');
  }

  const normalizedVisibility = visibility === 'targeted' ? 'targeted' : 'open';
  const trimmedIsoDate = isoDate.trim();
  const trimmedLocation = location.trim();
  const trimmedNotes = notes.trim();
  const trimmedTimeLabel = timeLabel.trim();
  const normalizedDateTbd = dateTbd === true;
  const normalizedPlayersNeeded = normalizeMatchPlayerCount(playersNeeded);
  const sourcePlayers = await listActiveTeamRosterPlayers(clubSlug, teamSlug);
  const createdByPlayer =
    normalizedPlayersNeeded === 1
      ? requireRosterPlayer(sourcePlayers, createdByPlayerId, 'Choose who will play singles for your team.')
      : null;

  if (normalizedPlayersNeeded === 2 && sourcePlayers.length < 2) {
    throw new Error('Your team needs two active members before sending a doubles challenge.');
  }

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
    acceptedByPlayerId: '',
    acceptedByPlayerName: '',
    awayGameId: '',
    cancelledAt: null,
    clubSlug: challengeClubSlug,
    createdAt: serverTimestamp(),
    createdByTeamClubSlug: clubSlug,
    createdByTeamName: sourceTeam.name ?? teamSlug,
    createdByTeamSlug: teamSlug,
    createdByUid: user.uid,
    createdByPlayerId: createdByPlayer?.id ?? '',
    createdByPlayerName: createdByPlayer ? getPlayerDisplayName(createdByPlayer) : '',
    dateTbd: normalizedDateTbd,
    declinedAt: null,
    homeGameId: '',
    isoDate: normalizedDateTbd ? '' : trimmedIsoDate,
    location: trimmedLocation || 'Location TBD',
    notes: trimmedNotes,
    playersNeeded: normalizedPlayersNeeded,
    status: 'open',
    targetTeamClubSlug: target?.clubSlug ?? '',
    targetTeamName: target?.name ?? '',
    targetTeamSlug: target?.teamSlug ?? '',
    timeLabel: normalizedDateTbd ? '' : trimmedTimeLabel,
    updatedAt: serverTimestamp(),
    visibility: normalizedVisibility,
  });

  await logActivityBestEffort({
    actorId: user.uid,
    clubId: challengeClubSlug,
    metadata: {
      challengeClubSlug,
      challengeId,
      challengedTeamClubSlug: target?.clubSlug ?? '',
      challengedTeamName: target?.name ?? '',
      challengedTeamSlug: target?.teamSlug ?? '',
      challengerTeamClubSlug: clubSlug,
      challengerTeamId: teamSlug,
      challengerTeamName: sourceTeam.name ?? teamSlug,
      challengerTeamSlug: teamSlug,
      challengerPlayerId: createdByPlayer?.id ?? '',
      challengerPlayerName: createdByPlayer ? getPlayerDisplayName(createdByPlayer) : '',
      matchType: 'club_challenge',
      opponentTeamId: target?.teamSlug ?? '',
      opponentTeamName: target?.name ?? (normalizedVisibility === 'open' ? 'Open challenge' : ''),
      proposedDate: normalizedDateTbd ? 'Date TBD' : trimmedIsoDate,
      timeLabel: normalizedDateTbd ? 'Time TBD' : trimmedTimeLabel || 'Time TBD',
      visibility: normalizedVisibility,
    },
    targetId: challengeId,
    teamId: teamSlug,
    type: ACTIVITY_TYPES.CHALLENGE_CREATED,
  });

  if (normalizedVisibility === 'targeted' && target) {
    const captainNotificationFields = await getTeamCaptainNotificationFields(target.clubSlug, target.teamSlug);
    const challengeDateLabel = normalizedDateTbd ? 'Date TBD' : trimmedIsoDate;
    const challengeTimeLabel = normalizedDateTbd ? 'Time TBD' : trimmedTimeLabel || 'Time TBD';
    const challengeLocation = trimmedLocation || 'Location TBD';

    await createAdminNotification({
      ...captainNotificationFields,
      clubSlug: target.clubSlug,
      message: `${sourceTeam.name ?? teamSlug} challenged ${target.name ?? target.teamSlug} to a match.`,
      teamName: target.name ?? target.teamSlug,
      teamSlug: target.teamSlug,
      title: 'New team challenge',
      type: 'challenge.created',
      user,
      metadata: {
        challengeClubSlug,
        challengeId,
        challengePath: `/c/${target.clubSlug}/t/${target.teamSlug}/challenges`,
        challengedTeamClubSlug: target.clubSlug,
        challengedTeamName: target.name ?? target.teamSlug,
        challengedTeamSlug: target.teamSlug,
        challengerTeamClubSlug: clubSlug,
        challengerTeamName: sourceTeam.name ?? teamSlug,
        challengerTeamSlug: teamSlug,
        challengerPlayerId: createdByPlayer?.id ?? '',
        challengerPlayerName: createdByPlayer ? getPlayerDisplayName(createdByPlayer) : '',
        dateLabel: challengeDateLabel,
        dateTbd: normalizedDateTbd,
        isoDate: normalizedDateTbd ? '' : trimmedIsoDate,
        location: challengeLocation,
        notes: trimmedNotes,
        playersNeeded: normalizedPlayersNeeded,
        timeLabel: challengeTimeLabel,
      },
    });
  }

  return challengeId;
}

export async function updateChallenge({
  challengeClubSlug,
  challengeId,
  clubSlug,
  createdByPlayerId = '',
  dateTbd = false,
  isoDate = '',
  location = '',
  notes = '',
  playersNeeded = 2,
  targetTeam = null,
  teamSlug,
  timeLabel = '',
  user,
  visibility = 'open',
}) {
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
    throw new Error('Only the posting team can edit an open challenge.');
  }

  const sourceTeamSnapshot = await getDoc(doc(db, 'clubs', clubSlug, 'teams', teamSlug));
  const sourceTeam = sourceTeamSnapshot.exists() ? sourceTeamSnapshot.data() : null;

  if (!sourceTeam || (sourceTeam.status ?? 'active') !== 'active') {
    throw new Error('Archived teams cannot edit challenges.');
  }

  const normalizedVisibility = visibility === 'targeted' ? 'targeted' : 'open';
  const trimmedIsoDate = isoDate.trim();
  const trimmedLocation = location.trim();
  const trimmedNotes = notes.trim();
  const trimmedTimeLabel = timeLabel.trim();
  const normalizedDateTbd = dateTbd === true;
  const normalizedPlayersNeeded = normalizeMatchPlayerCount(playersNeeded);
  const sourcePlayers = await listActiveTeamRosterPlayers(clubSlug, teamSlug);
  const createdByPlayer =
    normalizedPlayersNeeded === 1
      ? requireRosterPlayer(sourcePlayers, createdByPlayerId, 'Choose who will play singles for your team.')
      : null;

  if (normalizedPlayersNeeded === 2 && sourcePlayers.length < 2) {
    throw new Error('Your team needs two active members before sending a doubles challenge.');
  }

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

  await updateDoc(challengeRef, {
    createdByPlayerId: createdByPlayer?.id ?? '',
    createdByPlayerName: createdByPlayer ? getPlayerDisplayName(createdByPlayer) : '',
    dateTbd: normalizedDateTbd,
    isoDate: normalizedDateTbd ? '' : trimmedIsoDate,
    location: trimmedLocation || 'Location TBD',
    notes: trimmedNotes,
    playersNeeded: normalizedPlayersNeeded,
    targetTeamClubSlug: target?.clubSlug ?? '',
    targetTeamName: target?.name ?? '',
    targetTeamSlug: target?.teamSlug ?? '',
    timeLabel: normalizedDateTbd ? '' : trimmedTimeLabel,
    updatedAt: serverTimestamp(),
    visibility: normalizedVisibility,
  });
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

export function subscribeChallengeHub({ challengeClubSlug, clubSlug, teamSlug }, onChange, onError) {
  requireDb();

  if (!challengeClubSlug || challengeClubSlug === INDEPENDENT_CLUB.slug || !clubSlug || !teamSlug) {
    onChange({ clubChallenges: [], teamChallenges: [] });
    return () => {};
  }

  return onSnapshot(
    collection(db, 'clubs', challengeClubSlug, 'challenges'),
    (snapshot) => {
      const challenges = snapshot.docs.map((entry) => normalizeChallenge(entry, challengeClubSlug));
      challenges.sort((left, right) => (right.createdAtMs || 0) - (left.createdAtMs || 0));

      onChange({
        clubChallenges: challenges.filter(
          (challenge) =>
            challenge.status === 'open' &&
            challenge.visibility === 'open' &&
            (challenge.createdByTeamClubSlug !== clubSlug || challenge.createdByTeamSlug !== teamSlug),
        ),
        teamChallenges: challenges.filter(
          (challenge) =>
            (challenge.createdByTeamClubSlug === clubSlug && challenge.createdByTeamSlug === teamSlug) ||
            (challenge.targetTeamClubSlug === clubSlug && challenge.targetTeamSlug === teamSlug) ||
            (challenge.acceptedByTeamClubSlug === clubSlug && challenge.acceptedByTeamSlug === teamSlug),
        ),
      });
    },
    onError,
  );
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

export async function acceptChallenge({ acceptedByPlayerId = '', challengeId, challengeClubSlug, clubSlug, teamSlug, user }) {
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
  const [createdByPlayers, acceptedByPlayers] = await Promise.all([
    listActiveTeamRosterPlayers(createdByTeam.clubSlug, createdByTeam.teamSlug),
    listActiveTeamRosterPlayers(acceptedByTeam.clubSlug, acceptedByTeam.teamSlug),
  ]);
  let createdByRosterPlayers = createdByPlayers;
  let acceptedByRosterPlayers = acceptedByPlayers;
  let acceptedByPlayer = null;

  if (challenge.playersNeeded === 1) {
    const createdByPlayer = requireRosterPlayer(
      createdByPlayers,
      challenge.createdByPlayerId,
      'The challenging team must choose a singles player before this challenge can be accepted.',
    );
    acceptedByPlayer = requireRosterPlayer(
      acceptedByPlayers,
      acceptedByPlayerId,
      'Choose who will play singles for your team.',
    );
    createdByRosterPlayers = [createdByPlayer];
    acceptedByRosterPlayers = [acceptedByPlayer];
  } else {
    if (createdByPlayers.length < 2 || acceptedByPlayers.length < 2) {
      throw new Error('Both teams need two active members before accepting a doubles challenge.');
    }

    createdByRosterPlayers = createdByPlayers.slice(0, 2);
    acceptedByRosterPlayers = acceptedByPlayers.slice(0, 2);
  }

  const homeGameId = `challenge-${challengeId}-${createdByTeam.teamSlug}`;
  const awayGameId = `challenge-${challengeId}-${acceptedByTeam.teamSlug}`;
  const batch = writeBatch(db);

  batch.update(challengeRef, {
    acceptedAt: serverTimestamp(),
    acceptedByTeamClubSlug: acceptedByTeam.clubSlug,
    acceptedByTeamName: acceptedByTeam.name,
    acceptedByTeamSlug: acceptedByTeam.teamSlug,
    acceptedByUid: user.uid,
    acceptedByPlayerId: acceptedByPlayer?.id ?? '',
    acceptedByPlayerName: acceptedByPlayer ? getPlayerDisplayName(acceptedByPlayer) : '',
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
      rosterPlayers: createdByRosterPlayers,
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
      rosterPlayers: acceptedByRosterPlayers,
      user,
    }),
  );

  await batch.commit();

  const captainNotificationFields = await getTeamCaptainNotificationFields(createdByTeam.clubSlug, createdByTeam.teamSlug);

  await createAdminNotification({
    ...captainNotificationFields,
    clubSlug: createdByTeam.clubSlug,
    message: `${acceptedByTeam.name || acceptedByTeam.teamSlug} accepted the challenge from ${createdByTeam.name || createdByTeam.teamSlug}.`,
    teamName: createdByTeam.name || createdByTeam.teamSlug,
    teamSlug: createdByTeam.teamSlug,
    title: 'Team challenge accepted',
    type: 'challenge.accepted',
    user,
    metadata: {
      acceptedByTeamClubSlug: acceptedByTeam.clubSlug,
      acceptedByTeamName: acceptedByTeam.name || acceptedByTeam.teamSlug,
      acceptedByTeamSlug: acceptedByTeam.teamSlug,
      challengeClubSlug,
      challengeId,
      challengePath: `/c/${createdByTeam.clubSlug}/t/${createdByTeam.teamSlug}/challenges`,
      challengedTeamClubSlug: acceptedByTeam.clubSlug,
      challengedTeamName: acceptedByTeam.name || acceptedByTeam.teamSlug,
      challengedTeamSlug: acceptedByTeam.teamSlug,
      challengerTeamClubSlug: createdByTeam.clubSlug,
      challengerTeamName: createdByTeam.name || createdByTeam.teamSlug,
      challengerTeamSlug: createdByTeam.teamSlug,
      dateLabel: challenge.dateTbd ? 'Date TBD' : challenge.isoDate || 'Date TBD',
      dateTbd: challenge.dateTbd,
      homeGameId,
      awayGameId,
      isoDate: challenge.dateTbd ? '' : challenge.isoDate,
      location: challenge.location || 'Location TBD',
      notes: challenge.notes || '',
      playersNeeded: normalizeMatchPlayerCount(challenge.playersNeeded),
      timeLabel: challenge.dateTbd ? 'Time TBD' : challenge.timeLabel || 'Time TBD',
    },
  });

  await logActivityBestEffort({
    actorId: user.uid,
    clubId: challengeClubSlug,
    metadata: {
      acceptedByTeamClubSlug: acceptedByTeam.clubSlug,
      acceptedByTeamId: acceptedByTeam.teamSlug,
      acceptedByTeamName: acceptedByTeam.name || acceptedByTeam.teamSlug,
      acceptedByTeamSlug: acceptedByTeam.teamSlug,
      awayGameId,
      challengeId,
      challengerTeamClubSlug: createdByTeam.clubSlug,
      challengerTeamId: createdByTeam.teamSlug,
      challengerTeamName: createdByTeam.name || createdByTeam.teamSlug,
      challengerTeamSlug: createdByTeam.teamSlug,
      homeGameId,
      matchType: 'club_challenge',
      proposedDate: challenge.dateTbd ? 'Date TBD' : challenge.isoDate || 'Date TBD',
      timeLabel: challenge.dateTbd ? 'Time TBD' : challenge.timeLabel || 'Time TBD',
    },
    targetId: challengeId,
    teamId: acceptedByTeam.teamSlug,
    type: ACTIVITY_TYPES.CHALLENGE_ACCEPTED,
  });

  await logActivityBestEffort({
    actorId: user.uid,
    clubId: challengeClubSlug,
    metadata: {
      challengeId,
      dateLabel: challenge.dateTbd ? 'Date TBD' : challenge.isoDate || 'Date TBD',
      awayGameId,
      homeGameId,
      location: challenge.location || 'Location TBD',
      matchType: 'club_challenge',
      opponentName: acceptedByTeam.name || acceptedByTeam.teamSlug,
      teamAClubSlug: createdByTeam.clubSlug,
      teamAId: createdByTeam.teamSlug,
      teamAName: createdByTeam.name || createdByTeam.teamSlug,
      teamASlug: createdByTeam.teamSlug,
      teamBClubSlug: acceptedByTeam.clubSlug,
      teamBId: acceptedByTeam.teamSlug,
      teamBName: acceptedByTeam.name || acceptedByTeam.teamSlug,
      teamBSlug: acceptedByTeam.teamSlug,
      teamName: createdByTeam.name || createdByTeam.teamSlug,
      timeLabel: challenge.dateTbd ? 'Time TBD' : challenge.timeLabel || 'Time TBD',
    },
    targetId: homeGameId,
    teamId: createdByTeam.teamSlug,
    type: ACTIVITY_TYPES.MATCH_SCHEDULED,
  });
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

  await logActivityBestEffort({
    actorId: user.uid,
    clubId: challengeClubSlug,
    metadata: {
      challengeId,
      challengerTeamClubSlug: challenge.createdByTeamClubSlug,
      challengerTeamId: challenge.createdByTeamSlug,
      challengerTeamName: challenge.createdByTeamName || challenge.createdByTeamSlug,
      declinedByTeamClubSlug: clubSlug,
      declinedByTeamId: teamSlug,
      declinedByTeamName: challenge.targetTeamName || teamSlug,
      declinedByTeamSlug: teamSlug,
      matchType: 'club_challenge',
    },
    targetId: challengeId,
    teamId: teamSlug,
    type: ACTIVITY_TYPES.CHALLENGE_DECLINED,
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

  if (challenge.visibility === 'targeted' && challenge.targetTeamClubSlug && challenge.targetTeamSlug) {
    const captainNotificationFields = await getTeamCaptainNotificationFields(
      challenge.targetTeamClubSlug,
      challenge.targetTeamSlug,
    );

    await createAdminNotification({
      ...captainNotificationFields,
      clubSlug: challenge.targetTeamClubSlug,
      message: `${challenge.createdByTeamName || challenge.createdByTeamSlug} cancelled their challenge to ${challenge.targetTeamName || challenge.targetTeamSlug}.`,
      teamName: challenge.targetTeamName || challenge.targetTeamSlug,
      teamSlug: challenge.targetTeamSlug,
      title: 'Team challenge cancelled',
      type: 'challenge.cancelled',
      user,
      metadata: {
        challengeClubSlug,
        challengeId,
        challengePath: `/c/${challenge.targetTeamClubSlug}/t/${challenge.targetTeamSlug}/challenges`,
        challengedTeamClubSlug: challenge.targetTeamClubSlug,
        challengedTeamName: challenge.targetTeamName || challenge.targetTeamSlug,
        challengedTeamSlug: challenge.targetTeamSlug,
        challengerTeamClubSlug: challenge.createdByTeamClubSlug,
        challengerTeamName: challenge.createdByTeamName || challenge.createdByTeamSlug,
        challengerTeamSlug: challenge.createdByTeamSlug,
        dateLabel: challenge.dateTbd ? 'Date TBD' : challenge.isoDate || 'Date TBD',
        dateTbd: challenge.dateTbd,
        isoDate: challenge.dateTbd ? '' : challenge.isoDate,
        location: challenge.location || 'Location TBD',
        notes: challenge.notes || '',
        playersNeeded: normalizeMatchPlayerCount(challenge.playersNeeded),
        timeLabel: challenge.dateTbd ? 'Time TBD' : challenge.timeLabel || 'Time TBD',
      },
    });
  }
}

export async function rotateTeamJoinCode({ clubSlug, teamSlug }) {
  requireDb();

  const nextJoinCode = makeJoinCode(teamSlug);
  const teamRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug);
  const teamSnapshot = await getDoc(teamRef);
  const memberCount = Number(teamSnapshot.data()?.memberCount ?? 0);

  if (memberCount >= TEAM_MEMBER_LIMIT) {
    throw new Error('This team already has two members, so new joins are disabled.');
  }

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

function normalizeCourtLabels(courtLabels = [], numberOfCourts = '') {
  const parsedCourtCount = normalizeNullableNumber(numberOfCourts);
  const fallbackCount = Number.isInteger(parsedCourtCount) && parsedCourtCount > 0 ? parsedCourtCount : 0;
  const sourceLabels = Array.isArray(courtLabels)
    ? courtLabels
    : String(courtLabels ?? '')
        .split(/[\n,]+/)
        .map((label) => label.trim());
  const labels = sourceLabels
    .map((label) => String(label ?? '').trim())
    .filter(Boolean);

  if (labels.length) {
    return labels.slice(0, fallbackCount || labels.length);
  }

  return Array.from({ length: fallbackCount }, (_, index) => String(index + 1));
}

function normalizeMatchScores(scores = []) {
  if (!Array.isArray(scores)) {
    return [];
  }

  return scores
    .slice(0, 3)
    .map((score) => ({
      opponentScore: normalizeNullableNumber(score?.opponentScore),
      teamScore: normalizeNullableNumber(score?.teamScore),
    }))
    .filter((score) => score.teamScore !== null || score.opponentScore !== null);
}

function summarizeMatchScores(scores = []) {
  return scores.reduce(
    (summary, score) => {
      if (score.teamScore === null || score.opponentScore === null || score.teamScore === score.opponentScore) {
        return summary;
      }

      if (score.teamScore > score.opponentScore) {
        summary.teamSetsWon += 1;
      } else {
        summary.opponentSetsWon += 1;
      }

      summary.hasWinner = true;
      return summary;
    },
    {
      hasWinner: false,
      opponentSetsWon: 0,
      teamSetsWon: 0,
    },
  );
}

function formatSetScoreLabel(scores = []) {
  return scores
    .filter((score) => score.teamScore !== null && score.opponentScore !== null)
    .map((score) => `${score.teamScore}-${score.opponentScore}`)
    .join(', ');
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

function cleanActivityMetadata(metadata = {}) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => value !== undefined),
  );
}

function normalizeActivity(entry) {
  const data = entry.data();

  return {
    actorId: data.actorId ?? '',
    clubId: data.clubId ?? '',
    id: entry.id,
    metadata: data.metadata ?? {},
    targetId: data.targetId ?? '',
    teamId: data.teamId ?? '',
    timestampMs: normalizeTimestampMs(data.timestamp),
    type: data.type ?? '',
  };
}

function teamLabel(value, fallback = 'Unknown team') {
  return value || fallback;
}

export function formatActivity(activity) {
  const metadata = activity?.metadata ?? {};

  switch (activity?.type) {
    case ACTIVITY_TYPES.CHALLENGE_CREATED:
      return `${teamLabel(metadata.challengerTeamName)} challenged ${teamLabel(metadata.opponentTeamName)}`;
    case ACTIVITY_TYPES.CHALLENGE_ACCEPTED:
      return `${teamLabel(metadata.acceptedByTeamName)} accepted ${teamLabel(metadata.challengerTeamName)}'s challenge`;
    case ACTIVITY_TYPES.CHALLENGE_DECLINED:
      return `${teamLabel(metadata.declinedByTeamName)} declined ${teamLabel(metadata.challengerTeamName)}'s challenge`;
    case ACTIVITY_TYPES.MATCH_SCHEDULED:
      if (metadata.matchType === 'club_challenge' && metadata.teamAName && metadata.teamBName) {
        return `${metadata.teamAName} scheduled a match against ${metadata.teamBName}`;
      }

      return `${teamLabel(metadata.teamName)} scheduled a match against ${teamLabel(metadata.opponentName, metadata.opponent || 'TBD')}`;
    case ACTIVITY_TYPES.MATCH_COMPLETED:
      if (metadata.winnerTeamName) {
        return `${metadata.winnerTeamName} defeated ${metadata.loserTeamName || metadata.opponentName || 'their opponent'} ${metadata.scoreLabel || ''}`.trim();
      }

      return `${teamLabel(metadata.teamName)} completed a match against ${teamLabel(metadata.opponentName, metadata.opponent || 'TBD')} ${metadata.scoreLabel || ''}`.trim();
    case ACTIVITY_TYPES.SCORE_REPORTED:
      return `${teamLabel(metadata.teamName)} reported a score against ${teamLabel(metadata.opponentName, metadata.opponent || 'TBD')}`;
    case ACTIVITY_TYPES.TEAM_CREATED:
      return `${teamLabel(metadata.teamName)} was created`;
    case ACTIVITY_TYPES.PLAYER_ADDED:
      return `${metadata.playerName || 'A player'} was added to ${teamLabel(metadata.teamName)}`;
    case ACTIVITY_TYPES.PLAYER_JOINED_TEAM:
      return `${metadata.playerName || 'A player'} joined ${teamLabel(metadata.teamName)}`;
    case ACTIVITY_TYPES.EVENT_CREATED:
      return `${metadata.eventTitle || 'An event'} was created`;
    case ACTIVITY_TYPES.EVENT_REGISTERED:
      return `${metadata.registrantName || 'A player'} registered for ${metadata.eventTitle || 'an event'}`;
    case ACTIVITY_TYPES.STANDINGS_UPDATED:
      return `${metadata.clubName || activity?.clubId || 'Club'} standings were updated`;
    default:
      return 'Activity logged';
  }
}

export async function logActivity({
  actorId,
  clubId,
  metadata = {},
  targetId = '',
  teamId = '',
  type,
}) {
  requireDb();

  if (!ACTIVITY_TYPE_VALUES.includes(type)) {
    throw new Error('Choose a valid activity type.');
  }

  if (!clubId?.trim()) {
    throw new Error('Activity logs require a club.');
  }

  if (!actorId?.trim()) {
    throw new Error('Activity logs require an actor.');
  }

  const activityRef = doc(collection(db, 'activityLogs'));

  await setDoc(activityRef, {
    actorId: actorId.trim(),
    clubId: clubId.trim(),
    metadata: cleanActivityMetadata(metadata),
    targetId: targetId?.trim?.() ?? '',
    teamId: teamId?.trim?.() ?? '',
    timestamp: serverTimestamp(),
    type,
  });

  return activityRef.id;
}

async function logActivityBestEffort(payload) {
  try {
    await logActivity(payload);
  } catch (activityError) {
    console.warn('Unable to log activity.', activityError);
  }
}

export async function listAdminActivity({
  clubId = '',
  endDate = '',
  limitCount = 100,
  startDate = '',
  teamId = '',
  type = '',
  user,
} = {}) {
  requireDb();

  if (!(await isPlatformAdmin(user?.uid, user?.email))) {
    throw new Error('Only the app admin can view activity.');
  }

  const cappedLimit = Math.min(Math.max(Number(limitCount) || 100, 1), 100);
  const snapshot = await getDocs(
    query(collection(db, 'activityLogs'), orderBy('timestamp', 'desc'), limitDocs(cappedLimit)),
  );
  const startMs = startDate ? new Date(`${startDate}T00:00:00`).getTime() : 0;
  const endMs = endDate ? new Date(`${endDate}T23:59:59`).getTime() : 0;

  return snapshot.docs
    .map(normalizeActivity)
    .filter((activity) => !type || activity.type === type)
    .filter((activity) => !clubId || activity.clubId === clubId)
    .filter((activity) => !teamId || activity.teamId === teamId)
    .filter((activity) => !startMs || activity.timestampMs >= startMs)
    .filter((activity) => !endMs || activity.timestampMs <= endMs)
    .map((activity) => ({
      ...activity,
      description: formatActivity(activity),
    }));
}

export async function listClubActivity({ clubSlug, limitCount = 75, teamOnly = false, teamSlug = '', user } = {}) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to view activity.');
  }

  if (!clubSlug) {
    throw new Error('Choose a club to view activity.');
  }

  const cappedLimit = Math.min(Math.max(Number(limitCount) || 75, 1), 100);
  const filters = [where('clubId', '==', clubSlug)];

  if (teamOnly && teamSlug) {
    filters.push(where('teamId', '==', teamSlug));
  }

  const snapshot = await getDocs(
    query(
      collection(db, 'activityLogs'),
      ...filters,
    ),
  );

  return snapshot.docs
    .map((entry) => {
      const activity = normalizeActivity(entry);

      return {
        ...activity,
        description: formatActivity(activity),
      };
    })
    .sort((left, right) => right.timestampMs - left.timestampMs)
    .slice(0, cappedLimit);
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
      email: data.email ?? '',
      firstName,
      fullName: data.fullName ?? buildFullName(firstName, lastName),
      headshotPath: data.headshotPath ?? '',
      headshotUrl: data.headshotUrl ?? '',
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
  notes = '',
  playerId,
  teamSlug,
}) {
  requireDb();

  if (!playerId) {
    throw new Error('Players must join the team before their profile can be edited.');
  }

  const playerRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'players', playerId);
  const playerSnapshot = await getDoc(playerRef);

  if (!playerSnapshot.exists()) {
    throw new Error('That player could not be found.');
  }

  await updateDoc(playerRef, {
    active,
    availableDays: normalizeAvailableDays(availableDays),
    notes: notes.trim(),
    updatedAt: serverTimestamp(),
  });

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
  const currentActiveMemberCount = members.filter((member) => member.status !== 'inactive').length;
  const nextActiveMemberCount =
    targetMember?.status === 'inactive' ? currentActiveMemberCount : Math.max(0, currentActiveMemberCount - 1);

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

  batch.update(doc(db, 'clubs', clubSlug, 'teams', teamSlug), {
    memberCount: nextActiveMemberCount,
    updatedAt: serverTimestamp(),
  });
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
  return Math.min(1, Math.max(1, Math.ceil(selectedCount / 2)));
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
      matchScores: normalizeMatchScores(data.matchScores),
      opponent: data.opponent ?? '',
      opponentScore: normalizeNullableNumber(data.opponentScore),
      pairings: normalizePairings(data.pairings, data.rosterPlayerIds ?? []),
      playersNeeded: normalizeMatchPlayerCount(data.playersNeeded),
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
      challengeClubSlug: data.challengeClubSlug ?? '',
      challengeId: data.challengeId ?? '',
      linkedGameId: data.linkedGameId ?? '',
      linkedTeamClubSlug: data.linkedTeamClubSlug ?? '',
      linkedTeamLogoUrl: data.linkedTeamLogoUrl ?? '',
      linkedTeamName: data.linkedTeamName ?? '',
      linkedRosterPlayers: [],
      linkedTeamSlug: data.linkedTeamSlug ?? '',
      source: data.source ?? 'manual',
      sourceTeamLogoUrl: data.sourceTeamLogoUrl ?? '',
    };
  });

  const currentTeamSnap = await getDoc(doc(db, 'clubs', clubSlug, 'teams', teamSlug));
  const currentTeamLogo = currentTeamSnap.exists() ? (currentTeamSnap.data().logoUrl ?? '').trim() : '';
  const linkedTeamKeys = new Map();

  games.forEach((game) => {
    if (game.source !== 'challenge') {
      return;
    }

    if (!(game.sourceTeamLogoUrl ?? '').trim() && currentTeamLogo) {
      game.sourceTeamLogoUrl = currentTeamLogo;
    }

    if (game.linkedTeamClubSlug && game.linkedTeamSlug) {
      const key = `${game.linkedTeamClubSlug}::${game.linkedTeamSlug}`;
      linkedTeamKeys.set(key, {
        clubSlug: game.linkedTeamClubSlug,
        teamSlug: game.linkedTeamSlug,
      });
    }
  });

  if (linkedTeamKeys.size > 0) {
    const entries = [...linkedTeamKeys.values()];
    const [linkedSnaps, linkedPlayerGroups, linkedMemberGroups] = await Promise.all([
      Promise.all(
        entries.map(({ clubSlug: linkedClub, teamSlug: linkedTeam }) =>
          getDoc(doc(db, 'clubs', linkedClub, 'teams', linkedTeam)),
        ),
      ),
      Promise.all(
        entries.map(({ clubSlug: linkedClub, teamSlug: linkedTeam }) =>
          getDocs(collection(db, 'clubs', linkedClub, 'teams', linkedTeam, 'players')).catch(() => null),
        ),
      ),
      Promise.all(
        entries.map(({ clubSlug: linkedClub, teamSlug: linkedTeam }) =>
          getDocs(collection(db, 'clubs', linkedClub, 'teams', linkedTeam, 'members')).catch(() => null),
        ),
      ),
    ]);
    const logoByKey = new Map();
    const playersByKey = new Map();

    entries.forEach((entry, index) => {
      const key = `${entry.clubSlug}::${entry.teamSlug}`;
      const snap = linkedSnaps[index];
      const url = snap.exists() ? (snap.data().logoUrl ?? '').trim() : '';
      const roleByPlayerId = new Map();

      (linkedMemberGroups[index]?.docs ?? []).forEach((memberDoc) => {
        const member = memberDoc.data();
        const playerId = member.playerId || memberDoc.id;

        if (playerId) {
          roleByPlayerId.set(playerId, member.role ?? '');
        }
      });

      logoByKey.set(key, url);
      playersByKey.set(
        key,
        new Map(
          (linkedPlayerGroups[index]?.docs ?? []).map((playerDoc) => {
            const player = playerDoc.data();
            const firstName = (player.firstName ?? '').trim();
            const lastName = (player.lastName ?? '').trim();

            return [
              playerDoc.id,
              {
                fullName: player.fullName ?? buildFullName(firstName, lastName),
                headshotUrl: player.headshotUrl ?? '',
                id: playerDoc.id,
                memberRole: roleByPlayerId.get(playerDoc.id) ?? '',
              },
            ];
          }),
        ),
      );
    });

    const linkedGameLookups = games
      .filter((game) => game.source === 'challenge' && game.linkedTeamClubSlug && game.linkedTeamSlug && game.linkedGameId)
      .map((game) =>
        getDoc(doc(db, 'clubs', game.linkedTeamClubSlug, 'teams', game.linkedTeamSlug, 'games', game.linkedGameId))
          .then((snapshot) => ({ game, snapshot }))
          .catch(() => ({ game, snapshot: null })),
      );
    const linkedGameSnapshots = await Promise.all(linkedGameLookups);

    games.forEach((game) => {
      const key = `${game.linkedTeamClubSlug}::${game.linkedTeamSlug}`;
      const url = logoByKey.get(key);

      if (!(game.linkedTeamLogoUrl ?? '').trim() && url) {
        game.linkedTeamLogoUrl = url;
      }
    });

    linkedGameSnapshots.forEach(({ game, snapshot }) => {
      if (!snapshot?.exists()) {
        return;
      }

      const key = `${game.linkedTeamClubSlug}::${game.linkedTeamSlug}`;
      const linkedPlayers = playersByKey.get(key) ?? new Map();
      const linkedRosterPlayerIds = normalizePlayerIdList(snapshot.data().rosterPlayerIds);

      game.linkedRosterPlayers = linkedRosterPlayerIds
        .map((playerId) => linkedPlayers.get(playerId))
        .filter(Boolean);
    });
  }

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
  matchScores = [],
  opponent,
  opponentScore,
  playersNeeded = 2,
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
  const existingGameSnapshot = gameId ? await getDoc(gameRef) : null;
  const existingGame = existingGameSnapshot?.exists() ? existingGameSnapshot.data() : null;
  const normalizedTeamScore = normalizeNullableNumber(teamScore);
  const normalizedOpponentScore = normalizeNullableNumber(opponentScore);
  const normalizedMatchScores = normalizeMatchScores(matchScores);
  const matchScoreSummary = summarizeMatchScores(normalizedMatchScores);
  const scoreFromSets = normalizedMatchScores.length > 0 && matchScoreSummary.hasWinner;
  const finalTeamScore = scoreFromSets ? matchScoreSummary.teamSetsWon : normalizedTeamScore;
  const finalOpponentScore = scoreFromSets ? matchScoreSummary.opponentSetsWon : normalizedOpponentScore;
  const normalizedPlayersNeeded = normalizeMatchPlayerCount(playersNeeded);
  const finalStatus =
    matchStatus === 'completed' ||
    (finalTeamScore !== null && finalOpponentScore !== null)
      ? 'completed'
      : 'scheduled';
  const result = deriveMatchResult(finalStatus, finalTeamScore, finalOpponentScore);
  const payload = {
    dateLabel: normalizedDateTbd ? 'Date TBD' : trimmedIsoDate,
    dateTbd: normalizedDateTbd,
    isoDate: normalizedDateTbd ? '' : trimmedIsoDate,
    location: trimmedLocation || 'Location TBD',
    matchStatus: finalStatus,
    matchScores: normalizedMatchScores,
    opponent: trimmedOpponent,
    opponentScore: finalOpponentScore,
    playersNeeded: normalizedPlayersNeeded,
    result,
    teamScore: finalTeamScore,
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

  const existingTeamScore = normalizeNullableNumber(existingGame?.teamScore);
  const existingOpponentScore = normalizeNullableNumber(existingGame?.opponentScore);
  const existingMatchScores = normalizeMatchScores(existingGame?.matchScores);
  const wasCompleted =
    existingGame?.matchStatus === 'completed' ||
    (existingTeamScore !== null && existingOpponentScore !== null);
  const scoreChanged =
    existingTeamScore !== finalTeamScore ||
    existingOpponentScore !== finalOpponentScore ||
    JSON.stringify(existingMatchScores) !== JSON.stringify(normalizedMatchScores);
  const shouldLogScheduled = !gameId && finalStatus === 'scheduled';
  const shouldLogCompleted = finalStatus === 'completed' && (!wasCompleted || scoreChanged);

  if (shouldLogScheduled || shouldLogCompleted) {
    const teamSnapshot = await getDoc(doc(db, 'clubs', clubSlug, 'teams', teamSlug));
    const teamData = teamSnapshot.exists() ? teamSnapshot.data() : {};
    const teamName = teamData.name ?? teamSlug;
    const activityClubSlug =
      teamData.affiliationStatus === 'approved' && teamData.approvedClubSlug && teamData.approvedClubSlug !== 'independent'
        ? teamData.approvedClubSlug
        : clubSlug;
    const activityClubName = teamData.approvedClubName ?? teamData.clubName ?? activityClubSlug;
    const scoreLabel =
      normalizedMatchScores.length > 0
        ? formatSetScoreLabel(normalizedMatchScores)
        : finalTeamScore !== null && finalOpponentScore !== null
          ? `${finalTeamScore}-${finalOpponentScore}`
        : '';
    const winnerTeamName =
      result === 'win'
        ? teamName
        : result === 'loss'
          ? trimmedOpponent
          : '';
    const loserTeamName =
      result === 'win'
        ? trimmedOpponent
        : result === 'loss'
          ? teamName
          : '';

    if (shouldLogScheduled) {
      await logActivityBestEffort({
        actorId: user?.uid ?? '',
        clubId: activityClubSlug,
        metadata: {
          clubName: activityClubName,
          dateLabel: normalizedDateTbd ? 'Date TBD' : trimmedIsoDate,
          gameId: nextGameId,
          location: trimmedLocation || 'Location TBD',
          opponentName: trimmedOpponent,
          playersNeeded: normalizedPlayersNeeded,
          teamName,
          timeLabel: normalizedDateTbd ? 'Time TBD' : trimmedTimeLabel || 'Time TBD',
        },
        targetId: nextGameId,
        teamId: teamSlug,
        type: ACTIVITY_TYPES.MATCH_SCHEDULED,
      });
    }

    if (shouldLogCompleted) {
      const matchMetadata = {
        clubName: activityClubName,
        gameId: nextGameId,
        loserTeamName,
        opponentName: trimmedOpponent,
        scoreA: finalTeamScore,
        scoreB: finalOpponentScore,
        scoreLabel,
        teamAId: teamSlug,
        teamAName: teamName,
        teamBId: existingGame?.linkedTeamSlug ?? '',
        teamBName: trimmedOpponent,
        teamName,
        winnerTeamId: result === 'win' ? teamSlug : existingGame?.linkedTeamSlug ?? '',
        winnerTeamName,
      };

      await logActivityBestEffort({
        actorId: user?.uid ?? '',
        clubId: activityClubSlug,
        metadata: matchMetadata,
        targetId: nextGameId,
        teamId: teamSlug,
        type: ACTIVITY_TYPES.SCORE_REPORTED,
      });

      await logActivityBestEffort({
        actorId: user?.uid ?? '',
        clubId: activityClubSlug,
        metadata: matchMetadata,
        targetId: nextGameId,
        teamId: teamSlug,
        type: ACTIVITY_TYPES.MATCH_COMPLETED,
      });
    }
  }

  return nextGameId;
}

function gameHasScore(game) {
  return (
    game.matchStatus === 'completed' ||
    game.teamScore !== null ||
    game.opponentScore !== null ||
    normalizeMatchScores(game.matchScores).length > 0
  );
}

export async function deleteGame({ clubSlug, gameId, teamSlug, user }) {
  requireDb();

  if (!gameId) {
    throw new Error('Choose a matchup to delete.');
  }

  await requireTeamManager({ clubSlug, teamSlug, user });

  const gameRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'games', gameId);
  const gameSnapshot = await getDoc(gameRef);

  if (!gameSnapshot.exists()) {
    return;
  }

  const game = {
    id: gameSnapshot.id,
    ...gameSnapshot.data(),
    opponentScore: normalizeNullableNumber(gameSnapshot.data().opponentScore),
    teamScore: normalizeNullableNumber(gameSnapshot.data().teamScore),
  };

  if (game.source !== 'challenge') {
    await deleteDoc(gameRef);
    return;
  }

  if (gameHasScore(game)) {
    throw new Error('Completed challenge matches cannot be deleted. Contact the app admin if this result needs correction.');
  }

  if (!game.challengeClubSlug || !game.challengeId || !game.linkedGameId || !game.linkedTeamClubSlug || !game.linkedTeamSlug) {
    throw new Error('This challenge match is missing linked schedule details. Contact the app admin before deleting it.');
  }

  const linkedGameRef = doc(db, 'clubs', game.linkedTeamClubSlug, 'teams', game.linkedTeamSlug, 'games', game.linkedGameId);
  const challengeRef = doc(db, 'clubs', game.challengeClubSlug, 'challenges', game.challengeId);
  const [linkedGameSnapshot, challengeSnapshot] = await Promise.all([
    getDoc(linkedGameRef),
    getDoc(challengeRef),
  ]);
  const linkedGameData = linkedGameSnapshot.exists() ? linkedGameSnapshot.data() : null;

  if (
    linkedGameData &&
    gameHasScore({
      matchStatus: linkedGameData.matchStatus ?? 'scheduled',
      opponentScore: normalizeNullableNumber(linkedGameData.opponentScore),
      teamScore: normalizeNullableNumber(linkedGameData.teamScore),
    })
  ) {
    throw new Error('Completed challenge matches cannot be deleted. Contact the app admin if this result needs correction.');
  }

  const batch = writeBatch(db);
  batch.delete(gameRef);

  if (linkedGameSnapshot.exists()) {
    batch.delete(linkedGameRef);
  }

  if (challengeSnapshot.exists()) {
    batch.update(challengeRef, {
      cancelledAt: serverTimestamp(),
      homeGameId: '',
      awayGameId: '',
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  }

  await batch.commit();

  const captainNotificationFields = await getTeamCaptainNotificationFields(game.linkedTeamClubSlug, game.linkedTeamSlug);
  const teamSnapshot = await getDoc(doc(db, 'clubs', clubSlug, 'teams', teamSlug));
  const teamName = teamSnapshot.exists() ? teamSnapshot.data().name ?? teamSlug : teamSlug;

  await createAdminNotification({
    ...captainNotificationFields,
    clubSlug: game.linkedTeamClubSlug,
    message: `${teamName} removed the accepted challenge match against ${game.linkedTeamName || game.linkedTeamSlug}.`,
    teamName: game.linkedTeamName || game.linkedTeamSlug,
    teamSlug: game.linkedTeamSlug,
    title: 'Challenge match removed',
    type: 'challenge.matchRemoved',
    user,
    metadata: {
      challengeClubSlug: game.challengeClubSlug,
      challengeId: game.challengeId,
      challengePath: `/c/${game.linkedTeamClubSlug}/t/${game.linkedTeamSlug}/challenges`,
      removedByTeamClubSlug: clubSlug,
      removedByTeamName: teamName,
      removedByTeamSlug: teamSlug,
      affectedTeamClubSlug: game.linkedTeamClubSlug,
      affectedTeamName: game.linkedTeamName || game.linkedTeamSlug,
      affectedTeamSlug: game.linkedTeamSlug,
      gameId,
      linkedGameId: game.linkedGameId,
      isoDate: game.dateTbd ? '' : game.isoDate ?? '',
      location: game.location ?? 'Location TBD',
      opponent: game.opponent ?? '',
      playersNeeded: normalizeMatchPlayerCount(game.playersNeeded),
      timeLabel: game.dateTbd ? 'Time TBD' : game.timeLabel || 'Time TBD',
    },
  });
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
  const gameRef = doc(db, 'clubs', clubSlug, 'teams', teamSlug, 'games', gameId);

  const gameSnapshot = await getDoc(gameRef);
  const playersNeeded = normalizeMatchPlayerCount(gameSnapshot.data()?.playersNeeded);

  if (normalizedRosterPlayerIds.length > playersNeeded) {
    throw new Error(`Choose up to ${playersNeeded} players for this match roster.`);
  }

  const normalizedPairings = normalizePairings(pairings, normalizedRosterPlayerIds);

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

function normalizeNewsCommentEntry(commentEntry) {
  const comment = commentEntry.data();

  return {
    authorName: comment.authorName ?? 'Teammate',
    authorPhotoUrl: comment.authorPhotoUrl ?? '',
    authorRole: comment.authorRole ?? '',
    authorUid: comment.authorUid ?? comment.createdBy ?? '',
    body: (comment.body ?? '').trim(),
    createdAtMs: normalizeTimestampMs(comment.createdAt),
    id: commentEntry.id,
    updatedAtMs: normalizeTimestampMs(comment.updatedAt),
    updatedBy: comment.updatedBy ?? '',
  };
}

function normalizeNewsReactionEntry(reactionEntry) {
  const reaction = reactionEntry.data();

  return {
    createdAtMs: normalizeTimestampMs(reaction.createdAt),
    id: reactionEntry.id,
    type: reaction.type ?? 'like',
    uid: reaction.uid ?? reactionEntry.id,
  };
}

function normalizeNewsPostEntry(entry, teamSlug, comments = [], reactions = []) {
  const data = entry.data();

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
    teamName: data.teamName ?? '',
    teamSlug: data.teamSlug ?? teamSlug,
    title: (data.title ?? '').trim() || 'Community update',
    updatedAtMs: normalizeTimestampMs(data.updatedAt),
    updatedBy: data.updatedBy ?? '',
  };
}

function sortNewsPosts(posts) {
  return posts.sort((left, right) => (right.createdAtMs || right.updatedAtMs) - (left.createdAtMs || left.updatedAtMs));
}

export async function listNewsPosts(clubSlug, teamSlug) {
  requireDb();

  const newsRef = collection(db, 'clubs', clubSlug, 'newsPosts');
  const snapshot = await getDocs(newsRef);
  const posts = await Promise.all(snapshot.docs.map(async (entry) => {
    const [commentsSnapshot, reactionsSnapshot] = await Promise.all([
      getDocs(collection(entry.ref, 'comments')).catch(() => null),
      getDocs(collection(entry.ref, 'reactions')).catch(() => null),
    ]);
    const comments = (commentsSnapshot?.docs ?? [])
      .map(normalizeNewsCommentEntry)
      .sort((left, right) => (left.createdAtMs || 0) - (right.createdAtMs || 0));
    const reactions = (reactionsSnapshot?.docs ?? []).map(normalizeNewsReactionEntry);

    return normalizeNewsPostEntry(entry, teamSlug, comments, reactions);
  }));

  return sortNewsPosts(posts);
}

export function subscribeNewsPosts(clubSlug, teamSlug, onChange, onError) {
  requireDb();

  const newsRef = collection(db, 'clubs', clubSlug, 'newsPosts');
  const postEntries = new Map();
  const commentsByPost = new Map();
  const reactionsByPost = new Map();
  const childUnsubscribers = new Map();

  function emitPosts() {
    const posts = Array.from(postEntries.values()).map((entry) =>
      normalizeNewsPostEntry(
        entry,
        teamSlug,
        commentsByPost.get(entry.id) ?? [],
        reactionsByPost.get(entry.id) ?? [],
      ));

    onChange(sortNewsPosts(posts));
  }

  const unsubscribePosts = onSnapshot(
    newsRef,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        const postId = change.doc.id;

        if (change.type === 'removed') {
          postEntries.delete(postId);
          commentsByPost.delete(postId);
          reactionsByPost.delete(postId);
          childUnsubscribers.get(postId)?.forEach((unsubscribe) => unsubscribe());
          childUnsubscribers.delete(postId);
          return;
        }

        postEntries.set(postId, change.doc);

        if (!childUnsubscribers.has(postId)) {
          const unsubscribeComments = onSnapshot(
            collection(change.doc.ref, 'comments'),
            (commentsSnapshot) => {
              const comments = commentsSnapshot.docs
                .map(normalizeNewsCommentEntry)
                .sort((left, right) => (left.createdAtMs || 0) - (right.createdAtMs || 0));
              commentsByPost.set(postId, comments);
              emitPosts();
            },
            onError,
          );
          const unsubscribeReactions = onSnapshot(
            collection(change.doc.ref, 'reactions'),
            (reactionsSnapshot) => {
              reactionsByPost.set(postId, reactionsSnapshot.docs.map(normalizeNewsReactionEntry));
              emitPosts();
            },
            onError,
          );

          childUnsubscribers.set(postId, [unsubscribeComments, unsubscribeReactions]);
        }
      });

      emitPosts();
    },
    onError,
  );

  return () => {
    unsubscribePosts();
    childUnsubscribers.forEach((unsubscribers) => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    });
  };
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

  const sourceTeamSlug = post?.teamSlug || teamSlug;
  const [membership, platformAdmin] = await Promise.all([
    getMembership(clubSlug, sourceTeamSlug, user.uid, user),
    isPlatformAdmin(user.uid, user.email),
  ]);

  if (!membership && !platformAdmin) {
    throw new Error('You must be a team member to post in this feed.');
  }

  const normalizedTitle = (title || 'Team post').trim();
  const normalizedBody = body.trim();

  if (!normalizedBody && !imageFile && !post?.imageUrl) {
    throw new Error('Write a post or add a photo before sharing.');
  }

  const postId = post?.id ?? createNewsPostId(normalizedTitle);
  const postRef = doc(db, 'clubs', clubSlug, 'newsPosts', postId);
  let uploadedImage = null;

  if (imageFile) {
    uploadedImage = await uploadNewsImage({
      clubSlug,
      file: imageFile,
      postId,
      teamSlug: sourceTeamSlug,
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
    clubSlug,
    createdBy: post?.createdBy ?? user.uid,
    imagePath: uploadedImage?.imagePath ?? post?.imagePath ?? '',
    imageUrl: uploadedImage?.imageUrl ?? post?.imageUrl ?? '',
    linkUrl: normalizeUrl(linkUrl ?? ''),
    teamName: post?.teamName ?? membership?.teamName ?? sourceTeamSlug,
    teamSlug: sourceTeamSlug,
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

  const postRef = doc(db, 'clubs', clubSlug, 'newsPosts', post.id);
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

  const commentRef = doc(collection(db, 'clubs', clubSlug, 'newsPosts', postId, 'comments'));

  await setDoc(commentRef, {
    ...buildAuthorFromUser(user, membership?.role ?? ''),
    body: normalizedBody,
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    teamName: membership?.teamName ?? teamSlug,
    teamSlug,
  });

  return commentRef.id;
}

export async function deleteNewsComment({ clubSlug, commentId, postId, teamSlug }) {
  requireDb();

  await deleteDoc(doc(db, 'clubs', clubSlug, 'newsPosts', postId, 'comments', commentId));
}

export async function updateNewsComment({ body, clubSlug, commentId, postId, teamSlug, user }) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to edit a comment.');
  }

  const normalizedBody = body.trim();

  if (!normalizedBody) {
    throw new Error('Write a comment before saving.');
  }

  const commentRef = doc(db, 'clubs', clubSlug, 'newsPosts', postId, 'comments', commentId);
  const commentSnapshot = await getDoc(commentRef);
  const comment = commentSnapshot.exists() ? commentSnapshot.data() : null;

  if (!comment) {
    throw new Error('That comment could not be found.');
  }

  if ((comment.authorUid ?? comment.createdBy) !== user.uid) {
    throw new Error('Only the comment author can edit this comment.');
  }

  await updateDoc(commentRef, {
    body: normalizedBody,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
}

export async function toggleNewsReaction({ clubSlug, post, teamSlug, type = 'like', user }) {
  requireDb();

  if (!user?.uid) {
    throw new Error('You must be signed in to react.');
  }

  const reactionRef = doc(db, 'clubs', clubSlug, 'newsPosts', post.id, 'reactions', user.uid);
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

function normalizeEventStatus(status) {
  return ['draft', 'published', 'archived'].includes(status) ? status : 'draft';
}

function normalizeEventType(eventType) {
  return ['singleDay', 'multiDay', 'boxLeague'].includes(eventType) ? eventType : 'singleDay';
}

function normalizeEventBulletPoints(bulletPoints) {
  if (Array.isArray(bulletPoints)) {
    return bulletPoints.map((point) => String(point ?? '').trim()).filter(Boolean);
  }

  return String(bulletPoints ?? '')
    .split('\n')
    .map((point) => point.trim())
    .filter(Boolean);
}

function normalizeClubEvent(entry) {
  const data = entry.data();

  return {
    bulletPoints: normalizeEventBulletPoints(data.bulletPoints),
    costLabel: data.costLabel ?? '',
    createdAtMs: normalizeTimestampMs(data.createdAt),
    createdBy: data.createdBy ?? '',
    description: data.description ?? '',
    detailsHeading: data.detailsHeading ?? '',
    endDate: data.endDate ?? '',
    eventType: normalizeEventType(data.eventType),
    flyerImagePath: data.flyerImagePath ?? '',
    flyerImageUrl: data.flyerImageUrl ?? '',
    id: entry.id,
    locationLabel: data.locationLabel ?? '',
    registrationInfo: data.registrationInfo ?? '',
    registrationUrl: data.registrationUrl ?? '',
    startDate: data.startDate ?? '',
    status: normalizeEventStatus(data.status),
    timeLabel: data.timeLabel ?? '',
    title: data.title ?? entry.id,
    updatedAtMs: normalizeTimestampMs(data.updatedAt),
    updatedBy: data.updatedBy ?? '',
  };
}

function isClubEventUpcoming(event) {
  const today = new Date().toISOString().slice(0, 10);
  const eventEndDate = event.endDate || event.startDate;

  return !eventEndDate || eventEndDate >= today;
}

export async function listClubEvents({ clubSlug, includeDrafts = false, user = null }) {
  requireDb();

  if (!clubSlug || clubSlug === INDEPENDENT_CLUB.slug) {
    return [];
  }

  const canManage = includeDrafts ? await canManageClub({ clubSlug, user }) : false;
  const eventsRef = collection(db, 'clubs', clubSlug, 'events');
  const snapshot = await getDocs(canManage ? eventsRef : query(eventsRef, where('status', '==', 'published')));
  const events = snapshot.docs
    .map(normalizeClubEvent)
    .filter((event) => event.status === 'published' || (includeDrafts && canManage))
    .filter((event) => canManage || isClubEventUpcoming(event));

  events.sort((left, right) => {
    const leftDate = left.startDate || '9999-12-31';
    const rightDate = right.startDate || '9999-12-31';
    const dateCompare = leftDate.localeCompare(rightDate);

    return dateCompare || left.title.localeCompare(right.title);
  });

  return events;
}

export async function saveClubEvent({
  bulletPoints = [],
  clubSlug,
  costLabel = '',
  description = '',
  detailsHeading = '',
  endDate = '',
  eventId = '',
  eventType = 'singleDay',
  flyerFile = null,
  locationLabel = '',
  registrationInfo = '',
  registrationUrl = '',
  startDate = '',
  status = 'draft',
  timeLabel = '',
  title = '',
  user,
}) {
  requireDb();

  if (!(await canManageClub({ clubSlug, user }))) {
    throw new Error('Only club managers can save events.');
  }

  const normalizedTitle = title.trim();

  if (!normalizedTitle) {
    throw new Error('Enter an event title.');
  }

  const normalizedStatus = normalizeEventStatus(status);
  const normalizedEventType = normalizeEventType(eventType);
  const normalizedBulletPoints = normalizeEventBulletPoints(bulletPoints);
  const eventRef = eventId
    ? doc(db, 'clubs', clubSlug, 'events', eventId)
    : doc(collection(db, 'clubs', clubSlug, 'events'));
  const eventSnapshot = eventId ? await getDoc(eventRef) : null;
  const existingEvent = eventSnapshot?.exists() ? eventSnapshot.data() : {};
  const uploadedFlyer = flyerFile ? await uploadClubEventFlyer({ clubSlug, eventId: eventRef.id, file: flyerFile }) : null;
  const payload = {
    bulletPoints: normalizedBulletPoints,
    costLabel: costLabel.trim(),
    description: description.trim(),
    detailsHeading: detailsHeading.trim(),
    endDate: endDate.trim(),
    eventType: normalizedEventType,
    flyerImagePath: uploadedFlyer?.flyerImagePath ?? existingEvent.flyerImagePath ?? '',
    flyerImageUrl: uploadedFlyer?.flyerImageUrl ?? existingEvent.flyerImageUrl ?? '',
    locationLabel: locationLabel.trim(),
    registrationInfo: registrationInfo.trim(),
    registrationUrl: registrationUrl.trim(),
    startDate: startDate.trim(),
    status: normalizedStatus,
    timeLabel: timeLabel.trim(),
    title: normalizedTitle,
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  };

  if (!eventId) {
    payload.createdAt = serverTimestamp();
    payload.createdBy = user.uid;
  }

  await setDoc(eventRef, payload, { merge: true });

  if (!eventId) {
    await logActivityBestEffort({
      actorId: user.uid,
      clubId: clubSlug,
      metadata: {
        costLabel: payload.costLabel,
        eventId: eventRef.id,
        eventTitle: normalizedTitle,
        eventType: normalizedEventType,
        locationLabel: payload.locationLabel,
        startDate: payload.startDate,
        status: normalizedStatus,
        timeLabel: payload.timeLabel,
      },
      targetId: eventRef.id,
      type: ACTIVITY_TYPES.EVENT_CREATED,
    });
  }

  if (
    uploadedFlyer?.flyerImagePath &&
    existingEvent.flyerImagePath &&
    existingEvent.flyerImagePath !== uploadedFlyer.flyerImagePath
  ) {
    await deleteStoragePath(existingEvent.flyerImagePath);
  }

  return eventRef.id;
}

export async function archiveClubEvent({ clubSlug, eventId, user }) {
  requireDb();

  if (!(await canManageClub({ clubSlug, user }))) {
    throw new Error('Only club managers can archive events.');
  }

  if (!eventId) {
    throw new Error('Choose an event to archive.');
  }

  await updateDoc(doc(db, 'clubs', clubSlug, 'events', eventId), {
    status: 'archived',
    updatedAt: serverTimestamp(),
    updatedBy: user.uid,
  });
}

export async function deleteClubEvent({ clubSlug, eventId, user }) {
  requireDb();

  if (!(await canManageClub({ clubSlug, user }))) {
    throw new Error('Only club managers can delete events.');
  }

  if (!eventId) {
    throw new Error('Choose an event to delete.');
  }

  const eventRef = doc(db, 'clubs', clubSlug, 'events', eventId);
  const eventSnapshot = await getDoc(eventRef);
  const event = eventSnapshot.exists() ? eventSnapshot.data() : null;

  await deleteDoc(eventRef);

  if (event?.flyerImagePath) {
    await deleteStoragePath(event.flyerImagePath);
  }
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
