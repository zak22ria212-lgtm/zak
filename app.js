// === تخزين محلي فقط ===
const LS = { get(k, d){ try{ return JSON.parse(localStorage.getItem(k)) ?? d; }catch{ return d; } }, set(k, v){ localStorage.setItem(k, JSON.stringify(v)); } };

// إعدادات عامة
let settings = LS.get('settings', {});
settings.periods = settings.periods || 8;
settings.days = settings.days || ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس'];
settings.periodNames = settings.periodNames || ['الأولى','الثانية','الثالثة','الرابعة','الخامسة','السادسة','السابعة','الثامنة'];
// الحد الأقصى للاحتياط لكل معلّم يوميًا (يُستخدم الآن في الأهلية والتوزيع العادل).
settings.maxDailySubs = settings.maxDailySubs || 1; 
LS.set('settings', settings);

document.documentElement.style.setProperty('--periods', settings.periods);

let teachers = LS.get('teachers', []);
let classes = LS.get('classes', []);
let assignments = LS.get('assignments', []);
let absences = LS.get('absences', []);

const uid = () => Math.random().toString(36).slice(2);
const dayNamesMap = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
const dayFromDate = (d) => dayNamesMap[new Date(d).getDay()] || settings.days[0];

// === عدالة الاحتياط: نصاب اليوم + تقارب الحصص ===
function teachingLoadFor(t, dayName){
  let c = 0;
  for(let p=1; p<=settings.periods; p++) if(t?.schedule?.[dayName]?.[p]) c++;
  return c;
}
function hasAdjacentPeriod(t, dayName, period, todays){
  const prev = period-1;
  const next = period+1;
  const busyPrev = prev>=1 && !!(t?.schedule?.[dayName]?.[prev]);
  const busyNext = next<=settings.periods && !!(t?.schedule?.[dayName]?.[next]);
  const subPrev = prev>=1 && (todays||[]).some(a=>a.subTeacherId===t.id && a.period===prev);
  const subNext = next<=settings.periods && (todays||[]).some(a=>a.subTeacherId===t.id && a.period===next);
  return busyPrev || busyNext || subPrev || subNext;
}
function fairCompare(a,b,dayName,period,loadCount,todays){
  // 1) الأقل احتياطاً اليوم (توزيع عادل)
  const la = (loadCount[a.id] ?? 0);
  const lb = (loadCount[b.id] ?? 0);
  if(la !== lb) return la - lb;

  // 2) مراعاة قبل/بعد الحصص الأساسية أو احتياط ملاصق
  const aa = hasAdjacentPeriod(a, dayName, period, todays) ? 1 : 0;
  const bb = hasAdjacentPeriod(b, dayName, period, todays) ? 1 : 0;
  if(aa !== bb) return aa - bb;

  // 3) الأقل نصاب تدريس اليوم
  const ta = teachingLoadFor(a, dayName);
  const tb = teachingLoadFor(b, dayName);
  if(ta !== tb) return ta - tb;

  // 4) أبجديًا
  return (a.name ?? '').localeCompare((b.name ?? ''), 'ar');
}
function showToast(msg){ const t=document.getElementById('toast'); if(!t){ alert(msg); return; } t.textContent=msg; t.classList.add('show'); setTimeout(()=>{ t.classList.remove('show'); t.textContent=''; }, 2400); }

(function setupTabs(){
  const tabs = document.querySelectorAll('.tab');
  const sections = { teachers: document.getElementById('teachers'), classes: document.getElementById('classes'), absences: document.getElementById('absences'), reports: document.getElementById('reports'), settings: document.getElementById('settings') };
  function showTab(name){ Object.keys(sections).forEach(k => sections[k]?.classList.add('hidden')); tabs.forEach(t => t.classList.remove('active')); const tabEl=[...tabs].find(t=>t.dataset.tab===name); const secEl=sections[name]; if(tabEl) tabEl.classList.add('active'); if(secEl) secEl.classList.remove('hidden'); if(name==='absences') refreshAbsenceView(); if(name==='reports') refreshReportsView(); if(name==='classes') refreshClassesTable(); if(name==='settings') loadSettingsUI(); }
  tabs.forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab))); showTab('teachers');
})();

// === واجهة المعلّمين ===
const teacherName = document.getElementById('teacherName');
const teacherNote = document.getElementById('teacherNote');
const addTeacherBtn = document.getElementById('addTeacher');
const teacherSelect = document.getElementById('teacherSelect');
const daysTags = document.getElementById('daysTags');
const scheduleGrid = document.getElementById('scheduleGrid');
const saveScheduleBtn = document.getElementById('saveSchedule');
const clearScheduleBtn = document.getElementById('clearSchedule');
const teachersTableBody = document.querySelector('#teachersTable tbody');
let currentDay = settings.days[0];

