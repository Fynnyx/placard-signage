<script setup lang="ts">
const emit = defineEmits<{ close: [], pick: [files: any[]] }>()
const { t } = useI18n()
const { data: files } = await useAsyncData('media-picker', () => api<any[]>('/api/media'), { default: () => [] })
const selected = ref<Set<number>>(new Set())
function toggle(id: number) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="box card">
      <div class="row between"><h2 style="margin:0">{{ t('playlists.addMedia') }}</h2><button class="btn small" @click="emit('close')">{{ t('common.close') }}</button></div>
      <div v-if="!files.length" class="empty">{{ t('media.empty') }}</div>
      <div class="grid-files">
        <button v-for="f in files" :key="f.id" class="file" :class="{ sel: selected.has(f.id) }" type="button" @click="toggle(f.id)">
          <img v-if="f.kind === 'image'" :src="f.url" alt="" loading="lazy">
          <video v-else :src="`${f.url}#t=0.5`" muted preload="metadata" />
          <span class="small ellipsis">{{ f.originalName }}</span>
        </button>
      </div>
      <div class="row" style="justify-content:flex-end">
        <button class="btn primary" :disabled="!selected.size" @click="emit('pick', files.filter(f => selected.has(f.id)))">
          {{ t('playlists.addSelected', { count: selected.size }) }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / .5); display: grid; place-items: center; z-index: 50; padding: 1rem; }
.box { width: min(900px, 100%); max-height: 90vh; overflow: auto; display: flex; flex-direction: column; gap: 1rem; }
.grid-files { display: grid; gap: .6rem; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
.file { display: flex; flex-direction: column; gap: .3rem; padding: .4rem; border: 2px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); cursor: pointer; text-align: left; font: inherit; }
.file.sel { border-color: var(--accent); }
.file img, .file video { width: 100%; aspect-ratio: 16 / 9; object-fit: contain; background: #000; border-radius: 4px; }
</style>
