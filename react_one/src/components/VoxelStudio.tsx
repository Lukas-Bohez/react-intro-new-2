import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { VoxelScene } from '../voxel/VoxelScene'
import type { VoxelStats } from '../voxel/VoxelScene'
import { seedFromInput } from '../voxel/rng'
import type { ToolId } from '../voxel/world'
import './VoxelStudio.css'

const DEFAULT_SEED = 'atoll-01'

const TOOLS: { id: ToolId; label: string; hint: string; key: string }[] = [
  { id: 'raise', label: 'Raise', hint: 'stack voxels', key: '1' },
  { id: 'lower', label: 'Carve', hint: 'remove voxels', key: '2' },
  { id: 'smooth', label: 'Smooth', hint: 'relax the slopes', key: '3' },
]

const INITIAL_STATS: VoxelStats = {
  fps: 0,
  voxels: 0,
  faces: 0,
  timeOfDay: 0.33,
  undo: 0,
  redo: 0,
  seed: '------',
}

const number = new Intl.NumberFormat('en-US')

const clockLabel = (value: number): string => {
  const total = Math.round((((value % 1) + 1) % 1) * 24 * 60) % (24 * 60)
  const hours = Math.floor(total / 60)
  const minutes = total % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

function ToolIcon({ tool }: { tool: ToolId }) {
  if (tool === 'raise') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 21 21H3z" />
      </svg>
    )
  }
  if (tool === 'lower') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21 3 3h18z" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 15c3 0 3-4 6-4s3 4 6 4 3-4 6-4v5H2z" />
      <path d="M2 8c3 0 3-4 6-4s3 4 6 4 3-4 6-4v4c-3 0-3 4-6 4S11 8 8 8s-3 4-6 4z" opacity=".55" />
    </svg>
  )
}

