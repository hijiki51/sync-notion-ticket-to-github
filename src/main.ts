import {createGitHubIssue, updateGitHubIssue} from './github'
import {
  getChangedTasksFromDatabase,
  getTasksFromDatabase,
  updateNotionIssueField
} from './notion'
import * as core from '@actions/core'
import {utcToZonedTime} from 'date-fns-tz'
import {parse} from 'date-fns'
import {LinkedPage} from './types/page'

const GITHUB_PROJECT_STATUS_ID_MAP = new Map([
  ['保留', core.getInput('github-status-todo-id')],
  ['未着手', core.getInput('github-status-todo-id')],
  ['進行中', core.getInput('github-status-in-progress-id')],
  ['レビュー', core.getInput('github-status-review-id')],
  ['完了', core.getInput('github-status-done-id')],
  ['アーカイブ', core.getInput('github-status-done-id')]
])

const REPO_OWNER = core.getInput('repo-owner')
const REPO_NAME = core.getInput('repo-name')

;(async () => {
  try {
    const tasks = await getTasksFromDatabase()
    for await (const task of tasks.filter(t => {
      const splited = t.sprint.split('_')
      if (splited.length !== 2) {
        return false
      }
      const now = utcToZonedTime(new Date(), 'Asia/Tokyo')
      const end = parse(splited[2], 'yyMMdd', new Date())
      return now.getTime() <= end.getTime()
    })) {
      const issue = await createGitHubIssue(
        REPO_OWNER,
        REPO_NAME,
        task,
        GITHUB_PROJECT_STATUS_ID_MAP.get(task.status) ||
          core.getInput('github-project-todo-id')
      )
      await updateNotionIssueField(task.id, issue)
      await new Promise<void>(resolve =>
        setTimeout(() => {
          resolve()
        }, 500)
      )
    }
  } catch (error) {
    if (error instanceof Error)
      core.setFailed(`create issue failed: ${error.message}`)
  }
})()
;(async () => {
  try {
    const tasks = await getChangedTasksFromDatabase()
    for await (const task of tasks) {
      await updateGitHubIssue(
        REPO_OWNER,
        REPO_NAME,
        task,
        ((t: LinkedPage) => t.status === '完了' || t.status === 'アーカイブ')(
          task
        )
      )
      await new Promise<void>(resolve =>
        setTimeout(() => {
          resolve()
        }, 500)
      )
    }
  } catch (error) {
    if (error instanceof Error)
      core.setFailed(`update issue failed: ${error.message}`)
  }
})()
