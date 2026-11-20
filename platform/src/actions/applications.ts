"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { isStatus } from "@/lib/states";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

/** Mise à jour du statut / des notes (RLS : seulement SES candidatures). */
export async function updateApplication(applicationId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const status = String(formData.get("status") ?? "");
  const notes = String(formData.get("notes") ?? "").slice(0, 5000);
  if (!isStatus(status)) return { error: "Statut invalide." };

  const patch: Record<string, unknown> = { status, notes, updated_at: new Date().toISOString() };
  const appliedOn = String(formData.get("applied_on") ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(appliedOn)) patch.applied_on = appliedOn;
  else if (status === "Applied") patch.applied_on = new Date().toISOString().slice(0, 10);

  const supabase = await createClient();
  const { error } = await supabase.from("applications").update(patch).eq("id", applicationId);
  if (error) return { error: "Mise à jour impossible." };
  revalidatePath("/applications");
  revalidatePath(`/applications/${applicationId}`);
  revalidatePath("/");
  return { message: "Enregistré." };
}

/** Changement de statut rapide depuis la liste. */
export async function quickStatus(applicationId: string, formData: FormData): Promise<void> {
  await requireUser();
  const status = String(formData.get("status") ?? "");
  if (!isStatus(status)) return;
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
  if (status === "Applied") patch.applied_on = new Date().toISOString().slice(0, 10);
  const supabase = await createClient();
  await supabase.from("applications").update(patch).eq("id", applicationId);
  revalidatePath("/applications");
  revalidatePath("/");
}

export async function deleteApplication(applicationId: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("applications").delete().eq("id", applicationId);
  revalidatePath("/applications");
  redirect("/applications");
}

export async function deleteDocument(documentId: string, applicationId: string): Promise<void> {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("documents").delete().eq("id", documentId);
  revalidatePath(`/applications/${applicationId}`);
  redirect(`/applications/${applicationId}`);
}
