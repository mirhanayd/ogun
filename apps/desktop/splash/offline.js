const invoke = window.__TAURI__.core.invoke
const PRODUCTION_URL = 'https://ogun-web.vercel.app'

let profiles = []
let selectedProfile = null
let current = null
let selectedClientId = null
let modalType = null
let workspace = emptyWorkspace()
let mutations = []

const $ = (id) => document.getElementById(id)
const esc = (value = '') =>
  String(value).replace(/[&<>'"]/g, (char) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char],
  )
const localId = (prefix) =>
  `local-${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
const iso = () => new Date().toISOString()
const nullable = (value) => (String(value ?? '').trim() ? String(value).trim() : null)
const numberOrNull = (value) => {
  const text = String(value ?? '').trim()
  return text === '' || !Number.isFinite(Number(text)) ? null : Number(text)
}
const listFromText = (value) =>
  String(value ?? '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
const localDateIso = (value) => new Date(`${value}T12:00:00`).toISOString()

function emptyWorkspace() {
  return {
    version: 2,
    capturedAt: null,
    clients: [],
    anamneses: [],
    measurements: [],
    goals: [],
    labResults: [],
    payments: [],
    plans: [],
    appointments: [],
  }
}

function normalizeWorkspace(value) {
  const normalized = value && typeof value === 'object' ? value : emptyWorkspace()
  for (const key of [
    'clients',
    'anamneses',
    'measurements',
    'goals',
    'labResults',
    'payments',
    'plans',
    'appointments',
  ]) {
    if (!Array.isArray(normalized[key])) normalized[key] = []
  }
  normalized.version = 2
  return normalized
}

document.querySelectorAll('[data-window]').forEach((button) =>
  button.addEventListener('click', () =>
    invoke('control_main_window', { action: button.dataset.window }),
  ),
)
$('drag').addEventListener('mousedown', (event) => {
  if (event.button === 0) invoke('control_main_window', { action: 'startDragging' })
})
$('drag').addEventListener('dblclick', () =>
  invoke('control_main_window', { action: 'toggleMaximize' }),
)

async function networkAvailable() {
  try {
    return await invoke('desktop_network_available')
  } catch {
    return navigator.onLine
  }
}

function goOnline() {
  location.href = `${PRODUCTION_URL}/giris`
}

async function boot() {
  const unlocked = await invoke('get_unlocked_offline_workspace').catch(() => null)
  if (unlocked) {
    openWorkspace(unlocked)
    return
  }
  profiles = await invoke('list_offline_profiles').catch(() => [])
  const online = await networkAvailable()
  const status = $('network-status')
  status.classList.toggle('online', online)
  status.lastElementChild.textContent = online ? 'İnternet bağlantısı hazır' : 'Çevrimdışı mod'
  if (online) {
    $('boot-title').textContent = 'Çevrimiçi uygulama açılıyor'
    $('boot-copy').textContent = 'Güvenli oturumunuz kontrol edilecek.'
    setTimeout(goOnline, 350)
    return
  }
  $('boot-title').textContent = profiles.length
    ? 'Bu cihazda kim çalışıyor?'
    : 'İlk giriş için bağlantı gerekiyor'
  $('boot-copy').textContent = profiles.length
    ? 'Kayıtlı hesabınızı seçip yerel PIN’inizle devam edin.'
    : 'Bu cihazda henüz çevrimdışı profil yok. İnternet geldiğinde bir kez giriş yapıp PIN belirleyin.'
  $('online-login').classList.remove('hidden')
  renderProfiles()
}

function renderProfiles() {
  $('profiles').innerHTML = profiles
    .map(
      (profile) =>
        `<button class="profile" data-user="${esc(profile.userId)}" ${profile.pinConfigured ? '' : 'disabled'}><span class="avatar">${esc(profile.displayName.slice(0, 1).toLocaleUpperCase('tr-TR'))}</span><span class="profile-copy"><strong>${esc(profile.displayName)}</strong><span>${esc(profile.email)} · ${esc(profile.clinicName)}${profile.pinConfigured ? '' : ' · PIN ayarlanmamış'}</span></span><span class="chev">›</span></button>`,
    )
    .join('')
  document
    .querySelectorAll('.profile')
    .forEach((button) => button.addEventListener('click', () => selectProfile(button.dataset.user)))
}

function selectProfile(userId) {
  selectedProfile = profiles.find((profile) => profile.userId === userId)
  if (!selectedProfile) return
  $('profiles').classList.add('hidden')
  $('pin-panel').classList.remove('hidden')
  $('boot-title').textContent = `Hoş geldiniz, ${selectedProfile.displayName.split(' ')[0]}`
  $('boot-copy').textContent = `${selectedProfile.clinicName} çalışma alanını açmak için cihaz PIN’inizi girin.`
  $('pin-input').focus()
}

function openWorkspace(unlocked) {
  current = unlocked
  workspace = normalizeWorkspace(current.workspace)
  mutations = current.pendingMutations || []
  $('boot').classList.add('hidden')
  $('app').classList.remove('hidden')
  $('clinic-name').textContent = current.profile.clinicName
  $('user-name').textContent = current.profile.displayName
  renderAll()
}

async function unlock() {
  $('boot-error').textContent = ''
  try {
    openWorkspace(
      await invoke('unlock_offline_profile', {
        userId: selectedProfile.userId,
        pin: $('pin-input').value,
      }),
    )
  } catch (error) {
    $('boot-error').textContent = String(error)
    $('pin-input').select()
  }
}

$('pin-back').onclick = () => {
  selectedProfile = null
  $('pin-panel').classList.add('hidden')
  $('profiles').classList.remove('hidden')
  $('boot-error').textContent = ''
}
$('pin-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') unlock()
})
$('pin-submit').onclick = unlock
$('online-login').onclick = async () => {
  if (await networkAvailable()) goOnline()
  else $('boot-error').textContent = 'İnternet bağlantısı hâlâ yok.'
}

function showPage(name) {
  document.querySelectorAll('nav button').forEach((button) =>
    button.classList.toggle('active', button.dataset.page === name),
  )
  document.querySelectorAll('.page').forEach((page) =>
    page.classList.toggle('active', page.id === `page-${name}`),
  )
}

document.querySelectorAll('nav button').forEach((button) => {
  button.onclick = () => showPage(button.dataset.page)
})

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: String(value).includes('T') && !String(value).includes('T12:00:00') ? 'short' : undefined,
  }).format(date)
}

function clientName(id) {
  const client = workspace.clients.find((item) => item.id === id)
  return client ? `${client.firstName} ${client.lastName}` : 'Danışan'
}

function localBadge(id) {
  return String(id).startsWith('local-') ? ' · Senkron bekliyor' : ''
}

function emptyRecord(text) {
  return `<div class="empty">${esc(text)}</div>`
}

function renderAll() {
  const now = Date.now()
  const activePlans = workspace.plans.filter((item) => item.status !== 'arşiv')
  const upcoming = workspace.appointments
    .filter((item) => new Date(item.startsAt).getTime() >= now)
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
  $('metric-clients').textContent = workspace.clients.length
  $('metric-plans').textContent = activePlans.length
  $('metric-appointments').textContent = upcoming.length
  $('metric-pending').textContent = mutations.length
  $('last-sync').textContent = current.profile.lastSyncedAt
    ? `Bulutla son eşitleme: ${formatDate(current.profile.lastSyncedAt)}`
    : 'Bu cihaz henüz bulutla eşitlenmedi.'
  $('upcoming-list').innerHTML =
    upcoming
      .slice(0, 5)
      .map(
        (appointment) =>
          `<div class="list-item"><strong>${esc(clientName(appointment.clientId))}</strong><span>${formatDate(appointment.startsAt)} · ${esc(appointment.type || 'Görüşme')}</span></div>`,
      )
      .join('') || emptyRecord('Yaklaşan randevu yok.')

  $('clients-table').innerHTML = workspace.clients
    .map((client) => {
      const latest = workspace.measurements
        .filter((item) => item.clientId === client.id)
        .sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt))[0]
      const lastMeasurement = latest?.weightKg
        ? `${Number(latest.weightKg).toLocaleString('tr-TR')} kg · ${formatDate(latest.measuredAt)}`
        : '—'
      return `<tr class="client-row" data-client-id="${esc(client.id)}"><td><strong>${esc(client.firstName)} ${esc(client.lastName)}</strong><span class="record-meta">${esc(client.email || '')}</span></td><td>${esc(client.phone || '—')}</td><td>${esc(lastMeasurement)}</td><td><span class="badge">${esc(client.status || 'aktif')}</span></td><td>${String(client.id).startsWith('local-') ? '<span class="badge local">Senkron bekliyor</span>' : formatDate(client.createdAt)}</td></tr>`
    })
    .join('')
  $('clients-empty').classList.toggle('hidden', workspace.clients.length > 0)
  document.querySelectorAll('.client-row').forEach((row) => {
    row.onclick = () => openClient(row.dataset.clientId)
  })

  $('plans-list').innerHTML = workspace.plans
    .map(
      (plan) =>
        `<div class="list-item"><strong>${esc(plan.name)}</strong><span>${esc(clientName(plan.clientId))} · ${esc(String(plan.targetKcal || '—'))} kcal · ${esc(plan.status || 'taslak')}${localBadge(plan.id)}</span>${plan.notes ? `<span>${esc(plan.notes)}</span>` : ''}</div>`,
    )
    .join('')
  $('plans-empty').classList.toggle('hidden', workspace.plans.length > 0)
  $('appointments-list').innerHTML = [...workspace.appointments]
    .sort((a, b) => new Date(a.startsAt) - new Date(b.startsAt))
    .map(
      (appointment) =>
        `<div class="list-item"><strong>${esc(clientName(appointment.clientId))}</strong><span>${formatDate(appointment.startsAt)} — ${formatDate(appointment.endsAt)} · ${esc(appointment.type || 'kontrol')}${localBadge(appointment.id)}</span>${appointment.notes ? `<span>${esc(appointment.notes)}</span>` : ''}</div>`,
    )
    .join('')
  $('appointments-empty').classList.toggle('hidden', workspace.appointments.length > 0)
  if (selectedClientId) renderClientDetail()
}

function openClient(clientId) {
  selectedClientId = clientId
  renderClientDetail()
  showPage('client-detail')
}

function renderClientDetail() {
  const client = workspace.clients.find((item) => item.id === selectedClientId)
  if (!client) {
    selectedClientId = null
    showPage('clients')
    return
  }
  $('detail-name').textContent = `${client.firstName} ${client.lastName}`
  $('detail-summary').textContent = `${client.status || 'aktif'} danışan · ${client.phone || 'Telefon girilmemiş'}`
  $('detail-general').innerHTML = [
    ['Doğum tarihi', formatDate(client.birthDate)],
    ['Cinsiyet', client.sex === 'female' ? 'Kadın' : client.sex === 'male' ? 'Erkek' : 'Belirtilmedi'],
    ['E-posta', client.email || '—'],
    ['Meslek', client.occupation || '—'],
    ['Başvuru kaynağı', client.referralSource || '—'],
    ['Not', client.notes || '—'],
  ]
    .map(([label, value]) => `<div><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`)
    .join('')

  const anamnesis = workspace.anamneses.find((item) => item.clientId === client.id)
  $('detail-anamnesis').innerHTML = anamnesis
    ? `<div class="record-list"><div class="record"><strong>Tanılar / durumlar</strong><p>${esc((anamnesis.conditions || []).join(', ') || 'Kayıt yok')}</p></div><div class="record"><strong>İlaçlar</strong><p>${esc((anamnesis.medications || []).join(', ') || 'Kayıt yok')}</p></div><div class="record"><strong>Alerji ve intolerans</strong><p>${esc([...(anamnesis.allergies || []), ...(anamnesis.intolerances || [])].map((item) => item.label).join(', ') || 'Kayıt yok')}</p></div><div class="record"><strong>Yaşam tarzı</strong><p>${esc([anamnesis.activityNotes, anamnesis.eatingOutFrequency, anamnesis.sleepQuality].filter(Boolean).join(' · ') || 'Kayıt yok')}</p></div></div>`
    : emptyRecord('Anamnez henüz doldurulmamış.')

  const measurementRows = workspace.measurements
    .filter((item) => item.clientId === client.id)
    .sort((a, b) => new Date(b.measuredAt) - new Date(a.measuredAt))
  $('measurement-count').textContent = `(${measurementRows.length})`
  $('detail-measurements').innerHTML =
    measurementRows
      .map(
        (item) =>
          `<div class="record"><strong>${Number(item.weightKg).toLocaleString('tr-TR')} kg</strong><span class="record-meta">${formatDate(item.measuredAt)} · ${esc(item.source || 'manuel')}${localBadge(item.id)}</span><p>${[
            item.heightCm ? `Boy ${item.heightCm} cm` : '',
            item.waistCm ? `Bel ${item.waistCm} cm` : '',
            item.bodyFatPct ? `Yağ %${item.bodyFatPct}` : '',
            item.notes || '',
          ].filter(Boolean).map(esc).join(' · ')}</p></div>`,
      )
      .join('') || emptyRecord('Ölçüm kaydı yok.')

  $('detail-goals').innerHTML =
    workspace.goals
      .filter((item) => item.clientId === client.id)
      .sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))
      .map(
        (item) =>
          `<div class="record"><strong>${esc(item.type)}: ${esc(item.targetValue)}</strong><span class="record-meta">Başlangıç ${esc(item.startValue)} · ${formatDate(item.startedAt)}${localBadge(item.id)}</span><p>${item.targetDate ? `Hedef tarihi ${formatDate(item.targetDate)}` : 'Hedef tarihi belirtilmedi'}</p></div>`,
      )
      .join('') || emptyRecord('Aktif hedef kaydı yok.')

  $('detail-labs').innerHTML =
    workspace.labResults
      .filter((item) => item.clientId === client.id)
      .sort((a, b) => new Date(b.testedAt) - new Date(a.testedAt))
      .map(
        (item) =>
          `<div class="record"><strong>${esc(item.analyte)}: ${esc(item.value)} ${esc(item.unit)}</strong><span class="record-meta">${formatDate(item.testedAt)}${item.labName ? ` · ${esc(item.labName)}` : ''}${localBadge(item.id)}</span><p>${item.refMin != null || item.refMax != null ? `Referans ${esc(item.refMin ?? '—')} – ${esc(item.refMax ?? '—')}` : 'Referans aralığı girilmedi'}${item.notes ? ` · ${esc(item.notes)}` : ''}</p></div>`,
      )
      .join('') || emptyRecord('Laboratuvar sonucu yok.')

  $('detail-payments').innerHTML =
    workspace.payments
      .filter((item) => item.clientId === client.id)
      .sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt))
      .map(
        (item) =>
          `<div class="record"><strong>${Number(item.amount).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY' })}</strong><span class="record-meta">${formatDate(item.paidAt)} · ${esc(item.method)}${localBadge(item.id)}</span>${item.notes ? `<p>${esc(item.notes)}</p>` : ''}</div>`,
      )
      .join('') || emptyRecord('Ödeme kaydı yok.')
}

