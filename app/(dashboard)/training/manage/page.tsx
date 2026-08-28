"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2, Upload } from "lucide-react";
import { useApp } from "@/lib/context/AppContext";
import { canManageSite } from "@/lib/auth/roles";
import { SITE_IDS, SITES, type SiteId } from "@/lib/sites";
import {
  createTrainingCourse,
  deleteTrainingCourse,
  deleteTrainingMaterial,
  loadCourseMaterials,
  loadCourseProgress,
  loadCourseQuestions,
  loadManageCourses,
  loadTrainingTargetEmployees,
  replaceCourseQuestions,
  updateTrainingCourse,
} from "@/lib/training/api";
import {
  TRAINING_PROGRESS_LABELS,
  TRAINING_STATUS_LABELS,
  TRAINING_VISIBILITY_LABELS,
  materialKindLabel,
  newQuizOption,
  validateQuizDraft,
  type QuizOption,
  type TrainingCourse,
  type TrainingMaterial,
  type TrainingProgress,
  type TrainingQuizQuestion,
  type TrainingVisibility,
} from "@/lib/training/types";

type TabKey = "edit" | "progress";

type QuestionDraft = {
  localId: string;
  questionText: string;
  options: QuizOption[];
  correctOptionId: string;
};

const emptyCourseForm = {
  title: "",
  description: "",
  visibility: "single_site" as TrainingVisibility,
  siteId: "zhushan" as SiteId,
  hasExam: false,
  passingScore: 80,
};

function toQuestionDraft(q: TrainingQuizQuestion): QuestionDraft {
  return {
    localId: q.id,
    questionText: q.questionText,
    options: q.options.length > 0 ? q.options : [newQuizOption(0), newQuizOption(1)],
    correctOptionId: q.correctOptionId || "a",
  };
}

