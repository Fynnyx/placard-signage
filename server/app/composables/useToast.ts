export interface Toast { id: number, kind: 'ok' | 'error', text: string }

let next = 1

export function useToasts() {
  return useState<Toast[]>('toasts', () => [])
}

export function toast(text: string, kind: Toast['kind'] = 'ok') {
  const list = useToasts()
  const id = next++
  list.value.push({ id, kind, text })
  setTimeout(() => {
    list.value = list.value.filter(t => t.id !== id)
  }, kind === 'error' ? 7000 : 3500)
}

export function toastError(err: unknown) {
  toast(errorMessage(err), 'error')
}
