export enum UserRole {
  NURSE = "nurse",
  FAMILY = "family",
  ADMIN = "admin",
  SUPER_ADMIN = "super_admin",
}

export enum Credential {
  HHA = "hha",
  CNA = "cna",
  LPN = "lpn",
  RN = "rn",
  NP = "np",
}

export const CREDENTIAL_LABELS: Record<Credential, string> = {
  [Credential.HHA]: "Home Health Aide",
  [Credential.CNA]: "Certified Nursing Assistant",
  [Credential.LPN]: "Licensed Practical Nurse",
  [Credential.RN]: "Registered Nurse",
  [Credential.NP]: "Nurse Practitioner",
};

export enum CareType {
  ELDERLY = "elderly",
  PEDIATRIC = "pediatric",
  POSTPARTUM = "postpartum",
  DISABILITY = "disability",
  POST_SURGICAL = "post_surgical",
  CHRONIC_ILLNESS = "chronic_illness",
  MEMORY_CARE = "memory_care",
  HOSPICE = "hospice",
  REHABILITATION = "rehabilitation",
  WOUND_CARE = "wound_care",
}

export const CARE_TYPE_LABELS: Record<CareType, string> = {
  [CareType.ELDERLY]: "Elderly Care",
  [CareType.PEDIATRIC]: "Pediatric Care",
  [CareType.POSTPARTUM]: "Postpartum Care",
  [CareType.DISABILITY]: "Disability Care",
  [CareType.POST_SURGICAL]: "Post-Surgical Care",
  [CareType.CHRONIC_ILLNESS]: "Chronic Illness",
  [CareType.MEMORY_CARE]: "Memory Care",
  [CareType.HOSPICE]: "Hospice Care",
  [CareType.REHABILITATION]: "Rehabilitation",
  [CareType.WOUND_CARE]: "Wound Care",
};

export enum Skill {
  MEDICATION_MANAGEMENT = "medication_management",
  VITAL_SIGNS = "vital_signs",
  MOBILITY_ASSISTANCE = "mobility_assistance",
  BATHING_HYGIENE = "bathing_hygiene",
  MEAL_PREPARATION = "meal_preparation",
  LIGHT_HOUSEKEEPING = "light_housekeeping",
  COMPANIONSHIP = "companionship",
  TRANSPORTATION = "transportation",
  IV_THERAPY = "iv_therapy",
  CATHETER_CARE = "catheter_care",
  VENTILATOR_CARE = "ventilator_care",
  DIABETES_MANAGEMENT = "diabetes_management",
  PHYSICAL_THERAPY_SUPPORT = "physical_therapy_support",
  CPR_FIRST_AID = "cpr_first_aid",
  DEMENTIA_CARE = "dementia_care",
  TRACHEOSTOMY_CARE = "tracheostomy_care",
  FEEDING_TUBE = "feeding_tube",
}

export const SKILL_LABELS: Record<Skill, string> = {
  [Skill.MEDICATION_MANAGEMENT]: "Medication Management",
  [Skill.VITAL_SIGNS]: "Vital Signs Monitoring",
  [Skill.MOBILITY_ASSISTANCE]: "Mobility Assistance",
  [Skill.BATHING_HYGIENE]: "Bathing & Hygiene",
  [Skill.MEAL_PREPARATION]: "Meal Preparation",
  [Skill.LIGHT_HOUSEKEEPING]: "Light Housekeeping",
  [Skill.COMPANIONSHIP]: "Companionship",
  [Skill.TRANSPORTATION]: "Transportation",
  [Skill.IV_THERAPY]: "IV Therapy",
  [Skill.CATHETER_CARE]: "Catheter Care",
  [Skill.VENTILATOR_CARE]: "Ventilator Care",
  [Skill.DIABETES_MANAGEMENT]: "Diabetes Management",
  [Skill.PHYSICAL_THERAPY_SUPPORT]: "Physical Therapy Support",
  [Skill.CPR_FIRST_AID]: "CPR & First Aid",
  [Skill.DEMENTIA_CARE]: "Dementia Care",
  [Skill.TRACHEOSTOMY_CARE]: "Tracheostomy Care",
  [Skill.FEEDING_TUBE]: "Feeding Tube Care",
};

export enum Gender {
  MALE = "male",
  FEMALE = "female",
  NON_BINARY = "non_binary",
  PREFER_NOT_TO_SAY = "prefer_not_to_say",
}

export const GENDER_LABELS: Record<Gender, string> = {
  [Gender.MALE]: "Male",
  [Gender.FEMALE]: "Female",
  [Gender.NON_BINARY]: "Non-Binary",
  [Gender.PREFER_NOT_TO_SAY]: "Prefer Not to Say",
};

export enum VerificationStatus {
  PENDING = "pending",
  VERIFIED = "verified",
  REJECTED = "rejected",
}

export enum NurseTier {
  FREE = "free",
  FEATURED = "featured",
}

export enum AvailabilityCommitment {
  FULL_TIME = "full_time",
  PART_TIME = "part_time",
  PER_DIEM = "per_diem",
  LIVE_IN = "live_in",
}

export const AVAILABILITY_COMMITMENT_LABELS: Record<AvailabilityCommitment, string> = {
  [AvailabilityCommitment.FULL_TIME]: "Full-Time",
  [AvailabilityCommitment.PART_TIME]: "Part-Time",
  [AvailabilityCommitment.PER_DIEM]: "Per Diem",
  [AvailabilityCommitment.LIVE_IN]: "Live-In",
};

export enum TimeSlot {
  WEEKDAYS = "weekdays",
  WEEKENDS = "weekends",
  EVENINGS = "evenings",
  OVERNIGHTS = "overnights",
  ON_CALL = "on_call",
  FLEXIBLE = "flexible",
}

export const TIME_SLOT_LABELS: Record<TimeSlot, string> = {
  [TimeSlot.WEEKDAYS]: "Weekdays",
  [TimeSlot.WEEKENDS]: "Weekends",
  [TimeSlot.EVENINGS]: "Evenings",
  [TimeSlot.OVERNIGHTS]: "Overnights",
  [TimeSlot.ON_CALL]: "On-Call",
  [TimeSlot.FLEXIBLE]: "Flexible",
};

export enum CommunicationPreference {
  EMAIL = "email",
  PHONE = "phone",
  TEXT = "text",
}

export const COMMUNICATION_PREFERENCE_LABELS: Record<
  CommunicationPreference,
  string
> = {
  [CommunicationPreference.EMAIL]: "Email",
  [CommunicationPreference.PHONE]: "Phone",
  [CommunicationPreference.TEXT]: "Text",
};

export enum SubscriptionStatus {
  ACTIVE = "active",
  PAST_DUE = "past_due",
  CANCELLED = "cancelled",
  EXPIRED = "expired",
}

export enum ReviewStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  DISPUTED = "disputed",
}

export enum HireStatus {
  CLAIMED = "claimed",
  CONFIRMED = "confirmed",
  REJECTED = "rejected",
}

export enum AdminActionType {
  VERIFY_NURSE = "verify_nurse",
  REJECT_NURSE = "reject_nurse",
  APPROVE_REVIEW = "approve_review",
  REJECT_REVIEW = "reject_review",
  RESOLVE_DISPUTE = "resolve_dispute",
  SUSPEND_USER = "suspend_user",
  UNSUSPEND_USER = "unsuspend_user",
  REMOVE_USER = "remove_user",
}
