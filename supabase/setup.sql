-- Run schema.sql first in Supabase SQL Editor.
-- Then create a teacher account from Supabase Dashboard > Authentication > Users.
-- Copy the teacher user's UUID and replace YOUR_TEACHER_UUID below.

insert into public.profiles (id, full_name, role)
values ('YOUR_TEACHER_UUID', 'أ/ حسام', 'teacher')
on conflict (id) do update set full_name='أ/ حسام', role='teacher';

insert into public.courses (title, description, grade, status, teacher_id) values
('العلوم المتكاملة', 'شرح مبسط ومنظم لمناهج العلوم مع تدريبات واختبارات.', 'المرحلة الثانوية', 'published', 'YOUR_TEACHER_UUID'),
('أساسيات الفيزياء', 'الحركة والقوى والطاقة بطريقة سهلة وتطبيقية.', 'إعدادي', 'published', 'YOUR_TEACHER_UUID'),
('أساسيات الكيمياء', 'الذرة والعناصر والمركبات والتفاعلات الكيميائية.', 'إعدادي', 'published', 'YOUR_TEACHER_UUID'),
('الأحياء ببساطة', 'مراجعات وتدريبات على أجهزة جسم الإنسان والوراثة.', 'إعدادي', 'published', 'YOUR_TEACHER_UUID');

-- Replace YOUR_TEACHER_UUID in this file before running it.