$('client-back').onclick = () => showPage('clients')

async function persist(kind, payload) {
  workspace.capturedAt = iso()
  const mutation = { id: localId('mutation'), kind, payload, createdAt: iso() }
  await invoke('queue_offline_mutation', { userId: current.profile.userId, mutation })
  mutations.push(mutation)
  await invoke('save_offline_workspace', { userId: current.profile.userId, workspace })
  renderAll()
}

const option = (value, label) => ({ value, label })
const sexOptions = [option('', 'Belirtilmedi'), option('female', 'Kadın'), option('male', 'Erkek')]
const statusOptions = [option('aktif', 'Aktif'), option('pasif', 'Pasif'), option('arşiv', 'Arşiv')]
const activityOptions = [
  option('', 'Belirtilmedi'),
  option('sedentary', 'Sedanter'),
  option('light', 'Hafif aktif'),
  option('moderate', 'Orta aktif'),
  option('active', 'Aktif'),
  option('very_active', 'Çok aktif'),
]

function clientFields(client = {}) {
  return [
    { name: 'firstName', label: 'Ad', required: true, value: client.firstName },
    { name: 'lastName', label: 'Soyad', required: true, value: client.lastName },
    { name: 'phone', label: 'Telefon', type: 'tel', value: client.phone },
    { name: 'birthDate', label: 'Doğum tarihi', type: 'date', value: client.birthDate },
    { name: 'sex', label: 'Cinsiyet', type: 'select', options: sexOptions, value: client.sex },
    { name: 'email', label: 'E-posta', type: 'email', value: client.email },
    { name: 'occupation', label: 'Meslek', value: client.occupation },
    { name: 'referralSource', label: 'Başvuru kaynağı', value: client.referralSource },
    { name: 'notes', label: 'Genel not', type: 'textarea', full: true, value: client.notes },
  ]
}

