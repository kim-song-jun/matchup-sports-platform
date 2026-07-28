import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const requireFromV1Api = createRequire(
  path.resolve(scriptDir, '../../apps/v1_api/package.json'),
);
const { PrismaClient } = requireFromV1Api('@prisma/client');
const baselinePath = path.resolve(
  scriptDir,
  '../../apps/v1_api/prisma/data/managed-terms-v1.1.json',
);
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const prisma = new PrismaClient();
const migrationKey = 'v1-managed-terms-v11-utf8-remediation-20260722';

try {
  const result = await prisma.$transaction(async (tx) => {
    const policyIds = baseline.policies.map((policy) => policy.id);
    const documentIds = baseline.policies.map((policy) => policy.document.id);
    const [storedPolicies, storedDocuments, consentEventsBefore] = await Promise.all([
      tx.v1ManagedTermsPolicy.findMany({ where: { id: { in: policyIds } } }),
      tx.v1ManagedTermsDocument.findMany({ where: { id: { in: documentIds } } }),
      tx.v1ManagedTermsConsentEvent.count(),
    ]);

    if (
      storedPolicies.length !== baseline.policies.length
      || storedDocuments.length !== baseline.policies.length
    ) {
      throw new Error(
        'Baseline row count mismatch: policies=' + storedPolicies.length
          + ', documents=' + storedDocuments.length,
      );
    }

    const policyById = new Map(storedPolicies.map((policy) => [policy.id, policy]));
    const documentById = new Map(storedDocuments.map((document) => [document.id, document]));
    const changedPolicyIds = [];
    const changedDocumentIds = [];

    for (const expected of baseline.policies) {
      const storedPolicy = policyById.get(expected.id);
      const storedDocument = documentById.get(expected.document.id);
      if (!storedPolicy || !storedDocument) {
        throw new Error('Missing baseline row for ' + expected.code);
      }

      if (storedPolicy.name !== expected.name) {
        await tx.v1ManagedTermsPolicy.update({
          where: { id: expected.id },
          data: { name: expected.name },
        });
        changedPolicyIds.push(expected.id);
      }

      const documentChanged = (
        storedDocument.title !== expected.document.title
        || storedDocument.subtitle !== expected.document.subtitle
        || storedDocument.content !== expected.document.content
        || storedDocument.contentHash !== expected.document.contentHash
        || storedDocument.changeSummary !== expected.document.changeSummary
      );
      if (documentChanged) {
        await tx.v1ManagedTermsDocument.update({
          where: { id: expected.document.id },
          data: {
            title: expected.document.title,
            subtitle: expected.document.subtitle,
            content: expected.document.content,
            contentHash: expected.document.contentHash,
            changeSummary: expected.document.changeSummary,
          },
        });
        changedDocumentIds.push(expected.document.id);
      }
    }

    const consentEventsAfter = await tx.v1ManagedTermsConsentEvent.count();
    if (consentEventsAfter !== consentEventsBefore) {
      throw new Error('Consent event count changed during UTF-8 remediation');
    }

    if (changedPolicyIds.length > 0 || changedDocumentIds.length > 0) {
      await tx.v1ManagedTermsMigrationAudit.upsert({
        where: { migrationKey },
        create: {
          migrationKey,
          snapshot: {
            canonicalVersion: baseline.canonicalVersion,
            changedPolicyIds,
            changedDocumentIds,
            consentEventsBefore,
            consentEventsAfter,
          },
        },
        update: {
          snapshot: {
            canonicalVersion: baseline.canonicalVersion,
            changedPolicyIds,
            changedDocumentIds,
            consentEventsBefore,
            consentEventsAfter,
          },
        },
      });
    }

    return {
      policiesChecked: storedPolicies.length,
      documentsChecked: storedDocuments.length,
      policiesRepaired: changedPolicyIds.length,
      documentsRepaired: changedDocumentIds.length,
      consentEventsBefore,
      consentEventsAfter,
    };
  });

  process.stdout.write(JSON.stringify(result) + '\n');
} finally {
  await prisma.$disconnect();
}
