<script setup lang="ts">
withDefaults(defineProps<{ events: any[], showScreen?: boolean }>(), { showScreen: true })
const { t } = useI18n()
const { dateTime } = useFormat()
const levelClass = (l: string) => ({ error: 'error', warn: 'warn', info: '', debug: '' }[l] ?? '')
</script>

<template>
  <div class="table-wrap">
    <table class="small">
      <thead>
        <tr>
          <th>{{ t('events.time') }}</th>
          <th>{{ t('events.level') }}</th>
          <th v-if="showScreen">{{ t('events.screen') }}</th>
          <th>{{ t('events.source') }}</th>
          <th>{{ t('events.message') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-if="!events.length"><td :colspan="showScreen ? 5 : 4" class="muted">{{ t('events.empty') }}</td></tr>
        <tr v-for="e in events" :key="e.id">
          <td class="nowrap muted">{{ dateTime(e.at) }}</td>
          <td><span class="badge" :class="levelClass(e.level)">{{ e.level }}</span></td>
          <td v-if="showScreen" class="nowrap">
            <NuxtLink v-if="e.screenId" :to="`/screens/${e.screenId}`">{{ e.screenName || `#${e.screenId}` }}</NuxtLink>
            <span v-else class="muted">–</span>
          </td>
          <td class="muted">{{ e.source }}</td>
          <td style="word-break:break-word">{{ e.message }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