function modalDefinition(type) {
  const client = workspace.clients.find((item) => item.id === selectedClientId) || {}
  const anamnesis = workspace.anamneses.find((item) => item.clientId === selectedClientId) || {}
  const today = new Date().toISOString().slice(0, 10)
  const clientSelect = {
    name: 'clientId',
    label: 'Danışan',
    type: 'select',
    required: true,
    options: [option('', 'Seçin'), ...workspace.clients.map((item) => option(item.id, `${item.firstName} ${item.lastName}`))],
  }
  const definitions = {
    client: {
      title: 'Yeni danışan',
      copy: 'Tam danışan profili ve rıza kaydı şifreli cihaz kasasına kaydedilir.',
      fields: [
        ...clientFields(),
        { name: 'kvkkConsentChecked', label: 'KVKK aydınlatma metni sunuldu ve onaylandı', type: 'checkbox', required: true, full: true },
        { name: 'explicitConsentChecked', label: 'Sağlık verilerinin işlenmesi için açık rıza alındı', type: 'checkbox', required: true, full: true },
      ],
    },
    clientUpdate: {
      title: 'Danışan bilgilerini düzenle',
      copy: 'Değişiklikler bağlantı gelene kadar cihazda saklanır.',
      fields: [
        ...clientFields(client),
        { name: 'status', label: 'Durum', type: 'select', options: statusOptions, value: client.status || 'aktif' },
        { name: 'smsConsentChecked', label: 'İşlemsel SMS iletişimi için rıza var', type: 'checkbox', checked: Boolean(client.smsConsentAt), full: true },
      ],
    },
    anamnesis: {
      title: 'Anamnez düzenle',
      copy: 'Her satıra bir tanı veya ilaç yazabilirsiniz. Alerji ve intoleransları virgülle ayırın.',
      fields: [
        { name: 'conditions', label: 'Tanılar / sağlık durumları', type: 'textarea', full: true, value: (anamnesis.conditions || []).join('\n') },
        { name: 'medications', label: 'İlaçlar', type: 'textarea', full: true, value: (anamnesis.medications || []).join('\n') },
        { name: 'allergies', label: 'Alerjiler', value: (anamnesis.allergies || []).map((item) => item.label).join(', ') },
        { name: 'intolerances', label: 'İntoleranslar', value: (anamnesis.intolerances || []).map((item) => item.label).join(', ') },
        { name: 'surgeries', label: 'Ameliyat geçmişi', type: 'textarea', value: anamnesis.surgeries },
        { name: 'familyHistory', label: 'Aile öyküsü', type: 'textarea', value: anamnesis.familyHistory },
        { name: 'smokingStatus', label: 'Sigara kullanımı', value: anamnesis.smokingStatus },
        { name: 'alcoholUse', label: 'Alkol kullanımı', value: anamnesis.alcoholUse },
        { name: 'mealsPerDay', label: 'Günlük öğün', type: 'number', min: 1, max: 15, value: anamnesis.mealsPerDay },
        { name: 'waterIntakeMl', label: 'Su (ml/gün)', type: 'number', min: 0, max: 10000, value: anamnesis.waterIntakeMl },
        { name: 'eatingOutFrequency', label: 'Dışarıda yeme sıklığı', value: anamnesis.eatingOutFrequency },
        { name: 'activityLevel', label: 'Aktivite düzeyi', type: 'select', options: activityOptions, value: anamnesis.activityLevel },
        { name: 'activityNotes', label: 'Aktivite notu', type: 'textarea', value: anamnesis.activityNotes },
        { name: 'sleepHours', label: 'Uyku (saat)', type: 'number', min: 0, max: 24, value: anamnesis.sleepHours },
        { name: 'sleepQuality', label: 'Uyku kalitesi', value: anamnesis.sleepQuality },
        { name: 'bowelHabits', label: 'Sindirim / bağırsak alışkanlığı', type: 'textarea', full: true, value: anamnesis.bowelHabits },
      ],
    },
    measurement: {
      title: 'Yeni ölçüm', copy: 'Kilo zorunludur; diğer vücut kompozisyonu alanları isteğe bağlıdır.', fields: [
        { name: 'measuredAt', label: 'Ölçüm tarihi', type: 'date', required: true, value: today },
        { name: 'source', label: 'Kaynak', type: 'select', options: ['manuel', 'inbody', 'tanita', 'accuniq'].map((value) => option(value, value === 'manuel' ? 'Manuel' : value)), value: 'manuel' },
        { name: 'weightKg', label: 'Kilo (kg)', type: 'number', step: '0.01', required: true },
        { name: 'heightCm', label: 'Boy (cm)', type: 'number', step: '0.1' },
        { name: 'waistCm', label: 'Bel (cm)', type: 'number', step: '0.1' },
        { name: 'hipCm', label: 'Kalça (cm)', type: 'number', step: '0.1' },
        { name: 'neckCm', label: 'Boyun (cm)', type: 'number', step: '0.1' },
        { name: 'armCm', label: 'Kol (cm)', type: 'number', step: '0.1' },
        { name: 'thighCm', label: 'Uyluk (cm)', type: 'number', step: '0.1' },
        { name: 'chestCm', label: 'Göğüs (cm)', type: 'number', step: '0.1' },
        { name: 'bodyFatPct', label: 'Vücut yağ (%)', type: 'number', step: '0.1' },
        { name: 'bodyFatKg', label: 'Yağ kütlesi (kg)', type: 'number', step: '0.01' },
        { name: 'leanMassKg', label: 'Yağsız kütle (kg)', type: 'number', step: '0.01' },
        { name: 'muscleMassKg', label: 'Kas kütlesi (kg)', type: 'number', step: '0.01' },
        { name: 'totalBodyWaterL', label: 'Vücut suyu (L)', type: 'number', step: '0.01' },
        { name: 'visceralFatLevel', label: 'Visseral yağ seviyesi', type: 'number', step: '1' },
        { name: 'bmrKcal', label: 'BMH (kcal)', type: 'number', step: '1' },
        { name: 'phaseAngle', label: 'Faz açısı', type: 'number', step: '0.01' },
        { name: 'notes', label: 'Not', type: 'textarea', full: true },
      ],
    },
    goal: { title: 'Yeni hedef', copy: 'Danışanın ölçüm hedefini çevrimdışı kaydedin.', fields: [
      { name: 'type', label: 'Hedef türü', type: 'select', options: [option('kilo', 'Kilo'), option('yağ_oranı', 'Yağ oranı'), option('çevre', 'Çevre ölçüsü')] },
      { name: 'targetValue', label: 'Hedef değer', type: 'number', step: '0.01', required: true },
      { name: 'startValue', label: 'Başlangıç değeri', type: 'number', step: '0.01', required: true },
      { name: 'targetDate', label: 'Hedef tarihi', type: 'date' },
    ] },
    labResult: { title: 'Laboratuvar sonucu ekle', copy: 'Analit ve değer zorunludur.', fields: [
      { name: 'testedAt', label: 'Tahlil tarihi', type: 'date', required: true, value: today },
      { name: 'analyte', label: 'Analit', required: true },
      { name: 'value', label: 'Değer', type: 'number', step: 'any', required: true },
      { name: 'unit', label: 'Birim', required: true },
      { name: 'refMin', label: 'Alt referans', type: 'number', step: 'any' },
      { name: 'refMax', label: 'Üst referans', type: 'number', step: 'any' },
      { name: 'labName', label: 'Laboratuvar' },
      { name: 'notes', label: 'Not', type: 'textarea', full: true },
    ] },
    payment: { title: 'Ödeme ekle', copy: 'Paket bağlantısı gerektirmeyen tahsilat kaydı oluşturur.', fields: [
      { name: 'amount', label: 'Tutar (₺)', type: 'number', step: '0.01', required: true },
      { name: 'method', label: 'Yöntem', type: 'select', options: [option('nakit', 'Nakit'), option('kart', 'Kart'), option('havale', 'Havale/EFT'), option('online', 'Online')] },
      { name: 'paidAt', label: 'Ödeme tarihi', type: 'date', required: true, value: today },
      { name: 'notes', label: 'Not', type: 'textarea', full: true },
    ] },
    plan: { title: 'Yeni beslenme planı', copy: 'Plan taslağını çevrimdışıyken hazırlayıp sonra eşitleyin.', fields: [clientSelect, { name: 'name', label: 'Plan adı', required: true }, { name: 'targetKcal', label: 'Hedef enerji (kcal)', type: 'number' }, { name: 'notes', label: 'Plan notları / öğün taslağı', type: 'textarea', full: true }] },
    appointment: { title: 'Yeni randevu', copy: 'Takvim kaydı bağlantı gelince klinik hesabına aktarılır.', fields: [clientSelect, { name: 'startsAt', label: 'Başlangıç', type: 'datetime-local', required: true }, { name: 'endsAt', label: 'Bitiş', type: 'datetime-local', required: true }, { name: 'type', label: 'Tür', type: 'select', options: [option('kontrol', 'Kontrol'), option('ilk_görüşme', 'İlk görüşme'), option('ölçüm', 'Ölçüm'), option('online', 'Online')] }, { name: 'notes', label: 'Not', type: 'textarea', full: true }] },
  }
  return definitions[type]
}

