import {
  ArcRotateCamera,
  Color3,
  Color4,
  CreateScreenshotUsingRenderTarget,
  DirectionalLight,
  Engine,
  GlowLayer,
  HemisphericLight,
  ImageProcessingConfiguration,
  InstancedMesh,
  Mesh,
  NoiseProceduralTexture,
  PointerEventTypes,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  Vector3,
  VertexData,
} from '@babylonjs/core'
import {
  buildCloudGeometry,
  buildCubeGeometry,
  buildPropsGeometry,
  buildSpikeGeometry,
  buildTerrainGeometry,
  buildTexturedPlane,
} from './mesher'
import type { Geometry } from './mesher'
import { mulberry32, formatSeed, seedFromInput } from './rng'
import {
  SEA_LEVEL,
  WATER_Y,
  clamp,
  countVoxels,
  createWorld,
  restoreWorld,
  sculpt,
  snapshotWorld,
} from './world'
import type { ToolId, World } from './world'

export interface VoxelStats {
  fps: number
  voxels: number
  faces: number
  timeOfDay: number
  undo: number
  redo: number
  seed: string
}

export interface VoxelSceneOptions {
  seed: number
  onStats: (stats: VoxelStats) => void
}

interface DayStop {
  at: number
  sky: Color3
  sun: Color3
  sunIntensity: number
  hemi: Color3
  hemiIntensity: number
  fog: Color3
  water: Color3
}

interface Spark {
  instance: InstancedMesh
  vx: number
  vy: number
  vz: number
  life: number
  maxLife: number
  size: number
  active: boolean
}

interface Cloud {
  mesh: Mesh
  speed: number
  baseY: number
  phase: number
}

interface Cell {
  i: number
  j: number
}

const hex = (value: string): Color3 => Color3.FromHexString(value)

/**
 * One entry per moment of the day. The render loop lerps between the two
 * nearest entries, so the light, sky, fog and water all drift together.
 */
const DAY_STOPS: DayStop[] = [
  { at: 0, sky: hex('#05070f'), sun: hex('#7d92d6'), sunIntensity: 0.24, hemi: hex('#1a2340'), hemiIntensity: 0.32, fog: hex('#070b18'), water: hex('#0b1b2e') },
  { at: 0.19, sky: hex('#0d1226'), sun: hex('#4a5c93'), sunIntensity: 0.3, hemi: hex('#232f55'), hemiIntensity: 0.36, fog: hex('#111833'), water: hex('#12253c') },
  { at: 0.25, sky: hex('#df8a63'), sun: hex('#ffb072'), sunIntensity: 1.25, hemi: hex('#7a6076'), hemiIntensity: 0.5, fog: hex('#d99a86'), water: hex('#284b63') },
  { at: 0.33, sky: hex('#8fc7e8'), sun: hex('#ffe7c4'), sunIntensity: 1.9, hemi: hex('#b9d6ee'), hemiIntensity: 0.75, fog: hex('#a9cbe3'), water: hex('#2f7f96') },
  { at: 0.5, sky: hex('#93cdf2'), sun: hex('#fff4e2'), sunIntensity: 2.35, hemi: hex('#cfe6f7'), hemiIntensity: 0.9, fog: hex('#a9cfe8'), water: hex('#2f88a3') },
  { at: 0.68, sky: hex('#90c6e6'), sun: hex('#ffe0ba'), sunIntensity: 1.95, hemi: hex('#b6d3ea'), hemiIntensity: 0.72, fog: hex('#a6c6dd'), water: hex('#2f7f96') },
  { at: 0.76, sky: hex('#e0724c'), sun: hex('#ff9550'), sunIntensity: 1.5, hemi: hex('#7f6076'), hemiIntensity: 0.55, fog: hex('#cf7d64'), water: hex('#2b4f6d') },
  { at: 0.84, sky: hex('#2b1c31'), sun: hex('#6a4a74'), sunIntensity: 0.42, hemi: hex('#372a4a'), hemiIntensity: 0.4, fog: hex('#241a30'), water: hex('#152b45') },
  { at: 1, sky: hex('#05070f'), sun: hex('#7d92d6'), sunIntensity: 0.24, hemi: hex('#1a2340'), hemiIntensity: 0.32, fog: hex('#070b18'), water: hex('#0b1b2e') },
]

const TOOL_COLORS: Record<ToolId, Color3> = {
  raise: new Color3(0.32, 1, 0.86),
  lower: new Color3(1, 0.55, 0.26),
  smooth: new Color3(0.72, 0.5, 1),
}

const CRYSTAL_COLORS: Color3[] = [hex('#5cf5ff'), hex('#ff5cd9'), hex('#b6ff5c')]

