let currentUser=null;
const byId=id=>document.getElementById(id);

async function loadStudent(){
  const {data:{user},error}=await sb.auth.getUser();
  if(error||!user){showLogin();return}
  currentUser=user;
  const {data:p}=await sb.from('profiles').select('full_name,role').eq('id',user.id).single();
  if(p?.role==='admin'||p?.role==='teacher'){location.href=p.role==='admin'?'admin.html':'teacher.html';return}
  byId('userName').textContent=p?.full_name||user.user_metadata?.full_name||'طالب';
  byId('userEmail').textContent=user.email||'';
  await loadCourses();
}

async function loadCourses(){
  const {data:courses,error}=await sb.from('courses').select('id,title,description,cover_url,grade,modules(id,title,sort_order,lessons(id,title,description,type,duration_minutes,sort_order,is_free,video_url,file_url,content))').eq('status','published').order('created_at',{ascending:false});
  if(error){showMsg(error.message);return}
  const {data:progress}=await sb.from('lesson_progress').select('lesson_id,completed').eq('student_id',currentUser.id);
  const done=new Set((progress||[]).filter(x=>x.completed).map(x=>x.lesson_id));
  const total=(courses||[]).reduce((n,c)=>n+(c.modules||[]).reduce((x,m)=>x+(m.lessons||[]).length,0),0);
  byId('courseCount').textContent=courses?.length||0;
  byId('lessonCount').textContent=total;
  byId('progressCount').textContent=total?Math.round(done.size/total*100)+'%':'0%';
  byId('courses').innerHTML=(courses||[]).map((c,i)=>{
    const ls=(c.modules||[]).flatMap(m=>m.lessons||[]),pct=ls.length?Math.round(ls.filter(l=>done.has(l.id)).length/ls.length*100):0;
    return `<article class="course"><div class="illus">${['⚛️','🧬','🚀','🔬'][i%4]}</div><div class="coursebody"><small>${escapeHtml(c.grade||'علوم')}</small><h3>${escapeHtml(c.title)}</h3><p>${escapeHtml(c.description||'دروس تفاعلية مع أ/ حسام')}</p><div class="bar"><i style="width:${pct}%"></i></div><div class="foot"><span>${pct}% مكتمل</span><button onclick="openCourse('${c.id}')">فتح الكورس ←</button></div></div></article>`;
  }).join('')||'<div class="empty">لا توجد كورسات منشورة حاليًا.</div>';
  window._courses=courses||[];window._done=done;
}

function openCourse(id){
  const c=window._courses.find(x=>x.id===id);if(!c)return;
  byId('modalTitle').textContent=c.title;
  byId('modalBody').innerHTML=(c.modules||[]).sort((a,b)=>a.sort_order-b.sort_order).map(m=>`<h3>${escapeHtml(m.title)}</h3>`+(m.lessons||[]).sort((a,b)=>a.sort_order-b.sort_order).map(l=>`<div class="lesson"><span>${l.type==='video'?'🎬':l.type==='pdf'?'📄':l.type==='quiz'?'📝':'📘'}</span><div><b>${escapeHtml(l.title)}</b><small>${l.duration_minutes||0} دقيقة ${window._done.has(l.id)?'• مكتمل ✓':''}</small></div><button onclick="openLesson('${l.id}')">فتح</button></div>`).join('')).join('');
  byId('modal').classList.add('show');
}

