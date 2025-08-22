<script setup>
import { reactive, computed, watch, ref } from 'vue'

/* =========================
   Konfiguration
   ========================= */
const CATEGORIES = ['Pflanzenpflege', 'Kastanien', 'Haus', 'Garage', 'Garten', 'Extraarbeiten']
const STORAGE_KEY = 'stallerhof.data.v2' // neue Struktur

/* =========================
   Storage-Helpers
   ========================= */
function loadFromStorage() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY))
  } catch {
    return null
  }
}
function saveAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
function baseEmptyTasks() {
  return CATEGORIES.reduce((acc, cat) => (acc[cat] = [], acc), {})
}
function ensureData(obj) {
  const safe = (obj && typeof obj === 'object') ? { ...obj } : {}
  // Tasks-Objekt
  const tasks = ensureCategories(safe.tasks)
  // Notizbuch
  const notesBook = Array.isArray(safe.notesBook) ? safe.notesBook.map(n => ({
    id: n.id ?? uid(),
    text: String(n.text ?? '').trim(),
    done: !!n.done,
    createdAt: n.createdAt ?? new Date().toISOString()
  })) : []
  // Pflanzen
  const plants = Array.isArray(safe.plants) ? safe.plants.map(p => ({
    id: p.id ?? uid(),
    name: String(p.name ?? '').trim(),
    care: String(p.care ?? '').trim(),
    photo: p.photo ?? null, // Data-URL oder null
    createdAt: p.createdAt ?? new Date().toISOString()
  })) : []
  return { tasks, notesBook, plants }
}
function ensureCategories(obj) {
  const base = (obj && typeof obj === 'object') ? { ...obj } : {}
  for (const cat of CATEGORIES) {
    if (!Array.isArray(base[cat])) base[cat] = []
    base[cat] = base[cat].map(t => ({
      id: t.id ?? uid(),
      title: String(t.title ?? '').trim(),
      due: t.due ?? null,
      notes: String(t.notes ?? ''),
      done: !!t.done,
      repeat: t.repeat ?? 'none',
      createdAt: t.createdAt ?? new Date().toISOString()
    }))
  }
  // Optional: Unbekannte Kategorien entfernen
  // for (const k of Object.keys(base)) if (!CATEGORIES.includes(k)) delete base[k]
  return base
}

/* =========================
   State
   ========================= */
const initial = ensureData(loadFromStorage())
const state = reactive({
  activeCat: CATEGORIES[0],
  data: initial,                 // { tasks, notesBook, plants }
  newTask: { title:'', due:'', notes:'', repeat:'none' },
  showAll: false,                // false | true | 'calendar'
  // Notizbuch
  newNoteText: '',
  // Pflanzen
  newPlant: { name:'', care:'', photo:null }
})

/* =========================
   Helpers
   ========================= */
function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}
function toDateStr(d) {
  return d.toISOString().slice(0,10)
}
function lastDayOfMonth(y, m) {
  return new Date(y, m + 1, 0).getDate()
}
function addDays(date, n) { const d=new Date(date); d.setDate(d.getDate()+n); return d }
function addWeeks(date, n) { return addDays(date, n*7) }
function addMonthsSafe(date, n) {
  const d = new Date(date)
  const base = new Date(d.getFullYear(), d.getMonth(), 1)
  const ty = base.getFullYear() + Math.floor((base.getMonth() + n) / 12)
  const tm = (base.getMonth() + n) % 12
  const day = Math.min(d.getDate(), lastDayOfMonth(ty, tm))
  return new Date(ty, tm, day)
}
function addYearsSafe(date, n) {
  const d = new Date(date)
  const day = Math.min(d.getDate(), lastDayOfMonth(d.getFullYear()+n, d.getMonth()))
  return new Date(d.getFullYear()+n, d.getMonth(), day)
}
function hasTaskWithDue(cat, title, dueStr) {
  return state.data.tasks[cat].some(x => x.title === title && x.due === dueStr)
}

/* =========================
   Aufgaben CRUD
   ========================= */
