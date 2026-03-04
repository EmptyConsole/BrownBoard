import { v4 as uuidv4 } from 'uuid'
import { useCanvasStore } from '../store/canvasStore'
import type { FileObject } from '../types/canvas'

type RepoSeed = {
  repoId: string
  name: string
  files: string[]
}

export const addRepoToCanvas = (seed: RepoSeed) => {
  const basePosition = { x: 160, y: 160 }
  seed.files.forEach((path, index) => {
    const fileObject: FileObject = {
      id: uuidv4(),
      type: 'file',
      repoId: seed.repoId,
      path,
      position: { x: basePosition.x, y: basePosition.y + index * 48 },
      size: { width: 260, height: 44 },
      rotation: 0,
      layerIndex: 1,
      metadata: { semantic: 'task' },
      status: 'clean',
    }
    useCanvasStore.getState().addObject(fileObject)
  })
}

export const applyGitHubChange = (repoId: string, changedPaths: string[]) => {
  const state = useCanvasStore.getState()
  state.objects
    .filter((obj) => obj.type === 'file' && (obj as FileObject).repoId === repoId)
    .forEach((file) => {
      const changed = changedPaths.some((path) => path === (file as FileObject).path)
      state.updateObject(file.id, { ...(file as FileObject), status: changed ? 'changed' : 'clean' })
      if (changed) {
        state.addObject({
          id: uuidv4(),
          type: 'ai-suggestion',
          position: { x: file.position.x, y: file.position.y - 40 },
          size: { width: file.size.width, height: 40 },
          rotation: 0,
          layerIndex: file.layerIndex + 1,
          metadata: { semantic: 'task' },
          suggestion: `File changed: ${(file as FileObject).path}`,
          targetIds: [file.id],
        })
      }
    })
}

export const linkFileToObject = (fileId: string, objectId: string) => {
  const state = useCanvasStore.getState()
  const file = state.objects.find((obj) => obj.id === fileId)
  const target = state.objects.find((obj) => obj.id === objectId)
  if (!file || !target) return
  const labels = new Set([...(target.metadata?.labels ?? []), 'linked-file'])
  state.updateObject(objectId, {
    metadata: { ...target.metadata, labels: Array.from(labels) },
  })
}
