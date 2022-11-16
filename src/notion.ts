import {LinkedPage, Page} from './types/page'
import {Client, isFullPage} from '@notionhq/client'
import {NotionToMarkdown} from 'notion-to-md'
import * as core from '@actions/core'

import {
  PageObjectResponse,
  QueryDatabaseResponse,
  RichTextItemResponse,
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
const PROPERTY_ISSUE_NO = 'GitHub Issue No'
const PROPERTY_STATUS = 'ステータス'
const PROPERTY_SPRINT = 'Sprint'
const PROPERTY_GITHUB = 'Github issue link'

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
        const title = page.properties[PROPERTY_TITLE] as {
          type: 'title'
          title: RichTextItemResponse[]
          id: string
        }
        const mdblocks = await n2m.pageToMarkdown(page.id)
        const mdString = n2m.toMarkdownString(mdblocks)
        const status = page.properties[PROPERTY_STATUS] as {
          type: 'select'
          select: {
            id: string
            name: string
            color: string
          }
          id: string
        }
        const sprint = await (async (
          pg: PageObjectResponse
        ): Promise<string> => {
          const resp = await notion.pages.retrieve({
            page_id: (
              pg.properties[PROPERTY_SPRINT] as {
                type: 'relation'
                relation: {
                  id: string
                }[]
                id: string
              }
            ).relation[0].id
          })

          if (resp.object === 'page' && isFullPage(resp)) {
            return (
              page.properties[PROPERTY_TITLE] as {
                type: 'title'
                title: RichTextItemResponse[]
                id: string
              }
            ).title[0].plain_text
          } else {
            core.error('Sprint page not found')
            throw new Error('Sprint page not found')
          }
        })(page)

        tasks.push({
          id: page.id,
          title: title.title[0].plain_text,
          status: status.select.name,
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
              after: new Date().toISOString()
            }
          }
        ]
      },
      start_cursor: cursor
    })
    for await (const page of current_pages.results) {
      if (page.object === 'page' && isFullPage(page)) {
        const title = page.properties[PROPERTY_TITLE] as {
          type: 'title'
          title: RichTextItemResponse[]
          id: string
        }
        const mdblocks = await n2m.pageToMarkdown(page.id)
        const mdString = n2m.toMarkdownString(mdblocks)
        const status = page.properties[PROPERTY_STATUS] as {
          type: 'select'
          select: {
            id: string
            name: string
            color: string
          }
          id: string
        }
        const sprint = await (async (
          pg: PageObjectResponse
        ): Promise<string> => {
          const resp = await notion.pages.retrieve({
            page_id: (
              pg.properties[PROPERTY_SPRINT] as {
                type: 'relation'
                relation: {
                  id: string
                }[]
                id: string
              }
            ).relation[0].id
          })

          if (resp.object === 'page' && isFullPage(resp)) {
            return (
              page.properties[PROPERTY_TITLE] as {
                type: 'title'
                title: RichTextItemResponse[]
                id: string
              }
            ).title[0].plain_text
          } else {
            core.error('Sprint page not found')
            throw new Error('Sprint page not found')
          }
        })(page)

        tasks.push({
          id: page.id,
          title: title.title[0].plain_text,
          status: status.select.name,
          sprint,
          content: mdString
        })
      }
    }
  }
}


const getParam = <T>(pageId: string, paramId: string):Promise<T>