const CLOUD_NIGHT = hex('#141c30')
const CLOUD_DAY = hex('#f4f8ff')
const STAR_COLOR = hex('#dce8ff')
const MOON_COLOR = hex('#c9dcff')

const sampleDay = (time: number): DayStop => {
  const t = ((time % 1) + 1) % 1
  let index = 0
  while (index < DAY_STOPS.length - 2 && DAY_STOPS[index + 1].at < t) index += 1
  const from = DAY_STOPS[index]
  const to = DAY_STOPS[index + 1]
  const span = to.at - from.at || 1
  const k = clamp((t - from.at) / span, 0, 1)

  return {
    at: t,
    sky: Color3.Lerp(from.sky, to.sky, k),
    sun: Color3.Lerp(from.sun, to.sun, k),
    sunIntensity: from.sunIntensity + (to.sunIntensity - from.sunIntensity) * k,
    hemi: Color3.Lerp(from.hemi, to.hemi, k),
    hemiIntensity: from.hemiIntensity + (to.hemiIntensity - from.hemiIntensity) * k,
    fog: Color3.Lerp(from.fog, to.fog, k),
    water: Color3.Lerp(from.water, to.water, k),
  }
}

/** Pushes a Geometry straight into a mesh's vertex buffers. */
function applyGeometry(mesh: Mesh, geometry: Geometry): void {
  const vertexData = new VertexData()
  vertexData.positions = geometry.positions
  vertexData.normals = geometry.normals
  vertexData.colors = geometry.colors
  vertexData.indices = geometry.indices
  vertexData.applyToMesh(mesh)
}


/**
 * Owns the Babylon engine, the diorama, the day/night cycle and all sculpting.
 * React only talks to it through the small public API at the bottom.
 */
export class VoxelScene {
  private onStats: (stats: VoxelStats) => void
  private canvas: HTMLCanvasElement
  private engine: Engine
  private scene: Scene
  private camera: ArcRotateCamera
  private sunLight: DirectionalLight
  private skyLight: HemisphericLight
  private shadow: ShadowGenerator
  private glow: GlowLayer

  private terrain!: Mesh
  private props!: Mesh
  private water!: Mesh
  private terrainMaterial!: StandardMaterial
  private waterMaterial!: StandardMaterial
  private cloudMaterial!: StandardMaterial
  private sunMesh!: Mesh
  private moonMesh!: Mesh
  private sunMaterial!: StandardMaterial
  private moonMaterial!: StandardMaterial
  private starMesh!: Mesh
  private starMaterial!: StandardMaterial
  private brushMaterial!: StandardMaterial
  private sparkMaterial!: StandardMaterial
  private sparkSource!: Mesh

  private crystalSources: Mesh[] = []
  private crystalMaterials: StandardMaterial[] = []
  private crystalInstances: InstancedMesh[] = []
  private brushTiles: InstancedMesh[] = []
  private sparks: Spark[] = []
  private clouds: Cloud[] = []

  private world: World
  private tool: ToolId = 'raise'
  private brush = 2
  private timeOfDay = 0.33
  private autoTime = true
  private autoRotate = false
  private dirty = true
  private faces = 0
  private voxels = 0
  private elapsed = 0
  private delta = 0.016
  private statsTimer = 0
  private undoStack: Int16Array[] = []
  private redoStack: Int16Array[] = []
  private stroking = false
  private activePointer = -1
  private strokeTool: ToolId = 'raise'
  private lastCell: Cell | null = null
  private hoverCell: Cell | null = null
  private cameraAttached = true
  private resizeObserver: ResizeObserver
  private cloudTint = new Color3(1, 1, 1)
  private pendingSnapshot: Int16Array | null = null
  private baseScaling = 1
  private pixelMode = false

  private blockContextMenu = (event: Event): void => {
    event.preventDefault()
  }

  private onWindowPointerUp = (event: PointerEvent): void => {
    this.endStroke(event.pointerId)
  }

  /** If the window loses focus mid-stroke the pointerup never arrives, so recover. */
  private onWindowBlur = (): void => {
    if (!this.stroking) return
    this.stroking = false
    this.activePointer = -1
    this.lastCell = null
    this.pendingSnapshot = null
    this.attachCamera()
  }

