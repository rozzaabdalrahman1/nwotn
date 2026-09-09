-- Newton Science Platform
-- Apply this file in the Supabase SQL editor.
-- Auth users are stored in auth.users; profiles contains application roles.

create extension if not exists pgcrypto;

create type public.user_role as enum ('student','teacher','admin');
create type public.course_status as enum ('draft','published','archived');
create type public.lesson_type as enum ('video','article','pdf','quiz','assignment');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.user_role not null default 'student',
  avatar_url text,
  phone text,
  grade text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text default '',
  cover_url text,
  grade text,
  status public.course_status not null default 'draft',
  teacher_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table public.lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  title text not null,
  description text default '',
  type public.lesson_type not null default 'video',
  video_url text,
  content text,
  file_url text,
  duration_minutes int not null default 0,
  sort_order int not null default 0,
  is_free boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  unique(student_id, course_id)
);

create table public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  completed boolean not null default false,
  watched_seconds int not null default 0,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(student_id, lesson_id)
);

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid unique references public.lessons(id) on delete cascade,
  title text not null,
  passing_score int not null default 50,
  time_limit_minutes int,
  created_at timestamptz not null default now()
);

create table public.questions (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  question_text text not null,
  explanation text default '',
  points int not null default 1,
  sort_order int not null default 0
);

create table public.question_choices (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  choice_text text not null,
  is_correct boolean not null default false,
  sort_order int not null default 0
);

create table public.quiz_attempts (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  score numeric(6,2) not null default 0,
  total_points int not null default 0,
  submitted_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid references public.lessons(id) on delete cascade,
  title text not null,
  instructions text default '',
  due_at timestamptz,
  max_score int not null default 100,
  created_at timestamptz not null default now()
);

create table public.assignment_submissions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  answer_text text default '',
  file_url text,
  score numeric(6,2),
  teacher_feedback text,
  submitted_at timestamptz not null default now(),
  graded_at timestamptz,
  unique(assignment_id, student_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index courses_teacher_idx on public.courses(teacher_id);
create index modules_course_idx on public.modules(course_id, sort_order);
create index lessons_module_idx on public.lessons(module_id, sort_order);
create index enrollments_student_idx on public.enrollments(student_id);
create index progress_student_idx on public.lesson_progress(student_id);
create index attempts_student_idx on public.quiz_attempts(student_id, submitted_at desc);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'student')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id = auth.uid() and role in ('teacher','admin')); $$;

alter table public.profiles enable row level security;
alter table public.courses enable row level security;
alter table public.modules enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.quizzes enable row level security;
alter table public.questions enable row level security;
alter table public.question_choices enable row level security;
alter table public.quiz_attempts enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select_own_or_staff on public.profiles for select using (id = auth.uid() or public.is_staff());
create policy profiles_update_own on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

create policy published_courses_read on public.courses for select using (status = 'published' or teacher_id = auth.uid() or public.is_staff());
create policy staff_courses_insert on public.courses for insert with check (public.is_staff());
create policy staff_courses_update on public.courses for update using (public.is_staff());
create policy staff_courses_delete on public.courses for delete using (public.is_staff());

create policy modules_read on public.modules for select using (exists(select 1 from public.courses c where c.id = course_id and (c.status='published' or c.teacher_id=auth.uid() or public.is_staff())));
create policy modules_staff_write on public.modules for all using (public.is_staff()) with check (public.is_staff());

create policy lessons_read on public.lessons for select using (exists(select 1 from public.modules m join public.courses c on c.id=m.course_id where m.id=module_id and (c.status='published' or c.teacher_id=auth.uid() or public.is_staff())));
create policy lessons_staff_write on public.lessons for all using (public.is_staff()) with check (public.is_staff());

create policy enrollments_student_read on public.enrollments for select using (student_id=auth.uid() or public.is_staff());
create policy enrollments_staff_write on public.enrollments for all using (public.is_staff()) with check (public.is_staff());

create policy progress_student_all on public.lesson_progress for all using (student_id=auth.uid() or public.is_staff()) with check (student_id=auth.uid() or public.is_staff());
create policy quizzes_read on public.quizzes for select using (public.is_staff() or exists(select 1 from public.lessons l join public.modules m on m.id=l.module_id join public.courses c on c.id=m.course_id where l.id=lesson_id and (c.status='published' or c.teacher_id=auth.uid())));
create policy quizzes_staff_write on public.quizzes for all using (public.is_staff()) with check (public.is_staff());
create policy questions_read on public.questions for select using (public.is_staff() or exists(select 1 from public.quizzes q join public.lessons l on l.id=q.lesson_id join public.modules m on m.id=l.module_id join public.courses c on c.id=m.course_id where q.id=quiz_id and (c.status='published' or c.teacher_id=auth.uid())));
create policy questions_staff_write on public.questions for all using (public.is_staff()) with check (public.is_staff());
create policy choices_read on public.question_choices for select using (public.is_staff() or exists(select 1 from public.questions q join public.quizzes z on z.id=q.quiz_id join public.lessons l on l.id=z.lesson_id join public.modules m on m.id=l.module_id join public.courses c on c.id=m.course_id where q.id=question_id and (c.status='published' or c.teacher_id=auth.uid())));
create policy choices_staff_write on public.question_choices for all using (public.is_staff()) with check (public.is_staff());

create policy attempts_student_read_insert on public.quiz_attempts for select using (student_id=auth.uid() or public.is_staff());
create policy attempts_student_insert on public.quiz_attempts for insert with check (student_id=auth.uid());

create policy assignments_read on public.assignments for select using (public.is_staff() or exists(select 1 from public.lessons l join public.modules m on m.id=l.module_id join public.courses c on c.id=m.course_id where l.id=lesson_id and (c.status='published' or c.teacher_id=auth.uid())));
create policy assignments_staff_write on public.assignments for all using (public.is_staff()) with check (public.is_staff());
create policy submissions_student_read_insert on public.assignment_submissions for select using (student_id=auth.uid() or public.is_staff());
create policy submissions_student_insert_update on public.assignment_submissions for insert with check (student_id=auth.uid());
create policy submissions_staff_update on public.assignment_submissions for update using (public.is_staff());

create policy notifications_own on public.notifications for select using (user_id=auth.uid());
create policy notifications_update_own on public.notifications for update using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy notifications_staff_insert on public.notifications for insert with check (public.is_staff());

-- Seed public course content can be added after creating the teacher account.
