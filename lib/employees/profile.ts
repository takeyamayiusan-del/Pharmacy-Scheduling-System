export type Gender = "male" | "female" | "other";

export const GENDER_LABELS: Record<Gender, string> = {
  male: "男",
  female: "女",
  other: "其他",
};

export type EmergencyContact = {
  id?: string;
  name: string;
  relationship?: string;
  phone: string;
};

export type EmployeeDependent = {
  id?: string;
  name: string;
  nationalId?: string;
  birthDate?: string;
  enrollmentDate?: string;
  relationship?: string;
};

export type EmployeeProfileFields = {
  nationalId?: string;
  birthDate?: string;
  gender?: Gender | null;
  registeredAddress?: string;
  mailingAddress?: string;
  mailingSameAsRegistered?: boolean;
  phone?: string;
  emergencyContacts?: EmergencyContact[];
  dependents?: EmployeeDependent[];
};

export function normalizeEmergencyContacts(
  contacts: EmergencyContact[] | undefined
): EmergencyContact[] {
  if (!contacts?.length) return [];
  return contacts
    .map((c) => ({
      name: c.name.trim(),
      relationship: c.relationship?.trim() || undefined,
      phone: c.phone.trim(),
    }))
    .filter((c) => c.name && c.phone)
    .slice(0, 2);
}

export function effectiveMailingAddress(profile: EmployeeProfileFields): string {
  if (profile.mailingSameAsRegistered) {
    return profile.registeredAddress?.trim() ?? "";
  }
  return profile.mailingAddress?.trim() ?? "";
}