  constructor(host: HTMLElement, options: VoxelSceneOptions) {
    this.onStats = options.onStats
    this.world = createWorld(options.seed)
    this.voxels = countVoxels(this.world)

    this.canvas = document.createElement('canvas')
    this.canvas.className = 'voxel-canvas'
    this.canvas.setAttribute('aria-label', 'Interactive voxel island')
    this.canvas.addEventListener('contextmenu', this.blockContextMenu)
    host.appendChild(this.canvas)

    this.engine = new Engine(
      this.canvas,
      true,
      { stencil: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' },
      true,
    )
    this.scene = new Scene(this.engine)
    this.configureRendering()
    this.baseScaling = this.engine.getHardwareScalingLevel()

    this.camera = this.createCamera()
    this.skyLight = this.createSkyLight()
    this.sunLight = this.createSunLight()

    this.shadow = new ShadowGenerator(2048, this.sunLight)
    this.shadow.usePercentageCloserFiltering = true
    this.shadow.filteringQuality = ShadowGenerator.QUALITY_HIGH
    this.shadow.setDarkness(0.34)

    this.glow = new GlowLayer('glow', this.scene, { mainTextureFixedSize: 512, blurKernelSize: 48 })
    this.glow.intensity = 0.7

    this.buildTerrain()
    this.buildWater()
    this.buildSky()
    this.buildCrystals()
    this.buildBrush()
    this.buildSparks()
    this.buildClouds()
    this.setupInput()

    this.resizeObserver = new ResizeObserver(() => this.engine.resize())
    this.resizeObserver.observe(host)
    window.addEventListener('pointerup', this.onWindowPointerUp)
    window.addEventListener('pointercancel', this.onWindowPointerUp)
    window.addEventListener('blur', this.onWindowBlur)

    this.engine.runRenderLoop(() => this.render())
  }

  private configureRendering(): void {
    const scene = this.scene
    scene.clearColor = new Color4(0.05, 0.07, 0.12, 1)
    scene.ambientColor = new Color3(0.2, 0.24, 0.3)
    scene.fogMode = Scene.FOGMODE_EXP2
    scene.fogDensity = 0.0072
    scene.fogColor = hex('#a9cfe8')
    scene.skipPointerMovePicking = true

    const processing = scene.imageProcessingConfiguration
    processing.toneMappingEnabled = true
    processing.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES
    processing.exposure = 1.08
    processing.contrast = 1.16
  }

  private createCamera(): ArcRotateCamera {
    const target = new Vector3(0, SEA_LEVEL + 0.5, 0)
    const camera = new ArcRotateCamera('orbit', -Math.PI / 2.35, 1.02, 68, target, this.scene)
    camera.lowerRadiusLimit = 22
    camera.upperRadiusLimit = 155
    camera.lowerBetaLimit = 0.34
    camera.upperBetaLimit = 1.42
    camera.wheelDeltaPercentage = 0.02
    camera.pinchDeltaPercentage = 0.02
    camera.panningSensibility = 0
    camera.inertia = 0.85
    camera.angularSensibilityX = 2600
    camera.angularSensibilityY = 2600
    camera.minZ = 0.4
    camera.maxZ = 900
    camera.attachControl(this.canvas, true)
    return camera
  }

  private createSkyLight(): HemisphericLight {
    const light = new HemisphericLight('sky', new Vector3(0.15, 1, 0.2), this.scene)
    light.groundColor = new Color3(0.32, 0.4, 0.5)
    light.intensity = 0.85
    return light
  }

  private createSunLight(): DirectionalLight {
    const light = new DirectionalLight('sun', new Vector3(-0.45, -1, 0.4), this.scene)
    light.position = new Vector3(0, 40, 0)
    light.intensity = 2.2
    light.diffuse = new Color3(1, 0.97, 0.92)
    light.specular = new Color3(1, 0.95, 0.85)
    light.autoUpdateExtends = true
    light.autoCalcShadowZBounds = true
    return light
  }

  private buildTerrain(): void {
    this.terrainMaterial = new StandardMaterial('voxel', this.scene)
    this.terrainMaterial.diffuseColor = new Color3(1, 1, 1)
    this.terrainMaterial.specularColor = new Color3(0.02, 0.02, 0.03)
    this.terrainMaterial.backFaceCulling = true

    this.terrain = new Mesh('terrain', this.scene)
    this.terrain.material = this.terrainMaterial
    this.terrain.isPickable = true
    this.terrain.receiveShadows = true
    this.terrain.alwaysSelectAsActiveMesh = true
    this.terrain.useVertexColors = true
    this.terrain.hasVertexAlpha = false
    this.shadow.addShadowCaster(this.terrain)

    this.props = new Mesh('props', this.scene)
    this.props.material = this.terrainMaterial
    this.props.isPickable = false
    this.props.receiveShadows = true
    this.props.alwaysSelectAsActiveMesh = true
    this.props.useVertexColors = true
    this.shadow.addShadowCaster(this.props)

    this.rebuildGeometry()
  }

  /** Re-uploads the terrain and the props after any change to the height map. */
  private rebuildGeometry(): void {
    const terrain = buildTerrainGeometry(this.world)
    applyGeometry(this.terrain, terrain)
    this.terrain.refreshBoundingInfo()
    this.faces = terrain.faces

    applyGeometry(this.props, buildPropsGeometry(this.world))
    this.props.refreshBoundingInfo()
    this.voxels = countVoxels(this.world)

    this.layoutCrystals()
    this.updateBrushTiles(this.hoverCell)
  }

  private buildWater(): void {
    this.waterMaterial = new StandardMaterial('water', this.scene)
    const noise = new NoiseProceduralTexture('waterNoise', 256, this.scene)
    noise.octaves = 4
    noise.persistence = 0.85
    noise.animationSpeedFactor = 0.18

    this.waterMaterial.diffuseTexture = noise
    this.waterMaterial.bumpTexture = noise
    this.waterMaterial.diffuseColor = new Color3(0.18, 0.45, 0.56)
    this.waterMaterial.emissiveColor = new Color3(0.02, 0.08, 0.12)
    this.waterMaterial.specularColor = new Color3(1, 1, 1)
    this.waterMaterial.specularPower = 96
    this.waterMaterial.alpha = 0.8
    this.waterMaterial.backFaceCulling = false

    const plane = buildTexturedPlane(230, WATER_Y, 26)
    const vertexData = new VertexData()
    vertexData.positions = plane.positions
    vertexData.normals = plane.normals
    vertexData.uvs = plane.uvs
    vertexData.indices = plane.indices

    this.water = new Mesh('water', this.scene)
    vertexData.applyToMesh(this.water)
    this.water.material = this.waterMaterial
    this.water.isPickable = true
    this.water.alwaysSelectAsActiveMesh = true
  }

  private buildSky(): void {
    this.sunMaterial = new StandardMaterial('sunMat', this.scene)
    this.sunMaterial.disableLighting = true
    this.sunMaterial.emissiveColor = new Color3(1, 0.85, 0.55)
    this.sunMaterial.fogEnabled = false
    this.sunMesh = new Mesh('sunDisc', this.scene)
    applyGeometry(this.sunMesh, buildCubeGeometry(1))
    this.sunMesh.material = this.sunMaterial
    this.sunMesh.isPickable = false
    this.sunMesh.scaling.setAll(9)
    this.sunMesh.rotation.set(0.4, 0.7, 0.2)

    this.moonMaterial = new StandardMaterial('moonMat', this.scene)
    this.moonMaterial.disableLighting = true
    this.moonMaterial.emissiveColor = MOON_COLOR.scale(0.9)
    this.moonMaterial.fogEnabled = false
    this.moonMesh = new Mesh('moonDisc', this.scene)
    applyGeometry(this.moonMesh, buildCubeGeometry(1))
    this.moonMesh.material = this.moonMaterial
    this.moonMesh.isPickable = false
    this.moonMesh.scaling.setAll(5)
    this.moonMesh.rotation.set(0.2, 0.4, 0.5)

    this.starMaterial = new StandardMaterial('starMat', this.scene)
    this.starMaterial.disableLighting = true
    this.starMaterial.emissiveColor = STAR_COLOR
    this.starMaterial.fogEnabled = false
    this.starMaterial.alpha = 0
    this.starMesh = new Mesh('stars', this.scene)
    applyGeometry(this.starMesh, buildCubeGeometry(1))
    this.starMesh.material = this.starMaterial
    this.starMesh.isPickable = false
    this.starMesh.isVisible = false

    const random = mulberry32(0x5eed)
    for (let i = 0; i < 150; i++) {
      const star = this.starMesh.createInstance(`star-${i}`)
      const azimuth = random() * Math.PI * 2
      const elevation = 0.05 + random() * 1.25
      const radius = 320
      const flat = Math.cos(elevation) * radius
      star.position.set(Math.cos(azimuth) * flat, Math.sin(elevation) * radius, Math.sin(azimuth) * flat)
      const size = 0.9 + random() * 1.7
      star.scaling.set(size, size, size)
      star.rotation.set(random() * 3, random() * 3, random() * 3)
      star.isPickable = false
    }
  }

  private buildCrystals(): void {
    for (let hue = 0; hue < CRYSTAL_COLORS.length; hue++) {
      const material = new StandardMaterial(`crystal-${hue}`, this.scene)
      material.disableLighting = true
      material.emissiveColor = CRYSTAL_COLORS[hue]
      material.specularColor = Color3.Black()
      material.backFaceCulling = false

      const source = new Mesh(`crystalSource-${hue}`, this.scene)
      applyGeometry(source, buildSpikeGeometry())
      source.material = material
      source.isVisible = false
      source.isPickable = false

      this.crystalMaterials.push(material)
      this.crystalSources.push(source)
    }

    this.layoutCrystals()
  }

  private layoutCrystals(): void {
    for (const instance of this.crystalInstances) instance.dispose()
    this.crystalInstances = []

    const size = this.world.size
    const half = size / 2

    for (const anchor of this.world.crystals) {
      const height = this.world.heights[anchor.j * size + anchor.i]
      const source = this.crystalSources[anchor.hue]
      if (height <= 0 || !source) continue

      for (const spike of anchor.spikes) {
        const instance = source.createInstance('crystal')
        instance.position.set(
          anchor.i - half + 0.5 + spike.dx,
          height,
          anchor.j - half + 0.5 + spike.dz,
        )
        instance.rotation.set(spike.tiltX, 0, spike.tiltZ)
        instance.scaling.set(spike.width, spike.height, spike.width)
        instance.isPickable = false
        this.crystalInstances.push(instance)
      }
    }
  }

  private buildBrush(): void {
    this.brushMaterial = new StandardMaterial('brush', this.scene)
    this.brushMaterial.disableLighting = true
    this.brushMaterial.emissiveColor = TOOL_COLORS[this.tool]
    this.brushMaterial.alpha = 0.34
    this.brushMaterial.backFaceCulling = false

    const source = new Mesh('brushSource', this.scene)
    applyGeometry(source, buildCubeGeometry(1))
    source.material = this.brushMaterial
    source.isVisible = false
    source.isPickable = false
    this.glow.addExcludedMesh(source)

    const span = 4 * 2 + 1
    for (let i = 0; i < span * span; i++) {
      const tile = source.createInstance(`brushTile-${i}`)
      tile.scaling.set(0.9, 0.16, 0.9)
      tile.isPickable = false
      tile.setEnabled(false)
      this.brushTiles.push(tile)
    }
  }

  private buildSparks(): void {
    this.sparkMaterial = new StandardMaterial('spark', this.scene)
    this.sparkMaterial.disableLighting = true
    this.sparkMaterial.emissiveColor = new Color3(1, 0.76, 0.32)
    this.sparkMaterial.backFaceCulling = false

    this.sparkSource = new Mesh('sparkSource', this.scene)
    applyGeometry(this.sparkSource, buildCubeGeometry(1))
    this.sparkSource.material = this.sparkMaterial
    this.sparkSource.isVisible = false
    this.sparkSource.isPickable = false

    for (let i = 0; i < 72; i++) {
      const instance = this.sparkSource.createInstance(`spark-${i}`)
      instance.isPickable = false
      instance.setEnabled(false)
      this.sparks.push({ instance, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 0.2, active: false })
    }
  }

  private buildClouds(): void {
    for (const cloud of this.clouds) cloud.mesh.dispose()
    this.clouds = []

    if (!this.cloudMaterial) {
      this.cloudMaterial = new StandardMaterial('cloud', this.scene)
      this.cloudMaterial.diffuseColor = new Color3(1, 1, 1)
      this.cloudMaterial.emissiveColor = CLOUD_DAY.scale(0.4)
      this.cloudMaterial.specularColor = Color3.Black()
      this.cloudMaterial.alpha = 0.94
      this.cloudMaterial.backFaceCulling = false
    }

    const random = mulberry32((this.world.seed ^ 0x2f6f1b) >>> 0)
    for (let i = 0; i < 15; i++) {
      const mesh = new Mesh(`cloud-${i}`, this.scene)
      applyGeometry(mesh, buildCloudGeometry(random))
      mesh.material = this.cloudMaterial
      mesh.isPickable = false

      const angle = (i / 15) * Math.PI * 2 + random() * 0.5
      const distance = 30 + random() * 60
      const baseY = 27 + random() * 15
      mesh.position.set(Math.cos(angle) * distance, baseY, Math.sin(angle) * distance)
      mesh.rotation.y = random() * Math.PI

      this.clouds.push({ mesh, speed: 0.5 + random() * 1.1, baseY, phase: random() * Math.PI * 2 })
    }
  }

  /** The hologram tiles that preview which columns the brush will touch. */
  private updateBrushTiles(cell: Cell | null): void {
    let used = 0

    if (cell) {
      const size = this.world.size
      const half = size / 2
      const radius = this.brush

      for (let dj = -radius; dj <= radius; dj++) {
        for (let di = -radius; di <= radius; di++) {
          if (di * di + dj * dj > radius * radius + radius * 0.4) continue
          const i = cell.i + di
          const j = cell.j + dj
          if (i < 0 || j < 0 || i >= size || j >= size) continue

          const tile = this.brushTiles[used]
          if (!tile) break
          const height = this.world.heights[j * size + i]
          tile.position.set(i - half + 0.5, Math.max(height, WATER_Y) + 0.09, j - half + 0.5)
          tile.setEnabled(true)
          used += 1
        }
      }
    }

    for (let k = used; k < this.brushTiles.length; k++) this.brushTiles[k].setEnabled(false)
  }

  /**
   * Left drag on the island sculpts, left drag on the sky orbits the camera.
   * Hitting land detaches the camera for the duration of the stroke, which is
   * what keeps "drag to sculpt" from fighting "drag to orbit".
   */
  private setupInput(): void {
    this.scene.onPointerObservable.add((info) => {
      const event = info.event as PointerEvent
      switch (info.type) {
        case PointerEventTypes.POINTERDOWN:
          this.beginStroke(event.button, event.pointerId)
          break
        case PointerEventTypes.POINTERMOVE:
          this.handleMove(event.pointerId)
          break
        case PointerEventTypes.POINTERUP:
          this.endStroke(event.pointerId)
          break
        default:
          break
      }
    })
  }

  private beginStroke(button: number, pointerId: number): void {
    if (this.stroking) return
    if (button === 1) return // middle button stays free for the camera
    const cell = this.pickCell()
    if (!cell) return

    // Kept aside and only committed to the undo stack once something really changes.
    this.pendingSnapshot = snapshotWorld(this.world)

    this.stroking = true
    this.activePointer = pointerId
    this.strokeTool = button === 2 ? this.inverseTool(this.tool) : this.tool
    this.lastCell = cell
    this.hoverCell = cell
    this.detachCamera()
    this.applyStroke(cell)
  }

  private handleMove(pointerId: number): void {
    const cell = this.pickCell()
    this.hoverCell = cell

    if (!this.stroking) {
      this.updateBrushTiles(cell)
      return
    }

    if (pointerId !== this.activePointer || !cell) return
    if (this.lastCell && this.lastCell.i === cell.i && this.lastCell.j === cell.j) return

    const previous = this.lastCell
    this.lastCell = cell
    if (previous) this.paintLine(previous, cell)
    else this.applyStroke(cell)
  }

  private endStroke(pointerId: number): void {
    if (!this.stroking) return
    if (this.activePointer !== pointerId) return

    this.stroking = false
    this.activePointer = -1
    this.lastCell = null
    this.pendingSnapshot = null
    this.attachCamera()
  }

  private applyStroke(cell: Cell): void {
    if (!sculpt(this.world, cell.i, cell.j, this.brush, this.strokeTool)) return

    if (this.pendingSnapshot) {
      if (this.undoStack.length >= 40) this.undoStack.shift()
      this.undoStack.push(this.pendingSnapshot)
      this.pendingSnapshot = null
      this.redoStack = []
    }

    this.dirty = true
    this.spawnSparks(cell)
  }

  private inverseTool(tool: ToolId): ToolId {
    if (tool === 'raise') return 'lower'
    if (tool === 'lower') return 'raise'
    return 'smooth'
  }

  private pickCell(): Cell | null {
    const pick = this.scene.pick(
      this.scene.pointerX,
      this.scene.pointerY,
      (mesh) => mesh === this.terrain || mesh === this.water,
    )
    if (!pick.hit || !pick.pickedPoint) return null

    // Nudge the hit point just inside the face that was hit, so clicking a cliff
    // wall edits the column that owns the wall instead of the empty one next to it.
    const normal = pick.getNormal(true)
    const inset = 0.01
    const x = pick.pickedPoint.x - (normal ? normal.x * inset : 0)
    const z = pick.pickedPoint.z - (normal ? normal.z * inset : 0)

    const half = this.world.size / 2
    const i = Math.floor(x + half)
    const j = Math.floor(z + half)
    if (i < 0 || j < 0 || i >= this.world.size || j >= this.world.size) return null

    return { i, j }
  }

  /** Bresenham between two brush stamps so a fast drag still leaves a solid stroke. */
  private paintLine(from: Cell, to: Cell): void {
    let x = from.i
    let y = from.j
    const dx = Math.abs(to.i - x)
    const dy = Math.abs(to.j - y)
    const stepX = x < to.i ? 1 : -1
    const stepY = y < to.j ? 1 : -1
    let error = dx - dy
    let guard = 0

    while (guard < 96) {
      guard += 1
      if (!(x === from.i && y === from.j)) this.applyStroke({ i: x, j: y })
      if (x === to.i && y === to.j) break

      const doubled = error * 2
      if (doubled > -dy) {
        error -= dy
        x += stepX
      }
      if (doubled < dx) {
        error += dx
        y += stepY
      }
    }
  }

  private spawnSparks(cell: Cell): void {
    const size = this.world.size
    const half = size / 2
    const height = this.world.heights[cell.j * size + cell.i]
    const x = cell.i - half + 0.5
    const z = cell.j - half + 0.5
    let spawned = 0

    for (const spark of this.sparks) {
      if (spark.active) continue

      const angle = Math.random() * Math.PI * 2
      const speed = 1.2 + Math.random() * 2.8
      spark.active = true
      spark.vx = Math.cos(angle) * speed
      spark.vz = Math.sin(angle) * speed
      spark.vy = 2.2 + Math.random() * 3.4
      spark.life = 0.45 + Math.random() * 0.35
      spark.maxLife = spark.life
      spark.size = 0.13 + Math.random() * 0.16
      spark.instance.position.set(
        x + (Math.random() - 0.5) * 0.7,
        Math.max(height, WATER_Y) + 0.4,
        z + (Math.random() - 0.5) * 0.7,
      )
      spark.instance.scaling.set(spark.size, spark.size, spark.size)
      spark.instance.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3)
      spark.instance.setEnabled(true)

      spawned += 1
      if (spawned >= 4) break
    }
  }