function refreshTeachersSelect(){ teacherSelect.innerHTML = '<option value="">— اختر —</option>' + teachers.map(t => `<option value="${t.id}">${t.name}</option>`).join(''); }
function renderDaysTags(activeDay){ currentDay = activeDay || settings.days[0]; daysTags.innerHTML=''; settings.days.forEach(d=>{ const s=document.createElement('span'); s.className='chip'; s.textContent=d; s.style.cursor='pointer'; s.style.background = (d===currentDay)?'#052e57':''; s.addEventListener('click',()=>{ currentDay=d; renderDaysTags(d); renderScheduleGrid(d); }); daysTags.appendChild(s); }); }
function renderScheduleGrid(dayName){ scheduleGrid.innerHTML=''; const header=document.createElement('div'); header.className='cell header'; header.textContent='الحصة'; scheduleGrid.appendChild(header); settings.periodNames.forEach((nm,i)=>{ const h=document.createElement('div'); h.className='cell header'; h.textContent=`${i+1} — ${nm}`; scheduleGrid.appendChild(h); }); const rowLabel=document.createElement('div'); rowLabel.className='cell header'; rowLabel.textContent=dayName; scheduleGrid.appendChild(rowLabel); const teacherId=teacherSelect.value; const teacher=teachers.find(t=>t.id===teacherId); const schedule=teacher?.schedule?.[dayName]||{}; const dlId='classesList'; let dl=document.getElementById(dlId); if(!dl){ dl=document.createElement('datalist'); dl.id=dlId; document.body.appendChild(dl);} dl.innerHTML = classes.map(c=>`<option value="${c.name}">`).join(''); for(let p=1;p<=settings.periods;p++){ const cell=document.createElement('div'); cell.className='cell'; const input=document.createElement('input'); input.type='text'; input.setAttribute('list', dlId); input.placeholder='اسم الصف/المجموعة (اتركه فارغًا إذا فراغ)'; const stored=schedule[p]??''; const existingClass=classes.find(c=>c.id===stored); input.value = existingClass ? existingClass.name : (stored || ''); input.dataset.period=p; cell.appendChild(input); scheduleGrid.appendChild(cell);} }
function refreshTeachersTable(){ teachersTableBody.innerHTML = teachers.map(t=>`<tr><td class='right'>${t.name}</td><td class='small muted right'>${t.note||''}</td><td><button class='primary' onclick=\"editTeacher('${t.id}')\">تعديل</button><button class='warn' onclick=\"deleteTeacher('${t.id}')\">حذف</button></td></tr>`).join(''); }
window.editTeacher = (id)=>{ teacherSelect.value=id; renderDaysTags(currentDay); renderScheduleGrid(currentDay); };
window.deleteTeacher = (id)=>{ if(!confirm('تأكيد حذف المعلّم؟')) return; teachers = teachers.filter(t=>t.id!==id); LS.set('teachers', teachers); refreshTeachersSelect(); refreshTeachersTable(); };
addTeacherBtn.addEventListener('click', ()=>{ const name=teacherName.value.trim(); if(!name) return alert('يرجى إدخال اسم المعلّم'); const t={ id:uid(), name, note:teacherNote.value.trim(), schedule:{} }; teachers.push(t); LS.set('teachers', teachers); teacherName.value=''; teacherNote.value=''; refreshTeachersSelect(); refreshTeachersTable(); if(!teacherSelect.value){ teacherSelect.value=t.id; renderDaysTags(settings.days[0]); renderScheduleGrid(settings.days[0]); } });
saveScheduleBtn.addEventListener('click', ()=>{ const teacherId=teacherSelect.value; if(!teacherId) return alert('اختر معلّمًا أولًا'); const teacher=teachers.find(t=>t.id===teacherId); teacher.schedule=teacher.schedule||{}; teacher.schedule[currentDay]=teacher.schedule[currentDay]||{}; const inputs=scheduleGrid.querySelectorAll('input[type=text]'); inputs.forEach(inp=>{ const p=Number(inp.dataset.period); const name=inp.value.trim(); if(!name){ teacher.schedule[currentDay][p]=null; return; } let cls=classes.find(c=>c.name===name); if(!cls){ cls={ id:uid(), name, grade:'' }; classes.push(cls); LS.set('classes', classes);} teacher.schedule[currentDay][p]=cls.id; }); LS.set('teachers', teachers); alert('تم حفظ الجدول'); renderScheduleGrid(currentDay); });
clearScheduleBtn.addEventListener('click', ()=>{ const teacherId=teacherSelect.value; if(!teacherId) return alert('اختر معلّمًا'); const teacher=teachers.find(t=>t.id===teacherId); if(teacher?.schedule?.[currentDay]){ if(!confirm('تفريغ جميع الحصص لهذا اليوم؟')) return; teacher.schedule[currentDay]={}; LS.set('teachers', teachers); renderScheduleGrid(currentDay);} });
teacherSelect.addEventListener('change', ()=>{ renderDaysTags(settings.days[0]); renderScheduleGrid(settings.days[0]); });
function initTeachersUI(){ refreshTeachersSelect(); if(teachers.length && !teacherSelect.value) teacherSelect.value = teachers[0].id; renderDaysTags(settings.days[0]); renderScheduleGrid(settings.days[0]); refreshTeachersTable(); }

// === الفصول ===
const classNameInp=document.getElementById('className'); const classGradeInp=document.getElementById('classGrade'); const addClassBtn=document.getElementById('addClass'); const classesTableBody=document.getElementById('classesTable');
function refreshClassesTable(){ classesTableBody.innerHTML = classes.map(c=>`<tr><td>${c.name}</td><td class='small muted'>${c.grade||''}</td><td><button class='warn' onclick=\"deleteClass('${c.id}')\">حذف</button></td></tr>`).join(''); }
window.deleteClass = (id)=>{ classes = classes.filter(c=>c.id!==id); LS.set('classes', classes); refreshClassesTable(); };
addClassBtn.addEventListener('click', ()=>{ const name=classNameInp.value.trim(); if(!name) return alert('أدخل اسم الفصل'); const c={ id:uid(), name, grade:classGradeInp.value.trim() }; classes.push(c); LS.set('classes', classes); classNameInp.value=''; classGradeInp.value=''; refreshClassesTable(); renderScheduleGrid(currentDay); });

// === الغيابات والاحتياط ===
const absenceDate=document.getElementById('absenceDate'); const dayNameTag=document.getElementById('dayName'); const periodHeader=document.getElementById('periodHeader'); const absentOverviewBody=document.getElementById('absentOverviewBody'); const substitutesList=document.getElementById('substitutesList'); const assignmentsBody=document.getElementById('assignmentsBody'); const autoAssignFairBtn=document.getElementById('autoAssignFair'); const saveAssignmentsBtn=document.getElementById('saveAssignments'); const clearAssignmentsBtn=document.getElementById('clearAssignments'); const absentTeachersList=document.getElementById('absentTeachersList');

function buildAbsentTeachersCheckboxes(){
  ensureAbsentScrollBox();
    absentTeachersList.innerHTML = '';
    const sortedTeachers = [...teachers].sort((a,b)=>a.name.localeCompare(b.name,'ar'));
    const grid = document.createElement('div');
    grid.className = 'absent-grid';
    sortedTeachers.forEach(t => {
        const item = document.createElement('label');
        item.className = 'absent-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = t.id;
        cb.addEventListener('change', ()=>renderAbsenceData());
        const nameSpan = document.createElement('span');
        nameSpan.textContent = t.name;
        item.appendChild(cb);
        item.appendChild(nameSpan);
        grid.appendChild(item);
    });
    absentTeachersList.appendChild(grid);
}

function getSelectedAbsentIds(){ return [...absentTeachersList.querySelectorAll('input[type=checkbox]')].filter(c=>c.checked).map(c=>c.value); }
function refreshAbsenceView(){
  ensureAbsentScrollBox(); if(!absenceDate.value) absenceDate.valueAsDate=new Date(); dayNameTag.textContent=dayFromDate(absenceDate.value); buildAbsentTeachersCheckboxes(); renderAbsenceData(); renderAssignmentsTable(); }