function resetTaskForm() {
  state.newTask = { title:'', due:'', notes:'', repeat:'none' }
}
function addTask() {
  const cat = state.activeCat
  const title = state.newTask.title.trim()
  if (!title) return
  state.data.tasks[cat].push({
    id: uid(),
    title,
    due: state.newTask.due || null,
    notes: state.newTask.notes?.trim() || '',
    done: false,
    repeat: state.newTask.repeat || 'none',
    createdAt: new Date().toISOString()
  })
  resetTaskForm()
}
function toggleDone(cat, id) {
  const t = state.data.tasks[cat].find(t => t.id === id)
  if (t) t.done = !t.done
}
function removeTask(cat, id) {
  state.data.tasks[cat] = state.data.tasks[cat].filter(t => t.id !== id)
}

/* =========================
   Aufgaben: abgeleitet + Kalender
   ========================= */
const allTasks = computed(() => {
  return CATEGORIES.flatMap(cat =>
    state.data.tasks[cat].map(t => ({ ...t, cat }))
  ).sort((a,b) => {
    if (a.done !== b.done) return a.done ? 1 : -1
    if (a.due && b.due && a.due !== b.due) return a.due.localeCompare(b.due)
    return (b.createdAt || '').localeCompare(a.createdAt || '')
  })
})
function tasksOnDate(dateStr) {
  const list = []
  for (const cat of CATEGORIES) {
    for (const t of state.data.tasks[cat]) {
      if (t.due === dateStr) list.push({ ...t, cat })
    }
  }
  return list.sort((a,b) => (a.done === b.done) ? 0 : a.done ? 1 : -1)
}

/* =========================
   Wiederholungen expandieren
   ========================= */
function expandRecurrences(horizonMonths = 36) {
  const cutoff = addMonthsSafe(new Date(), horizonMonths)
  for (const cat of CATEGORIES) {
    const snapshot = [...state.data.tasks[cat]] // stabile Iteration
    for (const t of snapshot) {
      if (!t.due) continue
      const rep = t.repeat || 'none'
      if (rep === 'none') continue

      const start = new Date(t.due)
      const step = (d) => {
        if (rep === 'daily')   return addDays(d, 1)
        if (rep === 'weekly')  return addWeeks(d, 1)
        if (rep === 'monthly') return addMonthsSafe(d, 1)
        if (rep === 'yearly')  return addYearsSafe(d, 1)
        return d
      }

      let nextDate = step(start)
      while (nextDate <= cutoff) {
        const dueStr = toDateStr(nextDate)
        if (!hasTaskWithDue(cat, t.title, dueStr)) {
          state.data.tasks[cat].push({
            ...t,
            id: uid(),
            due: dueStr,
            done: false,
            repeat: 'none', // ganz wichtig: Instanzen sind eigenständig
            createdAt: new Date().toISOString()
          })
        }
        nextDate = step(nextDate)
      }
    }
  }
}

/* =========================
   Notizbuch
   ========================= */
function addNote() {
  const text = state.newNoteText.trim()
  if (!text) return
  state.data.notesBook.push({
    id: uid(),
    text,
    done: false,
    createdAt: new Date().toISOString()
  })
  state.newNoteText = ''
}
function toggleNote(id) {
  const n = state.data.notesBook.find(n => n.id === id)
  if (n) n.done = !n.done
}
function removeNote(id) {
  state.data.notesBook = state.data.notesBook.filter(n => n.id !== id)
}

/* =========================
   Pflanzen (Foto + Pflege)
   ========================= */
async function handlePlantPhotoChange(ev) {
  const file = ev.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => { state.newPlant.photo = reader.result }
  reader.readAsDataURL(file)
}
function addPlant() {
  const name = state.newPlant.name.trim()
  const care = state.newPlant.care.trim()
  // Foto ist optional
  if (!name && !care && !state.newPlant.photo) return
  state.data.plants.push({
    id: uid(),
    name,
    care,
    photo: state.newPlant.photo || null,
    createdAt: new Date().toISOString()
  })
  state.newPlant = { name:'', care:'', photo:null }
}
function removePlant(id) {
  state.data.plants = state.data.plants.filter(p => p.id !== id)
}