  private detachCamera(): void {
    if (!this.cameraAttached) return
    this.camera.detachControl()
    this.cameraAttached = false
  }

  private attachCamera(): void {
    if (this.cameraAttached) return
    this.camera.attachControl(this.canvas, true)
    this.cameraAttached = true
  }

  private render(): void {
    this.delta = Math.min(0.05, this.engine.getDeltaTime() / 1000)
    this.elapsed += this.delta

    if (this.autoTime) this.timeOfDay = (this.timeOfDay + this.delta * 0.006) % 1
    if (this.autoRotate && !this.stroking) this.camera.alpha += this.delta * 0.075

    if (this.dirty) {
      this.rebuildGeometry()
      this.dirty = false
    }

    this.updateSky()
    this.updateAtmosphere()
    this.updateSparks()
    this.updateStats()

    this.scene.render()
  }

  /** One orbiting sun drives the light, the sky, the fog, the water and the glow. */
  private updateSky(): void {
    const palette = sampleDay(this.timeOfDay)
    const angle = (this.timeOfDay - 0.25) * Math.PI * 2
    const direction = new Vector3(Math.cos(angle) * 0.92, Math.sin(angle), 0.42).normalize()
    const lightDirection = direction.y >= 0 ? direction : direction.scale(-1)
    const night = clamp(-direction.y * 2.6, 0, 1)

    this.sunLight.direction = lightDirection.scale(-1)
    this.sunLight.diffuse = palette.sun
    this.sunLight.specular = palette.sun
    this.sunLight.intensity = palette.sunIntensity * (direction.y >= 0 ? 1 : 0.45)

    this.skyLight.diffuse = palette.hemi
    this.skyLight.groundColor = palette.water.scale(0.6)
    this.skyLight.intensity = palette.hemiIntensity

    this.scene.clearColor.set(palette.sky.r, palette.sky.g, palette.sky.b, 1)
    this.scene.fogColor = palette.fog

    this.waterMaterial.diffuseColor = palette.water
    this.waterMaterial.emissiveColor = palette.water.scale(0.22)
    this.waterMaterial.specularColor = palette.sun.scale(0.9)

    Color3.LerpToRef(CLOUD_NIGHT, CLOUD_DAY, clamp(direction.y * 2.2 + 0.35, 0, 1), this.cloudTint)
    this.cloudMaterial.emissiveColor.copyFrom(this.cloudTint).scaleInPlace(0.55)
    this.cloudMaterial.diffuseColor.copyFrom(this.cloudTint).scaleInPlace(0.8)

    const center = this.camera.target
    this.sunMesh.position.copyFrom(center).addInPlace(direction.scale(190))
    this.sunMesh.isVisible = direction.y > -0.08
    this.sunMaterial.emissiveColor.copyFrom(palette.sun).scaleInPlace(1.5)

    this.moonMesh.position.copyFrom(center).subtractInPlace(direction.scale(190))
    this.moonMesh.isVisible = direction.y < 0.08
    this.moonMaterial.emissiveColor.copyFrom(MOON_COLOR).scaleInPlace(0.55 + night * 0.7)

    this.starMaterial.alpha = night * 0.95

    // Crystals drink the moonlight: they burn brighter once the sun is gone.
    for (let i = 0; i < this.crystalMaterials.length; i++) {
      this.crystalMaterials[i].emissiveColor.copyFrom(CRYSTAL_COLORS[i]).scaleInPlace(0.5 + night * 0.85)
    }
    this.glow.intensity = 0.55 + night * 0.55
    const exposure = 1.05 + night * 0.22
    if (Math.abs(exposure - this.scene.imageProcessingConfiguration.exposure) > 0.01) {
      this.scene.imageProcessingConfiguration.exposure = exposure
    }
  }

