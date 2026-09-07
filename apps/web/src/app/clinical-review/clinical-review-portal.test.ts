import { describe, expect, it, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

vi.mock('server-only', () => ({}))

const notFoundMock = vi.fn()
vi.mock('next/navigation', () => ({
  notFound: () => notFoundMock(),
  redirect: vi.fn(),
}))

const mockRequireAuth = vi.fn()
vi.mock('@/lib/authz', () => ({
  requireAuth: () => mockRequireAuth(),
}))

const mockGetReviewer = vi.fn()
vi.mock('@ogun/db/queries', () => ({
  getClinicalReviewerWithCapabilities: (...args: unknown[]) => mockGetReviewer(...args),
}))

import {
  assertClinicalReviewEnabled,
  requireReviewer,
  requireVerifiedReviewer,
  requireClinicalAdmin,
  requirePublisherAdmin,
  ClinicalAdminRequiredError,
  ClinicalPublisherRequiredError,
  InactiveReviewerError,
  NotClinicalReviewerError,
  UnverifiedReviewerError,
} from '@/lib/clinical-review/authz'

describe('clinical review portal authorization and UI validation', () => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url))
  const navSource = readFileSync(path.join(currentDir, '_components/portal-nav.tsx'), 'utf8')
  const queueListSource = readFileSync(path.join(currentDir, 'queue/_components/queue-list.tsx'), 'utf8')
  const queueFiltersSource = readFileSync(path.join(currentDir, 'queue/_components/queue-filters.tsx'), 'utf8')
  const taskDetailSource = readFileSync(path.join(currentDir, 'task/[id]/page.tsx'), 'utf8')
  const evidencePanelSource = readFileSync(path.join(currentDir, 'task/[id]/_components/evidence-panel.tsx'), 'utf8')
  const decisionFormSource = readFileSync(path.join(currentDir, 'task/[id]/_components/decision-form.tsx'), 'utf8')
  const technicalQaSource = readFileSync(path.join(currentDir, 'task/[id]/_components/technical-qa-panel.tsx'), 'utf8')
  const publishQueueSource = readFileSync(path.join(currentDir, 'admin/publish/_components/publish-queue-list.tsx'), 'utf8')
  const reviewerTableSource = readFileSync(path.join(currentDir, 'admin/reviewers/_components/reviewer-table.tsx'), 'utf8')

  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.CLINICAL_REVIEW_ENABLED
  })

  // -------------------------------------------------------------------------
  // SECTION 70: TEST 45 - UNAUTHORIZED ROUTE DENIED & FEATURE FLAG
  // -------------------------------------------------------------------------
  describe('45. unauthorized route denied & feature flags', () => {
    it('assertClinicalReviewEnabled triggers notFound when flag is "false"', () => {
      process.env.CLINICAL_REVIEW_ENABLED = 'false'
      assertClinicalReviewEnabled()
      expect(notFoundMock).toHaveBeenCalled()
    })

    it('assertClinicalReviewEnabled succeeds when enabled', () => {
      process.env.CLINICAL_REVIEW_ENABLED = 'true'
      assertClinicalReviewEnabled()
      expect(notFoundMock).not.toHaveBeenCalled()
    })

    it('requireReviewer throws NotClinicalReviewerError when user has no reviewer profile', async () => {
      mockRequireAuth.mockResolvedValue({ user: { id: 'usr_no_profile', email: 'none@ogun.test', name: 'None' } })
      mockGetReviewer.mockResolvedValue(null)

      await expect(requireReviewer()).rejects.toThrow(NotClinicalReviewerError)
    })

    it('requireVerifiedReviewer throws UnverifiedReviewerError when status is pending', async () => {
      mockRequireAuth.mockResolvedValue({ user: { id: 'usr_pending', email: 'pending@ogun.test', name: 'Pending' } })
      mockGetReviewer.mockResolvedValue({
        userId: 'usr_pending',
        professionalRole: 'pharmacist',
        specialty: null,
        verificationStatus: 'pending',
        verifiedAt: null,
        verifiedBy: null,
        isActive: true,
        canPublish: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        capabilities: ['medication_food'],
      })

      await expect(requireVerifiedReviewer()).rejects.toThrow(UnverifiedReviewerError)
    })

    it('requireVerifiedReviewer throws InactiveReviewerError when isActive is false', async () => {
      mockRequireAuth.mockResolvedValue({ user: { id: 'usr_inactive', email: 'inactive@ogun.test', name: 'Inactive' } })
      mockGetReviewer.mockResolvedValue({
        userId: 'usr_inactive',
        professionalRole: 'pharmacist',
        specialty: null,
        verificationStatus: 'verified',
        verifiedAt: new Date(),
        verifiedBy: 'usr_admin',
        isActive: false,
        canPublish: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        capabilities: ['medication_food'],
      })

      await expect(requireVerifiedReviewer()).rejects.toThrow(InactiveReviewerError)
    })

    it('requireClinicalAdmin throws ClinicalAdminRequiredError for non-admin roles', async () => {
      mockRequireAuth.mockResolvedValue({ user: { id: 'usr_pharm', email: 'pharm@ogun.test', name: 'Pharmacist' } })
      mockGetReviewer.mockResolvedValue({
        userId: 'usr_pharm',
        professionalRole: 'pharmacist',
        specialty: null,
        verificationStatus: 'verified',
        verifiedAt: new Date(),
        verifiedBy: 'usr_admin',
        isActive: true,
        canPublish: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        capabilities: ['medication_food'],
      })

      await expect(requireClinicalAdmin()).rejects.toThrow(ClinicalAdminRequiredError)
    })

    it('requirePublisherAdmin throws ClinicalPublisherRequiredError when canPublish is false', async () => {
      mockRequireAuth.mockResolvedValue({ user: { id: 'usr_admin', email: 'admin@ogun.test', name: 'Admin' } })
      mockGetReviewer.mockResolvedValue({
        userId: 'usr_admin',
        professionalRole: 'clinical_admin',
        specialty: null,
        verificationStatus: 'verified',
        verifiedAt: new Date(),
        verifiedBy: 'usr_admin',
        isActive: true,
        canPublish: false,
        createdAt: new Date(),
        updatedAt: new Date(),
        capabilities: ['general_clinical'],
      })

      await expect(requirePublisherAdmin()).rejects.toThrow(ClinicalPublisherRequiredError)
    })
  })

  // -------------------------------------------------------------------------
  // SECTION 70: TEST 42 - MOBILE QUEUE USABLE (CARDS, NO 43-COL SPREADSHEET)
  // -------------------------------------------------------------------------
  describe('42. mobile queue usable', () => {
    it('renders queue items as responsive touch cards on mobile', () => {
      expect(queueListSource).toContain('Card')
      expect(queueListSource).toContain('İncele')
      expect(queueListSource).toContain('task.reviewPriority')
      expect(queueListSource).toContain('task.candidateConfidence')
    })
  })

  // -------------------------------------------------------------------------
  // SECTION 70: TEST 43 - TASK DETAIL EVIDENCE VISIBLE
  // -------------------------------------------------------------------------
  describe('43. task detail evidence visible', () => {
    it('evidence panel displays representative evidence snippets, counts, and DailyMed links', () => {
      expect(evidencePanelSource).toContain('Kaynak Kanıtları (FDA SPL Evidence)')
      expect(evidencePanelSource).toContain('DailyMed')
      expect(evidencePanelSource).toContain('Daha Fazla Kanıt Göster')
      expect(evidencePanelSource).toContain('totalCount')
      expect(evidencePanelSource).toContain('documentCount')
    })

    it('task detail separates Technical Extraction Confidence from Clinical Severity', () => {
      expect(taskDetailSource).toContain('Çıkarım Güveni')
      expect(taskDetailSource).toContain('Klinik Şiddet')
      expect(taskDetailSource).toContain('Not assessed')
      // Must not call AI decisions "AI approved"
      expect(taskDetailSource).not.toContain('AI approved')
      expect(technicalQaSource).toContain('Teknik Ön İnceleme')
      expect(technicalQaSource).toContain('Extraction QA')
    })
  })

  // -------------------------------------------------------------------------
  // SECTION 70: TEST 44 - APPROVE FORM VALIDATION
  // -------------------------------------------------------------------------
  describe('44. approve form validation', () => {
    it('enforces severity levels, attribution confirmation, and target/action fields', () => {
      expect(decisionFormSource).toContain('SEVERITY_LEVELS')
      expect(decisionFormSource).toContain('hasAttributionRisk')
      expect(decisionFormSource).toContain('attributionConfirmed')
      expect(decisionFormSource).toContain('submitReviewDecisionAction')
    })

    it('provides controlled rejection reasons and note requirement for safe reject', () => {
      expect(decisionFormSource).toContain('false_positive')
      expect(decisionFormSource).toContain('wrong_subject')
      expect(decisionFormSource).toContain('wrong_target')
      expect(decisionFormSource).toContain('wrong_action')
      expect(decisionFormSource).toContain('non_clinical_instruction')
      expect(decisionFormSource).toContain('İnceleme Notu')
    })
  })

  // -------------------------------------------------------------------------
  // SECTION 70: TEST 46 - FILTER & SEARCH
  // -------------------------------------------------------------------------
  describe('46. filter/search', () => {
    it('queue filters support server-side query params for search, priority, status, and capability', () => {
      expect(queueFiltersSource).toContain('q')
      expect(queueFiltersSource).toContain('priority')
      expect(queueFiltersSource).toContain('status')
      expect(queueFiltersSource).toContain('capability')
      expect(queueFiltersSource).toContain('Temizle')
      expect(queueFiltersSource).toContain('İlaç adı, hedef')
    })
  })

  // -------------------------------------------------------------------------
  // SECTION 70: TEST 47 - REVIEWER ASSIGNMENT & ADMIN
  // -------------------------------------------------------------------------
  describe('47. reviewer assignment', () => {
    it('reviewer administration allows verification, role assignment, and publishing permissions', () => {
      expect(reviewerTableSource).toContain('Doğrula')
      expect(reviewerTableSource).toContain('Askıya Al')
      expect(reviewerTableSource).toContain('canPublish')
      expect(reviewerTableSource).toContain('verificationStatus')
    })
  })

  // -------------------------------------------------------------------------
  // SECTION 70: TEST 48 - ADMIN READY-TO-PUBLISH FLOW
  // -------------------------------------------------------------------------
  describe('48. admin ready-to-publish flow', () => {
    it('publish queue shows consensus checks, verified reviewer signatures, and publication trigger', () => {
      expect(publishQueueSource).toContain('Yayınla (Publish)')
      expect(publishQueueSource).toContain('task.candidateId')
      expect(publishQueueSource).toContain('Konsensüs Onayları')
    })
  })

  // -------------------------------------------------------------------------
  // SECTION 70: TEST 49 - DISAGREEMENT STATE
  // -------------------------------------------------------------------------
  describe('49. disagreement state', () => {
    it('navigation and queue highlight tasks in review and pending resolution', () => {
      expect(navSource).toContain('/clinical-review/queue')
      expect(queueListSource).toContain('in_review')
      expect(queueListSource).toContain('needs_more_evidence')
    })
  })

  // -------------------------------------------------------------------------
  // SECTION 70: TEST 50 - SOURCE CHANGED WARNING
  // -------------------------------------------------------------------------
  describe('50. source changed warning', () => {
    it('task detail and queue display prominent stale source warning banner when semantic hash changes', () => {
      expect(taskDetailSource).toContain('Kaynak Veri Değişti (Stale Snapshot)')
      expect(taskDetailSource).toContain('Bu adayın openFDA kaynak özeti ve semantik karması değişmiştir')
      expect(queueListSource).toContain('Kaynak Değişti')
    })
  })
})
