import { describe, expect, it } from 'vitest'
import {
  determineRequiredReviewPolicy,
  evaluateTaskConsensus,
  isReviewerEligibleForTask,
  isReviewerEligibleToReview,
  type CandidateTaskContext,
  type ClinicalReviewerContext,
  type RecordedDecision,
} from './clinical-review-policy'

describe('clinical review policy and consensus safety', () => {
  const pharmacist: ClinicalReviewerContext = {
    userId: 'usr_pharm_1',
    role: 'pharmacist',
    verificationStatus: 'verified',
    isActive: true,
    canPublish: false,
    capabilities: ['medication_food', 'medication_supplement', 'medication_timing'],
  }

  const physician: ClinicalReviewerContext = {
    userId: 'usr_phys_1',
    role: 'physician',
    verificationStatus: 'verified',
    isActive: true,
    canPublish: false,
    capabilities: ['medication_food', 'general_clinical'],
  }

  const dietitian: ClinicalReviewerContext = {
    userId: 'usr_diet_1',
    role: 'dietitian',
    verificationStatus: 'verified',
    isActive: true,
    canPublish: false,
    capabilities: ['condition_nutrient', 'medication_food'],
  }

  const oncologySpecialist: ClinicalReviewerContext = {
    userId: 'usr_onco_1',
    role: 'physician',
    verificationStatus: 'verified',
    isActive: true,
    canPublish: false,
    capabilities: ['oncology_medication'],
  }

  const baseMedicationTask: CandidateTaskContext = {
    id: 'task_med_1',
    status: 'in_review',
    subjectType: 'medication',
    targetType: 'food_component',
    action: 'avoid',
    ingredientAttribution: 'direct_single_ingredient',
    requiredCapability: 'medication_food',
    candidateSemanticHash: 'hash_abc123',
  }

  // 1. Normal user cannot access (not verified/active)
  it('1. normal user without verified reviewer status cannot review', () => {
    const unverifiedUser: ClinicalReviewerContext = {
      userId: 'usr_normal_1',
      role: 'pharmacist',
      verificationStatus: 'pending',
      isActive: true,
      canPublish: false,
      capabilities: ['medication_food'],
    }
    expect(isReviewerEligibleToReview(unverifiedUser)).toBe(false)
  })

  // 2. Unverified reviewer cannot review
  it('2. unverified reviewer cannot review tasks', () => {
    const pendingReviewer: ClinicalReviewerContext = {
      ...pharmacist,
      verificationStatus: 'pending',
    }
    const check = isReviewerEligibleForTask(pendingReviewer, baseMedicationTask, 'primary')
    expect(check.eligible).toBe(false)
    expect(check.reason).toContain('not verified')
  })

  // 3. Suspended reviewer cannot review
  it('3. suspended reviewer cannot review tasks', () => {
    const suspendedReviewer: ClinicalReviewerContext = {
      ...pharmacist,
      verificationStatus: 'suspended',
    }
    const check = isReviewerEligibleForTask(suspendedReviewer, baseMedicationTask, 'primary')
    expect(check.eligible).toBe(false)
  })

  // 4. Pharmacist medication_food eligible
  it('4. pharmacist is eligible as primary reviewer for medication_food', () => {
    const check = isReviewerEligibleForTask(pharmacist, baseMedicationTask, 'primary')
    expect(check.eligible).toBe(true)
  })

  // 5. Physician medication_food eligible
  it('5. physician is eligible as primary reviewer for medication_food', () => {
    const check = isReviewerEligibleForTask(physician, baseMedicationTask, 'primary')
    expect(check.eligible).toBe(true)
  })

  // 6. Dietitian cannot be sole primary medication pharmacology approval
  it('6. dietitian cannot be sole primary pharmacological reviewer for medication interaction', () => {
    const check = isReviewerEligibleForTask(dietitian, baseMedicationTask, 'primary')
    expect(check.eligible).toBe(false)
    expect(check.reason).toContain('Dietitian cannot be sole primary pharmacological reviewer')

    // But can be co-reviewer
    const coCheck = isReviewerEligibleForTask(dietitian, baseMedicationTask, 'co_review')
    expect(coCheck.eligible).toBe(true)
  })

  // 7. Dietitian condition_nutrient eligible
  it('7. dietitian is eligible as primary reviewer for condition_nutrient', () => {
    const conditionTask: CandidateTaskContext = {
      id: 'task_cond_1',
      status: 'pending',
      subjectType: 'condition',
      targetType: 'nutrient',
      action: 'limit',
      ingredientAttribution: null,
      requiredCapability: 'condition_nutrient',
      candidateSemanticHash: 'hash_cond123',
    }
    const check = isReviewerEligibleForTask(dietitian, conditionTask, 'primary')
    expect(check.eligible).toBe(true)
  })

  // 8. Oncology task requires oncology capability
  it('8. oncology task requires oncology capability', () => {
    const oncologyTask: CandidateTaskContext = {
      ...baseMedicationTask,
      requiredCapability: 'oncology_medication',
    }
    const regularPharmCheck = isReviewerEligibleForTask(pharmacist, oncologyTask, 'primary')
    expect(regularPharmCheck.eligible).toBe(false)
    expect(regularPharmCheck.reason).toContain('lacks required capability: oncology_medication')

    const oncoPhysCheck = isReviewerEligibleForTask(oncologySpecialist, oncologyTask, 'primary')
    expect(oncoPhysCheck.eligible).toBe(true)
  })

  // 9. Attribution-risk requires second reviewer and explicit confirmation
  it('9. attribution risk requires dual reviewer and attribution confirmation', () => {
    const attributionTask: CandidateTaskContext = {
      ...baseMedicationTask,
      ingredientAttribution: 'multi_ingredient_unattributed',
    }
    const policy = determineRequiredReviewPolicy(attributionTask)
    expect(policy.requiredReviewCount).toBe(2)
    expect(policy.requiresAttributionConfirmation).toBe(true)

    // Single approval without confirmation -> not ready
    const singleDecision: RecordedDecision = {
      id: 'dec_1',
      reviewerUserId: pharmacist.userId,
      decision: 'approve',
      severity: 'moderate',
      evidenceStrength: 'strong',
      approvedTargetKey: 'food_component:tyramine',
      approvedAction: 'avoid',
      attributionConfirmed: false,
      candidateSemanticHash: attributionTask.candidateSemanticHash,
      isDraft: false,
    }

    const consensus = evaluateTaskConsensus({
      task: attributionTask,
      decisions: [singleDecision],
      reviewersById: new Map([[pharmacist.userId, pharmacist]]),
    })

    expect(consensus.readyToPublish).toBe(false)
    expect(consensus.reasons.some((r) => r.includes('requires at least 2 distinct'))).toBe(true)
    expect(consensus.reasons.some((r) => r.includes('requires explicit attribution confirmation'))).toBe(
      true,
    )
  })

  // 10. High severity requires second reviewer
  it('10. high severity interaction requires second independent reviewer', () => {
    const highDecision: RecordedDecision = {
      id: 'dec_high',
      reviewerUserId: pharmacist.userId,
      decision: 'approve',
      severity: 'high',
      evidenceStrength: 'strong',
      approvedTargetKey: 'food_component:tyramine',
      approvedAction: 'avoid',
      attributionConfirmed: true,
      candidateSemanticHash: baseMedicationTask.candidateSemanticHash,
      isDraft: false,
    }

    const consensus = evaluateTaskConsensus({
      task: baseMedicationTask,
      decisions: [highDecision],
      reviewersById: new Map([[pharmacist.userId, pharmacist]]),
    })

    expect(consensus.readyToPublish).toBe(false)
    expect(consensus.reasons.some((r) => r.includes('High/Critical severity interaction requires at least 2'))).toBe(
      true,
    )
  })

  // 11. Same user cannot fill both reviewer slots
  it('11. same user cannot fill both reviewer slots for high severity requirement', () => {
    const dec1: RecordedDecision = {
      id: 'dec_1',
      reviewerUserId: pharmacist.userId,
      decision: 'approve',
      severity: 'high',
      evidenceStrength: 'strong',
      approvedTargetKey: 'food_component:tyramine',
      approvedAction: 'avoid',
      attributionConfirmed: true,
      candidateSemanticHash: baseMedicationTask.candidateSemanticHash,
      isDraft: false,
    }
    const dec2DuplicateUser: RecordedDecision = {
      ...dec1,
      id: 'dec_2',
    }

    const consensus = evaluateTaskConsensus({
      task: baseMedicationTask,
      decisions: [dec1, dec2DuplicateUser],
      reviewersById: new Map([[pharmacist.userId, pharmacist]]),
    })

    expect(consensus.readyToPublish).toBe(false)
    expect(consensus.reasons.some((r) => r.includes('Duplicate approvals'))).toBe(true)
  })

  // 12. Conflicting decisions cannot become ready_to_publish
  it('12. conflicting decisions transition task to needs_resolution', () => {
    const approval: RecordedDecision = {
      id: 'dec_app',
      reviewerUserId: pharmacist.userId,
      decision: 'approve',
      severity: 'moderate',
      evidenceStrength: 'strong',
      approvedTargetKey: 'food_component:tyramine',
      approvedAction: 'avoid',
      attributionConfirmed: true,
      candidateSemanticHash: baseMedicationTask.candidateSemanticHash,
      isDraft: false,
    }

    const rejection: RecordedDecision = {
      id: 'dec_rej',
      reviewerUserId: physician.userId,
      decision: 'reject',
      rejectReason: 'false_positive',
      reviewNote: 'Not clinically relevant',
      candidateSemanticHash: baseMedicationTask.candidateSemanticHash,
      isDraft: false,
    }

    const consensus = evaluateTaskConsensus({
      task: baseMedicationTask,
      decisions: [approval, rejection],
      reviewersById: new Map([
        [pharmacist.userId, pharmacist],
        [physician.userId, physician],
      ]),
    })

    expect(consensus.status).toBe('needs_resolution')
    expect(consensus.readyToPublish).toBe(false)
    expect(consensus.reasons.some((r) => r.includes('Conflicting decisions'))).toBe(true)
  })

  // 13. source_changed invalidates readiness
  it('13. source_changed status invalidates readiness to publish', () => {
    const staleTask: CandidateTaskContext = {
      ...baseMedicationTask,
      status: 'source_changed',
    }

    const approval: RecordedDecision = {
      id: 'dec_1',
      reviewerUserId: pharmacist.userId,
      decision: 'approve',
      severity: 'moderate',
      evidenceStrength: 'strong',
      approvedTargetKey: 'food_component:tyramine',
      approvedAction: 'avoid',
      attributionConfirmed: true,
      candidateSemanticHash: 'hash_old',
      isDraft: false,
    }

    const consensus = evaluateTaskConsensus({
      task: staleTask,
      decisions: [approval],
      reviewersById: new Map([[pharmacist.userId, pharmacist]]),
    })

    expect(consensus.status).toBe('source_changed')
    expect(consensus.readyToPublish).toBe(false)
  })
})