  private updateAtmosphere(): void {
    this.water.position.y = Math.sin(this.elapsed * 0.9) * 0.05

    for (const cloud of this.clouds) {
      cloud.mesh.position.x += this.delta * cloud.speed
      if (cloud.mesh.position.x > 130) cloud.mesh.position.x = -130
      cloud.mesh.position.y = cloud.baseY + Math.sin(this.elapsed * 0.35 + cloud.phase) * 0.5
    }
  }

  private updateSparks(): void {
    for (const spark of this.sparks) {
      if (!spark.active) continue

      spark.life -= this.delta
      if (spark.life <= 0) {
        spark.active = false
        spark.instance.setEnabled(false)
        continue
      }

      spark.vy -= 9.4 * this.delta
      spark.instance.position.x += spark.vx * this.delta
      spark.instance.position.y += spark.vy * this.delta
      spark.instance.position.z += spark.vz * this.delta

      const fade = spark.life / spark.maxLife
      spark.instance.scaling.setAll(spark.size * (0.25 + fade * 0.9))
      spark.instance.rotation.x += this.delta * 3
      spark.instance.rotation.y += this.delta * 4
    }
  }

  private updateStats(): void {
    this.statsTimer += this.delta
    if (this.statsTimer < 0.12) return
    this.statsTimer = 0

    this.onStats({
      fps: this.engine.getFps(),
      voxels: this.voxels,
      faces: this.faces,
      timeOfDay: this.timeOfDay,
      undo: this.undoStack.length,
      redo: this.redoStack.length,
      seed: formatSeed(this.world.seed),
    })
  }

