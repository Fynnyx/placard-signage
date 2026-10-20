<script setup lang="ts">
const props = defineProps<{ screen: { id: number, name: string, hasAgent: boolean, displayOn: boolean | null } }>()
const emit = defineEmits<{ sent: [] }>()
const { t } = useI18n()
const { can } = useRole()

async function send(type: string) {
  if (type === 'reboot' && !confirm(t('screens.confirmReboot', { name: props.screen.name }))) return
  try {
    await api(`/api/screens/${props.screen.id}/commands`, { method: 'POST', body: { type } })
    toast(t('screens.commandSent', { command: t(`command.${type}`) }))
    emit('sent')
  }
  catch (err) {
    toastError(err)
  }
}
</script>

<template>
  <div v-if="can('editor')" class="row" style="gap:.35rem">
    <button class="btn small" @click="send('reload')">{{ t('command.reload') }}</button>
    <template v-if="screen.hasAgent">
      <button class="btn small" @click="send('screenshot')">{{ t('command.screenshot') }}</button>
      <button v-if="screen.displayOn !== false" class="btn small" @click="send('display_off')">{{ t('command.display_off') }}</button>
      <button v-if="screen.displayOn !== true" class="btn small" @click="send('display_on')">{{ t('command.display_on') }}</button>
      <button v-if="can('admin')" class="btn small danger" @click="send('reboot')">{{ t('command.reboot') }}</button>
    </template>
  </div>
</template>