function renderAbsenceData(){ const dayName=dayFromDate(absenceDate.value); periodHeader.innerHTML = `<th>المعلّم</th>${settings.periodNames.map((nm,i)=>`<th>${i+1} — ${nm}</th>`).join('')}`; const rows=[]; const absentIds=getSelectedAbsentIds(); const absentSet=new Set(absentIds); absentIds.forEach(id=>{ const t=teachers.find(x=>x.id===id); const schedule=t?.schedule?.[dayName]||{}; const tds=[]; tds.push(`<td class='muted right'>${t?.name||'—'}</td>`); for(let p=1;p<=settings.periods;p++){ const classId=schedule[p]??null; const clsName=classes.find(c=>c.id===classId)?.name||''; tds.push(`<td>${classId?`<span class='chip bad'>${clsName}</span>`:`<span class='chip ok'>—</span>`}</td>`);} rows.push(`<tr>${tds.join('')}</tr>`);} ); absentOverviewBody.innerHTML = rows.join('') || `<tr><td colspan='${settings.periods+1}' class='muted'>اختر معلّمًا غائبًا</td></tr>`; renderSubstitutesFair(absentSet); }

// === اقتراحات قابلة للطي + جدول مصغّر + تحسينات تفاعل (التعديل هنا) ===
function renderSubstitutesFair(absentSet){
  const dayName = dayFromDate(absenceDate.value);
  const date = absenceDate.value;
  const absentIds = [...absentSet];
  substitutesList.innerHTML = '';
  if(absentIds.length===0){ substitutesList.innerHTML='<div class="muted">اختر معلّمًا واحدًا على الأقل.</div>'; return; }

  const todays = assignments.filter(a=>a.date===date);
  const loadCount = {}; teachers.forEach(t=> loadCount[t.id] = todays.filter(a=>a.subTeacherId===t.id).length);

  absentIds.forEach(absId => {
    const absent = teachers.find(t=>t.id===absId);
    if (!absent) return; 

    // 1. إنشاء حاوية رئيسية للمعلّم الغائب
    const absentGroupDiv = document.createElement('div');
    absentGroupDiv.className = 'absent-group card'; // استخدام كلاس card لعزل كل مجموعة غائبين

    // 2. إضافة عنوان للمجموعة
    const groupTitle = document.createElement('h3');
    groupTitle.className = 'card-title';
    groupTitle.innerHTML = `<span class="chip bad">المعلّم الغائب: ${absent.name}</span>`;
    absentGroupDiv.appendChild(groupTitle);
    
    let hasPeriods = false; // flag to check if the absent teacher has any periods

    // 3. حلقة الحصص (Periods)
    for(let p=1; p<=settings.periods; p++){
      const classId = absent?.schedule?.[dayName]?.[p] ?? null;
      if(!classId) continue; // الحصة غير موجودة للغائب
      hasPeriods = true;
      const periodName = settings.periodNames[p-1] || `${p}`;
      const clsName = classes.find(c=>c.id===classId)?.name || '';

      // التحقق مما إذا كانت هذه الحصة قد تم تعيينها بالفعل
      const assignedAssignment = todays.find(a => a.absentTeacherId === absId && a.period === p && a.classId === classId);
      const isAssigned = !!assignedAssignment;
      
      // قسم الحصة (مطوي افتراضيًا)
      const section = document.createElement('div');
      section.className = 'suggest-section collapsed';
      if (isAssigned) {
        section.classList.add('assigned-slot'); // لإضافة نمط مختلف للحصة المعيّنة
      }
      
      const header = document.createElement('div'); header.className = 'suggest-card__header';
      header.innerHTML = `
        <span class="chip info">${periodName}</span>
        <span class="chip">${clsName}</span>
        ${isAssigned ? `<span class="chip assigned">مُعيّنة لـ ${teachers.find(t => t.id === assignedAssignment?.subTeacherId)?.name || 'مجهول'}</span>` : ''}
        <span class="collapse-toggle" title="إظهار/إخفاء الاقتراحات">
          <span class="arrow"></span>
          <span>إظهار الاقتراحات</span>
        </span>
      `;

      const content = document.createElement('div'); content.className = 'suggest-content';
      const grid = document.createElement('div'); grid.className = 'suggest-scroll';

      // المرشحون المتاحون: ليسوا غائبين + فراغ في هذه الحصة + لا يوجد تعارض مع تعيين آخر في نفس الوقت
      const available = teachers.filter(t => {
        if (absentSet.has(t.id)) return false;
        const hasClassNow = !!(t.schedule?.[dayName]?.[p]);
        if (hasClassNow) return false;
        // التحقق من تعارض مع تعيينات سابقة لنفس المعلم البديل في نفس الفترة الزمنية
        const isAlreadyAssignedInThisPeriod = todays.some(a => a.subTeacherId === t.id && a.period === p);
 if (isAlreadyAssignedInThisPeriod) return false;
 // احترام الحد الأقصى اليومي للاحتياط
 const curr = (loadCount[t.id] ?? 0);
 if (curr >= settings.maxDailySubs) return false;
 return true;
      }).sort((a,b)=>fairCompare(a,b,dayName,p,loadCount,todays)); // ترتيب عادل: نصاب اليوم + تقارب + الأقل احتياطاً

      if(available.length===0){
        const empty=document.createElement('div'); empty.className='muted';
        empty.textContent='لا يوجد معلّمون متاحون لهذه الحصة (إما مشغولون، أو معيّنون في هذا الوقت، أو وصلوا للحد الأقصى للاحتياط اليومي).'; grid.appendChild(empty);
      } else {
        available.forEach(t=>{
          const item=document.createElement('div'); item.className='suggest-item';
          const left=document.createElement('div'); left.className='suggest-item__left';

          // أسباب الاختيار (Feedback)
          const reasons = [];
          reasons.push('المعلّم فاضي في هذه الحصة');
    const tTeach = teachingLoadFor(t, dayName);
    reasons.push(`حصصه اليوم: ${tTeach}`);
    const adj = hasAdjacentPeriod(t, dayName, p, todays);
    reasons.push(adj ? '<span class="chip warn">لديه حصة ملاصقة (قبل/بعد)</span>' : '<span class="chip ok">بدون حصص ملاصقة</span>');
          if (loadCount[t.id]===0) reasons.push('لم يأخذ احتياط اليوم');
          
// معلومات الحد الأقصى اليومي (لا يمكن تجاوزه)
const remaining = Math.max(0, settings.maxDailySubs - (loadCount[t.id] ?? 0));
reasons.push(`الحد الأقصى اليومي: ${settings.maxDailySubs} | المتبقي: ${remaining}`);
reasons.push(`تعيينات اليوم الحالية: ${loadCount[t.id] ?? 0}`);
left.innerHTML = `
            <span class='suggest-item__name'>${t.name}</span>
            <div class='suggest-item__meta'><span class='chip ok'>فراغ</span><span class='chip'>تعيينات اليوم: ${loadCount[t.id]}</span></div>
            <div class='suggest-reasons'>${reasons.map(r=>r.startsWith('<span')?r:`<span class='chip'>${r}</span>`).join('')}</div>
          `;

          // جدول مصغّر لحالة المعلم في اليوم
          const mini = document.createElement('div'); mini.className = 'mini-table';
          for(let pi=1; pi<=settings.periods; pi++){
            const isBusy = !!(t.schedule?.[dayName]?.[pi]);
            const isSub = todays.some(a => a.subTeacherId === t.id && a.period === pi); // التحقق من تعيينه كبديل
            const cid = t.schedule?.[dayName]?.[pi] ?? null;
            const cname = cid ? (classes.find(c=>c.id===cid)?.name || '') : 'فارغ';
            const cell = document.createElement('div');
            cell.className = 'mini-cell ' + (isSub ? 'assigned' : (isBusy ? 'busy' : 'free'));
            cell.dataset.title = `الحصة ${pi}: ${cname} ${isSub ? '(احتياط)' : ''}`;
            mini.appendChild(cell);
          }
          left.appendChild(mini);

          // زر التعيين + النقر على الاسم يعيّن أيضًا
          const btn=document.createElement('button'); btn.className='btn-assign'; btn.textContent='تعيين';
          const assignHandler = ()=>assignSub(date, dayName, p, classId, absId, t.id, absentSet);
          btn.addEventListener('click', assignHandler);
          left.querySelector('.suggest-item__name').addEventListener('click', assignHandler);

          item.appendChild(left); item.appendChild(btn); grid.appendChild(item);
        });
      }

      content.appendChild(grid);

      const toggle = header.querySelector('.collapse-toggle');
      const label  = toggle.querySelector('span:last-child');
      function setCollapsed(isCollapsed){ section.classList.toggle('collapsed', isCollapsed); toggle.classList.toggle('open', !isCollapsed); label.textContent = isCollapsed ? 'إظهار الاقتراحات' : 'إخفاء الاقتراحات'; }
      setCollapsed(true);
      toggle.addEventListener('click', ()=>{ const isCollapsed = section.classList.contains('collapsed'); setCollapsed(!isCollapsed); });

      section.appendChild(header);
      section.appendChild(content);

      // إضافة قسم الحصة إلى حاوية المعلّم الغائب
      absentGroupDiv.appendChild(section);
    }

    // 4. إضافة حاوية المعلّم الغائب إلى القائمة الرئيسية
    if (hasPeriods) {
        substitutesList.appendChild(absentGroupDiv);
    } else {
        // إذا لم يكن للمعلم حصص في هذا اليوم، نعرض رسالة مناسبة
        const noPeriods = document.createElement('div');
        noPeriods.className = 'muted';
        noPeriods.textContent = `المعلّم ${absent.name} لا يملك حصصًا في جدول اليوم، لا حاجة للاحتياط.`;
        absentGroupDiv.appendChild(noPeriods);
        substitutesList.appendChild(absentGroupDiv);
    }
  });
}