  // ------------------------------------------------------------------ public API

  setTool(tool: ToolId): void {
    this.tool = tool
    this.brushMaterial.emissiveColor.copyFrom(TOOL_COLORS[tool])
    this.updateBrushTiles(this.hoverCell)
  }

  setBrush(radius: number): void {
    this.brush = clamp(Math.round(radius), 1, 4)
    this.updateBrushTiles(this.hoverCell)
  }

  setTimeOfDay(value: number): void {
    this.timeOfDay = ((value % 1) + 1) % 1
  }

  setAutoTime(enabled: boolean): void {
    this.autoTime = enabled
  }

  setAutoRotate(enabled: boolean): void {
    this.autoRotate = enabled
  }

  /**
   * Authentic voxel look: render at half the CSS resolution and let the browser
   * upscale with nearest-neighbour (image-rendering: pixelated in the stylesheet).
   */
  setPixelMode(enabled: boolean): void {
    this.pixelMode = enabled
    this.engine.setHardwareScalingLevel(this.pixelMode ? this.baseScaling * 2 : this.baseScaling)
    this.engine.resize()
  }

  snapCamera(): void {
    this.camera.alpha = -Math.PI / 2.35
    this.camera.beta = 1.02
    this.camera.radius = 68
  }

  /** New island from a seed label: digits or any word you like. */
  randomize(seedLabel: string): void {
    this.regenerate(seedFromInput(seedLabel))
  }

