<script setup lang="ts">
const emit = defineEmits<{ uploaded: [files: any[]] }>()
const { t } = useI18n()
const input = ref<HTMLInputElement>()
const progress = ref<number | null>(null)

function upload(list: FileList | null) {
  if (!list?.length) return
  const fd = new FormData()
  for (const f of Array.from(list)) fd.append('file', f, f.name)
  // XMLHttpRequest for upload progress.
  const xhr = new XMLHttpRequest()
  xhr.open('POST', '/api/media')
  const csrf = useMe().value?.csrfToken
  if (csrf) xhr.setRequestHeader('x-csrf-token', csrf)
  xhr.upload.onprogress = (e) => { if (e.lengthComputable) progress.value = Math.round((e.loaded / e.total) * 100) }
  xhr.onload = () => {
    progress.value = null
    if (input.value) input.value.value = ''
    let body: any
    try {
      body = JSON.parse(xhr.responseText)
    }
    catch { /* not JSON */ }
    if (xhr.status >= 200 && xhr.status < 300) {
      toast(t('media.uploaded', { count: body.length }))
      emit('uploaded', body)
    }
    else {
      toast(body?.statusMessage || body?.message || `HTTP ${xhr.status}`, 'error')
    }
  }
  xhr.onerror = () => {
    progress.value = null
    toast(t('media.uploadFailed'), 'error')
  }
  progress.value = 0
  xhr.send(fd)
}
</script>

<template>
  <span class="row">
    <span v-if="progress !== null" class="small muted">{{ progress }} %</span>
    <button class="btn primary" type="button" :disabled="progress !== null" @click="input?.click()">{{ t('media.upload') }}</button>
    <input ref="input" type="file" accept="image/*,video/*" multiple hidden @change="upload(($event.target as HTMLInputElement).files)">
  </span>
</template>
