import type { createAdminClient } from "@/lib/supabase/server";
import {
  normalizeEmergencyContacts,
  type EmergencyContact,
  type EmployeeDependent,
} from "@/lib/employees/profile";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function upsertEmployeeEmergencyContacts(
  admin: AdminClient,
  userId: string,
  contacts: EmergencyContact[] | undefined
): Promise<void> {
  if (contacts === undefined) return;
  const normalized = normalizeEmergencyContacts(contacts);
  await admin.from("employee_emergency_contacts").delete().eq("user_id", userId);
  if (normalized.length === 0) return;
  const { error } = await admin.from("employee_emergency_contacts").insert(
    normalized.map((c, index) => ({
      user_id: userId,
      name: c.name,
      relationship: c.relationship ?? null,
      phone: c.phone,
      sort_order: index,
    }))
  );
  if (error) throw new Error(error.message);
}

export async function upsertEmployeeDependents(
  admin: AdminClient,
  userId: string,
  dependents: EmployeeDependent[] | undefined
): Promise<void> {
  if (dependents === undefined) return;
  const rows = (dependents ?? [])
    .map((d) => ({
      name: d.name.trim(),
      national_id: d.nationalId?.trim() || null,
      birth_date: d.birthDate || null,
      enrollment_date: d.enrollmentDate || null,
      relationship: d.relationship?.trim() || null,
    }))
    .filter((d) => d.name);
  await admin.from("employee_dependents").delete().eq("user_id", userId);
  if (rows.length === 0) return;
  const { error } = await admin.from("employee_dependents").insert(
    rows.map((row) => ({
      user_id: userId,
      ...row,
    }))
  );
  if (error) throw new Error(error.message);
}

export function profileUpdatesFromBody(body: Record<string, unknown>): Record<string, unknown> {
  const updates: Record<string, unknown> = {};
  if (body.national_id !== undefined) updates.national_id = body.national_id || null;
  if (body.birth_date !== undefined) updates.birth_date = body.birth_date || null;
  if (body.gender !== undefined) updates.gender = body.gender || null;
  if (body.registered_address !== undefined) {
    updates.registered_address = body.registered_address || null;
  }
  if (body.mailing_address !== undefined) updates.mailing_address = body.mailing_address || null;
  if (body.mailing_same_as_registered !== undefined) {
    updates.mailing_same_as_registered = Boolean(body.mailing_same_as_registered);
  }
  if (body.phone !== undefined) updates.phone = body.phone || null;
  return updates;
}
