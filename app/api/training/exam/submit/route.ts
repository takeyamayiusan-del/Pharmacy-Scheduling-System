import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

async function getCaller(req: NextRequest) {
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },
        setAll() {
          return;
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return user;
}

/** 提交測驗答案（伺服器端判分） */
export async function POST(req: NextRequest) {
  try {
    const user = await getCaller(req);
    if (!user) {
      return NextResponse.json({ error: "尚未登入" }, { status: 401 });
    }

    const body = (await req.json()) as {
      courseId?: string;
      answers?: Record<string, string>;
    };
    const courseId = String(body.courseId ?? "");
    const answers = body.answers ?? {};
    if (!courseId) {
      return NextResponse.json({ error: "缺少 courseId" }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data: course, error: courseError } = await admin
      .from("training_courses")
      .select("id, has_exam, passing_score, status")
      .eq("id", courseId)
      .single();

    if (courseError || !course) {
      return NextResponse.json({ error: "找不到課程" }, { status: 404 });
    }
    if (!course.has_exam) {
      return NextResponse.json({ error: "此課程無測驗" }, { status: 400 });
    }
    if (course.status !== "published") {
      return NextResponse.json({ error: "課程尚未發布" }, { status: 400 });
    }

    const { data: progress } = await admin
      .from("training_progress")
      .select("*")
      .eq("course_id", courseId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (!progress?.materials_viewed_at) {
      return NextResponse.json({ error: "請先閱讀完教材再測驗" }, { status: 400 });
    }
    if (progress.status === "completed") {
      return NextResponse.json({ error: "您已完成此課程" }, { status: 400 });
    }

    const { data: questions, error: qError } = await admin
      .from("training_quiz_questions")
      .select("id, correct_option_id")
      .eq("course_id", courseId);

    if (qError || !questions?.length) {
      return NextResponse.json({ error: "找不到測驗題目" }, { status: 400 });
    }

    let correct = 0;
    for (const q of questions) {
      if (answers[q.id] === q.correct_option_id) correct += 1;
    }
    const score = Math.round((correct / questions.length) * 100);
    const passed = score >= Number(course.passing_score ?? 80);
    const now = new Date().toISOString();

    const { error: updateError } = await admin
      .from("training_progress")
      .update({
        exam_score: score,
        exam_passed: passed,
        exam_submitted_at: now,
        exam_answers: answers,
        status: passed ? "completed" : "materials_done",
        completed_at: passed ? now : null,
        updated_at: now,
      })
      .eq("course_id", courseId)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({
      score,
      passed,
      passingScore: course.passing_score,
      correctCount: correct,
      totalCount: questions.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "提交失敗" },
      { status: 500 }
    );
  }
}
