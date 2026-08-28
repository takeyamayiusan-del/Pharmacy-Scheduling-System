import { createClient } from "@/lib/supabase/client";
import type { SiteId } from "@/lib/sites";
import type {
  QuizOption,
  TrainingCourse,
  TrainingCourseStatus,
  TrainingMaterial,
  TrainingProgress,
  TrainingQuizQuestion,
  TrainingVisibility,
} from "@/lib/training/types";

function mapCourse(r: Record<string, unknown>): TrainingCourse {
  return {
    id: String(r.id),
    title: String(r.title ?? ""),
    description: String(r.description ?? ""),
    visibility: (r.visibility as TrainingVisibility) || "single_site",
    siteId: r.site_id ? (String(r.site_id) as SiteId) : null,
    status: (r.status as TrainingCourseStatus) || "draft",
    hasExam: Boolean(r.has_exam),
    passingScore: Number(r.passing_score ?? 80),
    createdBy: r.created_by ? String(r.created_by) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

function mapMaterial(r: Record<string, unknown>): TrainingMaterial {
  return {
    id: String(r.id),
    courseId: String(r.course_id),
    title: String(r.title ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
    storagePath: r.storage_path ? String(r.storage_path) : null,
    fileName: r.file_name ? String(r.file_name) : null,
    mimeType: r.mime_type ? String(r.mime_type) : null,
    fileSize: r.file_size == null ? null : Number(r.file_size),
    externalUrl: r.external_url ? String(r.external_url) : null,
    createdAt: String(r.created_at),
  };
}

function mapQuestion(r: Record<string, unknown>): TrainingQuizQuestion {
  const options = Array.isArray(r.options) ? (r.options as QuizOption[]) : [];
  return {
    id: String(r.id),
    courseId: String(r.course_id),
    questionText: String(r.question_text ?? ""),
    sortOrder: Number(r.sort_order ?? 0),
    options,
    correctOptionId: String(r.correct_option_id ?? ""),
    createdAt: String(r.created_at),
  };
}

function mapProgress(r: Record<string, unknown>): TrainingProgress {
  return {
    id: String(r.id),
    courseId: String(r.course_id),
    userId: String(r.user_id),
    materialsViewedAt: r.materials_viewed_at ? String(r.materials_viewed_at) : null,
    examScore: r.exam_score == null ? null : Number(r.exam_score),
    examPassed: r.exam_passed == null ? null : Boolean(r.exam_passed),
    examSubmittedAt: r.exam_submitted_at ? String(r.exam_submitted_at) : null,
    examAnswers:
      r.exam_answers && typeof r.exam_answers === "object"
        ? (r.exam_answers as Record<string, string>)
        : null,
    status: (r.status as TrainingProgress["status"]) || "pending",
    completedAt: r.completed_at ? String(r.completed_at) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export async function loadPublishedCoursesForUser(): Promise<TrainingCourse[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_courses")
    .select("*")
    .eq("status", "published")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapCourse(r as Record<string, unknown>));
}

export async function loadManageCourses(): Promise<TrainingCourse[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_courses")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapCourse(r as Record<string, unknown>));
}

export async function loadCourseMaterials(courseId: string): Promise<TrainingMaterial[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_materials")
    .select("*")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapMaterial(r as Record<string, unknown>));
}

export async function loadCourseQuestions(courseId: string): Promise<TrainingQuizQuestion[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_quiz_questions")
    .select("*")
    .eq("course_id", courseId)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapQuestion(r as Record<string, unknown>));
}

export async function loadMyProgress(courseIds: string[]): Promise<TrainingProgress[]> {
  if (courseIds.length === 0) return [];
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return [];
  const { data, error } = await supabase
    .from("training_progress")
    .select("*")
    .eq("user_id", auth.user.id)
    .in("course_id", courseIds);
  if (error) throw error;
  return (data ?? []).map((r) => mapProgress(r as Record<string, unknown>));
}

export async function loadCourseProgress(courseId: string): Promise<TrainingProgress[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_progress")
    .select("*")
    .eq("course_id", courseId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => mapProgress(r as Record<string, unknown>));
}

export async function createTrainingCourse(input: {
  title: string;
  description: string;
  visibility: TrainingVisibility;
  siteId: SiteId | null;
  hasExam: boolean;
  passingScore: number;
  createdBy: string;
}): Promise<TrainingCourse> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_courses")
    .insert({
      title: input.title.trim(),
      description: input.description.trim(),
      visibility: input.visibility,
      site_id: input.visibility === "single_site" ? input.siteId : null,
      has_exam: input.hasExam,
      passing_score: input.passingScore,
      status: "draft",
      created_by: input.createdBy,
    })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("建立課程失敗");
  return mapCourse(data as Record<string, unknown>);
}

export async function updateTrainingCourse(
  courseId: string,
  patch: Partial<{
    title: string;
    description: string;
    visibility: TrainingVisibility;
    siteId: SiteId | null;
    hasExam: boolean;
    passingScore: number;
    status: TrainingCourseStatus;
  }>
): Promise<void> {
  const supabase = createClient();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) updates.title = patch.title.trim();
  if (patch.description !== undefined) updates.description = patch.description.trim();
  if (patch.visibility !== undefined) updates.visibility = patch.visibility;
  if (patch.siteId !== undefined || patch.visibility !== undefined) {
    const visibility = patch.visibility;
    if (visibility === "all_sites") {
      updates.site_id = null;
    } else if (patch.siteId !== undefined) {
      updates.site_id = patch.siteId;
    }
  }
  if (patch.hasExam !== undefined) updates.has_exam = patch.hasExam;
  if (patch.passingScore !== undefined) updates.passing_score = patch.passingScore;
  if (patch.status !== undefined) updates.status = patch.status;
  const { error } = await supabase.from("training_courses").update(updates).eq("id", courseId);
  if (error) throw error;
}

