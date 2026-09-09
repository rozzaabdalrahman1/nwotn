const { createClient } = window.supabase;
const sb = createClient(window.NEWTON_SUPABASE_URL, window.NEWTON_SUPABASE_ANON_KEY);
const $ = (s) => document.querySelector(s);

async function getProfile(userId) {
  const { data, error } = await sb.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data;
}

async function loadCourses(userId) {
  const { data: courses, error } = await sb.from('courses').select('id,title,description,cover_url,grade,status,modules(id,title,sort_order,lessons(id,title,type,duration_minutes,sort_order))').eq('status','published').order('created_at',{ascending:false});
  if (error) throw error;
  const { data: enrollments } = await sb.from('enrollments').select('course_id').eq('student_id', userId);
  const enrolled = new Set((enrollments || []).map(x => x.course_id));
  const { data: progress } = await sb.from('lesson_progress').select('lesson_id,completed').eq('student_id', userId);
  const done = new Set((progress || []).filter(x => x.completed).map(x => x.lesson_id));
  const box = $('#courses');
  if (!courses?.length) { box.innerHTML = '<div class="empty">لا توجد كورسات منشورة حاليًا. سيظهر المحتوى هنا بمجرد أن يضيفه أ/ حسام.</div>'; return; }
  box.innerHTML = courses.map((c,i) => {
    const lessons = (c.modules||[]).flatMap(m => m.lessons||[]);
    const percent = lessons.length ? Math.round(lessons.filter(l=>done.has(l.id)).length/lessons.length*100) : 0;
    return `<article class="course"><div class="illus">${['⚛️','🧪','🚀','🧬'][i%4]}</div><div class="coursebody"><small>${escapeHtml(c.grade || 'علوم')}</small><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.description || 'محتوى تعليمي مع أ/ حسام')}</p><div class="bar"><i style="width:${percent}%"></i></div><div class="foot"><span>${enrolled.has(c.id) ? percent+'% مكتمل' : 'غير مشترك'}</span><button onclick="openCourse('${c.id}',${enrolled.has(c.id)})">${enrolled.has(c.id)?'فتح الكورس':'طلب الاشتراك'} ←</button></div></div></article>`;
  }).join('');
}

async function openCourse(courseId, enrolled) {
  if (!enrolled) { alert('هذا الكورس غير مشترك فيه حاليًا.'); return; }
  const { data } = await sb.from('courses').select('title,description,modules(title,sort_order,lessons(id,title,type,duration_minutes,sort_order))').eq('id',courseId).single();
  const lessons = (data.modules||[]).sort((a,b)=>a.sort_order-b.sort_order).flatMap(m => (m.lessons||[]).sort((a,b)=>a.sort_order-b.sort_order).map(l=>({...l,module:m.title})));
  $('#modalTitle').textContent = data.title;
  $('#modalBody').innerHTML = `<p>${escapeHtml(data.description||'')}</p>` + lessons.map(l=>`<div class="lesson"><span>▶</span><div><b>${escapeHtml(l.title)}</b><small>${escapeHtml(l.module)} • ${l.duration_minutes||0} دقيقة</small></div><button onclick="completeLesson('${l.id}')">${l.type==='video'?'مشاهدة':'فتح'}</button></div>`).join('');
  $('#modal').classList.add('show');
}

async function completeLesson(id) {
  const { data:{user} } = await sb.auth.getUser();
  if (!user) return;
  const { error } = await sb.from('lesson_progress').upsert({student_id:user.id,lesson_id:id,completed:true,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'student_id,lesson_id'});
  if (error) { alert(error.message); return; }
  alert('تم تسجيل الدرس كمكتمل ✅');
  closeModal(); loadCourses(user.id);
}

async function login() {
  const email = $('#email').value.trim(); const password = $('#password').value;
  if (!email || !password) return showMsg('اكتب البريد الإلكتروني وكلمة المرور.');
  setBusy(true);
  const { error } = await sb.auth.signInWithPassword({email,password});
  setBusy(false);
  if (error) showMsg(error.message); else await boot();
}

async function signup() {
  const name = $('#name').value.trim(); const email = $('#email').value.trim(); const password = $('#password').value;
  if (!name || !email || password.length < 6) return showMsg('اكتب الاسم والبريد وكلمة مرور 6 أحرف على الأقل.');
  setBusy(true);
  const { data, error } = await sb.auth.signUp({email,password,options:{data:{full_name:name}}});
  setBusy(false);
  if (error) return showMsg(error.message);
  if (data.session) await boot(); else showMsg('تم إنشاء الحساب. افتح بريدك لتأكيد الحساب ثم سجّل الدخول.');
}

async function boot() {
  const { data:{user} } = await sb.auth.getUser();
  if (!user) { $('#login').style.display='grid'; $('#app').style.display='none'; return; }
  let profile = null; try { profile = await getProfile(user.id); } catch(e) { console.error(e); }
  if (profile?.role === 'admin') location.href='admin.html';
  if (profile?.role === 'teacher') location.href='teacher.html';
  $('#login').style.display='none'; $('#app').style.display='block';
  $('#userName').textContent = profile?.full_name || user.user_metadata?.full_name || 'طالب';
  $('#userEmail').textContent = user.email || '';
  try { await loadCourses(user.id); } catch(e) { $('#courses').innerHTML='<div class="empty">تعذر تحميل البيانات: '+escapeHtml(e.message)+'</div>'; }
}

function setBusy(v){ $('#loginBtn').disabled=v; $('#loginBtn').textContent=v?'جاري الدخول...':'تسجيل الدخول'; }
function showMsg(t){ $('#msg').textContent=t; $('#msg').style.display='block'; }
function closeModal(){ $('#modal').classList.remove('show'); }
function escapeHtml(s){ return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function togglePassword(){ $('#password').type=$('#password').type==='password'?'text':'password'; }
function toggleSignup(){ const x=$('#name'); const signup=x.style.display==='none'; x.style.display=signup?'block':'none'; $('#loginBtn').onclick=signup?signup:login; $('#loginBtn').textContent=signup?'إنشاء حساب':'تسجيل الدخول'; $('#switch').textContent=signup?'لديك حساب بالفعل؟ تسجيل الدخول':'ليس لديك حساب؟ إنشاء حساب'; $('#switch').onclick=toggleSignup; }
async function logout(){ await sb.auth.signOut(); location.reload(); }
window.login=login; window.signup=signup; window.toggleSignup=toggleSignup; window.togglePassword=togglePassword; window.openCourse=openCourse; window.completeLesson=completeLesson; window.closeModal=closeModal; window.logout=logout;
sb.auth.onAuthStateChange((_event, session)=>{ if(session && $('#app').style.display!=='block') boot(); });
document.addEventListener('DOMContentLoaded',()=>boot());