/* =========================
   Persistenz
   ========================= */
function persist() {
  saveAll(state.data)
}
watch(() => state.data.tasks, persist, { deep: true })
watch(() => state.data.notesBook, persist, { deep: true })
watch(() => state.data.plants, persist, { deep: true })

/* =========================
   Export / Import
   ========================= */
function exportJson() {
  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    tasks: state.data.tasks,
    notesBook: state.data.notesBook,
    plants: state.data.plants
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `stallerhof_backup_${new Date().toISOString().slice(0,10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
function importJson(ev) {
  const file = ev.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result)
      const merged = ensureData(parsed)
      state.data = merged
      saveAll(state.data)
      alert('Import erfolgreich ✅')
    } catch (e) {
      alert('Import fehlgeschlagen ❌: ' + (e?.message || e))
    } finally {
      ev.target.value = ''
    }
  }
  reader.readAsText(file)
}

/* =========================
   Kalender (Monat)
   ========================= */
const today = new Date()
const calYear = ref(today.getFullYear())
const calMonth = ref(today.getMonth()) // 0=Jan
const WEEKDAYS = ['Mo','Di','Mi','Do','Fr','Sa','So']
function startOfMonth(y, m) { return new Date(y, m, 1) }
function endOfMonth(y, m) { return new Date(y, m+1, 0) }
function getMonthMatrix(y, m) {
  const start = startOfMonth(y, m)
  const end = endOfMonth(y, m)
  const startWeekday = (start.getDay() + 6) % 7 // Mo=0
  const daysInMonth = end.getDate()
  const days = []
  for (let i=0;i<startWeekday;i++) days.push(null)
  for (let d=1; d<=daysInMonth; d++) days.push(new Date(y, m, d))
  while (days.length < 42) days.push(null)
  const weeks = []
  for (let i=0;i<42;i+=7) weeks.push(days.slice(i,i+7))
  return weeks
}
function prevMonth() { if (calMonth.value===0){ calMonth.value=11; calYear.value-- } else calMonth.value-- }
function nextMonth() { if (calMonth.value===11){ calMonth.value=0; calYear.value++ } else calMonth.value++ }

/* =========================
   Initial: Zukunft auffüllen
   ========================= */
expandRecurrences(36)
</script>

<template>
  <main class="wrap">
    <header class="head">
      <h1>Stallerhof&nbsp;App</h1>
      <p class="sub">Kategorien, Kalender, Notizbuch & Pflanzen – alles lokal gespeichert. 🎯</p>

      <div class="backup-row">
        <button class="ghost" @click="exportJson">Export (JSON)</button>
        <label class="ghost file">
          Import
          <input type="file" accept="application/json" @change="importJson" />
        </label>
        <button class="ghost" @click="expandRecurrences(36)">Zukunft auffüllen (36&nbsp;Monate)</button>
      </div>
    </header>

    <!-- Ansicht umschalten -->
    <div class="view-switch">
      <button class="pill" :class="{ active: state.showAll === false }" @click="state.showAll = false">Kategorie</button>
      <button class="pill" :class="{ active: state.showAll === true }" @click="state.showAll = true">Alle Aufgaben</button>
      <button class="pill" :class="{ active: state.showAll === 'calendar' }" @click="state.showAll = 'calendar'">Kalender</button>
    </div>

    <!-- Kategorien-Tabs -->
    <nav v-if="state.showAll === false" class="tabs">
      <button
        v-for="cat in CATEGORIES"
        :key="cat"
        class="tab"
        :class="{ active: state.activeCat === cat }"
        @click="state.activeCat = cat"
      >
        {{ cat }}
        <small class="count">{{ state.data.tasks[cat].filter(t => !t.done).length }}</small>
      </button>
    </nav>

    <!-- Formular: neue Aufgabe -->
    <section class="card">
      <h2>Neue Aufgabe</h2>
      <form class="form" @submit.prevent="addTask">
        <div class="row">
          <label>Titel</label>
          <input v-model="state.newTask.title" type="text" placeholder="z. B. Rosen schneiden" required />
        </div>

        <div class="row two">
          <div>
            <label>Fällig bis</label>
            <input v-model="state.newTask.due" type="date" />
          </div>
          <div v-if="state.showAll === false">
            <label>Kategorie</label>
            <select v-model="state.activeCat">
              <option v-for="cat in CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
            </select>
          </div>
        </div>

        <div class="row">
          <label>Wiederholen</label>
          <select v-model="state.newTask.repeat">
            <option value="none">Keine Wiederholung</option>
            <option value="daily">Täglich</option>
            <option value="weekly">Wöchentlich</option>
            <option value="monthly">Monatlich</option>
            <option value="yearly">Jährlich</option>
          </select>
        </div>

        <div class="row">
          <label>Notizen (optional)</label>
          <textarea v-model="state.newTask.notes" rows="2" placeholder="z. B. gegen Läuse spritzen, Foto machen"></textarea>
        </div>

        <div class="actions">
          <button type="submit" class="primary">Hinzufügen</button>
        </div>
      </form>
    </section>

    <!-- Kalenderansicht -->
    <section v-if="state.showAll === 'calendar'" class="card">
      <div class="cal-head">
        <button class="ghost" @click="prevMonth">‹</button>
        <h2 class="cal-title">
          {{ new Date(calYear, calMonth).toLocaleString('de-DE', { month: 'long', year: 'numeric' }) }}
        </h2>
        <button class="ghost" @click="nextMonth">›</button>
      </div>

      <div class="cal-grid">
        <div class="cal-wd" v-for="wd in WEEKDAYS" :key="wd">{{ wd }}</div>
        <template v-for="(week, wi) in getMonthMatrix(calYear, calMonth)" :key="wi">
          <div
            v-for="(day, di) in week"
            :key="wi+'-'+di"
            class="cal-cell"
            :class="{ empty: !day, today: day && toDateStr(day) === toDateStr(new Date()) }"
          >
            <div class="cal-date" v-if="day">{{ day.getDate() }}</div>
            <div class="cal-tasks" v-if="day">
              <div
                v-for="task in tasksOnDate(toDateStr(day))"
                :key="task.id"
                class="cal-task"
                :class="{ done: task.done }"
                title="Zum Abhaken/Löschen in die Listenansicht wechseln"
              >
                <span class="dot" :data-cat="task.cat"></span>
                <span class="t">{{ task.title }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>

      <small class="muted">Hinweis: Abhaken/Löschen in der Listenansicht.</small>
    </section>

    <!-- Aufgabenliste -->
    <section v-else class="card">
      <h2 v-if="state.showAll === false">{{ state.activeCat }} – Aufgaben</h2>
      <h2 v-else>Alle Aufgaben</h2>

      <ul class="list" v-if="(state.showAll ? allTasks.length : state.data.tasks[state.activeCat].length)">
        <li v-for="t in (state.showAll ? allTasks : state.data.tasks[state.activeCat])" :key="t.id" class="item">
          <label class="check">
            <input type="checkbox" :checked="t.done" @change="toggleDone(t.cat || state.activeCat, t.id)" />
            <span :class="{ done: t.done }">{{ t.title }}</span>
          </label>
          <div class="meta">
            <span v-if="t.due" class="chip">Fällig: {{ t.due }}</span>
            <span class="chip" v-if="t.cat && state.showAll">{{ t.cat }}</span>
          </div>
          <p v-if="t.notes" class="notes">{{ t.notes }}</p>
          <div class="row-end">
            <button class="danger" @click="removeTask(t.cat || state.activeCat, t.id)">Löschen</button>
          </div>
        </li>
      </ul>

      <p v-else class="empty">Noch keine Aufgaben hier. Leg oben eine an.</p>
    </section>

    <!-- Notizbuch -->
    <section class="card">
      <h2>Notizbuch</h2>
      <div class="form">
        <div class="row">
          <label>Neue Notiz</label>
          <input v-model="state.newNoteText" type="text" placeholder="z. B. Einkaufsliste, Ideen, To-dos" />
        </div>
        <div class="actions">
          <button class="primary" @click="addNote">Notiz hinzufügen</button>
        </div>
      </div>

      <ul class="list" v-if="state.data.notesBook.length">
        <li v-for="n in state.data.notesBook" :key="n.id" class="item">
          <label class="check">
            <input type="checkbox" :checked="n.done" @change="toggleNote(n.id)" />
            <span :class="{ done: n.done }">{{ n.text }}</span>
          </label>
          <div class="row-end">
            <button class="danger" @click="removeNote(n.id)">Löschen</button>
          </div>
        </li>
      </ul>
      <p v-else class="empty">Noch keine Notizen.</p>
    </section>

    <!-- Pflanzen: Foto + Pflegehinweis -->
    <section class="card">
      <h2>Pflanzen</h2>
      <div class="form">
        <div class="row two">
          <div>
            <label>Name (optional)</label>
            <input v-model="state.newPlant.name" type="text" placeholder="z. B. Rosen, Kastanie" />
          </div>
          <div>
            <label>Foto (optional)</label>
            <input type="file" accept="image/*" @change="handlePlantPhotoChange" />
          </div>
        </div>
        <div class="row">
          <label>Pflegehinweis</label>
          <textarea v-model="state.newPlant.care" rows="2" placeholder="z. B. Schnittzeit, Gießen, Schädlingsschutz"></textarea>
        </div>
        <div class="actions">
          <button class="primary" @click="addPlant">Eintrag hinzufügen</button>
        </div>
      </div>

      <div class="plants-grid" v-if="state.data.plants.length">
        <div class="plant-card" v-for="p in state.data.plants" :key="p.id">
          <div class="plant-photo" v-if="p.photo"><img :src="p.photo" alt="Pflanzenfoto" /></div>
          <div class="plant-body">
            <h3>{{ p.name || 'Ohne Titel' }}</h3>
            <p>{{ p.care || '—' }}</p>
          </div>
          <div class="row-end">
            <button class="danger" @click="removePlant(p.id)">Löschen</button>
          </div>
        </div>
      </div>
      <p v-else class="empty">Noch keine Pflanzeneinträge.</p>
    </section>

    <footer class="foot">
      <small>🔒 Lokal gespeichert. Tipp: Export nutzen, um Backups anzulegen.</small>
    </footer>
  </main>
</template>

<style>
:root {
  --bg:#0b0c10; --card:#111218; --muted:#8a8f98; --text:#e7e9ee;
  --brand:#3aa17e; --brand-2:#2f7b61; --danger:#b54b4b;
  --pill:#1a1c24; --chip:#1f2230; --border:#232433;
}
*{box-sizing:border-box}
body { margin:0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:var(--bg); color:var(--text); }
.wrap { max-width: 980px; margin: 24px auto; padding: 16px; }
.head h1 { margin: 0 0 4px; font-size: 26px; }
.sub { margin:0 0 8px; color:var(--muted) }
.backup-row { display:flex; gap:8px; flex-wrap:wrap; margin: 6px 0 16px; }
button.ghost, .ghost.file {
  background:transparent; border:1px solid var(--border); color:var(--text);
  border-radius:10px; padding:8px 12px; cursor:pointer; display:inline-flex; align-items:center; gap:8px
}
.ghost:hover { background:#12131a }
.ghost.file input { display:none }

.view-switch { display:flex; gap:8px; margin: 8px 0 16px; }
.pill { background:var(--pill); color:var(--text); border:1px solid var(--border); border-radius:999px; padding:8px 14px; cursor:pointer }
.pill.active { background:var(--brand); border-color:var(--brand); }

.tabs { display:flex; gap:8px; flex-wrap:wrap; margin: 8px 0 16px; }
.tab { background:var(--pill); border:1px solid var(--border); color:var(--text); border-radius:12px; padding:8px 12px; cursor:pointer; display:flex; align-items:center; gap:8px }
.tab.active { outline:2px solid var(--brand); }
.count { background:var(--chip); padding:2px 8px; border-radius:999px; color:var(--muted) }

.card { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:16px; margin: 12px 0; }
.form .row { display:flex; flex-direction:column; gap:6px; margin-bottom:12px; }
.form .two { flex-direction:row; gap:12px; }
.form label { color:var(--muted); font-size:14px; }
input, select, textarea { width:100%; background:#0f1016; border:1px solid var(--border); border-radius:10px; padding:10px; color:var(--text); }
input[type="date"] { padding:8px 10px }
.actions { display:flex; gap:8px; }
button.primary { background:var(--brand); border:none; color:#fff; border-radius:10px; padding:10px 14px; cursor:pointer }
button.primary:hover { background:var(--brand-2); }
button.danger { background:transparent; border:1px solid var(--danger); color:#fff; border-radius:10px; padding:8px 12px; cursor:pointer }
button.danger:hover { background:#2a0f0f; }

.list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:12px }
.item { background:#0f1016; border:1px solid var(--border); border-radius:12px; padding:12px }
.check { display:flex; align-items:center; gap:10px; font-weight:600; }
.check input { transform: scale(1.2); }
.done { text-decoration: line-through; color: var(--muted); }
.meta { display:flex; gap:8px; flex-wrap:wrap; margin:6px 0; }
.chip { background:var(--chip); color:var(--muted); border:1px solid var(--border); border-radius:999px; padding:2px 8px; font-size:12px }
.notes { margin:6px 0 8px; color:#cfd3da }
.row-end { display:flex; justify-content:flex-end }
.empty { color:var(--muted); }

.foot { color:var(--muted); margin-top: 8px; }

/* Kalender */
.cal-head { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px }
.cal-title { margin:0; text-transform: capitalize; }
.cal-grid { display:grid; grid-template-columns: repeat(7, 1fr); gap:6px; }
.cal-wd { text-align:center; color:var(--muted); font-weight:600; padding:6px 0; }
.cal-cell { min-height: 96px; background:#0f1016; border:1px solid var(--border); border-radius:10px; padding:6px; position:relative; }
.cal-cell.empty { background:transparent; border:1px dashed #2a2c3a }
.cal-cell.today { outline:2px solid var(--brand); }
.cal-date { position:absolute; top:6px; right:8px; color:var(--muted); font-size:12px; }
.cal-tasks { display:flex; flex-direction:column; gap:4px; margin-top: 18px; }
.cal-task { display:flex; align-items:center; gap:6px; font-size:12px; background:#11131b; border:1px solid var(--border); padding:3px 6px; border-radius:8px; }
.cal-task.done { opacity:0.6; text-decoration: line-through; }
.dot { width:8px; height:8px; border-radius:50%; display:inline-block; background:#777; }
/* Farben pro Kategorie */
.dot[data-cat="Pflanzenpflege"] { background:#3aa17e; }
.dot[data-cat="Kastanien"]     { background:#3a7aa1; }
.dot[data-cat="Haus"]          { background:#a17e3a; }
.dot[data-cat="Garage"]        { background:#7e3aa1; }
.dot[data-cat="Garten"]        { background:#5aa13a; }
.dot[data-cat="Extraarbeiten"] { background:#a13a7e; }

/* Pflanzen */
.plants-grid { display:grid; grid-template-columns: repeat(auto-fill, minmax(240px,1fr)); gap:12px; }
.plant-card { background:#0f1016; border:1px solid var(--border); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }
.plant-photo { width:100%; height:160px; overflow:hidden; display:flex; align-items:center; justify-content:center; background:#0c0d12; }
.plant-photo img { max-width:100%; max-height:100%; object-fit:cover; }
.plant-body { padding:12px; }
.plant-body h3 { margin:0 0 6px; font-size:16px; }

@media (max-width: 560px){
  .form .two { flex-direction:column; }
}
</style>

