import {LinkedPage, Page} from './types/page'
import {Client, isFullPage} from '@notionhq/client'
import {NotionToMarkdown} from 'notion-to-md'
import * as core from '@actions/core'

import {
  NumberPropertyItemObjectResponse,
  PageObjectResponse,
  QueryDatabaseResponse,
  RelationPropertyItemObjectResponse,
  SelectPropertyItemObjectResponse,
  TitlePropertyItemObjectResponse,
  UpdatePageParameters
} from '@notionhq/client/build/src/api-endpoints'
// eslint-disable-next-line import/named
import {RestEndpointMethodTypes} from '@octokit/plugin-rest-endpoint-methods'

const notion = new Client({auth: core.getInput('notion-apikey')})

const n2m = new NotionToMarkdown({notionClient: notion})

const DATABASE_ID = core.getInput('notion-database-id')
const TEAM_NAME = core.getInput('team-name')
const PROPERTY_TEAM_NAME = 'チーム'
const PROPERTY_TITLE = 'title'
const PROPERTY_STATUS = 'ステータス'
const PROPERTY_SPRINT = 'Sprint'
const PROPERTY_GITHUB = 'Github Issue link'
const PROPERTY_ISSUE_NO = 'GitHub Issue No'

export const getTasksFromDatabase = async (): Promise<Page[]> => {
  const tasks: Page[] = []
  const getPageOfTasks = async (cursor?: string): Promise<void> => {
    const current_pages: QueryDatabaseResponse = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        and: [
          {
            property: PROPERTY_TEAM_NAME,
            select: {
              equals: TEAM_NAME
            }
          },
          {
            property: PROPERTY_ISSUE_NO,
            number: {
              is_empty: true
            }
          }
        ]
      },
      start_cursor: cursor
    })
    for await (const page of current_pages.results) {
      if (page.object === 'page' && isFullPage(page)) {
        const title = await getProp<TitlePropertyItemObjectResponse>(
          page.id,
          PROPERTY_TITLE
        )
        const status = await getProp<SelectPropertyItemObjectResponse>(
          page.id,
          PROPERTY_STATUS
        )
        const mdblocks = await n2m.pageToMarkdown(page.id)
        const mdString = n2m.toMarkdownString(mdblocks)

        const sprint = await (async (
          pg: PageObjectResponse
        ): Promise<string> => {
          const sprintrel = await getProp<RelationPropertyItemObjectResponse>(
            pg.id,
            PROPERTY_SPRINT
          )
          const resp = await notion.pages.retrieve({
            page_id: sprintrel.relation.id
          })

          if (resp.object === 'page' && isFullPage(resp)) {
            return (
              await getProp<TitlePropertyItemObjectResponse>(
                page.id,
                PROPERTY_TITLE
              )
            ).title.plain_text
          } else {
            core.error('Sprint page not found')
            throw new Error('Sprint page not found')
          }
        })(page)

        tasks.push({
          id: page.id,
          title: title.title.plain_text,
          status: status.select?.name || '保留',
          sprint,
          content: mdString
        })
      }
    }

    if (current_pages.has_more && current_pages.next_cursor !== null) {
      await getPageOfTasks(current_pages.next_cursor)
    }
  }
  await getPageOfTasks()
  return tasks
}

export const updateNotionIssueField = async (
  pageId: string,
  issue: RestEndpointMethodTypes['issues']['create']['response']
): Promise<void> => {
  const request: UpdatePageParameters = {
    page_id: pageId,
    properties: {
      [PROPERTY_ISSUE_NO]: {
        number: issue.data.number
      },
      [PROPERTY_GITHUB]: {
        url: issue.data.html_url
      }
    }
  }
  await notion.pages.update(request)
}

export const getChangedTasksFromDatabase = async (): Promise<LinkedPage[]> => {
  const tasks: LinkedPage[] = []

  const getPageOfTasks = async (cursor?: string): Promise<void> => {
    const current_pages: QueryDatabaseResponse = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        and: [
          {
            property: PROPERTY_TEAM_NAME,
            select: {
              equals: TEAM_NAME
            }
          },
          {
            property: PROPERTY_ISSUE_NO,
            number: {
              is_not_empty: true
            }
          },
          {
            timestamp: 'last_edited_time',
            last_edited_time: {
              after: (() => {
                const date = new Date()
                date.setDate(date.getDate() - 1)
                return date
              })().toISOString()
            }
          }
        ]
      },
      start_cursor: cursor
    })
    for await (const page of current_pages.results) {
      if (page.object === 'page' && isFullPage(page)) {
        const title = await getProp<TitlePropertyItemObjectResponse>(
          page.id,
          PROPERTY_TITLE
        )
        const status = await getProp<SelectPropertyItemObjectResponse>(
          page.id,
          PROPERTY_STATUS
        )
        const issueNo = await getProp<NumberPropertyItemObjectResponse>(
          page.id,
          PROPERTY_ISSUE_NO
        )
        const mdblocks = await n2m.pageToMarkdown(page.id)
        const mdString = n2m.toMarkdownString(mdblocks)

        const sprint = await (async (
          pg: PageObjectResponse
        ): Promise<string> => {
          const sprintrel = await getProp<RelationPropertyItemObjectResponse>(
            pg.id,
            PROPERTY_SPRINT
          )
          const resp = await notion.pages.retrieve({
            page_id: sprintrel.relation.id
          })

          if (resp.object === 'page' && isFullPage(resp)) {
            return (
              await getProp<TitlePropertyItemObjectResponse>(
                page.id,
                PROPERTY_TITLE
              )
            ).title.plain_text
          } else {
            core.error('Sprint page not found')
            throw new Error('Sprint page not found')
          }
        })(page)

        tasks.push({
          id: page.id,
          title: title.title.plain_text,
          content: mdString,
          status: status.select?.name || '保留',
          sprint,
          issue_number: issueNo.number || 0
        })
      }
    }

    if (current_pages.has_more && current_pages.next_cursor !== null) {
      await getPageOfTasks(current_pages.next_cursor)
    }
  }
  await getPageOfTasks()
  return tasks
}

const getProp = async <T>(pageId: string, propId: string): Promise<T> => {
  const response = await notion.pages.properties.retrieve({
    page_id: pageId,
    property_id: propId
  })

  return response as unknown as T
}
