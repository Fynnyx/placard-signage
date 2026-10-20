<script setup lang="ts">
const me = useMe()
</script>

<template>
  <div class="bare">
    <div class="box">
      <div class="brand">
        <img v-if="me?.branding.logoUrl" :src="me.branding.logoUrl" alt="">
        <strong>{{ me?.branding.name }}</strong>
      </div>
      <slot />
    </div>
  </div>
</template>

<style scoped>
.bare { min-height: 100vh; display: grid; place-items: center; padding: 1rem; }
.box { width: min(440px, 100%); background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 2rem; box-shadow: var(--shadow); }
.brand { display: flex; align-items: center; gap: .6rem; margin-bottom: 1.5rem; font-size: 1.1rem; }
.brand img { height: 36px; max-width: 160px; object-fit: contain; }
</style>