export default function VoxelStudio() {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const sceneRef = useRef<VoxelScene | null>(null)
  const autoTimeRef = useRef(true)
  const autoRotateRef = useRef(false)

  const [stats, setStats] = useState<VoxelStats>(INITIAL_STATS)
  const [tool, setTool] = useState<ToolId>('raise')
  const [brush, setBrush] = useState(2)
  const [time, setTime] = useState(INITIAL_STATS.timeOfDay)
  const [autoTime, setAutoTime] = useState(true)
  const [autoRotate, setAutoRotate] = useState(false)
  const [seedText, setSeedText] = useState(DEFAULT_SEED)
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  const [pixels, setPixels] = useState(false)
  const pixelsRef = useRef(false)

  // The scene owns the clock while it runs, so it feeds the mirrors below.
  const handleStats = useCallback((next: VoxelStats) => {
    setStats(next)
    if (autoTimeRef.current) setTime(next.timeOfDay)
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let scene: VoxelScene
    try {
      scene = new VoxelScene(host, {
        seed: seedFromInput(DEFAULT_SEED),
        onStats: handleStats,
      })
    } catch (cause) {
      // A missing or blocked WebGL context should explain itself instead of a blank page.
      console.error('Babylon.js failed to start', cause)
      // eslint-disable-next-line react-hooks/set-state-in-effect -- surface a hard failure once
      setFatal(cause instanceof Error ? cause.message : 'WebGL is not available in this browser')
      return
    }

    sceneRef.current = scene
    scene.setTimeOfDay(INITIAL_STATS.timeOfDay)
    setReady(true)

    return () => {
      scene.dispose()
      sceneRef.current = null
      setReady(false)
    }
  }, [handleStats])

  const selectTool = useCallback((next: ToolId) => {
    setTool(next)
    sceneRef.current?.setTool(next)
  }, [])

  const changeBrush = useCallback((radius: number) => {
    const next = Math.min(4, Math.max(1, Math.round(radius)))
    setBrush(next)
    sceneRef.current?.setBrush(next)
  }, [])

  const changeTime = useCallback((value: number) => {
    setTime(value)
    sceneRef.current?.setTimeOfDay(value)
  }, [])

  const toggleAutoTime = useCallback(() => {
    const next = !autoTimeRef.current
    autoTimeRef.current = next
    setAutoTime(next)
    sceneRef.current?.setAutoTime(next)
  }, [])

  const toggleAutoRotate = useCallback(() => {
    const next = !autoRotateRef.current
    autoRotateRef.current = next
    setAutoRotate(next)
    sceneRef.current?.setAutoRotate(next)
  }, [])

  const togglePixels = useCallback(() => {
    const next = !pixelsRef.current
    pixelsRef.current = next
    setPixels(next)
    sceneRef.current?.setPixelMode(next)
  }, [])

  const snapCamera = useCallback(() => sceneRef.current?.snapCamera(), [])

  const randomize = useCallback(() => {
    const label = Math.random().toString(36).slice(2, 8)
    setSeedText(label)
    sceneRef.current?.randomize(label)
  }, [])

  const undo = useCallback(() => sceneRef.current?.undo(), [])
  const redo = useCallback(() => sceneRef.current?.redo(), [])
  const reset = useCallback(() => sceneRef.current?.reset(), [])
  const snapshot = useCallback(() => sceneRef.current?.saveSnapshot(), [])

  const submitSeed = (event: FormEvent) => {
    event.preventDefault()
    const label = seedText.trim() || DEFAULT_SEED
    setSeedText(label)
    sceneRef.current?.randomize(label)
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return

      switch (event.key) {
        case '1':
          selectTool('raise')
          break
        case '2':
          selectTool('lower')
          break
        case '3':
          selectTool('smooth')
          break
        case '[':
          changeBrush(brush - 1)
          break
        case ']':
          changeBrush(brush + 1)
          break
        case 'z':
        case 'Z':
          if (event.ctrlKey || event.metaKey) {
            event.preventDefault()
            if (event.shiftKey) redo()
            else undo()
          }
          break
        case 'r':
        case 'R':
          randomize()
          break
        case 'p':
        case 'P':
          togglePixels()
          break
        case 'c':
        case 'C':
          snapCamera()
          break
        case ' ':
          event.preventDefault()
          toggleAutoRotate()
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [brush, changeBrush, randomize, redo, selectTool, snapCamera, toggleAutoRotate, togglePixels, undo])

  const isDay = time > 0.24 && time < 0.78

  return (
    <div className={`studio${ready ? ' is-ready' : ''}`}>
      <div className="studio__viewport" ref={hostRef} />

      <header className="panel panel--brand">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <div className="brand__text">
            <h1>Voxel Terraformer</h1>
            <p>procedural island · babylon.js · react</p>
          </div>
        </div>
      </header>

      <section className="panel panel--seed" aria-label="World seed">
        <form className="seed" onSubmit={submitSeed}>
          <label htmlFor="seed">seed</label>
          <input
            id="seed"
            value={seedText}
            onChange={(event) => setSeedText(event.target.value)}
            spellCheck={false}
            autoComplete="off"
            maxLength={18}
          />
          <button type="submit" className="ghost" title="Generate this seed">
            go
          </button>
        </form>

        <div className="seed__row">
          <span className="chip">{stats.seed}</span>
          <button type="button" className="ghost" onClick={randomize} title="New island (R)">
            new island
          </button>
        </div>

        <div className="stats">
          <div className="stat">
            <span>fps</span>
            <strong>{stats.fps.toFixed(0)}</strong>
          </div>
          <div className="stat">
            <span>voxels</span>
            <strong>{number.format(stats.voxels)}</strong>
          </div>
          <div className="stat">
            <span>faces</span>
            <strong>{number.format(stats.faces)}</strong>
          </div>
        </div>
      </section>

      <section className="panel panel--tools" aria-label="Sculpting tools">
        <div className="panel__label">tool</div>
        <div className="tools">
          {TOOLS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`tool${tool === item.id ? ' is-active' : ''}`}
              onClick={() => selectTool(item.id)}
              aria-pressed={tool === item.id}
            >
              <ToolIcon tool={item.id} />
              <span className="tool__name">{item.label}</span>
              <span className="tool__key">{item.key}</span>
              <span className="tool__hint">{item.hint}</span>
            </button>
          ))}
        </div>

        <div className="brush">
          <div className="brush__head">
            <span>brush</span>
            <strong>
              {brush * 2 + 1}×{brush * 2 + 1}
            </strong>
          </div>
          <input
            type="range"
            min={1}
            max={4}
            step={1}
            value={brush}
            onChange={(event) => changeBrush(Number(event.target.value))}
            aria-label="Brush size"
          />
        </div>
      </section>

      <section className="panel panel--time" aria-label="Day cycle and actions">
        <div className="time">
          <span className={`time__icon${isDay ? ' is-day' : ''}`} aria-hidden="true" />
          <span className="time__value">{clockLabel(time)}</span>
          <button
            type="button"
            className={`ghost${autoTime ? ' is-on' : ''}`}
            onClick={toggleAutoTime}
            aria-pressed={autoTime}
            title="Let time run"
          >
            auto clock
          </button>
        </div>

        <input
          className="timeline"
          type="range"
          min={0}
          max={0.999}
          step={0.001}
          value={time}
          onChange={(event) => changeTime(Number(event.target.value))}
          aria-label="Time of day"
        />

        <div className="actions">
          <button type="button" className="ghost" onClick={undo} disabled={stats.undo === 0} title="Undo (Ctrl+Z)">
            undo
          </button>
          <button type="button" className="ghost" onClick={redo} disabled={stats.redo === 0} title="Redo (Ctrl+Shift+Z)">
            redo
          </button>
          <button type="button" className="ghost" onClick={reset} title="Rebuild the same seed">
            reset
          </button>
          <button
            type="button"
            className={`ghost${autoRotate ? ' is-on' : ''}`}
            onClick={toggleAutoRotate}
            aria-pressed={autoRotate}
            title="Slow orbit (Space)"
          >
            orbit
          </button>
          <button
            type="button"
            className={`ghost${pixels ? ' is-on' : ''}`}
            onClick={togglePixels}
            aria-pressed={pixels}
            title="Half resolution, nearest neighbour (P)"
          >
            pixels
          </button>
          <button type="button" className="ghost" onClick={snapCamera} title="Reset the camera (C)">
            centre
          </button>
          <button type="button" className="ghost ghost--accent" onClick={snapshot} title="Download a 1920×1080 still">
            poster
          </button>
        </div>
      </section>

      <div className="studio__hint">
        <span>Drag the island to sculpt</span>
        <span className="dot" />
        <span>Drag the sky to orbit</span>
        <span className="dot" />
        <span>Right-drag to carve</span>
      </div>

      {fatal && (
        <div className="fatal" role="alert">
          <strong>WebGL could not start</strong>
          <p>{fatal}</p>
          <p className="fatal__hint">Try another browser, or enable hardware acceleration.</p>
        </div>
      )}

      {!ready && (
        <div className="veil">
          <span>compiling voxels…</span>
        </div>
      )}
    </div>
  )
}