// ✅ المنطق الجديد: فقط منع التكرار لنفس الحصة + التحقق من عدم التعارض في جدول المعلّم البديل
function assignSub(date, dayName, period, classId, absentTeacherId, subTeacherId, absentSet){
  const todayAssignments = assignments.filter(a=>a.date===date);
  
  // 1) منع تكرار تعيين لنفس الحصة (نفس الغائب/الحصة/الفصل)
  const slotTaken = todayAssignments.find(a => a.dayName===dayName && a.period===period && a.classId===classId && a.absentTeacherId===absentTeacherId);
  if (slotTaken) { showToast('هذه الحصة مُخصّصة بالفعل لمعلّم آخر.'); return; }

  // 2) منع تعيين معلم في حصة هو مشغول فيها بجدوله الأصلي
  const subTeacher = teachers.find(t => t.id === subTeacherId);
  if (subTeacher?.schedule?.[dayName]?.[period]) { showToast('هذا المعلم مشغول في جدوله الأصلي في هذه الحصة.'); return; }
  
  // 3) منع تكرار نفس المعلم في نفس الحصة كبديل لغائب آخر (تعارض زمني)
  const conflict = todayAssignments.find(a => a.dayName===dayName && a.period===period && a.subTeacherId===subTeacherId);
  if (conflict) { showToast('هذا المعلّم معين بالفعل في هذه الحصة كبديل لمعلّم آخر.'); return; }


// 4) احترام الحد الأقصى للاحتياط اليومي للمعلّم
const currentCount = todayAssignments.filter(a => a.subTeacherId === subTeacherId).length;
if (currentCount >= settings.maxDailySubs) {
  showToast(`هذا المعلّم وصل للحد الأقصى للاحتياط اليوم (${settings.maxDailySubs}).`);
  return;
}

  // إضافة التعيين
  assignments.push({ id:uid(), date, dayName, period, classId, absentTeacherId, subTeacherId });
  LS.set('assignments', assignments);
  showToast('تم تعيين المعلم للاحتياط بنجاح ✔');

  // تحديث الاقتراحات ديناميكيًا
  renderSubstitutesFair(absentSet || new Set(getSelectedAbsentIds()));
  renderAssignmentsTable();
}

