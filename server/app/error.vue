<script setup lang="ts">
import type { NuxtError } from '#app'

defineProps<{ error: NuxtError }>()
const { t } = useI18n()
</script>

<template>
  <div style="min-height:100vh;display:grid;place-items:center;padding:1rem">
    <div class="card" style="max-width:480px;text-align:center">
      <h1>{{ error.statusCode }}</h1>
      <p>{{ error.statusCode === 403 ? t('error.forbidden') : error.statusCode === 404 ? t('error.notFound') : error.message }}</p>
      <button class="btn primary" @click="clearError({ redirect: '/' })">{{ t('error.home') }}</button>
    </div>
  </div>
</template>
