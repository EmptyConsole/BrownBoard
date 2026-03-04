import { useState } from 'react'
import { addRepoToCanvas, applyGitHubChange } from '../services/githubIntegration'
import { useCanvasStore } from '../store/canvasStore'
import { linkFileToObject } from '../services/githubIntegration'

export function GithubPanel() {
  const [repoName, setRepoName] = useState('repo/sample')
  const [filesText, setFilesText] = useState('src/index.ts\nsrc/App.tsx')
  const selection = useCanvasStore((state) => state.selection.selectedIds)
  const objects = useCanvasStore((state) => state.objects)
  const maybeFile = selection
    .map((id) => objects.find((obj) => obj.id === id))
    .find((obj) => obj?.type === 'file')
  const maybeTarget = selection
    .map((id) => objects.find((obj) => obj.id === id))
    .find((obj) => obj && obj.type !== 'file')

  return (
    <div className="github-panel">
      <div className="panel-header">
        <div className="panel-title">GitHub</div>
        <div className="panel-subtitle">Represent repositories as canvas nodes.</div>
      </div>
      <div className="panel-field">
        <span>Repository</span>
        <input value={repoName} onChange={(e) => setRepoName(e.target.value)} />
      </div>
      <div className="panel-field">
        <span>Files (one per line)</span>
        <textarea
          rows={4}
          value={filesText}
          onChange={(e) => setFilesText(e.target.value)}
          className="github-textarea"
        />
      </div>
      <div className="panel-actions">
        <button
          type="button"
          onClick={() =>
            addRepoToCanvas({
              repoId: repoName,
              name: repoName,
              files: filesText
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
        >
          Add repo to canvas
        </button>
      </div>
      <div className="panel-actions">
        <button type="button" onClick={() => applyGitHubChange(repoName, ['src/App.tsx'])}>
          Mark App.tsx changed
        </button>
      </div>
      {maybeFile && maybeTarget && (
        <div className="panel-actions">
          <button type="button" onClick={() => linkFileToObject(maybeFile.id, maybeTarget.id)}>
            Link selected file to selected object
          </button>
        </div>
      )}
    </div>
  )
}
