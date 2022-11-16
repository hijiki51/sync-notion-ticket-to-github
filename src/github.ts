import {ProjectV2Item} from '@octokit/graphql-schema'
// eslint-disable-next-line import/named
import {RestEndpointMethodTypes} from '@octokit/plugin-rest-endpoint-methods'
import {Octokit} from 'octokit'
import {LinkedPage, Page} from './types/page'
import * as core from '@actions/core'
import {formatISO, parse} from 'date-fns'
import {zonedTimeToUtc} from 'date-fns-tz'

const octokit = new Octokit({auth: core.getInput('github-token')})
const GITHUB_PROJECT_ID = core.getInput('github-project-id')
const GITHUB_PROJECT_STATUS_FIELD_ID = core.getInput(
  'github-project-status-field-id'
)

export const createGitHubIssue = async (
  owner: string,
  repo: string,
  task: Page,
  status: string
): Promise<RestEndpointMethodTypes['issues']['create']['response']> => {
  const milestone = await (async (
    mowner: string,
    mrepo: string,
    mtitle: string
  ): Promise<number> => {
    const milestones = (
      await octokit.rest.issues.listMilestones({
        owner: mowner,
        repo: mrepo,
        state: 'open'
      })
    ).data.find(ms => ms.title === mtitle)

    if (milestones) {
      return milestones.number
    }

    const {data} = await createMilestone(owner, repo, mtitle)

    return data.number
  })(owner, repo, task.sprint)

  const issue = await octokit.rest.issues.create({
    owner,
    repo,
    title: task.title,
    body: task.content,
    milestone
  })

  // https://docs.github.com/en/graphql/reference/input-objects#addprojectv2itembyidinput

  const item = await octokit.graphql<{item: ProjectV2Item}>({
    query: `mutation($input: AddProjectV2ItemByIdInput!) {
      addProjectV2ItemById(input: $input) {
        clientMutationId
        item
      }
    }`,
    input: {
      projectId: GITHUB_PROJECT_ID,
      contentId: issue.data.id
    }
  })

  await octokit.graphql<{item: ProjectV2Item}>({
    query: `mutation($input: UpdateProjectV2ItemFieldValueInput!) {
      updateProjectV2ItemFieldValue(input: $input) {
        clientMutationId
        item
      }
    }`,
    input: {
      projectId: GITHUB_PROJECT_ID,
      fieldId: GITHUB_PROJECT_STATUS_FIELD_ID,
      itemId: item.item.id,
      value: {
        singleSelectOptionId: status
      }
    }
  })
  return issue
}

export const updateGitHubIssue = async (
  owner: string,
  repo: string,
  task: LinkedPage,
  isDone: boolean
): Promise<void> => {
  const state = isDone ? 'closed' : 'open'

  await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: task.issue_number,
    title: task.title,
    body: task.content,
    state
  })
}

const createMilestone = async (
  owner: string,
  repo: string,
  title: string
): Promise<
  RestEndpointMethodTypes['issues']['createMilestone']['response']
> => {
  const splited = title.split('_')
  if (splited.length !== 2) {
    throw new Error(`Invalid sprint name: ${title}`)
  }
  const dueDate = formatISO(
    zonedTimeToUtc(parse(splited[2], 'yyMMdd', new Date()), 'Asia/Tokyo')
  )

  return await octokit.rest.issues.createMilestone({
    owner,
    repo,
    title,
    due_on: dueDate,
    state: 'open'
  })
}