  reset(): void {
    this.regenerate(this.world.seed)
  }

  private regenerate(seed: number): void {
    this.world = createWorld(seed)
    this.undoStack = []
    this.redoStack = []
    this.pendingSnapshot = null
    this.hoverCell = null
    this.lastCell = null
    this.stroking = false
    this.attachCamera()
    this.buildClouds()
    this.rebuildGeometry()
  }

  undo(): void {
    const previous = this.undoStack.pop()
    if (!previous) return
    this.redoStack.push(snapshotWorld(this.world))
    restoreWorld(this.world, previous)
    this.dirty = true
  }

  redo(): void {
    const next = this.redoStack.pop()
    if (!next) return
    this.undoStack.push(snapshotWorld(this.world))
    restoreWorld(this.world, next)
    this.dirty = true
  }

  /** Renders a high resolution still and downloads it, HUD excluded. */
  saveSnapshot(): void {
    CreateScreenshotUsingRenderTarget(
      this.engine,
      this.camera,
      { width: 1920, height: 1080 },
      (data) => {
        const link = document.createElement('a')
        link.href = data
        link.download = `voxel-island-${formatSeed(this.world.seed)}.png`
        link.click()
      },
    )
  }

  dispose(): void {
    this.resizeObserver.disconnect()
    window.removeEventListener('pointerup', this.onWindowPointerUp)
    window.removeEventListener('pointercancel', this.onWindowPointerUp)
    window.removeEventListener('blur', this.onWindowBlur)
    this.canvas.removeEventListener('contextmenu', this.blockContextMenu)
    this.engine.stopRenderLoop()
    this.scene.dispose()
    this.engine.dispose()
    this.canvas.remove()
  }
}

