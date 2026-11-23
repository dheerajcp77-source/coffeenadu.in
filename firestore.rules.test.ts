import fs from 'node:fs';
import path from 'node:path';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, getDocs, collection, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

const ADMIN_UID = 'admin-owner-uid';
const ADMIN_EMAIL = 'shwethashwethak85@gmail.com';
const ATTACKER_UID = 'attacker-uid';

function validArticlePayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'news-test-01',
    titleKannada: 'ಕೊಪ್ಪ ತಾಲೂಕು ಸುದ್ದಿ',
    summaryKannada: 'ಕೊಪ್ಪದ ಪ್ರಮುಖ ಸುದ್ದಿಯ ಸಾರಾಂಶ.',
    bodyKannada: ['ಕೊಪ್ಪ ತಾಲೂಕಿನಲ್ಲಿ ನಡೆದ ಪ್ರಮುಖ ಘಟನೆಯ ವಿವರವಾದ ವರದಿ.'],
    category: 'Local',
    location: 'Koppa Town',
    publishedDate: '15 Nov 2026',
    publishedTime: '08:00 AM',
    publishedTimestamp: 1794729600000,
    readTimeMinutes: 2,
    reporter: 'Coffeenadu Desk',
    imageKey: 'none',
    isFeatured: false,
    authorUid: ADMIN_UID,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  };
}

export async function runDirtyDozenSecurityTests() {
  const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  const testEnv: RulesTestEnvironment = await initializeTestEnvironment({
    projectId: 'astral-vehicle-xzbz0',
    firestore: { rules },
  });

  try {
    const adminDb = testEnv.authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      email_verified: true,
    }).firestore();

    const unverifiedAdminDb = testEnv.authenticatedContext(ADMIN_UID, {
      email: ADMIN_EMAIL,
      email_verified: false,
    }).firestore();

    const attackerDb = testEnv.authenticatedContext(ATTACKER_UID, {
      email: 'attacker@gmail.com',
      email_verified: true,
    }).firestore();

    const anonDb = testEnv.unauthenticatedContext().firestore();

    // Baseline valid write by verified bootstrapped admin succeeds
    await assertSucceeds(setDoc(doc(adminDb, 'articles', 'news-test-01'), validArticlePayload()));
    // Public read succeeds
    await assertSucceeds(getDoc(doc(anonDb, 'articles', 'news-test-01')));

    // 1. Unauthenticated create
    await assertFails(
      setDoc(doc(anonDb, 'articles', 'hack-1'), validArticlePayload({ id: 'hack-1' }))
    );

    // 2. Non-admin verified user create
    await assertFails(
      setDoc(
        doc(attackerDb, 'articles', 'hack-2'),
        validArticlePayload({ id: 'hack-2', authorUid: ATTACKER_UID })
      )
    );

    // 3. Unverified email spoof
    await assertFails(
      setDoc(
        doc(unverifiedAdminDb, 'articles', 'hack-3'),
        validArticlePayload({ id: 'hack-3' })
      )
    );

    // 4. Shadow / ghost field injection
    await assertFails(
      setDoc(
        doc(adminDb, 'articles', 'hack-4'),
        validArticlePayload({ id: 'hack-4', isAdminOverride: true })
      )
    );

    // 5. Author UID spoofing
    await assertFails(
      setDoc(
        doc(adminDb, 'articles', 'hack-5'),
        validArticlePayload({ id: 'hack-5', authorUid: 'other-uid' })
      )
    );

    // 6. Client-forged timestamp
    await assertFails(
      setDoc(
        doc(adminDb, 'articles', 'hack-6'),
        validArticlePayload({ id: 'hack-6', createdAt: new Date('2020-01-01T00:00:00Z') })
      )
    );

    // 7. ID poisoning
    await assertFails(
      setDoc(
        doc(adminDb, 'articles', 'bad..id'),
        validArticlePayload({ id: 'bad..id' })
      )
    );

    // 8. Invalid category enum
    await assertFails(
      setDoc(
        doc(adminDb, 'articles', 'hack-8'),
        validArticlePayload({ id: 'hack-8', category: 'InvalidCategory' })
      )
    );

    // 9. Oversized image payload
    await assertFails(
      setDoc(
        doc(adminDb, 'articles', 'hack-9'),
        validArticlePayload({ id: 'hack-9', imageUrl: 'x'.repeat(350001) })
      )
    );

    // 10. Immutable field mutation on update
    await assertFails(
      updateDoc(doc(adminDb, 'articles', 'news-test-01'), {
        titleKannada: 'Updated',
        authorUid: 'hijacked-uid',
        updatedAt: serverTimestamp(),
      })
    );

    // 11. Self-assigned admin escalation
    await assertFails(
      setDoc(doc(attackerDb, 'admins', ATTACKER_UID), {
        uid: ATTACKER_UID,
        label: 'Fake Admin',
        addedBy: ATTACKER_UID,
        createdAt: serverTimestamp(),
      })
    );

    // 12. Unauthorized read/list on /admins
    await assertFails(getDocs(collection(attackerDb, 'admins')));
    await assertFails(getDoc(doc(anonDb, 'admins', ADMIN_UID)));
    await assertFails(deleteDoc(doc(attackerDb, 'articles', 'news-test-01')));
  } finally {
    await testEnv.cleanup();
  }
}
