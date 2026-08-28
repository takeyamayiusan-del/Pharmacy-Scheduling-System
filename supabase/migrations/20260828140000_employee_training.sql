-- 員工教育訓練：課程、教材、測驗、完成紀錄

CREATE OR REPLACE FUNCTION public.is_training_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.role IN ('boss', 'owner', 'manager', 'deputy')
  );
$$;

CREATE OR REPLACE FUNCTION public.auth_user_site_id()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT u.site_id FROM public.users u WHERE u.id = auth.uid()),
    'zhushan'
  );
$$;

CREATE TABLE IF NOT EXISTS public.training_courses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           VARCHAR(200) NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  visibility      VARCHAR(20) NOT NULL DEFAULT 'single_site'
                  CHECK (visibility IN ('all_sites', 'single_site')),
  site_id         TEXT CHECK (site_id IN ('zhushan', 'jiji')),
  status          VARCHAR(20) NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft', 'published', 'archived')),
  has_exam        BOOLEAN NOT NULL DEFAULT FALSE,
  passing_score   INTEGER NOT NULL DEFAULT 80 CHECK (passing_score BETWEEN 0 AND 100),
  created_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT training_course_visibility_site CHECK (
    (visibility = 'all_sites' AND site_id IS NULL)
    OR (visibility = 'single_site' AND site_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_training_courses_status
  ON public.training_courses (status, visibility, site_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.training_course_visible(course_row public.training_courses)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    course_row.status = 'published'
    AND (
      course_row.visibility = 'all_sites'
      OR course_row.site_id = public.auth_user_site_id()
    );
$$;

CREATE TABLE IF NOT EXISTS public.training_materials (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id       UUID NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  title           VARCHAR(200) NOT NULL,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  storage_path    TEXT,
  file_name       VARCHAR(255),
  mime_type       VARCHAR(120),
  file_size       INTEGER,
  external_url    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_materials_course
  ON public.training_materials (course_id, sort_order);

CREATE TABLE IF NOT EXISTS public.training_quiz_questions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id           UUID NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  question_text       TEXT NOT NULL,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  options             JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_option_id   VARCHAR(20) NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_quiz_course
  ON public.training_quiz_questions (course_id, sort_order);

CREATE TABLE IF NOT EXISTS public.training_progress (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id           UUID NOT NULL REFERENCES public.training_courses(id) ON DELETE CASCADE,
  user_id             UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  materials_viewed_at TIMESTAMPTZ,
  exam_score          INTEGER,
  exam_passed         BOOLEAN,
  exam_submitted_at   TIMESTAMPTZ,
  exam_answers        JSONB,
  status              VARCHAR(20) NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'materials_done', 'completed')),
  completed_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (course_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_training_progress_course
  ON public.training_progress (course_id, status);
CREATE INDEX IF NOT EXISTS idx_training_progress_user
  ON public.training_progress (user_id, status);

ALTER TABLE public.training_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;

-- courses
CREATE POLICY "training_courses_select" ON public.training_courses
  FOR SELECT USING (
    public.is_training_admin()
    OR public.training_course_visible(training_courses)
  );

CREATE POLICY "training_courses_write_admin" ON public.training_courses
  FOR ALL USING (public.is_training_admin())
  WITH CHECK (public.is_training_admin());

-- materials
CREATE POLICY "training_materials_select" ON public.training_materials
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.training_courses c
      WHERE c.id = course_id
        AND (
          public.is_training_admin()
          OR public.training_course_visible(c)
        )
    )
  );

CREATE POLICY "training_materials_write_admin" ON public.training_materials
  FOR ALL USING (public.is_training_admin())
  WITH CHECK (public.is_training_admin());

-- quiz (employees only see when materials_done - enforced in app; admins always)
CREATE POLICY "training_quiz_select" ON public.training_quiz_questions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.training_courses c
      WHERE c.id = course_id
        AND (
          public.is_training_admin()
          OR (
            public.training_course_visible(c)
            AND EXISTS (
              SELECT 1 FROM public.training_progress p
              WHERE p.course_id = c.id
                AND p.user_id = auth.uid()
                AND p.materials_viewed_at IS NOT NULL
            )
          )
        )
    )
  );

CREATE POLICY "training_quiz_write_admin" ON public.training_quiz_questions
  FOR ALL USING (public.is_training_admin())
  WITH CHECK (public.is_training_admin());

-- progress
CREATE POLICY "training_progress_select" ON public.training_progress
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_training_admin()
  );

CREATE POLICY "training_progress_insert_own" ON public.training_progress
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "training_progress_update_own" ON public.training_progress
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_courses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_materials TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_quiz_questions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.training_progress TO authenticated;

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'training-materials',
  'training-materials',
  FALSE,
  52428800,
  ARRAY[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "training_materials_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'training-materials' AND auth.role() = 'authenticated'
  );

CREATE POLICY "training_materials_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'training-materials' AND auth.role() = 'authenticated'
  );

CREATE POLICY "training_materials_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'training-materials' AND public.is_training_admin()
  );