function renderAssignmentsTable(){ const date=absenceDate.value; const dayName=dayFromDate(date); const todays=assignments.filter(a=>a.date===date); if(todays.length===0){ assignmentsBody.innerHTML = `<tr><td colspan='7' class='muted'>لا توجد تعيينات مسجلة لهذا اليوم.</td></tr>`; return; } const groupsMap=new Map(); todays.forEach(a=>{ const key=a.absentTeacherId; const arr=groupsMap.get(key)||[]; arr.push(a); groupsMap.set(key,arr); }); const groups=[...groupsMap.entries()].sort(([,arrA],[,arrB])=>{ const nameA=teachers.find(t=>t.id===arrA[0]?.absentTeacherId)?.name||''; const nameB=teachers.find(t=>t.id===arrB[0]?.absentTeacherId)?.name||''; return nameA.localeCompare(nameB,'ar'); }); let html=''; groups.forEach(([absentId,arr])=>{ const absentName=teachers.find(t=>t.id===absentId)?.name||'—'; html+=`<tr><td colspan="7" style="padding:0; border-bottom:none;"><div class="card"><div class="suggest-card__header"><span class="chip bad">الغائب: ${absentName}</span><span class="chip info">${dayName}</span></div><table class="table-clean"><thead><tr><th>رقم الحصة</th><th>اسم الحصة</th><th>الفصل</th><th>المعلّم الاحتياط</th><th>إجراءات</th></tr></thead><tbody>${arr.sort((a,b)=>a.period-b.period).map(a=>{ const periodName=settings.periodNames[a.period-1]||a.period; const clsName=classes.find(c=>c.id===a.classId)?.name||''; const subName=teachers.find(t=>t.id===a.subTeacherId)?.name||'—'; return `<tr><td>${a.period}</td><td>${periodName}</td><td>${clsName}</td><td><span class='chip'>${subName}</span></td><td><button class='warn' onclick=\"removeAssignment('${a.id}')\">إزالة</button></td></tr>`; }).join('')}</tbody></table></div></td></tr>`; }); assignmentsBody.innerHTML = html; }

window.removeAssignment = (id)=>{ assignments = assignments.filter(a=>a.id!==id); LS.set('assignments', assignments); renderAssignmentsTable(); renderSubstitutesFair(new Set(getSelectedAbsentIds())); };

// ✅ توزيع عادل مع منع التعارض الزمني فقط
autoAssignFairBtn.addEventListener('click', ()=>{ 
  const dayName = dayFromDate(absenceDate.value);
  const date = absenceDate.value;
  const absentIds = getSelectedAbsentIds();
  const absentSet = new Set(absentIds);

  // نستخدم مصفوفة ديناميكية لتفادي تعارض نفس الفترة أثناء التوزيع التلقائي
  const todaysAll = assignments.filter(a => a.date === date);
  const loadCount = {};
  teachers.forEach(t => loadCount[t.id] = todaysAll.filter(a => a.subTeacherId === t.id).length);

  // حصر الفتحات المطلوبة غير المعيّنة مسبقًا
  const requiredSlots = [];
  absentIds.forEach(absId => {
    const t = teachers.find(x => x.id === absId);
    for(let p=1; p<=settings.periods; p++){
      const classId = t?.schedule?.[dayName]?.[p] ?? null;
      if(!classId) continue;
      const alreadyTaken = todaysAll.some(a => a.dayName === dayName && a.period === p && a.classId === classId && a.absentTeacherId === absId);
      if(!alreadyTaken) requiredSlots.push({ absId, period: p, classId });
    }
  });

  requiredSlots.sort((a,b) => a.period - b.period);

  let added = 0;
  requiredSlots.forEach(slot => {
    // المرشحون المتاحون لهذه الحصة:
    // - ليس غائبًا
    // - فاضي في الجدول الأصلي
    // - غير معيّن كبديل في نفس الفترة (تعارض زمني)
    // - لم يصل للحد الأقصى اليومي
    const available = teachers.filter(t => {
      if (absentSet.has(t.id)) return false;
      if (t.schedule?.[dayName]?.[slot.period]) return false;
      const isAlreadyAssignedInThisPeriod = todaysAll.some(a => a.subTeacherId === t.id && a.period === slot.period);
      if (isAlreadyAssignedInThisPeriod) return false;
      if ((loadCount[t.id] ?? 0) >= settings.maxDailySubs) return false;
      return true;
    });

    available.sort((a,b) => fairCompare(a,b,dayName,slot.period,loadCount,todaysAll));
    const chosen = available[0];
    if(!chosen) return;

    const newA = { id: uid(), date, dayName, period: slot.period, classId: slot.classId, absentTeacherId: slot.absId, subTeacherId: chosen.id };
    assignments.push(newA);
    todaysAll.push(newA);
    loadCount[chosen.id] = (loadCount[chosen.id] ?? 0) + 1;
    added++;
  });

  LS.set('assignments', assignments);
  renderAssignmentsTable();
  renderSubstitutesFair(absentSet);
  if(added===0){
    showToast('تم إعادة حساب التوزيع العادل. لم يتم إضافة تعيينات جديدة.');
  } else {
    showToast(`تم إضافة ${added} تعيينات عادلة جديدة.`);
  }
});

saveAssignmentsBtn.addEventListener('click', ()=>showToast('تم حفظ التعيينات لليوم'));
clearAssignmentsBtn.addEventListener('click', ()=>{ if(!confirm('مسح جميع تعيينات هذا التاريخ؟')) return; const date=absenceDate.value; assignments=assignments.filter(a=>a.date!==date); LS.set('assignments', assignments); renderAssignmentsTable(); renderSubstitutesFair(new Set(getSelectedAbsentIds())); });
absenceDate.addEventListener('change', ()=>refreshAbsenceView());

// === التقارير ===
const reportDate=document.getElementById('reportDate');
const reportGroups=document.getElementById('reportGroups');
const printReportBtn=document.getElementById('printReport');
const exportCSVBtn=document.getElementById('exportCSV');
function refreshReportsView(){ if(!reportDate.value) reportDate.valueAsDate=new Date(); renderReport(); }
function renderReport(){ const date=reportDate.value; const dayName=dayFromDate(date); const todays=assignments.filter(a=>a.date===date); if(todays.length===0){ reportGroups.innerHTML = `<div class='muted'>لا توجد تعيينات (${dayName}).</div>`; return; } const groupsMap=new Map(); todays.forEach(a=>{ const key=a.absentTeacherId; const arr=groupsMap.get(key)||[]; arr.push(a); groupsMap.set(key,arr); }); const groups=[...groupsMap.entries()].sort(([,arrA],[,arrB])=>{ const nameA=teachers.find(t=>t.id===arrA[0]?.absentTeacherId)?.name||''; const nameB=teachers.find(t=>t.id===arrB[0]?.absentTeacherId)?.name||''; return nameA.localeCompare(nameB,'ar'); }); let html=''; groups.forEach(([absentId,arr])=>{ const absentName=teachers.find(t=>t.id===absentId)?.name||'—'; html+=`<div class="card"><div class="suggest-card__header"><span class="chip bad">الغائب: ${absentName}</span><span class="chip info">${dayName}</span></div><table class="table-clean"><thead><tr><th>رقم الحصة</th><th>اسم الحصة</th><th>الفصل</th><th>المعلّم الاحتياط</th></tr></thead><tbody>${arr.sort((a,b)=>a.period-b.period).map(a=>{ const periodName=settings.periodNames[a.period-1]||a.period; const clsName=classes.find(c=>c.id===a.classId)?.name||''; const subName=teachers.find(t=>t.id===a.subTeacherId)?.name||'—'; return `<tr><td>${a.period}</td><td>${periodName}</td><td>${clsName}</td><td>${subName}</td></tr>`; }).join('')}</tbody></table></div>`; }); reportGroups.innerHTML = html; }

reportDate.addEventListener('change', renderReport);
printReportBtn.addEventListener('click', ()=>{
  if(!reportDate.value) reportDate.valueAsDate=new Date();
  renderReport();
  const date = reportDate.value;
  const dayName = dayFromDate(date);
  const title = document.querySelector('.brand-text h1')?.textContent || 'التقرير';
  const sub = document.querySelector('.brand-text .subtitle')?.textContent || '';
  const ph = document.getElementById('printHeader');
  if(ph){
    ph.innerHTML = `
      <div class="ph-title">${title}</div>
      <div class="ph-sub">${sub}</div>
      <div class="ph-meta">
        <span class="ph-badge">التاريخ: ${date}</span>
        <span class="ph-badge">اليوم: ${dayName}</span>
        <span class="ph-badge">تم الإنشاء: ${new Date().toLocaleString('ar')}</span>
      </div>
    `;
  }
  window.print();
});
exportCSVBtn.addEventListener('click', ()=>{ const date=reportDate.value; const rows=assignments.filter(a=>a.date===date); let csv='المعلم الغائب,رقم الحصة,اسم الحصة,الفصل,المعلم الاحتياط\n'; rows.forEach(a=>{ const absentName=teachers.find(t=>t.id===a.absentTeacherId)?.name||''; csv+=`${absentName},${a.period},${settings.periodNames[a.period-1]||a.period},${classes.find(c=>c.id===a.classId)?.name||''},${teachers.find(t=>t.id===a.subTeacherId)?.name||''}\n`; }); const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'}); const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=`تقرير_${date}.csv`; a.click(); });


// === الإعدادات (Logic) ===
const settingPeriods = document.getElementById('settingPeriods');
const settingPeriodNames = document.getElementById('settingPeriodNames');
const settingDays = document.getElementById('settingDays');
const settingMaxSubs = document.getElementById('settingMaxSubs');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');

function loadSettingsUI(){
  if(!settingPeriods) return; // Guard clause if settings UI isn't loaded
  settingPeriods.value = settings.periods;
  settingPeriodNames.value = settings.periodNames.join(',');
  settingDays.value = settings.days.join(',');
  settingMaxSubs.value = settings.maxDailySubs;
}

saveSettingsBtn?.addEventListener('click', ()=>{
  const newPeriods = Number(settingPeriods.value);
  const newPeriodNames = settingPeriodNames.value.split(',').map(s=>s.trim()).filter(s=>s.length>0);
  const newDays = settingDays.value.split(',').map(s=>s.trim()).filter(s=>s.length>0);
  const newMaxSubs = Number(settingMaxSubs.value);

  if (newPeriods < 1 || isNaN(newPeriods)) return showToast('عدد الحصص يجب أن يكون رقمًا صحيحًا و 1 على الأقل.');
  if (newPeriodNames.length !== newPeriods) return showToast(`عدد أسماء الحصص (${newPeriodNames.length}) لا يتطابق مع عدد الحصص اليومي (${newPeriods}).`);
  if (newDays.length < 1) return showToast('يجب تحديد يوم عمل واحد على الأقل.');
  if (newMaxSubs < 1 || isNaN(newMaxSubs)) return showToast('الحد الأقصى للاحتياط يجب أن يكون رقمًا صحيحًا و 1 على الأقل.');

  // تحديث الثوابت العالمية
  settings.periods = newPeriods;
  settings.periodNames = newPeriodNames;
  settings.days = newDays;
  settings.maxDailySubs = newMaxSubs; // تم حفظه لكن لا يُستخدم كشرط للأهلية
  

  LS.set('settings', settings);
  document.documentElement.style.setProperty('--periods', settings.periods);
  showToast('تم حفظ الإعدادات بنجاح. قد تحتاج إلى إعادة تحميل الصفحة لتطبيق كامل التغييرات على الجداول.');
  initUI(); // إعادة تهيئة واجهات المستخدم لتطبيق الإعدادات الجديدة (مهم للرسوم)
});

function initClassesUI(){ refreshClassesTable(); }
function initUI(){ initTeachersUI(); initClassesUI(); loadSettingsUI(); }
initUI();


// === Theme Toggle: robust initialization ===
document.addEventListener('DOMContentLoaded', function () {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme === 'light') {
    document.body.classList.add('theme-light');
  } else {
    document.body.classList.remove('theme-light');
  }
  let btn = document.getElementById('themeToggleBtn');
  if (!btn) {
    const wrapper = document.createElement('div');
    wrapper.style.position = 'fixed';
    wrapper.style.top = '20px';
    wrapper.style.left = '20px';
    wrapper.style.zIndex = '9999';
    btn = document.createElement('button');
    btn.id = 'themeToggleBtn';
    btn.className = 'btn secondary';
    btn.textContent = 'تبديل الوضع';
    wrapper.appendChild(btn);
    document.body.appendChild(wrapper);
  }
  btn.addEventListener('click', function () {
    const isLight = document.body.classList.toggle('theme-light');
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
  });
});


// ضمان وجود غلاف تمرير مستقل لقائمة المعلمين الغائبين
function ensureAbsentScrollBox(){
  const list = document.getElementById('absentTeachersList');
  if(!list) return;
  let box = list.closest('.absent-scroll-box');
  if(!box){
    box = document.createElement('div');
    box.className = 'absent-scroll-box';
    // ضع الصندوق قبل قائمة اليوم مباشرة إن وُجد عنوان نصي
    const parent = list.parentNode;
    parent.insertBefore(box, list);
    box.appendChild(list);
  }
}

// === إضافات: واجهة النسخ الاحتياطي (تصدير/استيراد) للمعلمين والفصول ===
(function addImportExportUI(){
 const sec = document.getElementById('teachers');
 if(!sec) return;
 const card = document.createElement('div'); card.className = 'card backup-card align-center';
 const title = document.createElement('h3'); title.className='card-title'; title.textContent='النسخ الاحتياطي للجداول'; card.appendChild(title);

 const actions = document.createElement('div'); actions.className='actions compact';

 // JSON
 const exportBtn = document.createElement('button'); exportBtn.id='exportTeachersBtn'; exportBtn.className='btn primary'; exportBtn.textContent='تصدير بيانات المعلمين (JSON)';
 const importBtn = document.createElement('button'); importBtn.id='importTeachersBtn'; importBtn.className='btn secondary'; importBtn.textContent='استيراد بيانات المعلمين (JSON)';
 const fileInp = document.createElement('input');
 fileInp.type='file';
 fileInp.id='importTeachersInput';
 fileInp.accept='.json';
 fileInp.style.display='none';

 // Excel عبر CSV (بفاصل ; ليظهر في أعمدة داخل Excel العربي)
 const exportExcelBtn = document.createElement('button'); exportExcelBtn.id='exportTeachersExcelBtn'; exportExcelBtn.className='btn primary'; exportExcelBtn.textContent='تصدير Excel (CSV)';
 const importExcelBtn = document.createElement('button'); importExcelBtn.id='importTeachersExcelBtn'; importExcelBtn.className='btn secondary'; importExcelBtn.textContent='استيراد Excel (CSV)';
 const templateExcelBtn = document.createElement('button'); templateExcelBtn.id='templateTeachersExcelBtn'; templateExcelBtn.className='btn secondary'; templateExcelBtn.textContent='تحميل قالب Excel (CSV)';

 const excelInp = document.createElement('input');
 excelInp.type='file';
 excelInp.id='importTeachersExcelInput';
 excelInp.accept='.csv,text/csv,application/vnd.ms-excel';
 excelInp.style.display='none';

 actions.appendChild(exportBtn);
 actions.appendChild(importBtn);
 actions.appendChild(exportExcelBtn);
 actions.appendChild(importExcelBtn);
 actions.appendChild(templateExcelBtn);

 card.appendChild(actions);
 card.appendChild(fileInp);
 card.appendChild(excelInp);

 const info = document.createElement('div');
 info.className = 'muted small right';
 info.style.marginTop = '10px';
 info.innerHTML = "<b>حقول ملف Excel (CSV) للاستيراد:</b> اسم_المعلم؛ ملاحظات_المعلم (اختياري)؛ اليوم؛ رقم_الحصة؛ اسم_الفصل؛ المرحلة (اختياري).<br><span class='small'>ملاحظة: ملف CSV يتم تصديره بفاصل <b>;</b> ليظهر كل حقل في عمود مستقل داخل Excel.</span>";
 card.appendChild(info);

 sec.appendChild(card);

 // ===== أدوات مساعدة للتنزيل =====
 function downloadTextFile(filename, content, mime){
   const blob = new Blob([content], {type: mime || 'text/plain;charset=utf-8;'});
   const url = URL.createObjectURL(blob);
   const a = document.createElement('a');
   a.href = url;
   a.download = filename;
   a.click();
   setTimeout(()=>URL.revokeObjectURL(url), 1000);
 }

 // ===== JSON Export/Import (كما كان) =====
 function exportTeachersData(){
   const payload = { version: 'v3.3', exportedAt: new Date().toISOString(), teachers, classes };
   const data = JSON.stringify(payload, null, 2);
   const blob = new Blob([data], {type:'application/json'});
   const url = URL.createObjectURL(blob);
   const a=document.createElement('a'); a.href=url; a.download='backup_teachers_classes.json'; a.click();
   setTimeout(()=>URL.revokeObjectURL(url), 1000);
   showToast('تم تصدير البيانات بنجاح ✔');
 }

 function importTeachersData(file){
   const reader = new FileReader();
   reader.onload = (evt)=>{
     try{
       const obj = JSON.parse(evt.target.result);
       const importedTeachers = Array.isArray(obj) ? obj : obj.teachers;
       const importedClasses  = Array.isArray(obj) ? [] : (obj.classes || []);
       if(!Array.isArray(importedTeachers)) throw new Error('invalid');
       if(!confirm('سيتم استبدال بيانات المعلمين الحالية. هل تريد المتابعة؟')) return;
       teachers = importedTeachers;
       classes = importedClasses.length ? importedClasses : classes;
       LS.set('teachers', teachers);
       LS.set('classes', classes);
       refreshTeachersSelect();
       refreshTeachersTable();
       renderScheduleGrid(settings.days[0]);
       showToast('تم الاستيراد بنجاح ✔');
     }catch(e){
       alert('ملف غير صالح!');
     }
   };
   reader.readAsText(file);
 }

 // ===== Excel CSV Export/Import =====
 const CSV_DELIM = ';';

 function csvEscape(v){
   const s = (v ?? '').toString();
   if (/[\n\r";]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
   return s;
 }

 function exportTeachersExcelCSV(){
   const headers = ['اسم_المعلم','ملاحظات_المعلم','اليوم','رقم_الحصة','اسم_الفصل','المرحلة'];
   const rows = [headers];
   const dayList = settings.days || [];

   teachers.forEach(t => {
     let hasAny = false;
     dayList.forEach(day => {
       for(let p=1; p<=settings.periods; p++){
         const cid = t?.schedule?.[day]?.[p] ?? null;
         if(!cid) continue;
         hasAny = true;
         const cls = classes.find(c => c.id === cid);
         rows.push([t.name, t.note || '', day, p, cls?.name || '', cls?.grade || '']);
       }
     });
     if(!hasAny){
       rows.push([t.name, t.note || '', '', '', '', '']);
     }
   });

   const csv = '\ufeff' + rows.map(r => r.map(csvEscape).join(CSV_DELIM)).join('\n');
   const stamp = new Date().toISOString().slice(0,10);
   downloadTextFile(`backup_teachers_${stamp}.csv`, csv, 'text/csv;charset=utf-8;');
   showToast('تم تصدير ملف Excel (CSV) ✔');
 }

 function downloadTeachersTemplateCSV(){
   const headers = ['اسم_المعلم','ملاحظات_المعلم','اليوم','رقم_الحصة','اسم_الفصل','المرحلة'];
   // مثال واضح (يمكن للمستخدم مسحه واستبداله)
   const sample = [
     ['خالد سعيد المويسي','التربية الاسلامية','الأحد','1','11','الحادي عشر'],
     ['خالد سعيد المويسي','التربية الاسلامية','الأحد','4','8','الثامن'],
     ['مثال: معلم بدون جدول','ملاحظات اختيارية','','','','']
   ];
   const rows = [headers, ...sample];
   const csv = '\ufeff' + rows.map(r => r.map(csvEscape).join(CSV_DELIM)).join('\n');
   downloadTextFile('قالب_استيراد_المعلمين.csv', csv, 'text/csv;charset=utf-8;');
   showToast('تم تحميل قالب Excel (CSV) ✔');
 }

 function detectDelimiter(line){
   const c = (line.match(/,/g) || []).length;
   const s = (line.match(/;/g) || []).length;
   return s >= c ? ';' : ',';
 }

 function parseCSV(text){
   const firstLine = (text.split(/\r?\n/).find(l => l.trim().length) || '');
   const delim = detectDelimiter(firstLine);

   const rows = [];
   let row = [];
   let cur = '';
   let inQuotes = false;
   for(let i=0;i<text.length;i++){
     const ch = text[i];
     const next = text[i+1];
     if(inQuotes){
       if(ch === '"' && next === '"'){ cur += '"'; i++; }
       else if(ch === '"'){ inQuotes = false; }
       else { cur += ch; }
     } else {
       if(ch === '"'){ inQuotes = true; }
       else if(ch === delim){ row.push(cur); cur = ''; }
       else if(ch === '\n'){
         row.push(cur); rows.push(row); row = []; cur='';
       } else if(ch === '\r'){
         // ignore
       } else { cur += ch; }
     }
   }
   row.push(cur);
   rows.push(row);
   while(rows.length && rows[rows.length-1].every(c => (c ?? '').trim() === '')) rows.pop();
   return rows;
 }

 function importTeachersExcelCSV(file){
   const reader = new FileReader();
   reader.onload = (evt)=>{
     try{
       const text = (evt.target.result || '').toString();
       const rows = parseCSV(text);
       if(rows.length < 1) throw new Error('empty');

       const header = rows[0].map(h => (h||'').trim());
       const alias = {
         'اسم_المعلم':'teacher_name', 'teacher_name':'teacher_name',
         'ملاحظات_المعلم':'teacher_note','teacher_note':'teacher_note',
         'اليوم':'day','day':'day',
         'رقم_الحصة':'period','period':'period',
         'اسم_الفصل':'class_name','class_name':'class_name',
         'المرحلة':'class_grade','class_grade':'class_grade'
       };
       const idx = {};
       header.forEach((h,i)=>{ const key = alias[h] || alias[h.replace(/\s+/g,'_')] || null; if(key) idx[key]=i; });
       if(idx.teacher_name == null) throw new Error('missing teacher_name');

       if(!confirm('سيتم استبدال بيانات المعلمين الحالية. هل تريد المتابعة؟')) return;

       const classByName = new Map();
       const newClasses = [];
       function getOrCreateClass(name, grade){
         const nm = (name||'').trim();
         if(!nm) return null;
         if(classByName.has(nm)){
           const c = classByName.get(nm);
           if(grade && !c.grade) c.grade = grade;
           return c;
         }
         const c = { id: uid(), name: nm, grade: (grade||'').trim() };
         classByName.set(nm,c);
         newClasses.push(c);
         return c;
       }

       const teacherByName = new Map();
       const newTeachers = [];
       const validDays = new Set(settings.days || []);

       for(let r=1; r<rows.length; r++){
         const line = rows[r];
         const tName = (line[idx.teacher_name] ?? '').trim();
         if(!tName) continue;
         let t = teacherByName.get(tName);
         if(!t){
           t = { id: uid(), name: tName, note: '', schedule: {} };
           teacherByName.set(tName, t);
           newTeachers.push(t);
         }
         const note = idx.teacher_note != null ? (line[idx.teacher_note] ?? '').trim() : '';
         if(note && !t.note) t.note = note;

         const day = idx.day != null ? (line[idx.day] ?? '').trim() : '';
         const perStr = idx.period != null ? (line[idx.period] ?? '').trim() : '';
         const clsName = idx.class_name != null ? (line[idx.class_name] ?? '').trim() : '';
         const grade = idx.class_grade != null ? (line[idx.class_grade] ?? '').trim() : '';

         if(!day || !perStr || !clsName) continue;
         if(!validDays.has(day)) continue;
         const p = Number(perStr);
         if(!Number.isFinite(p) || p < 1 || p > settings.periods) continue;

         const cls = getOrCreateClass(clsName, grade);
         if(!cls) continue;
         t.schedule[day] = t.schedule[day] || {};
         t.schedule[day][p] = cls.id;
       }

       teachers = newTeachers;
       classes = newClasses.length ? newClasses : classes;

       LS.set('teachers', teachers);
       LS.set('classes', classes);
       refreshTeachersSelect();
       refreshTeachersTable();
       renderScheduleGrid(settings.days[0]);
       showToast('تم استيراد Excel (CSV) بنجاح ✔');
     }catch(e){
       alert('ملف CSV غير صالح! تأكد من أسماء الحقول وترتيبها.');
     }
   };
   reader.readAsText(file);
 }

 // Events
 exportBtn.addEventListener('click', exportTeachersData);
 importBtn.addEventListener('click', ()=>fileInp.click());
 fileInp.addEventListener('change', (e)=>{ const file = e.target.files[0]; if(file) importTeachersData(file); e.target.value=''; });

 exportExcelBtn.addEventListener('click', exportTeachersExcelCSV);
 importExcelBtn.addEventListener('click', ()=>excelInp.click());
 excelInp.addEventListener('change', (e)=>{ const file = e.target.files[0]; if(file) importTeachersExcelCSV(file); e.target.value=''; });

 templateExcelBtn.addEventListener('click', downloadTeachersTemplateCSV);
})();
;
;