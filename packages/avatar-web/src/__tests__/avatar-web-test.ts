// @vitest-environment jsdom

import definitionJson from '../../../../examples/react-vite-consumer/src/strobi.avatar.json'
import { createAvatar } from '../index'

describe('@bible-strong/avatar-web', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="avatar"></div>'
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('mounts the shared avatar definition without React', () => {
    const avatar = createAvatar('#avatar', {
      definition: definitionJson,
      defaultExpression: 'neutral',
      size: 180,
    })

    expect(document.querySelector('#avatar svg')).not.toBeNull()
    expect(document.querySelectorAll('#avatar svg > path')).toHaveLength(37)
    expect(document.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Procedural avatar'
    )
    expect(avatar.getState()).toMatchObject({
      activeExpression: 'neutral',
      status: 'stopped',
    })

    avatar.destroy()
    expect(document.querySelector('#avatar svg')).toBeNull()
  })

  it('paints a mouth with the eyes and whiskers around the head when the face defines them', () => {
    const definition = structuredClone(definitionJson) as typeof definitionJson & {
      face?: unknown
    }
    definition.face = {
      mouth: { thickness: 3, x: 0, y: 48, width: 22, curve: 4, cat: 1, color: '#aa3355' },
      whiskers: { count: 2, thickness: 2, x: 70, y: 40, length: 40 },
    }
    const avatar = createAvatar('#avatar', { definition, defaultExpression: 'neutral' })
    const svg = document.querySelector('#avatar svg')!

    expect(svg.querySelectorAll(':scope > path')).toHaveLength(37)
    const groups = svg.querySelectorAll(':scope > g')
    expect(groups).toHaveLength(3)
    const [whiskersBehind, eyes, whiskersInFront] = [...groups]
    expect(eyes!.getAttribute('clip-path')).toMatch(/^url\(#/)
    const mouth = [...eyes!.querySelectorAll('path')].slice(2)
    expect(mouth).toHaveLength(3)
    expect(mouth.filter(path => path.getAttribute('d'))).toHaveLength(2)
    expect(mouth[0]!.getAttribute('fill')).toBe('#aa3355')
    expect(whiskersBehind!.querySelectorAll('path')).toHaveLength(8)
    const front = [...whiskersInFront!.querySelectorAll('path')]
    expect(front.filter(path => path.getAttribute('d'))).toHaveLength(4)
    expect(front[0]!.getAttribute('fill')).toBe(definitionJson.colors.eyes)

    avatar.destroy()
  })

  it('returns typed errors for unknown targets', () => {
    const avatar = createAvatar('#avatar', { definition: definitionJson })

    expect(avatar.play('missing')).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'unknown_animation', key: 'missing' }),
    })
    expect(avatar.setExpression('missing')).toEqual({
      ok: false,
      error: expect.objectContaining({ code: 'unknown_expression', key: 'missing' }),
    })
  })
})