export async function deleteTrainingCourse(courseId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("training_courses").delete().eq("id", courseId);
  if (error) throw error;
}

export async function addTrainingMaterial(input: {
  courseId: string;
  title: string;
  sortOrder: number;
  storagePath?: string | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;
  externalUrl?: string | null;
}): Promise<TrainingMaterial> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("training_materials")
    .insert({
      course_id: input.courseId,
      title: input.title.trim(),
      sort_order: input.sortOrder,
      storage_path: input.storagePath ?? null,
      file_name: input.fileName ?? null,
      mime_type: input.mimeType ?? null,
      file_size: input.fileSize ?? null,
      external_url: input.externalUrl ?? null,
    })
    .select("*")
    .single();
  if (error || !data) throw error ?? new Error("新增教材失敗");
  return mapMaterial(data as Record<string, unknown>);
}

export async function deleteTrainingMaterial(materialId: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.from("training_materials").delete().eq("id", materialId);
  if (error) throw error;
}

export async function replaceCourseQuestions(
  courseId: string,
  questions: Array<{
    questionText: string;
    sortOrder: number;
    options: QuizOption[];
    correctOptionId: string;
  }>
): Promise<void> {
  const supabase = createClient();
  const { error: delError } = await supabase
    .from("training_quiz_questions")
    .delete()
    .eq("course_id", courseId);
  if (delError) throw delError;
  if (questions.length === 0) return;
  const { error } = await supabase.from("training_quiz_questions").insert(
    questions.map((q) => ({
      course_id: courseId,
      question_text: q.questionText.trim(),
      sort_order: q.sortOrder,
      options: q.options.filter((o) => o.text.trim()),
      correct_option_id: q.correctOptionId,
    }))
  );
  if (error) throw error;
}

export async function markMaterialsViewed(courseId: string, userId: string, hasExam: boolean): Promise<void> {
  const supabase = createClient();
  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("training_progress")
    .select("id, status")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    const nextStatus = hasExam ? "materials_done" : "completed";
    const { error } = await supabase
      .from("training_progress")
      .update({
        materials_viewed_at: now,
        status: nextStatus,
        completed_at: hasExam ? null : now,
        updated_at: now,
      })
      .eq("id", existing.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("training_progress").insert({
    course_id: courseId,
    user_id: userId,
    materials_viewed_at: now,
    status: hasExam ? "materials_done" : "completed",
    completed_at: hasExam ? null : now,
  });
  if (error) throw error;
}

export async function loadTrainingTargetEmployees(
  course: Pick<TrainingCourse, "visibility" | "siteId">
): Promise<Array<{ id: string; name: string; siteId: SiteId }>> {
  const supabase = createClient();
  let query = supabase
    .from("users")
    .select("id, name, site_id, role")
    .eq("is_active", true)
    .neq("role", "boss")
    .neq("role", "owner");
  if (course.visibility === "single_site" && course.siteId) {
    query = query.eq("site_id", course.siteId);
  }
  const { data, error } = await query.order("name");
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    siteId: (String(r.site_id ?? "zhushan") as SiteId),
  }));
}

export async function getOrCreateProgress(
  courseId: string,
  userId: string
): Promise<TrainingProgress | null> {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from("training_progress")
    .select("*")
    .eq("course_id", courseId)
    .eq("user_id", userId)
    .maybeSingle();
  if (existing) return mapProgress(existing as Record<string, unknown>);

  const { data, error } = await supabase
    .from("training_progress")
    .insert({ course_id: courseId, user_id: userId })
    .select("*")
    .single();
  if (error) return null;
  return mapProgress(data as Record<string, unknown>);
}
