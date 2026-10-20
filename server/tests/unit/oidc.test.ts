import { describe, expect, it } from 'vitest'
import { claimAt, mapRoles } from '../../server/utils/oidc'
import { parseRoleMap } from '../../server/utils/config'

describe('OIDC role mapping', () => {
  const map = parseRoleMap('signage-admin=admin, signage-editor = editor,staff=viewer')

  it('parses OIDC_ROLE_MAP', () => {
    expect(map).toEqual({ 'signage-admin': 'admin', 'signage-editor': 'editor', 'staff': 'viewer' })
  })

  it('reads nested claims', () => {
    expect(claimAt({ realm_access: { roles: ['a'] } }, 'realm_access.roles')).toEqual(['a'])
    expect(claimAt({ roles: 'x' }, 'roles')).toBe('x')
    expect(claimAt({ a: null }, 'a.b')).toBeUndefined()
  })

  it('picks the highest mapped role', () => {
    expect(mapRoles(['staff', 'signage-editor'], map)).toBe('editor')
    expect(mapRoles(['signage-admin', 'staff'], map)).toBe('admin')
    expect(mapRoles('staff signage-editor', map)).toBe('editor')
    expect(mapRoles(['unknown'], map)).toBeNull()
    expect(mapRoles(undefined, map)).toBeNull()
  })
})
