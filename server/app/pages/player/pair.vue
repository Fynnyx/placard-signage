<script setup lang="ts">
definePageMeta({ layout: false })
useHead({ title: 'Pairing', bodyAttrs: { class: 'player-body' } })
const { t } = useI18n()
const route = useRoute()

// With ?code= the Pi agent does the pairing and this page only shows the code.
const agentCode = typeof route.query.code === 'string' ? route.query.code : null
const code = ref<string | null>(agentCode)
const error = ref('')
const origin = ref('')
let secret: string | null = null
let timer: ReturnType<typeof setTimeout> | undefined
let stopped = false

async function start() {
  error.value = ''
  try {
    const res = await fetch('/api/device/pair', { method: 'POST' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = await res.json() as { code: string, secret: string }
    code.value = body.code
    secret = body.secret
    schedule(3000)
  }
  catch (err) {
    error.value = (err as Error).message
    schedule(15_000, true)
  }
}

function schedule(ms: number, restart = false) {
  if (stopped) return
  timer = setTimeout(() => restart ? start() : check(), ms)
}

async function check() {
  try {
    const res = await fetch(`/api/device/pair/${secret}`, { cache: 'no-store' })
    if (res.status === 404) return start()
    const body = await res.json() as { status: string, token?: string }
    if (body.status === 'paired' && body.token) {
      writeToken(body.token)
      location.replace('/player')
      return
    }
    if (body.status === 'expired') return start()
    schedule(3000)
  }
  catch {
    schedule(5000)
  }
}

onMounted(() => {
  origin.value = location.origin
  if (agentCode) return
  takeTokenFromHash()
  if (readToken() && route.query.new !== '1') {
    location.replace('/player')
    return
  }
  void start()
})

onBeforeUnmount(() => {
  stopped = true
  clearTimeout(timer)
})

const digits = computed(() => (code.value ?? '').replace(/(\d{3})(\d{3})/, '$1 $2'))
</script>

<template>
  <div class="pair">
    <p class="label">{{ t('player.pairCode') }}</p>
    <div class="code">{{ digits || '······' }}</div>
    <p class="hint">{{ t('player.pairHint', { url: `${origin}/pair` }) }}</p>
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<style scoped>
.pair {
  position: fixed; inset: 0; background: #0b0d10; color: #fff; font-family: system-ui, sans-serif;
  display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 2rem;
}
.label { font-size: 2.2vw; opacity: .7; margin: 0; }
.code { font: 700 13vw/1.1 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: .08em; margin: 1vw 0 2vw; }
.hint { font-size: 1.8vw; opacity: .75; margin: 0; }
.error { color: #f88; font-size: 1.4vw; }
</style>
