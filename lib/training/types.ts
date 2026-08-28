import type { SiteId } from "@/lib/sites";

export type TrainingVisibility = "all_sites" | "single_site";
export type TrainingCourseStatus = "draft" | "published" | "archived";
export type TrainingProgressStatus = "pending" | "materials_done" | "completed";

export type QuizOption = {
  id: string;
  text: string;
};

export type TrainingCourse = {
  id: string;
  title: string;
  description: string;
  visibility: TrainingVisibility;
  siteId: SiteId | null;
  status: TrainingCourseStatus;
  hasExam: boolean;
  passingScore: number;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TrainingMaterial = {
  id: string;
  courseId: string;
  title: string;
  sortOrder: number;
  storagePath: string | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  externalUrl: string | null;
  createdAt: string;
};

export type TrainingQuizQuestion = {
  id: string;
  courseId: string;
  questionText: string;
  sortOrder: number;
  options: QuizOption[];
  correctOptionId: string;
  createdAt: string;
};

export type TrainingProgress = {
  id: string;
  courseId: string;
  userId: string;
  materialsViewedAt: string | null;
  examScore: number | null;
  examPassed: boolean | null;
  examSubmittedAt: string | null;
  examAnswers: Record<string, string> | null;
  status: TrainingProgressStatus;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const TRAINING_STATUS_LABELS: Record<TrainingCourseStatus, string> = {
  draft: "草稿",
  published: "已發布",
  archived: "已封存",
};

export const TRAINING_VISIBILITY_LABELS: Record<TrainingVisibility, string> = {
  all_sites: "全部店家",
  single_site: "指定店家",
};

export const TRAINING_PROGRESS_LABELS: Record<TrainingProgressStatus, string> = {
  pending: "未開始",
  materials_done: "已閱讀／待測驗",
  completed: "已完成",
};

export function materialKindLabel(mime: string | null | undefined): string {
  if (!mime) return "檔案";
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("presentation") || mime.includes("powerpoint")) return "PPT";
  if (mime.startsWith("video/")) return "影片";
  return "檔案";
}

export function isTrainingComplete(
  course: Pick<TrainingCourse, "hasExam">,
  progress: TrainingProgress | null | undefined
): boolean {
  return progress?.status === "completed";
}

export function newQuizOption(index: number): QuizOption {
  const id = String.fromCharCode(97 + index);
  return { id, text: "" };
}

export function validateQuizDraft(
  questions: Array<Pick<TrainingQuizQuestion, "questionText" | "options" | "correctOptionId">>
): string | null {
  if (questions.length === 0) return "請至少新增一題測驗";
  for (let i = 0; i < questions.length; i += 1) {
    const q = questions[i];
    if (!q.questionText.trim()) return `第 ${i + 1} 題請填寫題目`;
    const opts = q.options.filter((o) => o.text.trim());
    if (opts.length < 2) return `第 ${i + 1} 題至少需要 2 個選項`;
    if (!opts.some((o) => o.id === q.correctOptionId)) {
      return `第 ${i + 1} 題請選擇正確答案`;
    }
  }
  return null;
}