export default function TrainingManagePage() {
  const { currentUser, activeSiteId } = useApp();
  const canManage = canManageSite(currentUser?.role);

  const [courses, setCourses] = useState<TrainingCourse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("edit");
  const [form, setForm] = useState(emptyCourseForm);
  const [materials, setMaterials] = useState<TrainingMaterial[]>([]);
  const [questions, setQuestions] = useState<QuestionDraft[]>([]);
  const [progressRows, setProgressRows] = useState<TrainingProgress[]>([]);
  const [targetEmployees, setTargetEmployees] = useState<
    Array<{ id: string; name: string; siteId: SiteId }>
  >([]);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const selected = useMemo(
    () => courses.find((c) => c.id === selectedId) ?? null,
    [courses, selectedId]
  );

  const targetEmployeesResolved = targetEmployees;

  const progressByUser = useMemo(() => {
    const map = new Map<string, TrainingProgress>();
    progressRows.forEach((p) => map.set(p.userId, p));
    return map;
  }, [progressRows]);

  const reloadCourses = useCallback(async () => {
    setLoading(true);
    try {
      const list = await loadManageCourses();
      setCourses(list);
    } catch (err) {
      alert(err instanceof Error ? err.message : "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (canManage) void reloadCourses();
  }, [canManage, reloadCourses]);

  const loadSelectedDetails = async (course: TrainingCourse) => {
    setSelectedId(course.id);
    setForm({
      title: course.title,
      description: course.description,
      visibility: course.visibility,
      siteId: course.siteId ?? activeSiteId,
      hasExam: course.hasExam,
      passingScore: course.passingScore,
    });
    const [mats, qs, prog, targets] = await Promise.all([
      loadCourseMaterials(course.id),
      loadCourseQuestions(course.id),
      loadCourseProgress(course.id),
      loadTrainingTargetEmployees(course),
    ]);
    setMaterials(mats);
    setQuestions(qs.map(toQuestionDraft));
    setProgressRows(prog);
    setTargetEmployees(targets);
  };

  const handleCreateCourse = async () => {
    if (!currentUser || !form.title.trim()) {
      alert("請填寫課程名稱");
      return;
    }
    setSaving(true);
    try {
      const course = await createTrainingCourse({
        title: form.title,
        description: form.description,
        visibility: form.visibility,
        siteId: form.visibility === "single_site" ? form.siteId : null,
        hasExam: form.hasExam,
        passingScore: form.passingScore,
        createdBy: currentUser.id,
      });
      await reloadCourses();
      await loadSelectedDetails(course);
    } catch (err) {
      alert(err instanceof Error ? err.message : "建立失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCourse = async () => {
    if (!selected) return;
    if (!form.title.trim()) {
      alert("請填寫課程名稱");
      return;
    }
    if (form.hasExam) {
      const err = validateQuizDraft(questions);
      if (err) {
        alert(err);
        return;
      }
    }
    setSaving(true);
    try {
      await updateTrainingCourse(selected.id, {
        title: form.title,
        description: form.description,
        visibility: form.visibility,
        siteId: form.visibility === "single_site" ? form.siteId : null,
        hasExam: form.hasExam,
        passingScore: form.passingScore,
      });
      if (form.hasExam) {
        await replaceCourseQuestions(
          selected.id,
          questions.map((q, idx) => ({
            questionText: q.questionText,
            sortOrder: idx,
            options: q.options,
            correctOptionId: q.correctOptionId,
          }))
        );
      } else {
        await replaceCourseQuestions(selected.id, []);
      }
      await reloadCourses();
      await loadSelectedDetails({ ...selected, ...form, siteId: form.visibility === "single_site" ? form.siteId : null });
      alert("已儲存");
    } catch (err) {
      alert(err instanceof Error ? err.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!selected) return;
    if (materials.length === 0) {
      alert("請至少上傳一個教材後再發布");
      return;
    }
    if (form.hasExam) {
      const err = validateQuizDraft(questions);
      if (err) {
        alert(err);
        return;
      }
    }
    if (!form.title.trim()) {
      alert("請填寫課程名稱");
      return;
    }
    setSaving(true);
    try {
      await updateTrainingCourse(selected.id, {
        title: form.title,
        description: form.description,
        visibility: form.visibility,
        siteId: form.visibility === "single_site" ? form.siteId : null,
        hasExam: form.hasExam,
        passingScore: form.passingScore,
      });
      if (form.hasExam) {
        await replaceCourseQuestions(
          selected.id,
          questions.map((q, idx) => ({
            questionText: q.questionText,
            sortOrder: idx,
            options: q.options,
            correctOptionId: q.correctOptionId,
          }))
        );
      } else {
        await replaceCourseQuestions(selected.id, []);
      }
      await updateTrainingCourse(selected.id, { status: "published" });
      await reloadCourses();
      await loadSelectedDetails({ ...selected, status: "published" });
      alert("已發布");
    } catch (err) {
      alert(err instanceof Error ? err.message : "發布失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCourse = async () => {
    if (!selected || !window.confirm(`確定刪除「${selected.title}」？`)) return;
    try {
      await deleteTrainingCourse(selected.id);
      setSelectedId(null);
      setMaterials([]);
      setQuestions([]);
      await reloadCourses();
    } catch (err) {
      alert(err instanceof Error ? err.message : "刪除失敗");
    }
  };

  const handleUploadMaterial = async () => {
    if (!selected || !uploadFile || !uploadTitle.trim()) {
      alert("請填寫教材名稱並選擇檔案");
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("courseId", selected.id);
      formData.append("title", uploadTitle.trim());
      formData.append("file", uploadFile);
      const res = await fetch("/api/training/materials", { method: "POST", body: formData });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        alert(json.error || "上傳失敗");
        return;
      }
      setUploadTitle("");
      setUploadFile(null);
      setMaterials(await loadCourseMaterials(selected.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : "上傳失敗");
    } finally {
      setUploading(false);
    }
  };

  const addQuestion = () => {
    setQuestions((prev) => [
      ...prev,
      {
        localId: `new-${Date.now()}`,
        questionText: "",
        options: [newQuizOption(0), newQuizOption(1), newQuizOption(2), newQuizOption(3)],
        correctOptionId: "a",
      },
    ]);
  };

  if (!canManage) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <p className="text-gray-500">僅老闆／店長／副店可管理教育訓練</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="app-toolbar justify-between flex-wrap gap-3">
        <div>
          <h1 className="app-page-title">訓練管理</h1>
          <p className="app-meta mt-1">新增教材、設定測驗，並追蹤員工完成狀況。</p>
        </div>
        <Link href="/training" className="text-sm text-blue-600 hover:underline">
          前往員工訓練頁
        </Link>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6">
        <div className="app-panel p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">課程列表</h2>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setForm({ ...emptyCourseForm, siteId: activeSiteId });
                setMaterials([]);
                setQuestions([]);
              }}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-600 text-white"
            >
              <Plus className="w-3 h-3" /> 新增
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-gray-500">載入中…</p>
          ) : (
            courses.map((course) => (
              <button
                key={course.id}
                type="button"
                onClick={() => void loadSelectedDetails(course)}
                className={`w-full text-left rounded-lg border p-3 ${
                  selectedId === course.id ? "border-blue-400 bg-blue-50" : "border-slate-200"
                }`}
              >
                <p className="font-medium text-sm truncate">{course.title}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {TRAINING_STATUS_LABELS[course.status]} ·{" "}
                  {course.visibility === "all_sites"
                    ? TRAINING_VISIBILITY_LABELS.all_sites
                    : SITES[course.siteId ?? "zhushan"]?.displayName}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="app-panel p-6 space-y-5">
          <div className="flex gap-2 border-b pb-2">
            <button
              type="button"
              onClick={() => setTab("edit")}
              className={`px-3 py-1.5 text-sm rounded ${tab === "edit" ? "bg-blue-600 text-white" : ""}`}
            >
              課程設定
            </button>
            <button
              type="button"
              onClick={() => setTab("progress")}
              disabled={!selected}
              className={`px-3 py-1.5 text-sm rounded ${tab === "progress" ? "bg-blue-600 text-white" : ""} disabled:opacity-50`}
            >
              完成追蹤
            </button>
          </div>

          {tab === "progress" && selected ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left">姓名</th>
                    <th className="px-3 py-2 text-left">店別</th>
                    <th className="px-3 py-2 text-left">狀態</th>
                    <th className="px-3 py-2 text-left">測驗分數</th>
                    <th className="px-3 py-2 text-left">完成時間</th>
                  </tr>
                </thead>
                <tbody>
                  {targetEmployeesResolved.map((emp) => {
                    const p = progressByUser.get(emp.id);
                    return (
                      <tr key={emp.id} className="border-t">
                        <td className="px-3 py-2">{emp.name}</td>
                        <td className="px-3 py-2">{SITES[emp.siteId]?.displayName ?? emp.siteId}</td>
                        <td className="px-3 py-2">{TRAINING_PROGRESS_LABELS[p?.status ?? "pending"]}</td>
                        <td className="px-3 py-2">{p?.examScore != null ? `${p.examScore} 分` : "—"}</td>
                        <td className="px-3 py-2">
                          {p?.completedAt ? new Date(p.completedAt).toLocaleString("zh-TW") : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm md:col-span-2">
                  <span className="text-gray-700">課程名稱</span>
                  <input
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                  />
                </label>
                <label className="block text-sm md:col-span-2">
                  <span className="text-gray-700">說明</span>
                  <textarea
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    rows={3}
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-gray-700">可見範圍</span>
                  <select
                    value={form.visibility}
                    onChange={(e) =>
                      setForm({ ...form, visibility: e.target.value as TrainingVisibility })
                    }
                    className="mt-1 w-full border rounded-lg px-3 py-2"
                  >
                    <option value="single_site">{TRAINING_VISIBILITY_LABELS.single_site}</option>
                    <option value="all_sites">{TRAINING_VISIBILITY_LABELS.all_sites}</option>
                  </select>
                </label>
                {form.visibility === "single_site" && (
                  <label className="block text-sm">
                    <span className="text-gray-700">指定店家</span>
                    <select
                      value={form.siteId}
                      onChange={(e) => setForm({ ...form, siteId: e.target.value as SiteId })}
                      className="mt-1 w-full border rounded-lg px-3 py-2"
                    >
                      {SITE_IDS.map((id) => (
                        <option key={id} value={id}>
                          {SITES[id].displayName}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="inline-flex items-center gap-2 text-sm md:col-span-2">
                  <input
                    type="checkbox"
                    checked={form.hasExam}
                    onChange={(e) => setForm({ ...form, hasExam: e.target.checked })}
                  />
                  完成閱讀後需通過測驗
                </label>
                {form.hasExam && (
                  <label className="block text-sm">
                    <span className="text-gray-700">及格分數</span>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.passingScore}
                      onChange={(e) =>
                        setForm({ ...form, passingScore: Number(e.target.value) || 80 })
                      }
                      className="mt-1 w-full border rounded-lg px-3 py-2"
                    />
                  </label>
                )}
              </div>

              <div className="border-t pt-4 space-y-3">
                <h3 className="font-medium">教材（PDF／PPT／影片，≤50MB）</h3>
                {selected ? (
                  <>
                    {materials.map((m) => (
                      <div key={m.id} className="flex items-center justify-between rounded border px-3 py-2">
                        <div>
                          <p className="text-sm font-medium">{m.title}</p>
                          <p className="text-xs text-gray-500">
                            {materialKindLabel(m.mimeType)} {m.fileName ? `· ${m.fileName}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            void deleteTrainingMaterial(m.id).then(() =>
                              loadCourseMaterials(selected.id).then(setMaterials)
                            )
                          }
                          className="text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <div className="flex flex-wrap gap-2 items-end">
                      <input
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value)}
                        placeholder="教材名稱"
                        className="border rounded px-3 py-2 text-sm"
                      />
                      <input
                        type="file"
                        accept=".pdf,.ppt,.pptx,.mp4,.webm,.mov,video/*,application/pdf"
                        onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                        className="text-sm"
                      />
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => void handleUploadMaterial()}
                        className="inline-flex items-center gap-1 px-3 py-2 rounded bg-green-600 text-white text-sm"
                      >
                        <Upload className="w-4 h-4" />
                        {uploading ? "上傳中…" : "上傳"}
                      </button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500">請先建立並儲存課程，再上傳教材。</p>
                )}
              </div>

              {form.hasExam && selected && (
                <div className="border-t pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">測驗題目（單選）</h3>
                    <button type="button" onClick={addQuestion} className="text-sm text-blue-600">
                      + 新增題目
                    </button>
                  </div>
                  {questions.map((q, idx) => (
                    <div key={q.localId} className="rounded border p-3 space-y-2">
                      <input
                        value={q.questionText}
                        onChange={(e) =>
                          setQuestions((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, questionText: e.target.value } : item
                            )
                          )
                        }
                        placeholder={`第 ${idx + 1} 題`}
                        className="w-full border rounded px-3 py-2 text-sm"
                      />
                      {q.options.map((opt, optIdx) => (
                        <div key={opt.id} className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`correct-${q.localId}`}
                            checked={q.correctOptionId === opt.id}
                            onChange={() =>
                              setQuestions((prev) =>
                                prev.map((item, i) =>
                                  i === idx ? { ...item, correctOptionId: opt.id } : item
                                )
                              )
                            }
                          />
                          <input
                            value={opt.text}
                            onChange={(e) =>
                              setQuestions((prev) =>
                                prev.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        options: item.options.map((o, j) =>
                                          j === optIdx ? { ...o, text: e.target.value } : o
                                        ),
                                      }
                                    : item
                                )
                              )
                            }
                            placeholder={`選項 ${opt.id.toUpperCase()}`}
                            className="flex-1 border rounded px-2 py-1 text-sm"
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap gap-2 border-t pt-4">
                {!selected ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleCreateCourse()}
                    className="px-4 py-2 rounded bg-blue-600 text-white text-sm"
                  >
                    建立課程
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handleSaveCourse()}
                      className="px-4 py-2 rounded bg-blue-600 text-white text-sm"
                    >
                      儲存
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void handlePublish()}
                      className="px-4 py-2 rounded bg-emerald-600 text-white text-sm"
                    >
                      發布
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDeleteCourse()}
                      className="px-4 py-2 rounded border border-red-200 text-red-600 text-sm"
                    >
                      刪除課程
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