async function openLesson(id){
  let lesson=null;for(const c of window._courses||[])for(const m of c.modules||[]){const x=(m.lessons||[]).find(x=>x.id===id);if(x)lesson=x}
  if(!lesson)return;
  byId('modalTitle').textContent=lesson.title;
  let html=`<p>${escapeHtml(lesson.description||'')}</p>`;
  if(lesson.type==='video'&&lesson.video_url)html+=`<video controls style="width:100%;border-radius:14px" src="${safeUrl(lesson.video_url)}"></video>`;
  else if(lesson.type==='pdf'&&lesson.file_url)html+=`<a class="primary" style="display:block;text-align:center;padding-top:15px;text-decoration:none" target="_blank" rel="noopener" href="${safeUrl(lesson.file_url)}">فتح ملف PDF</a>`;
  else if(lesson.type==='quiz')html+=`<button class="primary" onclick="startQuiz('${lesson.id}')">بدء الاختبار</button>`;
  else html+=`<div style="background:#f5f9fe;border-radius:14px;padding:18px;line-height:2">${escapeHtml(lesson.content||'محتوى الدرس غير مضاف بعد.')}</div>`;
  html+=`<button class="primary" onclick="completeLesson('${lesson.id}')">${window._done.has(lesson.id)?'تم إكمال الدرس ✓':'تحديد الدرس كمكتمل'}</button>`;
  byId('modalBody').innerHTML=html;
}

async function startQuiz(lessonId){
  const {data:q,error}=await sb.from('quizzes').select('id,title,passing_score,questions(id,question_text,explanation,points,sort_order,question_choices(id,choice_text,sort_order))').eq('lesson_id',lessonId).single();
  if(error||!q){showMsg(error?.message||'الاختبار غير متاح بعد.');return}
  byId('modalTitle').textContent=q.title;
  byId('modalBody').innerHTML=`<p>درجة النجاح: ${q.passing_score}%</p><form id="quizForm">${(q.questions||[]).sort((a,b)=>a.sort_order-b.sort_order).map((x,i)=>`<div style="padding:14px 0;border-bottom:1px solid #edf3f8"><b>${i+1}. ${escapeHtml(x.question_text)}</b>${(x.question_choices||[]).sort((a,b)=>a.sort_order-b.sort_order).map(ch=>`<label style="display:block;padding:8px"><input type="radio" name="q_${x.id}" value="${ch.id}"> ${escapeHtml(ch.choice_text)}</label>`).join('')}</div>`).join('')}</form><button class="primary" onclick="submitQuiz('${q.id}')">إرسال الإجابات</button>`;
  window._quiz=q;
}

async function submitQuiz(quizId){
  const q=window._quiz;
  if(!q||!currentUser)return;
  const answers={};
  (q.questions||[]).forEach(x=>{
    const chosen=document.querySelector(`input[name="q_${x.id}"]:checked`);
    if(chosen)answers[x.id]=chosen.value;
  });
  if(!Object.keys(answers).length){showMsg('اختر إجابة واحدة على الأقل قبل الإرسال.');return}
  const {data,error}=await sb.rpc('submit_quiz_attempt',{p_quiz_id:quizId,p_answers:answers});
  if(error){showMsg(error.message);return}
  const pct=Number(data?.score||0);
  const passed=pct>=Number(q.passing_score||0);
  byId('modalBody').innerHTML=`<div style="text-align:center;padding:25px"><div style="font-size:60px">${passed?'🏆':'📚'}</div><h2>نتيجتك ${pct}%</h2><p>${passed?'مبروك! اجتزت الاختبار.':'راجع الدرس وحاول مرة أخرى.'}</p><p>تم حفظ النتيجة في حسابك.</p></div>`;
}

async function completeLesson(id){
  const {error}=await sb.from('lesson_progress').upsert({student_id:currentUser.id,lesson_id:id,completed:true,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:'student_id,lesson_id'});
  if(error){showMsg(error.message);return}
  window._done.add(id);await loadCourses();showMsg('تم حفظ تقدمك بنجاح');
}

function closeModal(){byId('modal').classList.remove('show')}
async function logout(){await sb.auth.signOut();showLogin()}
function showLogin(){byId('login').style.display='grid';byId('app').style.display='none'}
function showMsg(t){const m=byId('msg');if(!m)return;m.textContent=t;m.style.display='block';setTimeout(()=>m.style.display='none',4000)}
function escapeHtml(s){return String(s).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}
function safeUrl(s){try{const u=new URL(s,location.href);return ['http:','https:'].includes(u.protocol)?u.href:'#'}catch{return '#'}}

sb.auth.onAuthStateChange((e,s)=>{if(s)loadStudent();else showLogin()});
loadStudent();
