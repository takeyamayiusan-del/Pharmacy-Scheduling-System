"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, CheckCircle2, ClipboardCheck, FileText, PlayCircle } from "lucide-react";
import { useApp } from "@/lib/context/AppContext";
import { SITES } from "@/lib/sites";
import {
  getOrCreateProgress,
  loadCourseMaterials,
  loadCourseQuestions,
  loadMyProgress,
  loadPublishedCoursesForUser,
  markMaterialsViewed,
} from "@/lib/training/api";
import {
  TRAINING_PROGRESS_LABELS,
  TRAINING_VISIBILITY_LABELS,
  materialKindLabel,
  type TrainingCourse,
  type TrainingMaterial,
  type TrainingProgress,
  type TrainingQuizQuestion,
} from "@/lib/training/types";

export default function TrainingPage() {
  const { currentUser } = useApp();
  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, TrainingProgress>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [materials, setMaterials] = useState<TrainingMaterial[]>([]);
  const [questions, setQuestions] = useState<TrainingQuizQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [submittingExam, setSubmittingExam] = useState(false);
  const [examResult, setExamResult] = useState<{
    score: number;
    passed: boolean;
    passingScore: number;
  } | null>(null);

  const selected = useMemo(
    () => courses.find((c) => c.id === selectedId) ?? null,
    [courses, selectedId]
  );
  const selectedProgress = selected ? progressMap[selected.id] : null;

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadPublishedCoursesForUser();
      setCourses(list);
      const progress = await loadMyProgress(list.map((c) => c.id));
      const map: Record<string, TrainingProgress> = {};
      progress.forEach((p) => {
        map[p.courseId] = p;
      });
      setProgressMap(map);
    } catch (err) {
      alert(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const openCourse = async (course: TrainingCourse) => {
    setSelectedId(course.id);
    setExamResult(null);
    setAnswers({});
    setDetailLoading(true);
    try {
      if (currentUser) {
        await getOrCreateProgress(course.id, currentUser.id);
      }
      const mats = await loadCourseMaterials(course.id);
      const progressRows = await loadMyProgress([course.id]);
      const prog = progressRows[0];
      if (prog) {
        setProgressMap((prev) => ({ ...prev, [course.id]: prog }));
      }
      setMaterials(mats);
      if (course.hasExam && prog?.materialsViewedAt) {
        setQuestions(await loadCourseQuestions(course.id));
      } else {
        setQuestions([]);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "載入課程失敗");
    } finally {
      setDetailLoading(false);
    }
  };

  const openMaterial = async (materialId: string) => {
    try {
      const res = await fetch(`/api/training/materials?id=${encodeURIComponent(materialId)}`);
      const json = (await res.json()) as { error?: string; url?: string };
      if (!res.ok || !json.url) {
        alert(json.error || "無法開啟教材");
        return;
      }
      window.open(json.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      alert(err instanceof Error ? err.message : "無法開啟教材");
    }
  };

  const handleMarkViewed = async () => {
    if (!selected || !currentUser) return;
    try {
      await markMaterialsViewed(selected.id, currentUser.id, selected.hasExam);
      const progress = await loadMyProgress([selected.id]);
      if (progress[0]) {
        setProgressMap((prev) => ({ ...prev, [selected.id]: progress[0] }));
      }
      if (selected.hasExam) {
        const qs = await loadCourseQuestions(selected.id);
        setQuestions(qs);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "更新失敗");
    }
  };

  const handleSubmitExam = async () => {
    if (!selected) return;
    for (const q of questions) {
      if (!answers[q.id]) {
        alert("請作答每一題");
        return;
      }
    }
    setSubmittingExam(true);
    try {
      const res = await fetch("/api/training/exam/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: selected.id, answers }),
      });
      const json = (await res.json()) as {
        error?: string;
        score?: number;
        passed?: boolean;
        passingScore?: number;
      };
      if (!res.ok) {
        alert(json.error || "提交失敗");
        return;
      }
      setExamResult({
        score: json.score ?? 0,
        passed: Boolean(json.passed),
        passingScore: json.passingScore ?? 80,
      });
      await reload();
      if (selectedId) {
        const progress = await loadMyProgress([selectedId]);
        if (progress[0]) {
          setProgressMap((prev) => ({ ...prev, [selectedId]: progress[0] }));
        }
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "提交失敗");
    } finally {
      setSubmittingExam(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="app-toolbar justify-between">
        <div>
          <h1 className="app-page-title">教育訓練</h1>
          <p className="app-meta mt-1">閱讀教材；若有測驗需及格後才算完成。</p>
        </div>
      </div>

      {loading ? (
        <div className="app-panel p-8 text-center text-gray-500">載入中…</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-6">
          <div className="app-panel p-4 space-y-2">
            <h2 className="font-semibold text-gray-900 mb-2">我的訓練課程</h2>
            {courses.length === 0 ? (
              <p className="text-sm text-gray-500">目前沒有已發布的訓練課程。</p>
            ) : (
              courses.map((course) => {
                const progress = progressMap[course.id];
                const done = progress?.status === "completed";
                return (
                  <button
                    key={course.id}
                    type="button"
                    onClick={() => void openCourse(course)}
                    className={`w-full text-left rounded-xl border p-3 transition-colors ${
                      selectedId === course.id
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 hover:border-blue-200"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      {done ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <BookOpen className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900 truncate">{course.title}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {course.visibility === "all_sites"
                            ? TRAINING_VISIBILITY_LABELS.all_sites
                            : SITES[course.siteId ?? "zhushan"]?.displayName}
                          {course.hasExam ? " · 含測驗" : ""}
                        </p>
                        <p className="text-xs mt-1 text-slate-600">
                          {TRAINING_PROGRESS_LABELS[progress?.status ?? "pending"]}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          <div className="app-panel p-6 min-h-[320px]">
            {!selected ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                請從左側選擇課程
              </div>
            ) : detailLoading ? (
              <div className="text-center text-gray-500 py-12">載入中…</div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{selected.title}</h2>
                  {selected.description ? (
                    <p className="text-sm text-gray-600 mt-2 whitespace-pre-wrap">{selected.description}</p>
                  ) : null}
                </div>

                <div>
                  <h3 className="font-medium text-gray-900 mb-3">教材</h3>
                  {materials.length === 0 ? (
                    <p className="text-sm text-gray-500">尚無教材。</p>
                  ) : (
                    <div className="space-y-2">
                      {materials.map((m) => (
                        <div
                          key={m.id}
                          className="flex items-center justify-between gap-3 rounded-lg border bg-slate-50 px-3 py-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {m.mimeType?.startsWith("video/") ? (
                              <PlayCircle className="w-4 h-4 text-purple-600 shrink-0" />
                            ) : (
                              <FileText className="w-4 h-4 text-sky-600 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{m.title}</p>
                              <p className="text-xs text-gray-500">
                                {materialKindLabel(m.mimeType)}
                                {m.fileName ? ` · ${m.fileName}` : ""}
                              </p>
                            </div>
                          </div>
                          {m.storagePath ? (
                            <button
                              type="button"
                              onClick={() => void openMaterial(m.id)}
                              className="text-xs px-3 py-1 rounded bg-blue-600 text-white"
                            >
                              開啟
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {selectedProgress?.status !== "completed" && (
                  <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3">
                    <p className="text-sm text-amber-900">
                      請先開啟並閱讀所有教材，再按下方確認。
                      {selected.hasExam ? " 確認後才能進行測驗。" : " 確認後即完成。"}
                    </p>
                    {!selectedProgress?.materialsViewedAt && (
                      <button
                        type="button"
                        onClick={() => void handleMarkViewed()}
                        className="mt-3 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm"
                      >
                        我已閱讀完教材
                      </button>
                    )}
                  </div>
                )}

                {selected.hasExam &&
                  selectedProgress?.materialsViewedAt &&
                  selectedProgress.status !== "completed" && (
                    <div className="space-y-4 border-t pt-4">
                      <h3 className="font-medium text-gray-900 flex items-center gap-2">
                        <ClipboardCheck className="w-5 h-5" />
                        課程測驗（及格 {selected.passingScore} 分）
                      </h3>
                      {questions.length === 0 ? (
                        <p className="text-sm text-gray-500">測驗題目載入中或尚未設定。</p>
                      ) : (
                        questions.map((q, idx) => (
                          <div key={q.id} className="rounded-lg border p-4 space-y-2">
                            <p className="text-sm font-medium">
                              {idx + 1}. {q.questionText}
                            </p>
                            <div className="space-y-1">
                              {q.options.map((opt) => (
                                <label key={opt.id} className="flex items-center gap-2 text-sm">
                                  <input
                                    type="radio"
                                    name={`q-${q.id}`}
                                    checked={answers[q.id] === opt.id}
                                    onChange={() =>
                                      setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))
                                    }
                                  />
                                  {opt.text}
                                </label>
                              ))}
                            </div>
                          </div>
                        ))
                      )}
                      <button
                        type="button"
                        disabled={submittingExam}
                        onClick={() => void handleSubmitExam()}
                        className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-60"
                      >
                        {submittingExam ? "提交中…" : "提交測驗"}
                      </button>
                      {examResult && !examResult.passed ? (
                        <p className="text-sm text-red-600">
                          得分 {examResult.score} 分，未達及格 {examResult.passingScore} 分，請重新作答。
                        </p>
                      ) : null}
                    </div>
                  )}

                {selectedProgress?.status === "completed" && (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-emerald-800 text-sm">
                    已完成
                    {selected.hasExam && selectedProgress.examScore != null
                      ? `（測驗 ${selectedProgress.examScore} 分）`
                      : ""}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
