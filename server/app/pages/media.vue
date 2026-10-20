<script setup lang="ts">
const { t } = useI18n()
const { can } = useRole()
const { bytes, dateTime } = useFormat()
useHead({ title: t('nav.media') })
const { data: files, refresh } = await useAsyncData('media', () => api<any[]>('/api/media'), { default: () => [] })

async function remove(f: any) {
  if (!confirm(t('media.confirmDelete', { name: f.originalName }))) return
  try {
    await api(`/api/media/${f.id}`, { method: 'DELETE' })
    refresh()
  }
  catch (err) {
    toastError(err)
  }
}
</script>

<template>
  <div>
    <div class="page-head">
      <h1>{{ t('nav.media') }}</h1>
      <MediaUpload v-if="can('editor')" @uploaded="refresh()" />
    </div>
    <div v-if="!files.length" class="card empty">{{ t('media.empty') }}</div>
    <div class="media-grid">
      <div v-for="f in files" :key="f.id" class="card tile">
        <a :href="f.url" target="_blank" class="thumb">
          <img v-if="f.kind === 'image'" :src="f.url" alt="" loading="lazy">
          <video v-else :src="`${f.url}#t=0.5`" muted preload="metadata" />
        </a>
        <div class="small ellipsis" :title="f.originalName">{{ f.originalName }}</div>
        <div class="row between small muted">
          <span>{{ bytes(f.size) }} · {{ dateTime(f.createdAt) }}</span>
          <button v-if="can('editor')" class="btn small danger" @click="remove(f)">{{ t('common.delete') }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.media-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
.tile { margin: 0 !important; display: flex; flex-direction: column; gap: .4rem; padding: .6rem; }
.thumb { aspect-ratio: 16 / 9; background: #000; border-radius: 6px; overflow: hidden; display: grid; place-items: center; }
.thumb img, .thumb video { width: 100%; height: 100%; object-fit: contain; }
</style>