function renderField(field) {
  const attrs = [
    `name="${field.name}"`,
    field.required ? 'required' : '',
    field.min !== undefined ? `min="${field.min}"` : '',
    field.max !== undefined ? `max="${field.max}"` : '',
    field.step ? `step="${field.step}"` : '',
  ].filter(Boolean).join(' ')
  if (field.type === 'checkbox') {
    return `<label class="field full" style="display:flex;grid-template-columns:auto 1fr;align-items:start"><input ${attrs} type="checkbox" ${field.checked ? 'checked' : ''} style="width:17px;height:17px;margin-top:2px"><span style="font-size:12px;line-height:1.5">${esc(field.label)}</span></label>`
  }
  let control
  if (field.type === 'textarea') {
    control = `<textarea ${attrs}>${esc(field.value || '')}</textarea>`
  } else if (field.type === 'select') {
    control = `<select ${attrs}>${field.options.map((item) => `<option value="${esc(item.value)}" ${String(item.value) === String(field.value ?? '') ? 'selected' : ''}>${esc(item.label)}</option>`).join('')}</select>`
  } else {
    control = `<input ${attrs} type="${field.type || 'text'}" value="${esc(field.value ?? '')}">`
  }
  return `<div class="field ${field.full ? 'full' : ''}"><label>${esc(field.label)}</label>${control}</div>`
}

