import type {
  ClinicalAssignmentRole,
  ClinicalProfessionalRole,
  ClinicalReviewerCapability,
  ClinicalTaskEligibilityValidator,
} from '@ogun/db/queries'
import {
  isClinicalReviewTaskAssignable,
  isReviewerEligibleForTask,
} from '@ogun/etl/clinical-review-policy'

export const CLINICAL_PROFESSIONAL_ROLES: ClinicalProfessionalRole[] = [
  'pharmacist',
  'dietitian',
  'physician',
  'clinical_admin',
]
export const CLINICAL_REVIEWER_CAPABILITIES: ClinicalReviewerCapability[] = [
  'medication_food',
  'medication_supplement',
  'medication_timing',
  'condition_nutrient',
  'condition_food',
  'oncology_medication',
  'renal_nutrition',
  'general_clinical',
]
export const CLINICAL_ASSIGNMENT_ROLES: ClinicalAssignmentRole[] = [
  'primary',
  'secondary',
  'co_review',
]

export const PROFESSIONAL_ROLE_LABELS: Record<ClinicalProfessionalRole, string> = {
  pharmacist: 'Eczacı',
  dietitian: 'Diyetisyen',
  physician: 'Hekim',
  clinical_admin: 'Klinik Yönetici',
}

export function clinicalTaskValidator(
  professionalRole: ClinicalProfessionalRole,
  capabilities: ClinicalReviewerCapability[],
): ClinicalTaskEligibilityValidator {
  return (task, assignmentRole) => {
    if (!isClinicalReviewTaskAssignable(task.status)) {
      return { eligible: false, reason: `Görev ${task.status} durumunda yeni atamaya kapalı.` }
    }
    return isReviewerEligibleForTask(
      {
        userId: 'planned-reviewer',
        role: professionalRole,
        verificationStatus: 'verified',
        isActive: true,
        canPublish: false,
        capabilities,
      },
      task,
      assignmentRole === 'primary' ? 'primary' : 'co_review',
    )
  }
}
