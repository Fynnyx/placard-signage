<script setup lang="ts">
defineProps<{ online: boolean, displayOn?: boolean | null }>()
const { t } = useI18n()
</script>

<template>
  <span class="row" style="gap:.3rem">
    <span class="badge" :class="online ? 'ok' : 'error'"><span class="dot" />{{ online ? t('screens.online') : t('screens.offline') }}</span>
    <span v-if="online && displayOn === false" class="badge warn">{{ t('screens.displayOff') }}</span>
  </span>
</template>