function openModal(type) {
  if (['clientUpdate', 'anamnesis', 'measurement', 'goal', 'labResult', 'payment'].includes(type) && !selectedClientId) return
  modalType = type
  const definition = modalDefinition(type)
  $('modal-title').textContent = definition.title
  $('modal-copy').textContent = definition.copy
  $('modal-error').textContent = ''
  $('modal-fields').innerHTML = definition.fields.map(renderField).join('')
  $('modal').classList.remove('hidden')
}

document.querySelectorAll('[data-modal]').forEach((button) => {
  button.onclick = () => openModal(button.dataset.modal)
})
$('modal-cancel').onclick = () => $('modal').classList.add('hidden')
$('modal').addEventListener('click', (event) => {
  if (event.target === $('modal')) $('modal').classList.add('hidden')
})

function allergenEntries(value, prefix) {
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean).map((label) => ({
    id: localId(prefix), label, severity: null, note: null,
  }))
}

$('modal-form').onsubmit = async (event) => {
  event.preventDefault()
  const data = Object.fromEntries(new FormData(event.currentTarget))
  const id = localId(modalType)
  try {
    if (modalType === 'client') {
      const record = {
        id, firstName: data.firstName.trim(), lastName: data.lastName.trim(), phone: nullable(data.phone),
        birthDate: nullable(data.birthDate), sex: nullable(data.sex), email: nullable(data.email),
        occupation: nullable(data.occupation), referralSource: nullable(data.referralSource), notes: nullable(data.notes),
        kvkkConsentChecked: data.kvkkConsentChecked === 'on', explicitConsentChecked: data.explicitConsentChecked === 'on',
        status: 'aktif', createdAt: iso(),
      }
      workspace.clients.unshift(record)
      await persist('client.create', record)
      selectedClientId = record.id
    } else if (modalType === 'clientUpdate') {
      const client = workspace.clients.find((item) => item.id === selectedClientId)
      const payload = {
        clientId: selectedClientId, firstName: data.firstName.trim(), lastName: data.lastName.trim(),
        phone: nullable(data.phone), birthDate: nullable(data.birthDate), sex: nullable(data.sex), email: nullable(data.email),
        occupation: nullable(data.occupation), referralSource: nullable(data.referralSource), notes: nullable(data.notes),
        status: data.status, smsConsentChecked: data.smsConsentChecked === 'on',
      }
      Object.assign(client, payload, { smsConsentAt: payload.smsConsentChecked ? iso() : null })
      await persist('client.update', payload)
    } else if (modalType === 'anamnesis') {
      const payload = {
        clientId: selectedClientId, conditions: listFromText(data.conditions), medications: listFromText(data.medications),
        allergies: allergenEntries(data.allergies, 'allergy'), intolerances: allergenEntries(data.intolerances, 'intolerance'),
        surgeries: nullable(data.surgeries), familyHistory: nullable(data.familyHistory), smokingStatus: nullable(data.smokingStatus),
        alcoholUse: nullable(data.alcoholUse), mealsPerDay: numberOrNull(data.mealsPerDay), eatingOutFrequency: nullable(data.eatingOutFrequency),
        waterIntakeMl: numberOrNull(data.waterIntakeMl), activityLevel: nullable(data.activityLevel), activityNotes: nullable(data.activityNotes),
        sleepHours: numberOrNull(data.sleepHours), sleepQuality: nullable(data.sleepQuality), bowelHabits: nullable(data.bowelHabits),
      }
      const index = workspace.anamneses.findIndex((item) => item.clientId === selectedClientId)
      if (index >= 0) workspace.anamneses[index] = { ...workspace.anamneses[index], ...payload, updatedAt: iso() }
      else workspace.anamneses.push({ id: localId('anamnesis'), ...payload, updatedAt: iso() })
      await persist('anamnesis.upsert', payload)
    } else if (modalType === 'measurement') {
      const record = { id, clientId: selectedClientId, measuredAt: localDateIso(data.measuredAt), source: data.source, weightKg: Number(data.weightKg), notes: nullable(data.notes) }
      for (const key of ['heightCm', 'waistCm', 'hipCm', 'neckCm', 'armCm', 'thighCm', 'chestCm', 'bodyFatPct', 'bodyFatKg', 'leanMassKg', 'muscleMassKg', 'totalBodyWaterL', 'visceralFatLevel', 'bmrKcal', 'phaseAngle']) record[key] = numberOrNull(data[key])
      workspace.measurements.push(record)
      await persist('measurement.create', record)
    } else if (modalType === 'goal') {
      const record = { id, clientId: selectedClientId, type: data.type, targetValue: Number(data.targetValue), targetDate: nullable(data.targetDate), startValue: Number(data.startValue), startedAt: iso() }
      workspace.goals.push(record)
      await persist('goal.create', record)
    } else if (modalType === 'labResult') {
      const record = { id, clientId: selectedClientId, testedAt: localDateIso(data.testedAt), analyte: data.analyte.trim(), value: Number(data.value), unit: data.unit.trim(), refMin: numberOrNull(data.refMin), refMax: numberOrNull(data.refMax), labName: nullable(data.labName), notes: nullable(data.notes) }
      workspace.labResults.push(record)
      await persist('labResult.create', record)
    } else if (modalType === 'payment') {
      const record = { id, clientId: selectedClientId, amount: Number(data.amount), method: data.method, paidAt: localDateIso(data.paidAt), notes: nullable(data.notes) }
      workspace.payments.push(record)
      await persist('payment.create', record)
    } else if (modalType === 'plan') {
      const record = { id, clientId: data.clientId, name: data.name.trim(), targetKcal: numberOrNull(data.targetKcal), notes: nullable(data.notes), status: 'taslak', createdAt: iso(), updatedAt: iso() }
      workspace.plans.unshift(record)
      await persist('plan.create', record)
    } else if (modalType === 'appointment') {
      const record = { id, clientId: data.clientId, startsAt: new Date(data.startsAt).toISOString(), endsAt: new Date(data.endsAt).toISOString(), type: data.type, notes: nullable(data.notes), status: 'planlandı', createdAt: iso() }
      if (new Date(record.endsAt) <= new Date(record.startsAt)) throw new Error('Randevu bitişi başlangıçtan sonra olmalıdır.')
      workspace.appointments.push(record)
      await persist('appointment.create', record)
    }
    $('modal').classList.add('hidden')
    if (selectedClientId && ['client', 'clientUpdate', 'anamnesis', 'measurement', 'goal', 'labResult', 'payment'].includes(modalType)) openClient(selectedClientId)
  } catch (error) {
    $('modal-error').textContent = String(error)
  }
}

$('sync-now').onclick = async () => {
  const online = await networkAvailable()
  if (!online) {
    $('sync-copy').textContent = 'Bağlantı bulunamadı. Kayıtlar cihazda güvende.'
    return
  }
  $('sync-title').textContent = 'Bağlantı bulundu'
  $('sync-copy').textContent = 'Canlı uygulama açılıyor; bekleyen kayıtlar otomatik eşitlenecek.'
  setTimeout(goOnline, 300)
}
$('change-pin').onclick = async () => {
  try {
    await invoke('configure_offline_pin', { userId: current.profile.userId, currentPin: $('current-pin').value, newPin: $('new-pin').value })
    $('settings-error').style.color = '#177e5c'
    $('settings-error').textContent = 'PIN güncellendi.'
    $('current-pin').value = ''
    $('new-pin').value = ''
  } catch (error) {
    $('settings-error').style.color = '#b42318'
    $('settings-error').textContent = String(error)
  }
}
$('lock-now').onclick = async () => {
  await invoke('lock_offline_profile')
  location.reload()
}

boot().catch((error) => {
  $('boot-title').textContent = 'Yerel çalışma alanı açılamadı'
  $('boot-error').textContent = String(error)
})
